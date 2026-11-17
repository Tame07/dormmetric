'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { db, DATA_DIR } = require('./db');

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'dm_session';
const SESSION_DAYS = 7;

/* ---------- passwords (scrypt, no external dependency) ---------- */
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [alg, saltHex, keyHex] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const key = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(key, expected);
}

/* ---------- signed session cookie ---------- */
function getSecret() {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET !== 'change-me') return process.env.SESSION_SECRET;
  const file = path.join(DATA_DIR, '.session_secret');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}
const SECRET = getSecret();

const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

function createToken(userId) {
  const payload = b64(JSON.stringify({ uid: userId, exp: Date.now() + SESSION_DAYS * 86400000 }));
  return `${payload}.${sign(payload)}`;
}

function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

function parseCookies(header = '') {
  const out = {};
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function setSessionCookie(req, res, userId) {
  const secure = req.secure || process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie',
    `${COOKIE}=${createToken(userId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/* ---------- middleware ---------- */
const findUser = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?');

function isAdminEmail(email) {
  const list = (process.env.ADMIN_EMAIL || 'ibeadaniel689@gmail.com').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

function attachUser(req, _res, next) {
  const data = readToken(parseCookies(req.headers.cookie)[COOKIE]);
  const user = data ? findUser.get(data.uid) || null : null;
  if (user) user.isAdmin = isAdminEmail(user.email);
  req.user = user;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in to continue.' });
  next();
}

const requireRole = (role) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Please log in to continue.' });
  if (req.user.role !== role) return res.status(403).json({ error: `This action is only available to ${role} accounts.` });
  next();
};

/** Simple in-memory limiter, e.g. to slow down password guessing. */
function rateLimit({ windowMs, max, message }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || 'unknown';
    let entry = hits.get(key);
    if (!entry || entry.reset < now) entry = { count: 0, reset: now + windowMs };
    entry.count += 1;
    hits.set(key, entry);
    if (entry.count > max) return res.status(429).json({ error: message || 'Too many attempts. Please try again later.' });
    next();
  };
}

module.exports = {
  hashPassword, verifyPassword, setSessionCookie, clearSessionCookie,
  attachUser, requireAuth, requireRole, rateLimit, isAdminEmail
};
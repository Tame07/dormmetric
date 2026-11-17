'use strict';
const express = require('express');
const { db } = require('../db');
const { hashPassword, verifyPassword, setSessionCookie, clearSessionCookie, rateLimit } = require('../auth');
const { validateSignup, fail } = require('../validate');

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: 'Too many attempts. Please wait a few minutes and try again.' });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// A fixed hash so unknown emails take the same time as wrong passwords.
let dummyHash;

router.post('/signup', limiter, wrap(async (req, res) => {
  const { errors, value } = validateSignup(req.body);
  if (Object.keys(errors).length) return fail(res, errors);

  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(value.email))
    return res.status(409).json({ error: 'An account with that email already exists. Try logging in instead.' });

  const hash = await hashPassword(value.password);
  const info = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)')
    .run(value.name, value.email, hash, value.role);
  const user = { id: Number(info.lastInsertRowid), name: value.name, email: value.email, role: value.role };
  setSessionCookie(req, res, user.id);
  res.status(201).json({ user });
}));

router.post('/login', limiter, wrap(async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!row) {
    dummyHash = dummyHash || (await hashPassword('dormmetric-dummy'));
    await verifyPassword(password, dummyHash);
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  if (!(await verifyPassword(password, row.password_hash)))
    return res.status(401).json({ error: 'Incorrect email or password.' });

  setSessionCookie(req, res, row.id);
  res.json({ user: { id: row.id, name: row.name, email: row.email, role: row.role } });
}));

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => res.json({ user: req.user || null }));

module.exports = router;

'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { UPLOAD_DIR } = require('./db');

const MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80';

const SIGNATURES = [
  { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'webp', test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' }
];

/** Saves a data-URL image sent by the owner dashboard. Returns the public path, e.g. /uploads/ab12.jpg */
function saveDataUrl(dataUrl) {
  const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match) throw Object.assign(new Error('Photo must be a PNG, JPG or WebP image.'), { status: 400, field: 'image' });
  const buf = Buffer.from(match[1], 'base64');
  if (buf.length > MAX_BYTES) throw Object.assign(new Error('Photo is too large (max 2 MB).'), { status: 400, field: 'image' });
  const sig = SIGNATURES.find((s) => buf.length > 12 && s.test(buf));
  if (!sig) throw Object.assign(new Error('That file is not a valid image.'), { status: 400, field: 'image' });
  const name = `${crypto.randomBytes(12).toString('hex')}.${sig.ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}

/** Accepts http(s) image links or already-uploaded files. */
function isAllowedImageRef(value) {
  if (typeof value !== 'string') return false;
  if (/^\/uploads\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(value)) return true;
  try {
    const u = new URL(value);
    return (u.protocol === 'https:' || u.protocol === 'http:') && value.length <= 500;
  } catch {
    return false;
  }
}

function deleteUpload(ref) {
  const m = /^\/uploads\/([a-f0-9]{24}\.(?:jpg|png|webp))$/.exec(ref || '');
  if (m) fs.rm(path.join(UPLOAD_DIR, m[1]), { force: true }, () => {});
}

module.exports = { saveDataUrl, isAllowedImageRef, deleteUpload, DEFAULT_IMAGE };

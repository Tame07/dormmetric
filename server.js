'use strict';
const path = require('path');
const express = require('express');
const { UPLOAD_DIR } = require('./src/db');
const { attachUser } = require('./src/auth');
const { seedIfEmpty } = require('./src/seed');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1); // correct client IP / HTTPS detection behind Render, Railway, Heroku, etc.
app.disable('x-powered-by');

// Basic security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '3mb' })); // owner photo uploads arrive as base64 data URLs

// Reject cross-site state-changing requests (CSRF defence on top of SameSite cookies)
app.use('/api', (req, res, next) => {
  const origin = req.get('origin');
  if (origin && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    let host = '';
    try { host = new URL(origin).host; } catch { /* invalid origin */ }
    if (host !== req.get('host')) return res.status(403).json({ error: 'Cross-site request blocked.' });
  }
  next();
});

app.use('/api', attachUser);
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/owner', require('./src/routes/owner'));
app.use('/api', require('./src/routes/public'));
app.use('/api', require('./src/routes/user'));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// Uploaded dorm photos and the website itself
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', index: false }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: isProd ? '1h' : 0 }));

// Central error handler (JSON for API errors)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  const message = status >= 500 ? 'Something went wrong on our side. Please try again.'
    : err.type === 'entity.parse.failed' ? 'Invalid request data.'
    : err.type === 'entity.too.large' ? 'That upload is too large.'
    : err.message;
  res.status(status).json({ error: message, ...(err.field ? { details: { [err.field]: err.message } } : {}) });
});

seedIfEmpty()
  .then((seeded) => {
    if (seeded) console.log('Demo data added (owner@dormmetric.test / Owner123!  |  student@dormmetric.test / Student123!).');
    app.listen(PORT, () => console.log(`DormMetric running at http://localhost:${PORT}`));
  })
  .catch((err) => { console.error('Failed to start:', err); process.exit(1); });

module.exports = app;

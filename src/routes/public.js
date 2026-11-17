'use strict';
const express = require('express');
const { db } = require('../db');
const { rateLimit } = require('../auth');
const { getPublishedDorms, getDormRow, toDorm, marketAnalytics } = require('../models');
const { isInt } = require('../validate');

const router = express.Router();
const viewLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 300 });

router.get('/health', (_req, res) => res.json({ status: 'ok' }));

router.get('/dorms', (_req, res) => res.json({ dorms: getPublishedDorms() }));

router.get('/dorms/:id', (req, res) => {
  const row = isInt(req.params.id) ? getDormRow(Number(req.params.id)) : null;
  if (!row || !row.is_published) return res.status(404).json({ error: 'Dorm not found.' });
  res.json({ dorm: toDorm(row) });
});

// Counts a "details opened" view so owners can see interest in their listing.
router.post('/dorms/:id/view', viewLimiter, (req, res) => {
  if (isInt(req.params.id))
    db.prepare('UPDATE dorms SET views = views + 1 WHERE id = ? AND is_published = 1').run(Number(req.params.id));
  res.json({ ok: true });
});

router.get('/analytics', (_req, res) => res.json(marketAnalytics()));

module.exports = router;

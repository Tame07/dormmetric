'use strict';
const express = require('express');
const { db } = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { validateInquiry, fail, isInt } = require('../validate');

const router = express.Router();

/* ----- saved shortlist (any logged-in user) ----- */
router.get('/saved', requireAuth, (req, res) => {
  const ids = db.prepare('SELECT dorm_id FROM saved_dorms WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id).map((r) => r.dorm_id);
  res.json({ ids });
});

router.put('/saved/:id', requireAuth, (req, res) => {
  if (!isInt(req.params.id) || !db.prepare('SELECT 1 FROM dorms WHERE id = ? AND is_published = 1').get(Number(req.params.id)))
    return res.status(404).json({ error: 'Dorm not found.' });
  db.prepare('INSERT OR IGNORE INTO saved_dorms (user_id, dorm_id) VALUES (?, ?)').run(req.user.id, Number(req.params.id));
  res.json({ ok: true });
});

router.delete('/saved/:id', requireAuth, (req, res) => {
  if (isInt(req.params.id)) db.prepare('DELETE FROM saved_dorms WHERE user_id = ? AND dorm_id = ?').run(req.user.id, Number(req.params.id));
  res.json({ ok: true });
});

/* ----- inquiries ("Request owner contact") ----- */
router.post('/inquiries', requireRole('student'), (req, res) => {
  const { errors, value } = validateInquiry(req.body);
  if (Object.keys(errors).length) return fail(res, errors);

  const dorm = db.prepare('SELECT id, spaces, is_published FROM dorms WHERE id = ?').get(value.dormId);
  if (!dorm || !dorm.is_published) return res.status(404).json({ error: 'Dorm not found.' });
  if (dorm.spaces < 1) return res.status(409).json({ error: 'This dorm is currently full.' });

  if (db.prepare("SELECT 1 FROM inquiries WHERE dorm_id = ? AND student_id = ? AND status != 'closed'").get(dorm.id, req.user.id))
    return res.status(409).json({ error: 'You already have an open request for this dorm. The owner will get back to you.' });

  db.prepare('INSERT INTO inquiries (dorm_id, student_id, message, phone) VALUES (?,?,?,?)')
    .run(dorm.id, req.user.id, value.message, value.phone);
  res.status(201).json({ ok: true });
});

router.get('/me/inquiries', requireAuth, (req, res) => {
  const inquiries = db.prepare(`SELECT i.id, i.message, i.status, i.created_at AS createdAt, d.id AS dormId, d.name AS dormName
    FROM inquiries i JOIN dorms d ON d.id = i.dorm_id WHERE i.student_id = ? ORDER BY i.created_at DESC, i.id DESC`).all(req.user.id);
  res.json({ inquiries });
});

module.exports = router;

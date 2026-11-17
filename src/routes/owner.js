'use strict';
const express = require('express');
const { db, tx } = require('../db');
const { requireRole } = require('../auth');
const { toOwnerDorm } = require('../models');
const { validateDorm, fail, isInt, INQUIRY_STATUSES } = require('../validate');
const { saveDataUrl, isAllowedImageRef, deleteUpload, DEFAULT_IMAGE } = require('../images');

const router = express.Router();
router.use(requireRole('owner'));

const OWNER_SELECT = `SELECT d.*,
  (SELECT group_concat(amenity, '|') FROM dorm_amenities a WHERE a.dorm_id = d.id) AS amenity_list,
  (SELECT COUNT(*) FROM inquiries i WHERE i.dorm_id = d.id) AS inquiry_count
  FROM dorms d`;

const ownedDorm = (id, ownerId) => (isInt(id) ? db.prepare(`${OWNER_SELECT} WHERE d.id = ? AND d.owner_id = ?`).get(Number(id), ownerId) : null);
const notFound = (res) => res.status(404).json({ error: 'Listing not found.' });

/** Decide which image to store: new upload > pasted link > existing > default. */
function resolveImage(body, existing) {
  if (body.imageData) return saveDataUrl(body.imageData);
  const link = typeof body.image === 'string' ? body.image.trim() : '';
  if (link) {
    if (!isAllowedImageRef(link)) throw Object.assign(new Error('Photo link must start with http:// or https://'), { status: 400, field: 'image' });
    return link;
  }
  return existing || DEFAULT_IMAGE;
}

function setAmenities(dormId, amenities) {
  db.prepare('DELETE FROM dorm_amenities WHERE dorm_id = ?').run(dormId);
  const ins = db.prepare('INSERT INTO dorm_amenities (dorm_id, amenity) VALUES (?, ?)');
  amenities.forEach((a) => ins.run(dormId, a));
}

/* ----- listings ----- */
router.get('/dorms', (req, res) => {
  const rows = db.prepare(`${OWNER_SELECT} WHERE d.owner_id = ? ORDER BY d.id DESC`).all(req.user.id);
  res.json({ dorms: rows.map(toOwnerDorm) });
});

router.post('/dorms', (req, res) => {
  const { errors, value: v } = validateDorm(req.body);
  if (Object.keys(errors).length) return fail(res, errors);

  const image = resolveImage(req.body, null);
  const id = tx(() => {
    const info = db.prepare(`INSERT INTO dorms
      (owner_id, name, location, price, utilities, room_type, spaces, distance_km, description, image, contact_name, is_published)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(req.user.id, v.name, v.location, v.price, v.utilities, v.room, v.spaces,
      v.distance, v.description, image, v.contactName || req.user.name, v.isPublished ? 1 : 0);
    const dormId = Number(info.lastInsertRowid);
    setAmenities(dormId, v.amenities);
    return dormId;
  });
  res.status(201).json({ dorm: toOwnerDorm(ownedDorm(id, req.user.id)) });
});

router.put('/dorms/:id', (req, res) => {
  const existing = ownedDorm(req.params.id, req.user.id);
  if (!existing) return notFound(res);
  const { errors, value: v } = validateDorm(req.body);
  if (Object.keys(errors).length) return fail(res, errors);

  const image = resolveImage(req.body, existing.image);
  tx(() => {
    db.prepare(`UPDATE dorms SET name=?, location=?, price=?, utilities=?, room_type=?, spaces=?, distance_km=?,
      description=?, image=?, contact_name=?, is_published=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(v.name, v.location, v.price, v.utilities, v.room, v.spaces, v.distance, v.description, image,
        v.contactName || req.user.name, v.isPublished ? 1 : 0, existing.id);
    setAmenities(existing.id, v.amenities);
  });
  if (image !== existing.image) deleteUpload(existing.image);
  res.json({ dorm: toOwnerDorm(ownedDorm(existing.id, req.user.id)) });
});

// Quick actions from the dashboard: change vacancy count or hide/show a listing.
router.patch('/dorms/:id', (req, res) => {
  const existing = ownedDorm(req.params.id, req.user.id);
  if (!existing) return notFound(res);
  const { spaces, isPublished } = req.body || {};
  if (spaces !== undefined && (!isInt(spaces) || +spaces < 0 || +spaces > 99))
    return res.status(400).json({ error: 'Available spaces must be a whole number from 0 to 99.' });
  if (isPublished !== undefined && typeof isPublished !== 'boolean')
    return res.status(400).json({ error: 'isPublished must be true or false.' });

  db.prepare('UPDATE dorms SET spaces=?, is_published=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(spaces !== undefined ? Number(spaces) : existing.spaces,
      isPublished !== undefined ? (isPublished ? 1 : 0) : existing.is_published, existing.id);
  res.json({ dorm: toOwnerDorm(ownedDorm(existing.id, req.user.id)) });
});

router.delete('/dorms/:id', (req, res) => {
  const existing = ownedDorm(req.params.id, req.user.id);
  if (!existing) return notFound(res);
  db.prepare('DELETE FROM dorms WHERE id = ?').run(existing.id);
  deleteUpload(existing.image);
  res.json({ ok: true });
});

/* ----- inquiries received ----- */
router.get('/inquiries', (req, res) => {
  const inquiries = db.prepare(`SELECT i.id, i.message, i.phone, i.status, i.created_at AS createdAt,
      d.id AS dormId, d.name AS dormName, u.name AS studentName, u.email AS studentEmail
    FROM inquiries i JOIN dorms d ON d.id = i.dorm_id JOIN users u ON u.id = i.student_id
    WHERE d.owner_id = ? ORDER BY i.created_at DESC, i.id DESC`).all(req.user.id);
  res.json({ inquiries });
});

router.patch('/inquiries/:id', (req, res) => {
  const status = req.body && req.body.status;
  if (!INQUIRY_STATUSES.includes(status)) return res.status(400).json({ error: 'Status must be new, contacted or closed.' });
  const row = isInt(req.params.id) && db.prepare(`SELECT i.id FROM inquiries i JOIN dorms d ON d.id = i.dorm_id
    WHERE i.id = ? AND d.owner_id = ?`).get(Number(req.params.id), req.user.id);
  if (!row) return res.status(404).json({ error: 'Inquiry not found.' });
  db.prepare('UPDATE inquiries SET status = ? WHERE id = ?').run(status, row.id);
  res.json({ ok: true });
});

/* ----- owner analytics: how my listings compare with the market ----- */
router.get('/analytics', (req, res) => {
  const listings = db.prepare(`SELECT d.id, d.name, d.room_type AS room, d.price, d.spaces, d.views, d.is_published AS isPublished,
      (SELECT COUNT(*) FROM inquiries i WHERE i.dorm_id = d.id) AS inquiries,
      (SELECT CAST(ROUND(AVG(m.price)) AS INTEGER) FROM dorms m WHERE m.is_published = 1 AND m.room_type = d.room_type) AS marketAvg
    FROM dorms d WHERE d.owner_id = ? ORDER BY d.id`).all(req.user.id);
  const newInquiries = db.prepare(`SELECT COUNT(*) AS n FROM inquiries i JOIN dorms d ON d.id = i.dorm_id
    WHERE d.owner_id = ? AND i.status = 'new'`).get(req.user.id).n;

  res.json({
    totals: {
      listings: listings.length,
      published: listings.filter((l) => l.isPublished).length,
      views: listings.reduce((s, l) => s + l.views, 0),
      inquiries: listings.reduce((s, l) => s + l.inquiries, 0),
      newInquiries,
      openSpaces: listings.reduce((s, l) => s + l.spaces, 0)
    },
    listings: listings.map((l) => ({ ...l, isPublished: !!l.isPublished }))
  });
});

module.exports = router;

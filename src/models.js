'use strict';
const { db } = require('./db');
const { AMENITIES, ROOM_TYPES } = require('./validate');

const amenityOrder = (a) => AMENITIES.indexOf(a);

const DORM_SELECT = `
  SELECT d.*,
    (SELECT group_concat(amenity, '|') FROM dorm_amenities a WHERE a.dorm_id = d.id) AS amenity_list
  FROM dorms d`;

/** Shape sent to the browser (matches what the front-end already expected). */
function toDorm(row) {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    price: row.price,
    utilities: row.utilities,
    room: row.room_type,
    spaces: row.spaces,
    rating: row.rating,
    distance: row.distance_km,
    available: row.spaces > 0,
    amenities: row.amenity_list ? row.amenity_list.split('|').sort((a, b) => amenityOrder(a) - amenityOrder(b)) : [],
    image: row.image,
    description: row.description,
    owner: row.contact_name
  };
}

/** Owner view adds management fields. */
function toOwnerDorm(row) {
  return { ...toDorm(row), isPublished: !!row.is_published, views: row.views, inquiryCount: row.inquiry_count ?? 0 };
}

const listPublished = db.prepare(`${DORM_SELECT} WHERE d.is_published = 1
  ORDER BY (d.spaces > 0) DESC, (d.created_at >= datetime('now','-7 days')) DESC, d.id ASC`);
const getById = db.prepare(`${DORM_SELECT} WHERE d.id = ?`);

function getPublishedDorms() {
  return listPublished.all().map(toDorm);
}

function getDormRow(id) {
  return getById.get(id);
}

/** Market summary computed in SQL from published listings. */
function marketAnalytics() {
  const totals = db.prepare(`SELECT COUNT(*) AS total, COALESCE(AVG(price),0) AS avg_price,
      COALESCE(MIN(price),0) AS min_price, COALESCE(MAX(price),0) AS max_price,
      COALESCE(SUM(spaces > 0),0) AS available
    FROM dorms WHERE is_published = 1`).get();
  const byRoom = db.prepare(`SELECT room_type AS room, COUNT(*) AS count, AVG(price) AS avg
    FROM dorms WHERE is_published = 1 GROUP BY room_type`).all();
  const amenityRows = db.prepare(`SELECT a.amenity, COUNT(*) AS count FROM dorm_amenities a
    JOIN dorms d ON d.id = a.dorm_id WHERE d.is_published = 1 GROUP BY a.amenity`).all();

  return {
    totalListings: totals.total,
    availableCount: totals.available,
    avgRent: Math.round(totals.avg_price),
    minPrice: totals.min_price,
    maxPrice: totals.max_price,
    rentByRoom: ROOM_TYPES.map((room) => {
      const g = byRoom.find((r) => r.room === room);
      return { room, count: g ? g.count : 0, average: g ? Math.round(g.avg) : 0 };
    }),
    amenities: AMENITIES.map((amenity) => ({ amenity, count: (amenityRows.find((r) => r.amenity === amenity) || {}).count || 0 }))
  };
}

module.exports = { toDorm, toOwnerDorm, getPublishedDorms, getDormRow, marketAnalytics, DORM_SELECT };

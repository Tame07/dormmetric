'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'dormmetric.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('student','owner')),
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dorms (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  location     TEXT NOT NULL,
  price        INTEGER NOT NULL CHECK (price BETWEEN 0 AND 100000),
  utilities    INTEGER NOT NULL DEFAULT 0,
  room_type    TEXT NOT NULL CHECK (room_type IN ('Shared Room','Private Room','Bunk Bed','Studio Type')),
  spaces       INTEGER NOT NULL DEFAULT 0 CHECK (spaces >= 0),
  distance_km  REAL NOT NULL DEFAULT 0,
  rating       REAL,
  description  TEXT NOT NULL,
  image        TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  is_published INTEGER NOT NULL DEFAULT 1,
  views        INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dorms_owner ON dorms(owner_id);

CREATE TABLE IF NOT EXISTS dorm_amenities (
  dorm_id INTEGER NOT NULL REFERENCES dorms(id) ON DELETE CASCADE,
  amenity TEXT NOT NULL,
  PRIMARY KEY (dorm_id, amenity)
);

CREATE TABLE IF NOT EXISTS saved_dorms (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dorm_id    INTEGER NOT NULL REFERENCES dorms(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, dorm_id)
);

CREATE TABLE IF NOT EXISTS inquiries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  dorm_id    INTEGER NOT NULL REFERENCES dorms(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message    TEXT NOT NULL,
  phone      TEXT,
  status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','closed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_inquiries_dorm ON inquiries(dorm_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_student ON inquiries(student_id);
`);

/** Run fn inside a transaction; rolls back if it throws. */
function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { db, tx, DATA_DIR, UPLOAD_DIR };

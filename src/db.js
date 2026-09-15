import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS devotees (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  father_name  TEXT NOT NULL DEFAULT '',
  gender       TEXT NOT NULL DEFAULT '',
  phone        TEXT NOT NULL UNIQUE,
  alt_phone    TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL DEFAULT '',
  dob          TEXT NOT NULL DEFAULT '',
  address      TEXT NOT NULL DEFAULT '',
  city         TEXT NOT NULL DEFAULT '',
  state        TEXT NOT NULL DEFAULT '',
  pincode      TEXT NOT NULL DEFAULT '',
  native_place TEXT NOT NULL DEFAULT '',
  raasi        TEXT NOT NULL DEFAULT '',
  natchathram  TEXT NOT NULL DEFAULT '',
  caste        TEXT NOT NULL DEFAULT '',
  gothram      TEXT NOT NULL DEFAULT '',
  member_type  TEXT NOT NULL DEFAULT 'Devotee',
  notes        TEXT NOT NULL DEFAULT '',
  version      INTEGER NOT NULL DEFAULT 1,
  created_by   TEXT NOT NULL DEFAULT '',
  updated_by   TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_devotees_name ON devotees (name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_devotees_city ON devotees (city COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_devotees_stars ON devotees (raasi, natchathram);

CREATE TABLE IF NOT EXISTS family_members (
  id          INTEGER PRIMARY KEY,
  devotee_id  INTEGER NOT NULL REFERENCES devotees(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  name        TEXT NOT NULL,
  relation    TEXT NOT NULL DEFAULT '',
  raasi       TEXT NOT NULL DEFAULT '',
  natchathram TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_family_devotee ON family_members (devotee_id);
CREATE INDEX IF NOT EXISTS idx_family_name ON family_members (name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS donations (
  id           INTEGER PRIMARY KEY,
  devotee_id   INTEGER NOT NULL REFERENCES devotees(id) ON DELETE CASCADE,
  donated_on   TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  purpose      TEXT NOT NULL DEFAULT '',
  mode         TEXT NOT NULL DEFAULT '',
  receipt_no   TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_donations_devotee ON donations (devotee_id);
`;

export function openDatabase(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Brings databases created by earlier versions up to the current schema. */
function migrate(db) {
  const devoteeColumns = new Set(db.prepare('PRAGMA table_info(devotees)').all().map((column) => column.name));
  if (!devoteeColumns.has('version')) {
    db.exec('ALTER TABLE devotees ADD COLUMN version INTEGER NOT NULL DEFAULT 1');
  }
}

export function withTransaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

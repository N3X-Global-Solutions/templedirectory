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
  -- version, occupation, hundiyal_wanted: see ADDED_COLUMNS below
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
  -- phone: see ADDED_COLUMNS below
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

-- Small key/value store for things the admin can change at runtime (e.g. the public form link).
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Devotees who filled in the shared public form; they join the directory once an admin approves.
CREATE TABLE IF NOT EXISTS registrations (
  id           INTEGER PRIMARY KEY,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  payload      TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at  TEXT NOT NULL DEFAULT '',
  reviewed_by  TEXT NOT NULL DEFAULT '',
  devotee_id   INTEGER REFERENCES devotees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations (status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_registrations_phone ON registrations (phone);
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

/**
 * Columns added after the first release. Applied to new and existing databases alike,
 * so an older database file picks them up automatically on the next start.
 */
const ADDED_COLUMNS = Object.freeze([
  { table: 'devotees', column: 'version', definition: 'INTEGER NOT NULL DEFAULT 1' },
  { table: 'devotees', column: 'occupation', definition: "TEXT NOT NULL DEFAULT ''" },
  { table: 'devotees', column: 'hundiyal_wanted', definition: 'INTEGER NOT NULL DEFAULT 0 CHECK (hundiyal_wanted IN (0, 1))' },
  { table: 'family_members', column: 'phone', definition: "TEXT NOT NULL DEFAULT ''" },
]);

function migrate(db) {
  const existingColumns = (table) => new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  for (const { table, column, definition } of ADDED_COLUMNS) {
    if (!existingColumns(table).has(column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
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

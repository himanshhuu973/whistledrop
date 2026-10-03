const Database = require('better-sqlite3');
const config = require('./config');

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// NOTE: no IP address, user agent or any reporter-identifying column exists anywhere.
db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id             TEXT PRIMARY KEY,
    case_code_hash TEXT UNIQUE NOT NULL,
    category       TEXT NOT NULL,
    description    TEXT NOT NULL,
    evidence_url   TEXT,
    status         TEXT NOT NULL DEFAULT 'SUBMITTED',
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS status_updates (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id  TEXT NOT NULL REFERENCES reports(id),
    status     TEXT NOT NULL,
    message    TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS moderators (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
  CREATE INDEX IF NOT EXISTS idx_reports_category ON reports(category);
`);

module.exports = db;

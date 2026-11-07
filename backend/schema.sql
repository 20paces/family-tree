-- Private family-tree metadata. Apply with wrangler d1 execute, or the local dev server.
-- This file does not create an administrator. See bootstrap-admin.sql.

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'contributor', 'admin')),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT NOT NULL,
  sex TEXT,
  born INTEGER,
  died INTEGER,
  notes TEXT,
  branch TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  published INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'parent_biological', 'parent_adoptive', 'parent_step', 'partner', 'partner_former'
  )),
  version INTEGER NOT NULL DEFAULT 1,
  published INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS relationships_live
  ON relationships (from_id, to_id, kind)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_email TEXT NOT NULL,
  proposal_type TEXT NOT NULL,
  entity_id INTEGER,
  base_version INTEGER,
  payload TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewer_email TEXT
);

CREATE TABLE IF NOT EXISTS uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_email TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  caption TEXT,
  doc_date TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'deleted')),
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewer_email TEXT
);

CREATE TABLE IF NOT EXISTS upload_links (
  upload_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  PRIMARY KEY (upload_id, person_id)
);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  detail TEXT
);

-- Local preview identities only. People and sample documents are loaded from the public tree by seed-sample.js.
INSERT INTO members (email, role, status, created_at, updated_at) VALUES
  ('admin@example.test', 'admin', 'active', datetime('now'), datetime('now')),
  ('contributor@example.test', 'contributor', 'active', datetime('now'), datetime('now')),
  ('viewer@example.test', 'viewer', 'active', datetime('now'), datetime('now')),
  ('revoked@example.test', 'admin', 'revoked', datetime('now'), datetime('now'));

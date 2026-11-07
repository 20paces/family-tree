-- One-time administrator bootstrap. Do not commit a filled-in copy.
-- 1. Enforce MFA on the Cloudflare Access identity provider first.
-- 2. Replace the address below with that person's IdP email, then run:
--    npx wrangler d1 execute family-tree --remote --file=./bootstrap-admin.sql
-- 3. Delete the filled file from the operator machine. The app never
--    promotes the first visitor, and it never reads this file itself.

INSERT INTO members (email, role, status, created_at, updated_at)
VALUES ('REPLACE_WITH_ADMIN_EMAIL', 'admin', 'active', datetime('now'), datetime('now'));

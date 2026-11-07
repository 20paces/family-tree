# Private family-tree preview

Local preview of a Cloudflare Access, Worker, D1, and private R2 design. It does not provision Cloudflare, change DNS, or replace the public sample at the repository root.

The public viewer is `index.html`, `tree.js`, `docs/`, and `portraits/` at the repository root. This preview is `app/` and `backend/`. Opening the public page without `?data=approved` still shows the bundled sample.

## Run the preview

From the repository root:

```bash
cd backend
npm test
npm run dev
```

Open http://127.0.0.1:8788. The identity switcher is sent only as `X-Dev-User`, and the server accepts it only when `ENVIRONMENT=dev`, `DEV_IDENTITY=1`, and the host is `localhost` or `127.0.0.1`. Any other host returns 401. Production mode rejects the dev header even on localhost. The spoofable `Cf-Access-Authenticated-User-Email` header is ignored.

Example identities in `dev-seed.sql`:

- `admin@example.test` — review, membership, audit, backup
- `contributor@example.test` — proposals and own uploads
- `viewer@example.test` — approved tree and approved files only
- `revoked@example.test` — a signed-in identity is still denied

## What the server enforces

Every `/api` request checks a Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`) for issuer `https://$ACCESS_TEAM_DOMAIN`, audience `ACCESS_AUD`, an RS256 signature against the team JWKS, and expiry. `alg` other than RS256 is rejected. The email claim is then looked up in the membership table. Missing, unknown, and revoked members are denied. Viewers cannot upload, propose, or read the review queue. Contributors cannot approve, manage members, or download another person's pending file. Draft edits and pending uploads are absent from `GET /api/tree`.

Mutations also require `X-Family-Tree-Request: 1`.

Uploads are limited to 8 MB. JPEG, PNG, WebP, and PDF are accepted only when the magic bytes match the declared type. SVG, HTML, and script-looking bodies are rejected and are not stored. Downloads go through the API with `Content-Disposition: attachment`, `nosniff`, and a sandbox CSP.

Person updates carry `baseVersion`. Approval applies only when that version still matches; otherwise the API returns 409, writes an `edit_conflict` audit row, and leaves the published row unchanged. A second copy of the same partnership is rejected.

## Approved records on the existing chart

The Tree control opens `/canvas/?data=approved`. That is the same all-branch viewer. It loads `GET /api/tree`.

Biological parents and one current partner are the couple chart. Former partners, extra current partners, step parents, adoptive parents, half-siblings, and people with a single biological parent are named in the person details. People who cannot sit on the couple chart are listed under “Also recorded” on the wide chart and on the phone stack. They are not dropped. Sample documents are copied into the private file map by the seed and opened through `/api/files/:id`.

## Account prerequisites (not done)

`yabbs.cloud` is not in the connected Cloudflare account. Its nameservers are Hostinger. Access is not enabled, the token cannot read the organization, R2 is disabled, and no Workers or D1 databases were listed. Turning those on, moving DNS, and any billing change are a separate review. No production security is claimed.

`wrangler.toml` uses a placeholder D1 id and `DEV_IDENTITY=1`. Do not deploy it.

## Malware scanning

Magic-byte and markup checks stop renamed HTML and SVG. They do not detect malware inside a valid JPEG or PDF. Treat every approved file as untrusted and keep the attachment and sandbox headers.

## Deletion, recovery, backups

Uploads soft-delete to `deleted`. An administrator can restore them to `pending`.

`GET /api/admin/backup` returns a JSON bundle of the tables plus base64 file bytes. `POST /api/admin/backup` restores both. Only an administrator can call either, and restore requires the CSRF header. The local tests round-trip a backup, including a private blob, and show that clearing the file map makes downloads 404 until restore. Nothing in this app schedules that export. MEGA and any other off-site copy are out of scope. Restoring the tables without the file section, or the reverse, leaves metadata pointing at missing objects.

## Cutover

Not authorized from this repository. Do not change salon-hbr, Hostinger, or Cloudflare from here. A later review would attach Access, a Worker, D1, and a private bucket, then decide how the public sample on `yabbs.cloud` is replaced. Until that review, the public sample in this repo stays the dummy tree.

## Still open

Real Access tenant tests, MFA enforcement inside Cloudflare, malware scanning, and an external schedule for backups are not done. This preview is not a production deployment.

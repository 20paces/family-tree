# family-tree

Practice family tree. The pages at the repository root are the public all-branch viewer. They still use the bundled fictional sample (people, notes, spouses, documents, and the original parent links). Approved private records load only through the local preview, at `/canvas/?data=approved`.

`screenshot.png` and `screenshot-doc.png` are the earlier example captures and are kept as-is.

## Public sample

No install. Open `index.html`, or serve this directory.

```bash
node --test tree.test.js
node browser.check.js
```

`browser.check.js` needs Chrome. It serves this directory at `http://127.0.0.1:8765/`.

## Local private preview

`app/` and `backend/` are a local preview of a private record. They do not change DNS, Cloudflare, Hostinger, or the public sample.

```bash
cd backend
npm test
npm run dev
```

Open http://127.0.0.1:8788

The identity switcher sends `X-Dev-User`. The server accepts it only when `ENVIRONMENT=dev`, `DEV_IDENTITY=1`, and the host is `localhost` or `127.0.0.1`.

Example identities: `admin@example.test`, `contributor@example.test`, `viewer@example.test`, `revoked@example.test`.

Approved chart: http://127.0.0.1:8788/canvas/?data=approved&as=viewer@example.test

On that chart, biological parents and one current couple are the blood lines. Former partners, step parents, adoptive parents, half-siblings, and people who cannot sit on a couple line stay in the details and in “Also recorded”. They are not removed from the record.

## Limitations

This preview is not production-ready.

- `yabbs.cloud` is on Hostinger DNS. It is not in Cloudflare. Access and R2 are not enabled, the API token cannot read the organization, and no Workers or D1 database is configured. This repository does not provision those services.
- Do not deploy `backend/wrangler.toml`. Its D1 id, audience, and dev identity flag are placeholders.
- Upload checks look at type and magic bytes. They are not malware scanning.
- Backup export and restore are an administrator action against the local database and file map. Nothing schedules them, and nothing copies the bundle off the machine. MEGA is not part of this slice. Restoring rows without the file section leaves downloads at 404.
- Dev identity headers are refused in production, including on localhost. A missing, expired, wrong-issuer, wrong-audience, or non-RS256 Access token is rejected. Membership still has to be active.
- Do not change salon-hbr from this repository.

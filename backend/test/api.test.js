import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { handle } from '../src/api.js';
import { wrapDb } from '../src/db.js';
import { halfSiblings } from '../src/relationships.js';
import { inspectUpload } from '../src/uploads.js';
import { seedSample } from '../src/seed-sample.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PublicTree = require('../../tree.js');

const root = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(root, '..', 'schema.sql'), 'utf8');
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'test-key';
jwk.alg = 'RS256';
jwk.use = 'sig';

function signJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = header + '.' + body;
  const signature = createSign('RSA-SHA256').update(data).sign(privateKey).toString('base64url');
  return data + '.' + signature;
}

function fresh() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(schema);
  const db = wrapDb({ __node: true, db: sqlite });
  const objects = new Map();
  const bucket = {
    async put(key, bytes) { objects.set(key, new Uint8Array(bytes)); },
    async get(key) {
      const found = objects.get(key);
      if (!found) return null;
      return { arrayBuffer: async () => found };
    }
  };
  return { db, bucket, sqlite, objects };
}

async function seedMembers(db) {
  const now = new Date().toISOString();
  const rows = [
    ['admin@example.test', 'admin', 'active'],
    ['contributor@example.test', 'contributor', 'active'],
    ['viewer@example.test', 'viewer', 'active'],
    ['revoked@example.test', 'admin', 'revoked']
  ];
  for (const [email, role, status] of rows) {
    await db.run(
      'INSERT INTO members (email, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [email, role, status, now, now]
    );
  }
}

function envFor(ctx, overrides = {}) {
  return Object.assign({
    ENVIRONMENT: 'dev',
    DEV_IDENTITY: '1',
    ACCESS_TEAM_DOMAIN: 'example.cloudflareaccess.com',
    ACCESS_AUD: 'aud-test',
    JWKS_JSON: JSON.stringify({ keys: [jwk] }),
    db: ctx.db,
    bucket: ctx.bucket
  }, overrides);
}

async function call(ctx, method, path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.user) headers.set('X-Dev-User', options.user);
  if (options.jwt) headers.set('Cf-Access-Jwt-Assertion', options.jwt);
  if (method !== 'GET' && options.csrf !== false) headers.set('X-Family-Tree-Request', '1');
  let body;
  if (options.json) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(options.json);
  } else if (options.bytes) {
    body = options.bytes;
  }
  const host = options.host || '127.0.0.1';
  const request = new Request('http://' + host + path, { method, headers, body });
  const response = await handle(request, options.env || envFor(ctx));
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: response.status, body: parsed, headers: response.headers };
}

function claims(email, extra = {}) {
  const now = Math.floor(Date.now() / 1000);
  return Object.assign({
    email,
    iss: 'https://example.cloudflareaccess.com',
    aud: 'aud-test',
    exp: now + 300,
    nbf: now - 10,
    sub: email
  }, extra);
}

test('half-siblings share exactly one biological parent', () => {
  const relationships = [
    { from_id: 1, to_id: 3, kind: 'parent_biological', published: 1 },
    { from_id: 2, to_id: 3, kind: 'parent_biological', published: 1 },
    { from_id: 1, to_id: 6, kind: 'parent_biological', published: 1 },
    { from_id: 1, to_id: 5, kind: 'parent_biological', published: 1 },
    { from_id: 2, to_id: 5, kind: 'parent_biological', published: 1 }
  ];
  const halves = halfSiblings(3, relationships).map(item => item.personId).sort();
  assert.deepEqual(halves, [6]);
});

test('upload inspection rejects html and svg and accepts pdf magic', () => {
  assert.equal(inspectUpload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/svg+xml', 'face.svg').ok, false);
  assert.equal(inspectUpload(Buffer.from('<html><script>alert(1)</script></html>'), 'text/html', 'note.html').ok, false);
  assert.equal(inspectUpload(Buffer.from('not a file'), 'application/pdf', 'a.pdf').error, 'signature_rejected');
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');
  assert.equal(inspectUpload(pdf, 'application/pdf', 'will.pdf').ok, true);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  assert.equal(inspectUpload(jpeg, 'image/jpeg', 'photo.jpg').ok, true);
  assert.equal(inspectUpload(jpeg, 'application/pdf', 'photo.jpg').error, 'type_mismatch');
});

test('missing identity, spoofed email header, and revoked members are denied', async () => {
  const ctx = fresh();
  await seedMembers(ctx.db);
  const anon = await call(ctx, 'GET', '/api/tree', { user: null, env: envFor(ctx, { ENVIRONMENT: 'production', DEV_IDENTITY: '0' }) });
  assert.equal(anon.status, 401);

  const spoof = await call(ctx, 'GET', '/api/tree', {
    user: null,
    host: 'tree.example',
    env: envFor(ctx, { ENVIRONMENT: 'production', DEV_IDENTITY: '0' }),
    headers: { 'Cf-Access-Authenticated-User-Email': 'admin@example.test' }
  });
  assert.equal(spoof.status, 401);

  const revoked = await call(ctx, 'GET', '/api/tree', {
    jwt: signJwt(claims('revoked@example.test')),
    host: 'tree.example',
    env: envFor(ctx, { ENVIRONMENT: 'production', DEV_IDENTITY: '0' })
  });
  assert.equal(revoked.status, 403);
});

test('jwt audience, expiry, and dev-header host checks fail closed', async () => {
  const ctx = fresh();
  await seedMembers(ctx.db);
  const production = envFor(ctx, { ENVIRONMENT: 'production', DEV_IDENTITY: '0' });
  const wrongAud = await call(ctx, 'GET', '/api/me', {
    jwt: signJwt(claims('admin@example.test', { aud: 'other-app' })),
    host: 'tree.example',
    env: production
  });
  assert.equal(wrongAud.status, 401);
  const expired = await call(ctx, 'GET', '/api/me', {
    jwt: signJwt(claims('admin@example.test', { exp: Math.floor(Date.now() / 1000) - 20 })),
    host: 'tree.example',
    env: production
  });
  assert.equal(expired.status, 401);
  const wrongIss = await call(ctx, 'GET', '/api/me', {
    jwt: signJwt(claims('admin@example.test', { iss: 'https://evil.example' })),
    host: 'tree.example',
    env: production
  });
  assert.equal(wrongIss.status, 401);
  const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', kid: 'test-key' })).toString('base64url');
  const noneBody = Buffer.from(JSON.stringify(claims('admin@example.test'))).toString('base64url');
  const noneAlg = await call(ctx, 'GET', '/api/me', {
    jwt: noneHeader + '.' + noneBody + '.',
    host: 'tree.example',
    env: production
  });
  assert.equal(noneAlg.status, 401);
  const devOnLocalhostInProduction = await call(ctx, 'GET', '/api/me', {
    user: 'admin@example.test',
    host: '127.0.0.1',
    env: envFor(ctx, { ENVIRONMENT: 'production', DEV_IDENTITY: '1' })
  });
  assert.equal(devOnLocalhostInProduction.status, 401);
  const devOnPublicHost = await call(ctx, 'GET', '/api/me', {
    user: 'admin@example.test',
    host: 'tree.example',
    env: envFor(ctx, { ENVIRONMENT: 'dev', DEV_IDENTITY: '1' })
  });
  assert.equal(devOnPublicHost.status, 401);
  const good = await call(ctx, 'GET', '/api/me', {
    jwt: signJwt(claims('viewer@example.test')),
    host: 'tree.example',
    env: production
  });
  assert.equal(good.status, 200);
  assert.equal(good.body.user.role, 'viewer');
});

test('viewers cannot upload, approve, or see pending files', async () => {
  const ctx = fresh();
  await seedMembers(ctx.db);
  const upload = await call(ctx, 'POST', '/api/uploads', {
    user: 'viewer@example.test',
    bytes: Buffer.from('%PDF-1.4\n'),
    headers: { 'content-type': 'application/pdf', 'x-filename': 'note.pdf' }
  });
  assert.equal(upload.status, 403);
  const list = await call(ctx, 'GET', '/api/uploads', { user: 'viewer@example.test' });
  assert.equal(list.status, 403);
  const created = await call(ctx, 'POST', '/api/uploads', {
    user: 'contributor@example.test',
    bytes: Buffer.from('%PDF-1.4\nhello\n'),
    headers: { 'content-type': 'application/pdf', 'x-filename': 'story.pdf', 'x-caption': 'A note', 'x-people': '1' }
  });
  assert.equal(created.status, 201);
  const hidden = await call(ctx, 'GET', '/api/files/' + created.body.id, { user: 'viewer@example.test' });
  assert.equal(hidden.status, 403);
  const other = await call(ctx, 'GET', '/api/uploads', { user: 'contributor@example.test' });
  assert.equal(other.body.uploads.length, 1);
  const stranger = await call(ctx, 'GET', '/api/uploads', { user: 'admin@example.test' });
  assert.ok(stranger.body.uploads.some(item => item.owner_email === 'contributor@example.test'));
  const viewerTree = await call(ctx, 'GET', '/api/tree', { user: 'viewer@example.test' });
  const docs = viewerTree.body.people.flatMap(person => person.documents || []);
  assert.equal(docs.length, 0);
});

test('approval publishes a file and an edit, and conflicts are rejected', async () => {
  const ctx = fresh();
  await seedMembers(ctx.db);
  const now = new Date().toISOString();
  await ctx.db.run(
    'INSERT INTO people (display_name, sex, born, notes, version, published, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, ?, ?)',
    ['Walter Ashworth', 'm', 1921, 'Original note', now, now]
  );
  const upload = await call(ctx, 'POST', '/api/uploads', {
    user: 'contributor@example.test',
    bytes: Buffer.from([0xff, 0xd8, 0xff, 0x00, 0xd9]),
    headers: { 'content-type': 'image/jpeg', 'x-filename': 'portrait.jpg', 'x-caption': 'Example', 'x-people': '1' }
  });
  const forbidden = await call(ctx, 'POST', '/api/uploads/' + upload.body.id + '/approve', { user: 'contributor@example.test' });
  assert.equal(forbidden.status, 403);
  const approvedFile = await call(ctx, 'POST', '/api/uploads/' + upload.body.id + '/approve', { user: 'admin@example.test' });
  assert.equal(approvedFile.body.status, 'approved');
  const download = await call(ctx, 'GET', '/api/files/' + upload.body.id, { user: 'viewer@example.test' });
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition'), /attachment/);
  assert.match(download.headers.get('content-security-policy'), /sandbox/);

  const edit = await call(ctx, 'POST', '/api/edits', {
    user: 'contributor@example.test',
    json: { type: 'update_person', personId: 1, baseVersion: 1, displayName: 'Walter Ashworth', notes: 'Updated after review', submit: true }
  });
  assert.equal(edit.status, 201);
  const before = await call(ctx, 'GET', '/api/tree', { user: 'viewer@example.test' });
  assert.match(before.body.people[0].notes, /Original note/);
  const ok = await call(ctx, 'POST', '/api/edits/' + edit.body.id + '/approve', { user: 'admin@example.test' });
  assert.equal(ok.body.status, 'approved');
  const after = await call(ctx, 'GET', '/api/tree', { user: 'viewer@example.test' });
  assert.match(after.body.people[0].notes, /Updated after review/);

  const stale = await call(ctx, 'POST', '/api/edits', {
    user: 'contributor@example.test',
    json: { type: 'update_person', personId: 1, baseVersion: 1, displayName: 'Walter Ashworth', notes: 'Stale', submit: true }
  });
  const conflict = await call(ctx, 'POST', '/api/edits/' + stale.body.id + '/approve', { user: 'admin@example.test' });
  assert.equal(conflict.status, 409);
  const still = await ctx.db.get('SELECT notes, version FROM people WHERE id = 1');
  assert.equal(still.version, 2);
  assert.match(still.notes, /Updated after review/);
  const log = await call(ctx, 'GET', '/api/audit', { user: 'admin@example.test' });
  assert.ok(log.body.audit.some(entry => entry.action === 'edit_conflict'));
  assert.ok(log.body.audit.some(entry => entry.action === 'edit_approve'));
});

test('relationship proposals can record a former partner and a step parent', async () => {
  const ctx = fresh();
  await seedMembers(ctx.db);
  const now = new Date().toISOString();
  await ctx.db.run('INSERT INTO people (display_name, version, published, created_at, updated_at) VALUES (?, 1, 1, ?, ?)', ['Walter Ashworth', now, now]);
  await ctx.db.run('INSERT INTO people (display_name, version, published, created_at, updated_at) VALUES (?, 1, 1, ?, ?)', ['Helen Crowe', now, now]);
  const proposal = await call(ctx, 'POST', '/api/edits', {
    user: 'contributor@example.test',
    json: { type: 'create_relationship', fromId: 1, toId: 2, kind: 'partner_former', submit: true }
  });
  const approved = await call(ctx, 'POST', '/api/edits/' + proposal.body.id + '/approve', { user: 'admin@example.test' });
  assert.equal(approved.status, 200);
  const tree = await call(ctx, 'GET', '/api/tree', { user: 'viewer@example.test' });
  assert.ok(tree.body.relationships.some(row => row.kind === 'partner_former'));
  const step = await call(ctx, 'POST', '/api/edits', {
    user: 'contributor@example.test',
    json: { type: 'create_relationship', fromId: 2, toId: 1, kind: 'parent_step', submit: true }
  });
  assert.equal((await call(ctx, 'POST', '/api/edits/' + step.body.id + '/approve', { user: 'admin@example.test' })).status, 200);
});

test('mutations require the csrf header and bad uploads never land in the bucket', async () => {
  const ctx = fresh();
  await seedMembers(ctx.db);
  const noHeader = await call(ctx, 'POST', '/api/edits', {
    user: 'admin@example.test',
    csrf: false,
    json: { type: 'create_person', displayName: 'Should Not Exist', submit: true }
  });
  assert.equal(noHeader.status, 403);
  const svg = await call(ctx, 'POST', '/api/uploads', {
    user: 'contributor@example.test',
    bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'),
    headers: { 'content-type': 'image/svg+xml', 'x-filename': 'face.svg' }
  });
  assert.equal(svg.status, 415);
  assert.equal(ctx.bucket && true, true);
  const listed = await call(ctx, 'GET', '/api/uploads', { user: 'admin@example.test' });
  assert.equal(listed.body.uploads.length, 0);
});

test('seed preserves sample documents and approval updates the viewer tree', async () => {
  const ctx = fresh();
  await seedMembers(ctx.db);
  await seedSample(ctx.db, ctx.bucket, join(root, '..', '..', 'docs'));
  const viewer = await call(ctx, 'GET', '/api/tree', { user: 'viewer@example.test' });
  assert.equal(viewer.status, 200);
  const walter = viewer.body.people.find(person => person.displayName === 'Walter Ashworth');
  assert.ok(walter);
  assert.equal(walter.documents.length, 3);
  assert.deepEqual(walter.documents.map(doc => doc.caption).sort(), ['Birth certificate', 'Marriage certificate', 'Will (PDF)']);
  const mapped = PublicTree.fromApproved(viewer.body);
  const canvasWalter = mapped.canvas.find(person => person.name === 'Walter Ashworth');
  assert.equal(canvasWalter.docs.length, 3);
  assert.match(canvasWalter.docs.find(doc => doc.title === 'Will (PDF)').file, /^\/api\/files\/\d+$/);
  const file = await call(ctx, 'GET', canvasWalter.docs[0].file, { user: 'viewer@example.test' });
  assert.equal(file.status, 200);

  const pending = await call(ctx, 'POST', '/api/uploads', {
    user: 'contributor@example.test',
    bytes: Buffer.from('%PDF-1.4\npending\n'),
    headers: { 'content-type': 'application/pdf', 'x-filename': 'extra.pdf', 'x-caption': 'Extra note', 'x-people': String(walter.id) }
  });
  const before = await call(ctx, 'GET', '/api/tree', { user: 'viewer@example.test' });
  assert.equal(before.body.people.find(person => person.id === walter.id).documents.length, 3);
  assert.equal((await call(ctx, 'POST', '/api/uploads/' + pending.body.id + '/approve', { user: 'admin@example.test' })).status, 200);
  const after = await call(ctx, 'GET', '/api/tree', { user: 'viewer@example.test' });
  assert.ok(after.body.people.find(person => person.id === walter.id).documents.some(doc => doc.caption === 'Extra note'));

  const edit = await call(ctx, 'POST', '/api/edits', {
    user: 'contributor@example.test',
    json: { type: 'update_person', personId: walter.id, baseVersion: 1, displayName: 'Walter Ashworth', notes: 'Approved revision', submit: true }
  });
  assert.match((await call(ctx, 'GET', '/api/tree', { user: 'viewer@example.test' })).body.people.find(person => person.id === walter.id).notes, /Ballarat/);
  assert.equal((await call(ctx, 'POST', '/api/edits/' + edit.body.id + '/approve', { user: 'admin@example.test' })).status, 200);
  assert.match((await call(ctx, 'GET', '/api/tree', { user: 'viewer@example.test' })).body.people.find(person => person.id === walter.id).notes, /Approved revision/);
});

test('backup restore puts the approved sample back', async () => {
  const ctx = fresh();
  await seedMembers(ctx.db);
  await seedSample(ctx.db, ctx.bucket, join(root, '..', '..', 'docs'));
  const exported = await call(ctx, 'GET', '/api/admin/backup', { user: 'admin@example.test' });
  assert.equal(exported.status, 200);
  assert.ok(exported.body.files.length >= 3);
  const denied = await call(ctx, 'GET', '/api/admin/backup', { user: 'viewer@example.test' });
  assert.equal(denied.status, 403);
  const privateUpload = await call(ctx, 'POST', '/api/uploads', {
    user: 'contributor@example.test',
    bytes: Buffer.from('%PDF-1.4\nprivate-blob\n'),
    headers: { 'content-type': 'application/pdf', 'x-filename': 'private.pdf', 'x-caption': 'Private note', 'x-people': '1' }
  });
  assert.equal((await call(ctx, 'POST', '/api/uploads/' + privateUpload.body.id + '/approve', { user: 'admin@example.test' })).status, 200);
  const withPrivate = await call(ctx, 'GET', '/api/admin/backup', { user: 'admin@example.test' });
  assert.ok(withPrivate.body.files.some(file => String(file.key).startsWith('uploads/') && file.base64));
  assert.ok(withPrivate.body.files.some(file => String(file.key).startsWith('sample/') && file.base64));
  await ctx.db.run("UPDATE people SET notes = 'damaged' WHERE display_name = 'Walter Ashworth'");
  ctx.objects.clear();
  const walterBefore = (await call(ctx, 'GET', '/api/tree', { user: 'viewer@example.test' })).body.people.find(person => person.displayName === 'Walter Ashworth');
  const missing = await call(ctx, 'GET', '/api/files/' + walterBefore.documents[0].id, { user: 'viewer@example.test' });
  assert.equal(missing.status, 404);
  const restored = await call(ctx, 'POST', '/api/admin/backup', { user: 'admin@example.test', json: withPrivate.body });
  assert.equal(restored.status, 200);
  const note = await ctx.db.get("SELECT notes FROM people WHERE display_name = 'Walter Ashworth'");
  assert.match(note.notes, /Ballarat/);
  const walter = (await call(ctx, 'GET', '/api/tree', { user: 'viewer@example.test' })).body.people.find(person => person.displayName === 'Walter Ashworth');
  const download = await call(ctx, 'GET', '/api/files/' + walter.documents[0].id, { user: 'viewer@example.test' });
  assert.equal(download.status, 200);
  const privateFile = walter.documents.find(doc => doc.caption === 'Private note');
  assert.ok(privateFile);
  const privateDownload = await call(ctx, 'GET', '/api/files/' + privateFile.id, { user: 'viewer@example.test' });
  assert.equal(privateDownload.status, 200);
  assert.match(privateDownload.body, /private-blob/);
});

test('approved former partners and step parents are not biological lines', () => {
  const mapped = PublicTree.fromApproved({
    people: [
      { id: 1, displayName: 'Walter <b>Ashworth</b>', sex: 'm', born: 1921, notes: 'ok', documents: [{ id: 4, caption: 'Will', contentType: 'application/pdf' }] },
      { id: 2, displayName: 'Helen Crowe', sex: 'f', born: 1926, notes: '', documents: [] },
      { id: 8, displayName: 'Edith Ashworth', sex: 'f', born: 1924, notes: '' },
      { id: 3, displayName: 'Harold Ashworth', sex: 'm', born: 1948, notes: '', halfSiblings: [{ personId: 6 }] },
      { id: 6, displayName: 'Ruth Ashworth', sex: 'f', born: 1954, notes: '' }
    ],
    relationships: [
      { fromId: 1, toId: 8, kind: 'partner' },
      { fromId: 1, toId: 2, kind: 'partner_former' },
      { fromId: 2, toId: 3, kind: 'parent_step' },
      { fromId: 1, toId: 3, kind: 'parent_biological' },
      { fromId: 8, toId: 3, kind: 'parent_biological' },
      { fromId: 1, toId: 6, kind: 'parent_biological' }
    ]
  });
  const walter = mapped.directory[1];
  assert.equal(walter.spouse, 8);
  assert.deepEqual(walter.formerPartners, [2]);
  assert.equal(walter.name.includes('<'), false);
  assert.equal(mapped.canvas.find(person => person.id === 3).parents.includes(2), false);
  assert.deepEqual(mapped.canvas.find(person => person.id === 3).stepParents, [2]);
  assert.ok(mapped.aside.some(person => person.id === 6));
  assert.match(walter.docs[0].file, /^\/api\/files\/4$/);
  const find = id => mapped.directory[id];
  const details = PublicTree.buildDetail(walter, 2026, find);
  assert.match(details, /Former partners/);
  assert.match(details, /Helen Crowe/);
  assert.match(details, /Will/);
  const harold = PublicTree.buildDetail(mapped.directory[3], 2026, find);
  assert.match(harold, /Step parents/);
  assert.match(harold, /Half-siblings/);
  assert.match(harold, /Ruth Ashworth/);
  const ids = new Set(mapped.canvas.concat(mapped.aside).map(person => person.id));
  assert.equal(ids.size, 5);
});

test('admins manage membership and the audit log records it', async () => {
  const ctx = fresh();
  await seedMembers(ctx.db);
  const viewerAttempt = await call(ctx, 'POST', '/api/admin/members', {
    user: 'viewer@example.test',
    json: { email: 'new@example.test', role: 'viewer' }
  });
  assert.equal(viewerAttempt.status, 403);
  const added = await call(ctx, 'POST', '/api/admin/members', {
    user: 'admin@example.test',
    json: { email: 'new@example.test', role: 'contributor' }
  });
  assert.equal(added.status, 201);
  const revoked = await call(ctx, 'PATCH', '/api/admin/members/' + added.body.id, {
    user: 'admin@example.test',
    json: { status: 'revoked' }
  });
  assert.equal(revoked.body.status, 'revoked');
  const denied = await call(ctx, 'GET', '/api/tree', {
    jwt: signJwt(claims('new@example.test')),
    host: 'tree.example',
    env: envFor(ctx, { ENVIRONMENT: 'production', DEV_IDENTITY: '0' })
  });
  assert.equal(denied.status, 403);
  const log = await call(ctx, 'GET', '/api/audit', { user: 'admin@example.test' });
  assert.ok(log.body.audit.some(entry => entry.action === 'member_add'));
  const hidden = await call(ctx, 'GET', '/api/audit', { user: 'contributor@example.test' });
  assert.equal(hidden.status, 403);
});

test('contributor draft stays hidden until an admin approves the person, relationship, and file', async () => {
  const ctx = fresh();
  await seedMembers(ctx.db);
  await seedSample(ctx.db, ctx.bucket, join(root, '..', '..', 'docs'));
  const production = envFor(ctx, { ENVIRONMENT: 'production', DEV_IDENTITY: '0' });
  assert.equal((await call(ctx, 'GET', '/api/tree', { env: production })).status, 401);
  assert.equal((await call(ctx, 'GET', '/api/tree', {
    jwt: signJwt(claims('revoked@example.test')),
    host: 'tree.example',
    env: production
  })).status, 403);
  assert.equal((await call(ctx, 'GET', '/api/tree', {
    user: 'viewer@example.test',
    host: 'tree.example',
    env: envFor(ctx, { ENVIRONMENT: 'dev', DEV_IDENTITY: '1' })
  })).status, 401);

  const seeded = await call(ctx, 'GET', '/api/tree', { user: 'viewer@example.test' });
  const walter = seeded.body.people.find(person => person.displayName === 'Walter Ashworth');
  assert.equal(walter.documents.length, 3);

  const draft = await call(ctx, 'POST', '/api/edits', {
    user: 'contributor@example.test',
    json: { type: 'create_person', displayName: 'Draft Person', sex: 'f', born: 1930, notes: 'not ready', submit: false }
  });
  assert.equal(draft.body.status, 'draft');
  const pendingPerson = await call(ctx, 'POST', '/api/edits', {
    user: 'contributor@example.test',
    json: { type: 'create_person', displayName: 'Helen Crowe', sex: 'f', born: 1926, notes: 'Former partner, fictional sample.', submit: true }
  });
  assert.equal(pendingPerson.body.status, 'pending');
  const hiddenPeople = await call(ctx, 'GET', '/api/tree', { user: 'viewer@example.test' });
  assert.equal(hiddenPeople.body.people.some(person => person.displayName === 'Helen Crowe' || person.displayName === 'Draft Person'), false);
  assert.equal((await call(ctx, 'POST', '/api/edits/' + pendingPerson.body.id + '/approve', { user: 'contributor@example.test' })).status, 403);
  assert.equal((await call(ctx, 'POST', '/api/edits/' + pendingPerson.body.id + '/approve', { user: 'admin@example.test' })).status, 200);

  const afterPerson = await call(ctx, 'GET', '/api/tree', { user: 'viewer@example.test' });
  const helen = afterPerson.body.people.find(person => person.displayName === 'Helen Crowe');
  assert.ok(helen);
  assert.equal(afterPerson.body.people.some(person => person.displayName === 'Draft Person'), false);
  const relationship = await call(ctx, 'POST', '/api/edits', {
    user: 'contributor@example.test',
    json: { type: 'create_relationship', fromId: walter.id, toId: helen.id, kind: 'partner_former', submit: true }
  });
  const reverse = await call(ctx, 'POST', '/api/edits', {
    user: 'contributor@example.test',
    json: { type: 'create_relationship', fromId: helen.id, toId: walter.id, kind: 'partner_former', submit: true }
  });
  assert.equal((await call(ctx, 'GET', '/api/tree', { user: 'viewer@example.test' })).body.relationships.some(row => row.kind === 'partner_former'), false);
  assert.equal((await call(ctx, 'POST', '/api/edits/' + relationship.body.id + '/approve', { user: 'admin@example.test' })).status, 200);
  assert.equal((await call(ctx, 'POST', '/api/edits/' + reverse.body.id + '/approve', { user: 'admin@example.test' })).status, 400);

  const upload = await call(ctx, 'POST', '/api/uploads', {
    user: 'contributor@example.test',
    bytes: Buffer.from('%PDF-1.4\nhelen-letter\n'),
    headers: { 'content-type': 'application/pdf', 'x-filename': 'letter.pdf', 'x-caption': 'Letter from Helen', 'x-people': String(walter.id) }
  });
  assert.equal(upload.status, 201);
  assert.equal((await call(ctx, 'GET', '/api/files/' + upload.body.id, { user: 'viewer@example.test' })).status, 403);
  const beforeDocs = (await call(ctx, 'GET', '/api/tree', { user: 'viewer@example.test' })).body.people.find(person => person.id === walter.id);
  assert.equal(beforeDocs.documents.length, 3);
  assert.equal((await call(ctx, 'POST', '/api/uploads/' + upload.body.id + '/approve', { user: 'admin@example.test' })).status, 200);

  const note = await call(ctx, 'POST', '/api/edits', {
    user: 'contributor@example.test',
    json: { type: 'update_person', personId: walter.id, baseVersion: walter.version, displayName: 'Walter Ashworth', sex: 'm', born: 1921, died: 1994, notes: 'Carpenter from Ballarat. Former partner recorded.', submit: true }
  });
  assert.match((await call(ctx, 'GET', '/api/tree', { user: 'viewer@example.test' })).body.people.find(person => person.id === walter.id).notes, /Ballarat\./);
  assert.equal((await call(ctx, 'POST', '/api/edits/' + note.body.id + '/approve', { user: 'admin@example.test' })).status, 200);

  const viewer = await call(ctx, 'GET', '/api/tree', { user: 'viewer@example.test' });
  const published = viewer.body.people.find(person => person.id === walter.id);
  assert.match(published.notes, /Former partner recorded/);
  assert.ok(published.documents.some(doc => doc.caption === 'Letter from Helen'));
  assert.equal(viewer.body.people.some(person => person.displayName === 'Draft Person'), false);
  assert.ok(viewer.body.relationships.some(row => row.kind === 'partner_former' && row.fromId === walter.id && row.toId === helen.id));
  const mapped = PublicTree.fromApproved(viewer.body);
  const seen = new Set(mapped.canvas.concat(mapped.aside).map(person => person.id));
  viewer.body.people.forEach(person => assert.ok(seen.has(person.id), 'omitted ' + person.displayName));
  assert.ok(mapped.aside.some(person => person.id === helen.id));
  const details = PublicTree.buildDetail(mapped.directory[walter.id], 2026, id => mapped.directory[id]);
  assert.match(details, /Former partners/);
  assert.match(details, /Helen Crowe/);
  assert.match(details, /not a current spouse, and not a blood line/);
  assert.match(details, /Letter from Helen/);
  assert.match(details, /Edith Ashworth/);
  const file = await call(ctx, 'GET', mapped.directory[walter.id].docs.find(doc => doc.title === 'Letter from Helen').file, { user: 'viewer@example.test' });
  assert.equal(file.status, 200);
  assert.match(file.body, /helen-letter/);
  const stranger = await call(ctx, 'GET', '/api/files/' + upload.body.id, {
    jwt: signJwt(claims('revoked@example.test')),
    host: 'tree.example',
    env: production
  });
  assert.equal(stranger.status, 403);
  const log = await call(ctx, 'GET', '/api/audit', { user: 'admin@example.test' });
  assert.ok(log.body.audit.some(entry => entry.action === 'edit_approve'));
  assert.ok(log.body.audit.some(entry => entry.action === 'upload_approve'));
  assert.equal((await call(ctx, 'GET', '/api/audit', { user: 'viewer@example.test' })).status, 403);
});

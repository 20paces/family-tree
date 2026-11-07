import { authenticate, requireRole, allowDevIdentity } from './auth.js';
import { nowIso } from './db.js';
import { RELATION_KINDS, isRelationKind, halfSiblings } from './relationships.js';
import { inspectUpload, safeDownloadName } from './uploads.js';
import { exportBackup, restoreBackup } from './backup.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function bad(error, status) {
  return json({ error }, status);
}

async function audit(db, actor, action, entityType, entityId, detail) {
  await db.run(
    'INSERT INTO audit (at, actor_email, action, entity_type, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)',
    [nowIso(), actor, action, entityType, entityId == null ? null : String(entityId), detail ? JSON.stringify(detail) : null]
  );
}

function publishedPerson(row) {
  return {
    id: row.id,
    displayName: row.display_name,
    sex: row.sex,
    born: row.born,
    died: row.died,
    notes: row.notes,
    version: row.version
  };
}

async function treePayload(db) {
  const people = await db.all(
    'SELECT * FROM people WHERE published = 1 AND deleted_at IS NULL ORDER BY born, id'
  );
  const relationships = await db.all(
    'SELECT * FROM relationships WHERE published = 1 AND deleted_at IS NULL ORDER BY id'
  );
  const uploads = await db.all(
    `SELECT uploads.id, uploads.filename, uploads.content_type, uploads.caption, uploads.doc_date,
            upload_links.person_id
     FROM uploads
     LEFT JOIN upload_links ON upload_links.upload_id = uploads.id
     WHERE uploads.status = 'approved'`
  );
  const byPerson = {};
  uploads.forEach(row => {
    if (!row.person_id) return;
    if (!byPerson[row.person_id]) byPerson[row.person_id] = [];
    byPerson[row.person_id].push({
      id: row.id,
      filename: row.filename,
      contentType: row.content_type,
      caption: row.caption,
      docDate: row.doc_date
    });
  });
  return {
    people: people.map(person => Object.assign(publishedPerson(person), {
      documents: byPerson[person.id] || [],
      halfSiblings: halfSiblings(person.id, relationships)
    })),
    relationships: relationships.map(row => ({
      id: row.id,
      fromId: row.from_id,
      toId: row.to_id,
      kind: row.kind,
      version: row.version
    }))
  };
}

async function applyEdit(db, edit) {
  const payload = JSON.parse(edit.payload);
  if (payload.type === 'create_person') {
    const created = await db.run(
      `INSERT INTO people (display_name, sex, born, died, notes, version, published, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)`,
      [payload.displayName, payload.sex || null, payload.born ?? null, payload.died ?? null, payload.notes || '', nowIso(), nowIso()]
    );
    return { entityId: created.lastRowId };
  }
  if (payload.type === 'update_person') {
    const result = await db.run(
      `UPDATE people
       SET display_name = ?, sex = ?, born = ?, died = ?, notes = ?, version = version + 1, updated_at = ?
       WHERE id = ? AND version = ? AND deleted_at IS NULL`,
      [payload.displayName, payload.sex || null, payload.born ?? null, payload.died ?? null, payload.notes || '', nowIso(), payload.personId, edit.base_version]
    );
    if (!result.changes) return { conflict: true };
    return { entityId: payload.personId };
  }
  if (payload.type === 'create_relationship') {
    const from = await db.get('SELECT id FROM people WHERE id = ? AND deleted_at IS NULL', [payload.fromId]);
    const to = await db.get('SELECT id FROM people WHERE id = ? AND deleted_at IS NULL', [payload.toId]);
    if (!from || !to) return { error: 'unknown_person' };
    const undirected = payload.kind === 'partner' || payload.kind === 'partner_former';
    const existing = undirected
      ? await db.get(
        `SELECT id FROM relationships
         WHERE deleted_at IS NULL AND kind = ?
           AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))`,
        [payload.kind, payload.fromId, payload.toId, payload.toId, payload.fromId]
      )
      : await db.get(
        'SELECT id FROM relationships WHERE deleted_at IS NULL AND kind = ? AND from_id = ? AND to_id = ?',
        [payload.kind, payload.fromId, payload.toId]
      );
    if (existing) return { error: 'relationship_exists' };
    try {
      const created = await db.run(
        `INSERT INTO relationships (from_id, to_id, kind, version, published, created_at)
         VALUES (?, ?, ?, 1, 1, ?)`,
        [payload.fromId, payload.toId, payload.kind, nowIso()]
      );
      return { entityId: created.lastRowId };
    } catch {
      return { error: 'relationship_exists' };
    }
  }
  return { error: 'unknown_proposal' };
}

function validateProposal(body) {
  if (!body || typeof body !== 'object') return 'invalid_proposal';
  if (body.type === 'create_person' || body.type === 'update_person') {
    const name = String(body.displayName || '').trim();
    if (name.length < 1 || name.length > 120) return 'invalid_name';
    if (body.notes && String(body.notes).length > 2000) return 'invalid_notes';
    if (body.type === 'update_person' && (!body.personId || body.baseVersion == null)) return 'missing_version';
    return null;
  }
  if (body.type === 'create_relationship') {
    if (!body.fromId || !body.toId || body.fromId === body.toId) return 'invalid_relationship';
    if (!isRelationKind(body.kind)) return 'invalid_kind';
    return null;
  }
  return 'invalid_proposal';
}

async function readBody(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 8 * 1024 * 1024 + 1024) return { error: 'too_large' };
  const buffer = new Uint8Array(await request.arrayBuffer());
  if (buffer.length > 8 * 1024 * 1024) return { error: 'too_large' };
  return { bytes: buffer };
}

export async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/')) return json({ error: 'not_found' }, 404);
  const db = env.db;
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'allow': 'GET, POST, PATCH, DELETE, OPTIONS' } });
  }
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) return bad('method_not_allowed', 405);
  if (method !== 'GET' && request.headers.get('X-Family-Tree-Request') !== '1') {
    return bad('csrf_rejected', 403);
  }

  if (path === '/api/config' && method === 'GET') {
    return json({ devIdentity: allowDevIdentity(request, env) === true });
  }

  const auth = await authenticate(request, env, db);
  if (auth.error) return bad(auth.error, auth.status);
  const user = auth.user;

  if (path === '/api/me' && method === 'GET') return json({ user });

  if (path === '/api/tree' && method === 'GET') {
    const denied = requireRole(user, ['viewer', 'contributor', 'admin']);
    if (denied) return bad(denied.error, denied.status);
    return json(await treePayload(db));
  }

  if (path === '/api/edits' && method === 'GET') {
    const denied = requireRole(user, ['contributor', 'admin']);
    if (denied) return bad(denied.error, denied.status);
    const rows = user.role === 'admin'
      ? await db.all('SELECT * FROM edits ORDER BY id DESC')
      : await db.all('SELECT * FROM edits WHERE author_email = ? ORDER BY id DESC', [user.email]);
    return json({ edits: rows });
  }

  if (path === '/api/edits' && method === 'POST') {
    const denied = requireRole(user, ['contributor', 'admin']);
    if (denied) return bad(denied.error, denied.status);
    const raw = await request.text();
    if (raw.length > 100000) return bad('too_large', 413);
    let body;
    try { body = JSON.parse(raw); } catch { return bad('invalid_json', 400); }
    const problem = validateProposal(body);
    if (problem) return bad(problem, 400);
    const status = body.submit === false ? 'draft' : 'pending';
    const created = await db.run(
      `INSERT INTO edits (author_email, proposal_type, entity_id, base_version, payload, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user.email, body.type, body.personId || null, body.baseVersion ?? null, JSON.stringify(body), status, nowIso()]
    );
    await audit(db, user.email, 'edit_create', 'edit', created.lastRowId, { status, type: body.type });
    return json({ id: created.lastRowId, status }, 201);
  }

  const editAction = path.match(/^\/api\/edits\/(\d+)\/(approve|reject)$/);
  if (editAction && method === 'POST') {
    const denied = requireRole(user, ['admin']);
    if (denied) return bad(denied.error, denied.status);
    const edit = await db.get('SELECT * FROM edits WHERE id = ?', [Number(editAction[1])]);
    if (!edit) return bad('not_found', 404);
    if (edit.status !== 'pending' && edit.status !== 'draft') return bad('already_reviewed', 409);
    if (editAction[2] === 'reject') {
      await db.run(
        'UPDATE edits SET status = ?, reviewed_at = ?, reviewer_email = ? WHERE id = ?',
        ['rejected', nowIso(), user.email, edit.id]
      );
      await audit(db, user.email, 'edit_reject', 'edit', edit.id, null);
      return json({ status: 'rejected' });
    }
    let parsedProposal;
    try { parsedProposal = JSON.parse(edit.payload); } catch { return bad('invalid_proposal', 400); }
    const proposalProblem = validateProposal(parsedProposal);
    if (proposalProblem) return bad(proposalProblem, 400);
    const applied = await applyEdit(db, edit);
    if (applied.conflict) {
      await audit(db, user.email, 'edit_conflict', 'edit', edit.id, { baseVersion: edit.base_version });
      return bad('version_conflict', 409);
    }
    if (applied.error) return bad(applied.error, 400);
    await db.run(
      'UPDATE edits SET status = ?, reviewed_at = ?, reviewer_email = ?, entity_id = ? WHERE id = ?',
      ['approved', nowIso(), user.email, applied.entityId, edit.id]
    );
    await audit(db, user.email, 'edit_approve', 'edit', edit.id, { entityId: applied.entityId });
    return json({ status: 'approved', entityId: applied.entityId });
  }

  if (path === '/api/uploads' && method === 'GET') {
    const denied = requireRole(user, ['contributor', 'admin']);
    if (denied) return bad(denied.error, denied.status);
    const rows = user.role === 'admin'
      ? await db.all('SELECT id, owner_email, filename, content_type, byte_size, caption, doc_date, status, created_at FROM uploads ORDER BY id DESC')
      : await db.all(
        'SELECT id, owner_email, filename, content_type, byte_size, caption, doc_date, status, created_at FROM uploads WHERE owner_email = ? ORDER BY id DESC',
        [user.email]
      );
    return json({ uploads: rows });
  }

  if (path === '/api/uploads' && method === 'POST') {
    const denied = requireRole(user, ['contributor', 'admin']);
    if (denied) return bad(denied.error, denied.status);
    const incoming = await readBody(request);
    if (incoming.error) return bad(incoming.error, 413);
    const inspected = inspectUpload(
      incoming.bytes,
      request.headers.get('content-type'),
      request.headers.get('x-filename')
    );
    if (!inspected.ok) return bad(inspected.error, 415);
    const caption = String(request.headers.get('x-caption') || '').slice(0, 500);
    const docDate = String(request.headers.get('x-doc-date') || '').slice(0, 32);
    const people = String(request.headers.get('x-people') || '')
      .split(',')
      .map(item => Number(item))
      .filter(item => Number.isInteger(item) && item > 0);
    const key = 'uploads/' + crypto.randomUUID();
    await env.bucket.put(key, incoming.bytes, { httpMetadata: { contentType: inspected.contentType } });
    const created = await db.run(
      `INSERT INTO uploads (owner_email, r2_key, filename, content_type, byte_size, caption, doc_date, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [user.email, key, safeDownloadName(request.headers.get('x-filename'), inspected.ext), inspected.contentType, incoming.bytes.length, caption, docDate, nowIso()]
    );
    for (const personId of people) {
      const person = await db.get('SELECT id FROM people WHERE id = ? AND deleted_at IS NULL', [personId]);
      if (person) {
        await db.run('INSERT INTO upload_links (upload_id, person_id) VALUES (?, ?)', [created.lastRowId, personId]);
      }
    }
    await audit(db, user.email, 'upload_create', 'upload', created.lastRowId, { contentType: inspected.contentType, people });
    return json({ id: created.lastRowId, status: 'pending' }, 201);
  }

  const uploadReview = path.match(/^\/api\/uploads\/(\d+)\/(approve|reject|restore)$/);
  if (uploadReview && method === 'POST') {
    const denied = requireRole(user, ['admin']);
    if (denied) return bad(denied.error, denied.status);
    const upload = await db.get('SELECT * FROM uploads WHERE id = ?', [Number(uploadReview[1])]);
    if (!upload) return bad('not_found', 404);
    const next = uploadReview[2] === 'approve' ? 'approved' : uploadReview[2] === 'restore' ? 'pending' : 'rejected';
    if (uploadReview[2] === 'restore' && upload.status !== 'deleted') return bad('not_deleted', 409);
    await db.run(
      'UPDATE uploads SET status = ?, reviewed_at = ?, reviewer_email = ? WHERE id = ?',
      [next, nowIso(), user.email, upload.id]
    );
    await audit(db, user.email, 'upload_' + uploadReview[2], 'upload', upload.id, null);
    return json({ status: next });
  }

  const uploadDelete = path.match(/^\/api\/uploads\/(\d+)$/);
  if (uploadDelete && method === 'DELETE') {
    const upload = await db.get('SELECT * FROM uploads WHERE id = ?', [Number(uploadDelete[1])]);
    if (!upload) return bad('not_found', 404);
    if (user.role !== 'admin' && upload.owner_email !== user.email) return bad('forbidden', 403);
    await db.run("UPDATE uploads SET status = 'deleted', reviewed_at = ?, reviewer_email = ? WHERE id = ?", [nowIso(), user.email, upload.id]);
    await audit(db, user.email, 'upload_delete', 'upload', upload.id, null);
    return json({ status: 'deleted' });
  }

  const fileRoute = path.match(/^\/api\/files\/(\d+)$/);
  if (fileRoute && method === 'GET') {
    const upload = await db.get('SELECT * FROM uploads WHERE id = ?', [Number(fileRoute[1])]);
    if (!upload || upload.status === 'deleted') return bad('not_found', 404);
    const owner = upload.owner_email === user.email;
    const staff = user.role === 'admin';
    if (upload.status !== 'approved' && !owner && !staff) return bad('forbidden', 403);
    const object = await env.bucket.get(upload.r2_key);
    if (!object) return bad('not_found', 404);
    const bytes = object.arrayBuffer ? await object.arrayBuffer() : object.body;
    return new Response(bytes, {
      status: 200,
      headers: {
        'content-type': upload.content_type,
        'content-disposition': 'attachment; filename="' + upload.filename.replace(/"/g, '') + '"',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
        'cache-control': 'private, no-store'
      }
    });
  }

  if (path === '/api/admin/members' && method === 'GET') {
    const denied = requireRole(user, ['admin']);
    if (denied) return bad(denied.error, denied.status);
    return json({ members: await db.all('SELECT id, email, role, status, created_at, updated_at FROM members ORDER BY email') });
  }

  if (path === '/api/admin/members' && method === 'POST') {
    const denied = requireRole(user, ['admin']);
    if (denied) return bad(denied.error, denied.status);
    let body;
    try { body = await request.json(); } catch { return bad('invalid_json', 400); }
    const email = String(body.email || '').trim().toLowerCase();
    const role = body.role;
    if (!email.includes('@') || !['viewer', 'contributor', 'admin'].includes(role)) return bad('invalid_member', 400);
    const existing = await db.get('SELECT id FROM members WHERE email = ?', [email]);
    if (existing) return bad('already_member', 409);
    const created = await db.run(
      'INSERT INTO members (email, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [email, role, 'active', nowIso(), nowIso()]
    );
    await audit(db, user.email, 'member_add', 'member', created.lastRowId, { email, role });
    return json({ id: created.lastRowId }, 201);
  }

  const memberPatch = path.match(/^\/api\/admin\/members\/(\d+)$/);
  if (memberPatch && method === 'PATCH') {
    const denied = requireRole(user, ['admin']);
    if (denied) return bad(denied.error, denied.status);
    let body;
    try { body = await request.json(); } catch { return bad('invalid_json', 400); }
    const member = await db.get('SELECT * FROM members WHERE id = ?', [Number(memberPatch[1])]);
    if (!member) return bad('not_found', 404);
    const role = body.role || member.role;
    const status = body.status || member.status;
    if (!['viewer', 'contributor', 'admin'].includes(role)) return bad('invalid_member', 400);
    if (!['active', 'revoked'].includes(status)) return bad('invalid_member', 400);
    if (member.email === user.email && status === 'revoked') return bad('cannot_revoke_self', 409);
    await db.run('UPDATE members SET role = ?, status = ?, updated_at = ? WHERE id = ?', [role, status, nowIso(), member.id]);
    await audit(db, user.email, 'member_update', 'member', member.id, { role, status });
    return json({ id: member.id, role, status });
  }

  if (path === '/api/admin/backup' && method === 'GET') {
    const denied = requireRole(user, ['admin']);
    if (denied) return bad(denied.error, denied.status);
    const bundle = await exportBackup(db, env.bucket);
    await audit(db, user.email, 'backup_export', 'backup', null, { files: bundle.files.length });
    return json(bundle);
  }

  if (path === '/api/admin/backup' && method === 'POST') {
    const denied = requireRole(user, ['admin']);
    if (denied) return bad(denied.error, denied.status);
    const raw = await request.text();
    if (raw.length > 20 * 1024 * 1024) return bad('too_large', 413);
    let bundle;
    try { bundle = JSON.parse(raw); } catch { return bad('invalid_json', 400); }
    try {
      const restored = await restoreBackup(db, env.bucket, bundle);
      await audit(db, user.email, 'backup_restore', 'backup', null, restored);
      return json({ status: 'restored', files: restored.files });
    } catch {
      return bad('bad_backup', 400);
    }
  }

  if (path === '/api/audit' && method === 'GET') {
    const denied = requireRole(user, ['admin']);
    if (denied) return bad(denied.error, denied.status);
    return json({ audit: await db.all('SELECT id, at, actor_email, action, entity_type, entity_id, detail FROM audit ORDER BY id DESC LIMIT 200') });
  }

  return bad('not_found', 404);
}

export { RELATION_KINDS };

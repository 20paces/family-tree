// Local export and restore. Scheduling this is an external job, not part of the app.
// Bytes are base64 in the JSON bundle. Nothing copies that bundle off the machine.
const TABLE_ORDER = ['members', 'people', 'relationships', 'edits', 'uploads', 'upload_links', 'audit'];

function columnsFor(row) {
  return Object.keys(row);
}

function toBase64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

function fromBase64(value) {
  const bin = atob(value || '');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function exportBackup(db, bucket) {
  const tables = {};
  for (const name of TABLE_ORDER) {
    tables[name] = await db.all('SELECT * FROM ' + name);
  }
  const files = [];
  for (const upload of tables.uploads) {
    const object = await bucket.get(upload.r2_key);
    if (!object) continue;
    const bytes = new Uint8Array(await object.arrayBuffer());
    files.push({ key: upload.r2_key, base64: toBase64(bytes) });
  }
  return { version: 1, exportedAt: new Date().toISOString(), tables, files };
}

export async function restoreBackup(db, bucket, bundle) {
  if (!bundle || bundle.version !== 1 || !bundle.tables) throw new Error('bad_backup');
  for (const name of ['audit', 'upload_links', 'uploads', 'edits', 'relationships', 'people', 'members']) {
    await db.run('DELETE FROM ' + name);
  }
  for (const name of TABLE_ORDER) {
    const rows = bundle.tables[name] || [];
    for (const row of rows) {
      const cols = columnsFor(row);
      const sql = 'INSERT INTO ' + name + ' (' + cols.join(', ') + ') VALUES (' + cols.map(() => '?').join(', ') + ')';
      await db.run(sql, cols.map(col => row[col]));
    }
  }
  const keep = new Set((bundle.files || []).map(file => file.key));
  for (const file of bundle.files || []) {
    if (!file.key || String(file.key).includes('..')) continue;
    const bytes = fromBase64(file.base64);
    await bucket.put(file.key, bytes);
    keep.add(file.key);
  }
  return { tables: TABLE_ORDER.length, files: (bundle.files || []).length, keys: [...keep] };
}

// Copies the fictional sample already shipped with the public tree into the
// private database as approved records, and stores those sample files in the bucket.
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { nowIso } from './db.js';

const require = createRequire(import.meta.url);

export function sampleCatalog() {
  return require('../../tree.js').people;
}

export async function seedSample(db, bucket, docsDir) {
  const catalog = sampleCatalog();
  const now = nowIso();
  for (const person of catalog) {
    await db.run(
      `INSERT INTO people (id, display_name, sex, born, died, notes, version, published, branch, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?)`,
      [person.id, person.name, person.sex, person.born, person.died, person.note || '', person.branch || 'ashworth', now, now]
    );
    for (const parentId of person.parents || []) {
      await db.run(
        `INSERT INTO relationships (from_id, to_id, kind, version, published, created_at)
         VALUES (?, ?, 'parent_biological', 1, 1, ?)`,
        [parentId, person.id, now]
      );
    }
    if (person.spouse && person.id < person.spouse) {
      await db.run(
        `INSERT INTO relationships (from_id, to_id, kind, version, published, created_at)
         VALUES (?, ?, 'partner', 1, 1, ?)`,
        [person.id, person.spouse, now]
      );
    }
    for (const doc of person.docs || []) {
      const relative = String(doc.file || '').replace(/^docs\//, '');
      const file = join(docsDir, relative);
      if (!existsSync(file) || relative.includes('..')) continue;
      const bytes = readFileSync(file);
      const key = 'sample/' + person.id + '/' + relative;
      await bucket.put(key, bytes);
      const contentType = relative.endsWith('.pdf') ? 'application/pdf' : 'image/svg+xml';
      const created = await db.run(
        `INSERT INTO uploads (owner_email, r2_key, filename, content_type, byte_size, caption, doc_date, status, created_at, reviewed_at, reviewer_email)
         VALUES ('seed@example.test', ?, ?, ?, ?, ?, '', 'approved', ?, ?, 'seed@example.test')`,
        [key, relative, contentType, bytes.length, doc.title, now, now]
      );
      await db.run('INSERT INTO upload_links (upload_id, person_id) VALUES (?, ?)', [created.lastRowId, person.id]);
    }
  }
  return { people: catalog.length };
}

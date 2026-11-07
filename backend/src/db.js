// One query shape for D1 (async bind) and node:sqlite (sync).
export function wrapDb(native) {
  const nodeSqlite = native && native.__node === true;
  return {
    async all(sql, params = []) {
      if (nodeSqlite) return native.db.prepare(sql).all(...params);
      const result = await native.prepare(sql).bind(...params).all();
      return result.results || [];
    },
    async get(sql, params = []) {
      if (nodeSqlite) return native.db.prepare(sql).get(...params) || null;
      return native.prepare(sql).bind(...params).first();
    },
    async run(sql, params = []) {
      if (nodeSqlite) {
        const info = native.db.prepare(sql).run(...params);
        return { lastRowId: Number(info.lastInsertRowid), changes: info.changes };
      }
      const result = await native.prepare(sql).bind(...params).run();
      return { lastRowId: result.meta && result.meta.last_row_id, changes: result.meta && result.meta.changes };
    }
  };
}

export function nowIso() {
  return new Date().toISOString();
}

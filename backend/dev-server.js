// Local preview. Identity switching works only because ENVIRONMENT=dev,
// DEV_IDENTITY=1, and the host is 127.0.0.1. It is not a production mode.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { handle } from './src/api.js';
import { wrapDb } from './src/db.js';
import { seedSample } from './src/seed-sample.js';

const root = dirname(fileURLToPath(import.meta.url));
const appDir = join(root, '..', 'app');
const treeDir = join(root, '..');
const port = Number(process.env.PORT || 8788);

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(join(root, 'schema.sql'), 'utf8'));
sqlite.exec(readFileSync(join(root, 'dev-seed.sql'), 'utf8'));
const db = wrapDb({ __node: true, db: sqlite });
const objects = new Map();
const bucket = {
  async put(key, bytes) {
    objects.set(key, new Uint8Array(bytes));
  },
  async get(key) {
    const found = objects.get(key);
    if (!found) return null;
    return { arrayBuffer: async () => found };
  }
};
await seedSample(db, bucket, join(treeDir, 'docs'));

const env = {
  ENVIRONMENT: 'dev',
  DEV_IDENTITY: '1',
  ACCESS_TEAM_DOMAIN: 'example.cloudflareaccess.com',
  ACCESS_AUD: 'local-preview-audience',
  db,
  bucket
};

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function nodeRequest(req) {
  const url = 'http://127.0.0.1:' + port + req.url;
  const chunks = [];
  return new Promise((resolve, reject) => {
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value != null) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
      resolve(new Request(url, {
        method: req.method,
        headers,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body
      }));
    });
    req.on('error', reject);
  });
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) {
      const response = await handle(await nodeRequest(req), env);
      const headers = {};
      response.headers.forEach((value, key) => { headers[key] = value; });
      const payload = Buffer.from(await response.arrayBuffer());
      res.writeHead(response.status, headers);
      res.end(payload);
      return;
    }
    const canvas = url.pathname === '/canvas' || url.pathname.startsWith('/canvas/');
    let file = null;
    let policy = "default-src 'self'; img-src 'self' blob:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'";
    if (canvas) {
      const relative = url.pathname.replace(/^\/canvas\/?/, '') || 'index.html';
      const base = relative === 'tree.js' || relative.startsWith('portraits/') ? treeDir : treeDir;
      file = resolve(base, relative === 'index.html' || relative === '' ? 'index.html' : relative);
      if (file !== treeDir && !file.startsWith(treeDir + sep)) file = null;
      if (file && (file.endsWith(sep + 'docs') || file.includes(sep + 'docs' + sep))) file = null;
      policy = "default-src 'self'; img-src 'self' blob: data:; style-src 'unsafe-inline' 'self'; script-src 'unsafe-inline' 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'";
    } else {
      const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
      file = resolve(appDir, relative);
      if (file !== appDir && !file.startsWith(appDir + sep)) file = null;
    }
    if (!file || !existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'content-type': types[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
      'content-security-policy': policy
    });
    res.end(readFileSync(file));
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('Preview error');
    console.error(error);
  }
}).listen(port, '127.0.0.1', () => {
  console.log('Family tree local preview at http://127.0.0.1:' + port);
});

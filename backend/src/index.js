import { handle } from './api.js';
import { wrapDb } from './db.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const bound = Object.assign({}, env, {
        db: wrapDb(env.DB),
        bucket: env.BUCKET
      });
      return handle(request, bound);
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  }
};

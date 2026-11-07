// Cloudflare Access JWT checks. Email headers are never accepted as identity.

function bytesToBase64Url(bytes) {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(part) {
  const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((part.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function allowDevIdentity(request, env) {
  if (!env || env.ENVIRONMENT !== 'dev' || env.DEV_IDENTITY !== '1') return false;
  let host = '';
  try { host = new URL(request.url).hostname; } catch { return false; }
  return host === 'localhost' || host === '127.0.0.1';
}

async function loadJwks(env) {
  if (env.JWKS_JSON) return JSON.parse(env.JWKS_JSON);
  if (!env.ACCESS_TEAM_DOMAIN) return null;
  const response = await fetch('https://' + env.ACCESS_TEAM_DOMAIN + '/cdn-cgi/access/certs');
  if (!response.ok) return null;
  return response.json();
}

export async function verifyAccessJwt(token, env, options = {}) {
  if (!token || typeof token !== 'string' || token.split('.').length !== 3) return null;
  const [headerPart, payloadPart, sigPart] = token.split('.');
  let header;
  let payload;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerPart)));
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart)));
  } catch {
    return null;
  }
  if (!header || header.alg !== 'RS256' || !header.kid) return null;
  const now = options.now || Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
  if (typeof payload.nbf === 'number' && payload.nbf > now) return null;
  const issuer = 'https://' + env.ACCESS_TEAM_DOMAIN;
  if (!env.ACCESS_TEAM_DOMAIN || payload.iss !== issuer) return null;
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!env.ACCESS_AUD || !audience.includes(env.ACCESS_AUD)) return null;
  const jwks = options.jwks || await loadJwks(env);
  const jwk = jwks && jwks.keys && jwks.keys.find(key => key.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const signed = new TextEncoder().encode(headerPart + '.' + payloadPart);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64UrlDecode(sigPart), signed);
  if (!ok) return null;
  const email = String(payload.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return null;
  return { email, sub: payload.sub || '' };
}

export async function authenticate(request, env, db) {
  const devOk = allowDevIdentity(request, env);
  let identity = null;
  if (devOk) {
    const devEmail = String(request.headers.get('X-Dev-User') || '').trim().toLowerCase();
    if (devEmail) identity = { email: devEmail, sub: 'dev', dev: true };
  }
  if (!identity) {
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    identity = await verifyAccessJwt(token, env);
  }
  if (!identity) return { error: 'unauthorized', status: 401 };
  const member = await db.get(
    'SELECT id, email, role, status FROM members WHERE email = ?',
    [identity.email]
  );
  if (!member || member.status !== 'active') return { error: 'forbidden', status: 403 };
  return { user: { id: member.id, email: member.email, role: member.role } };
}

export function requireRole(user, roles) {
  if (!user || !roles.includes(user.role)) return { error: 'forbidden', status: 403 };
  return null;
}

export { bytesToBase64Url };

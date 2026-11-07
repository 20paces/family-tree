export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const ALLOWED = [
  { type: 'image/jpeg', ext: 'jpg', magic: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', ext: 'png', magic: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: 'image/webp', ext: 'webp', magic: (b) => b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
  { type: 'application/pdf', ext: 'pdf', magic: (b) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 }
];

function asciiHead(bytes) {
  const n = Math.min(bytes.length, 256);
  let text = '';
  for (let i = 0; i < n; i++) text += String.fromCharCode(bytes[i]);
  return text.toLowerCase();
}

export function inspectUpload(bytes, claimedType, filename) {
  if (!bytes || !bytes.length) return { ok: false, error: 'empty_upload' };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, error: 'too_large' };
  const name = String(filename || '').toLowerCase();
  if (/\.(svg|html?|xhtml|xml|js|mjs)$/i.test(name)) return { ok: false, error: 'type_not_allowed' };
  const claimed = String(claimedType || '').toLowerCase().split(';')[0].trim();
  if (claimed === 'image/svg+xml' || claimed === 'text/html' || claimed === 'application/xhtml+xml') {
    return { ok: false, error: 'type_not_allowed' };
  }
  const head = asciiHead(bytes);
  if (head.includes('<svg') || head.includes('<html') || head.includes('<script') || head.includes('<!doctype html')) {
    return { ok: false, error: 'active_content' };
  }
  const match = ALLOWED.find(item => item.magic(bytes));
  if (!match) return { ok: false, error: 'signature_rejected' };
  if (claimed && claimed !== match.type) return { ok: false, error: 'type_mismatch' };
  return { ok: true, contentType: match.type, ext: match.ext };
}

export function safeDownloadName(filename, ext) {
  const base = String(filename || 'document').split(/[/\\]/).pop().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^\.+/, '');
  const trimmed = (base || 'document').slice(0, 80);
  if (trimmed.toLowerCase().endsWith('.' + ext)) return trimmed;
  return trimmed.replace(/\.[A-Za-z0-9]+$/, '') + '.' + ext;
}

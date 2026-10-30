// Cloudflare R2 object storage (S3-compatible) with no extra npm packages: requests are signed with AWS Signature V4.
//
// Set these environment variables to turn it on:
//   R2_ACCOUNT_ID         Cloudflare account id (R2 > Overview, right side)
//   R2_ACCESS_KEY_ID      from R2 > Manage API tokens (Object Read & Write)
//   R2_SECRET_ACCESS_KEY  same place
//   R2_BUCKET             bucket name
// Optional:
//   R2_REDIRECT=1         send downloads straight from R2 (signed link) so file traffic never touches this server
import crypto from 'node:crypto';

const ACCOUNT = (process.env.R2_ACCOUNT_ID || '').trim();
const KEY_ID = (process.env.R2_ACCESS_KEY_ID || '').trim();
const SECRET = (process.env.R2_SECRET_ACCESS_KEY || '').trim();
const BUCKET = (process.env.R2_BUCKET || '').trim();
const HOST = `${ACCOUNT}.r2.cloudflarestorage.com`;
const REGION = 'auto';

export const r2Enabled = Boolean(ACCOUNT && KEY_ID && SECRET && BUCKET);
export const r2Redirect = r2Enabled && process.env.R2_REDIRECT === '1';

const sha256 = (d) => crypto.createHash('sha256').update(d).digest('hex');
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const objectPath = (id) => `/${BUCKET}/files/${enc(id)}`;
const stamp = () => new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); // 20261023T101500Z

function signingKey(day) {
  return hmac(hmac(hmac(hmac('AWS4' + SECRET, day), REGION), 's3'), 'aws4_request');
}

function authHeaders(method, p, payloadHash, extra = {}) {
  const amz = stamp(), day = amz.slice(0, 8);
  const headers = { host: HOST, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amz, ...extra };
  const names = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const canonHeaders = names.map((h) => `${h}:${String(headers[Object.keys(headers).find((k) => k.toLowerCase() === h)]).trim()}\n`).join('');
  const signed = names.join(';');
  const canon = [method, p, '', canonHeaders, signed, payloadHash].join('\n');
  const scope = `${day}/${REGION}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha256(canon)].join('\n');
  const sig = crypto.createHmac('sha256', signingKey(day)).update(toSign).digest('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${KEY_ID}/${scope}, SignedHeaders=${signed}, Signature=${sig}`;
  delete headers.host;
  return headers;
}

export async function r2Put(id, buf, mime = 'application/octet-stream') {
  const p = objectPath(id);
  const headers = authHeaders('PUT', p, sha256(buf), { 'content-type': mime });
  const r = await fetch(`https://${HOST}${p}`, { method: 'PUT', headers, body: buf, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`R2 put ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
}

// Returns a Buffer, or null when the object doesn't exist.
export async function r2Get(id) {
  const p = objectPath(id);
  const headers = authHeaders('GET', p, sha256(''));
  const r = await fetch(`https://${HOST}${p}`, { headers, signal: AbortSignal.timeout(60000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`R2 get ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

export async function r2Has(id) {
  const p = objectPath(id);
  const r = await fetch(`https://${HOST}${p}`, { method: 'HEAD', headers: authHeaders('HEAD', p, sha256('')), signal: AbortSignal.timeout(30000) });
  return r.ok;
}

// A temporary download link (default 1 hour). The browser then fetches straight from Cloudflare.
export function r2SignedUrl(id, { seconds = 3600, name = '', mime = '' } = {}) {
  const p = objectPath(id), amz = stamp(), day = amz.slice(0, 8), scope = `${day}/${REGION}/s3/aws4_request`;
  const q = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${KEY_ID}/${scope}`,
    'X-Amz-Date': amz,
    'X-Amz-Expires': String(seconds),
    'X-Amz-SignedHeaders': 'host',
  };
  if (mime) q['response-content-type'] = mime;
  if (name) q['response-content-disposition'] = `inline; filename="${name.replace(/["\\\r\n]/g, '_')}"`;
  const query = Object.keys(q).sort().map((k) => `${enc(k)}=${enc(q[k])}`).join('&');
  const canon = ['GET', p, query, `host:${HOST}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha256(canon)].join('\n');
  const sig = crypto.createHmac('sha256', signingKey(day)).update(toSign).digest('hex');
  return `https://${HOST}${p}?${query}&X-Amz-Signature=${sig}`;
}

export async function r2Delete(id) {
  const p = objectPath(id);
  const r = await fetch(`https://${HOST}${p}`, { method: 'DELETE', headers: authHeaders('DELETE', p, sha256('')), signal: AbortSignal.timeout(30000) });
  if (!r.ok && r.status !== 404) throw new Error(`R2 delete ${r.status}`);
}

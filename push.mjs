// Web Push (RFC 8030 + RFC 8291 aes128gcm + RFC 8292 VAPID) using only node:crypto,
// so no extra npm package is needed. Used to deliver admin broadcasts as phone/desktop
// notifications even when the person is not on the website.
import crypto from 'node:crypto';

const b64u = (b) => Buffer.from(b).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s || ''), 'base64url');

// Only real push services may be called, so a user can't make the server fetch an arbitrary URL.
const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'push.services.mozilla.com',
  'notify.windows.com',
  'push.apple.com',
];
export function isAllowedEndpoint(endpoint) {
  try {
    const u = new URL(String(endpoint));
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return PUSH_HOSTS.some((d) => h === d || h.endsWith('.' + d));
  } catch { return false; }
}

export function generateVapidKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ format: 'jwk' });
  const priv = privateKey.export({ format: 'jwk' });
  const raw = Buffer.concat([Buffer.from([4]), fromB64u(pub.x), fromB64u(pub.y)]);
  return { publicKey: b64u(raw), privateKey: priv.d };
}

function privateKeyObject(vapid) {
  const raw = fromB64u(vapid.publicKey);
  return crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33, 65)), d: vapid.privateKey },
    format: 'jwk',
  });
}

export function vapidHeader(endpoint, vapid, subject) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const input = `${head}.${body}`;
  const sig = crypto.sign('sha256', Buffer.from(input), { key: privateKeyObject(vapid), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${input}.${b64u(sig)}, k=${vapid.publicKey}`;
}

const hkdf = (ikm, salt, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));

// RFC 8291 message encryption for a single record.
export function encryptPayload(subscription, payload) {
  const uaPublic = fromB64u(subscription.keys.p256dh);
  const authSecret = fromB64u(subscription.keys.auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error('Bad subscription keys');
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const ikm = hkdf(shared, authSecret, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32);
  const salt = crypto.randomBytes(16);
  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
  const data = Buffer.concat([Buffer.from(payload), Buffer.from([2])]); // 0x02 = last record
  if (data.length > 3993) throw new Error('Payload too large');
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const enc = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, enc]);
}

// Returns { ok, status, gone }. gone = the subscription is dead and should be deleted.
export async function sendPush(subscription, payloadObj, { vapid, subject, ttl = 86400 }) {
  try {
    if (!isAllowedEndpoint(subscription.endpoint)) return { ok: false, status: 0, gone: true };
    const body = encryptPayload(subscription, JSON.stringify(payloadObj));
    const r = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidHeader(subscription.endpoint, vapid, subject),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttl),
        Urgency: 'high',
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
    return { ok: r.status >= 200 && r.status < 300, status: r.status, gone: r.status === 404 || r.status === 410 };
  } catch (e) {
    return { ok: false, status: 0, gone: false, error: e.message };
  }
}

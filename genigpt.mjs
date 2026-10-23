// GeniGPT AI (prexzyapis.com) - text-to-image AND image editing through one endpoint.
//   GET https://prexzyapis.com/ai/genigpt?prompt=<text>&image=<public image url>
// With no `image` it generates a new picture; with `image` it edits that picture.
//
// Returns { mime, bytes } like every other provider in imagegen.mjs. Throws a plain Error
// on any failure so the caller can fall back to the next provider (Gemini etc.).
// The provider answer is not documented, so this accepts every shape it is likely to use:
// raw image bytes, JSON holding a URL / data URI / base64, or JSON nested a few levels deep.
const GENIGPT_URL = () => process.env.GENIGPT_API_URL || 'https://prexzyapis.com/ai/genigpt';
const TIMEOUT_MS = () => Number(process.env.GENIGPT_TIMEOUT_MS) || 75000;

// Set GENIGPT_ENABLED=off to skip it without touching the code.
export const genigptEnabled = () => String(process.env.GENIGPT_ENABLED || 'on').toLowerCase() !== 'off';

const looksLikeImage = (b) => b.length > 8 && (
  (b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x47 && b[1] === 0x49) || (b[0] === 0x52 && b[1] === 0x49));
const mimeOf = (b) => (b[0] === 0x89 ? 'image/png' : b[0] === 0xff ? 'image/jpeg' : b[0] === 0x47 ? 'image/gif' : 'image/webp');

const KEYS = ['url', 'image', 'image_url', 'imageUrl', 'imageURL', 'result', 'results', 'data', 'output', 'link', 'response', 'images', 'file', 'path'];
function findImageRef(j, depth = 0) {
  if (j == null || depth > 4) return '';
  if (typeof j === 'string') {
    const s = j.trim();
    if (/^(https?:\/\/|data:image\/)/i.test(s)) return s;
    const md = /!?\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/.exec(s); // markdown image/link
    if (md) return md[1];
    const bare = /(https?:\/\/[^\s"'<>)]+\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>)]*)?)/i.exec(s);
    return bare ? bare[1] : '';
  }
  if (Array.isArray(j)) { for (const x of j) { const f = findImageRef(x, depth + 1); if (f) return f; } return ''; }
  if (typeof j !== 'object') return '';
  for (const k of KEYS) { const f = findImageRef(j[k], depth + 1); if (f) return f; }
  return '';
}

async function download(ref) {
  if (ref.startsWith('data:image/')) {
    const m = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is.exec(ref);
    if (!m) throw new Error('genigpt: bad data URI');
    return { mime: m[1], bytes: Buffer.from(m[2], 'base64') };
  }
  const r = await fetch(ref, { signal: AbortSignal.timeout(TIMEOUT_MS()), redirect: 'follow' });
  if (!r.ok) throw new Error(`genigpt: could not download result (${r.status})`);
  const bytes = Buffer.from(await r.arrayBuffer());
  if (!looksLikeImage(bytes)) throw new Error('genigpt: downloaded result is not an image');
  return { mime: mimeOf(bytes), bytes };
}

// prompt: what to draw / how to change the picture. imageUrl: public https URL of the picture to edit (optional).
export async function genigptImage(prompt, imageUrl = '') {
  const text = String(prompt || '').trim();
  if (!text) throw new Error('genigpt: empty prompt');
  const qs = new URLSearchParams({ prompt: text.slice(0, 1800) });
  if (imageUrl) qs.set('image', imageUrl);
  const r = await fetch(`${GENIGPT_URL()}?${qs}`, {
    headers: { Accept: 'image/*,application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS()),
    redirect: 'follow',
  });
  const raw = Buffer.from(await r.arrayBuffer());
  if (!r.ok) throw new Error(`genigpt: HTTP ${r.status}: ${raw.toString('utf8').slice(0, 200)}`);
  if (looksLikeImage(raw)) return { mime: mimeOf(raw), bytes: raw };

  let json = null;
  const body = raw.toString('utf8').trim();
  try { json = JSON.parse(body); } catch { /* maybe plain text with a link */ }
  // Many of these APIs answer 200 with {status:false,...}. Treat that as a failure.
  if (json && (json.status === false || json.success === false || json.error)) {
    throw new Error(`genigpt: ${String(json.error || json.message || 'request failed').slice(0, 200)}`);
  }
  const ref = findImageRef(json ?? body);
  if (!ref) throw new Error('genigpt: no image in the response');
  return download(ref);
}

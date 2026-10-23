// /textimage - simple text images with custom colors, made by the prexzyapis image creator.
//   /textimage Dave Tech
//   /textimage Dave Tech, background black, color gold
//   /textimage "Good morning" bg #1e293b color #fde047 emoji style apple
const TEXTIMAGE_API_URL = process.env.TEXTIMAGE_API_URL || 'https://prexzyapis.com/imagecreator/image';

const VALUE = String.raw`(#[0-9a-f]{3,8}\b|[a-z]+(?:[ -][a-z]+)??)(?=\s*(?:,|;|\band\b|\bwith\b|\bbackground\b|\bbg\b|\bcolou?r\b|\bemoji\b|$))`;
const RE_BG = new RegExp(String.raw`\b(?:background(?:\s+colou?r)?|bg)\s*(?:[:=]|is|of)?\s*` + VALUE, 'i');
const RE_FG = new RegExp(String.raw`\b(?:(?:text|font)\s+colou?r|colou?r)\s*(?:[:=]|is|of)?\s*` + VALUE, 'i');
const RE_EMOJI = new RegExp(String.raw`\bemoji(?:\s+style)?\s*(?:[:=]|is|of)?\s*` + VALUE, 'i');

// Splits what the person typed after the command into the text and its optional colors.
export function parseTextImage(raw = '') {
  let rest = String(raw).trim();
  const take = (re) => {
    const m = rest.match(re);
    if (!m) return '';
    rest = (rest.slice(0, m.index) + ' ' + rest.slice(m.index + m[0].length)).trim();
    return m[1].trim().toLowerCase().slice(0, 40);
  };
  const background = take(RE_BG);
  const color = take(RE_FG);
  const emojiStyle = take(RE_EMOJI);
  const quoted = rest.match(/["“”'‘’]([^"“”'‘’]{1,200})["“”'‘’]/);
  let text = quoted ? quoted[1] : rest;
  // drop connectors left dangling by the removed color clauses ("Hello with and" -> "Hello")
  for (let i = 0; i < 3; i++) text = text.replace(/\b(?:with|and)\b\s*(?=\b(?:with|and)\b|[,;]|$)/gi, '').replace(/\s{2,}/g, ' ').trim();
  text = text.replace(/^(?:that\s+)?(?:says?|saying|text|write|with the text)\b[:\s]*/i, '').replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '').trim();
  return { text: text.slice(0, 200), background, color, emojiStyle };
}

const looksLikeImage = (b) => b.length > 8 && (
  (b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x47 && b[1] === 0x49) || (b[0] === 0x52 && b[1] === 0x49));
const mimeOf = (b) => (b[0] === 0x89 ? 'image/png' : b[0] === 0xff ? 'image/jpeg' : b[0] === 0x47 ? 'image/gif' : 'image/webp');

function findImageRef(j, depth = 0) {
  if (!j || depth > 3) return '';
  if (typeof j === 'string') return /^(https?:\/\/|data:image\/)/i.test(j.trim()) ? j.trim() : '';
  if (typeof j !== 'object') return '';
  for (const k of ['url', 'image', 'image_url', 'imageUrl', 'result', 'data', 'link', 'output']) {
    const f = findImageRef(j[k], depth + 1);
    if (f) return f;
  }
  return '';
}

// Returns { mime, bytes } like the other image providers.
export async function makeTextImage({ text, background = '', color = '', emojiStyle = '' }) {
  if (!text) throw new Error('no text');
  const qs = new URLSearchParams({ text });
  if (background) qs.set('background', background);
  if (color) qs.set('color', color);
  if (emojiStyle) qs.set('emojiStyle', emojiStyle);
  const res = await fetch(`${TEXTIMAGE_API_URL}?${qs}`, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`text image provider error (${res.status})`);
  let bytes = Buffer.from(await res.arrayBuffer());
  if (looksLikeImage(bytes)) return { mime: mimeOf(bytes), bytes };
  // Otherwise the provider answered with JSON that points at (or contains) the picture.
  let json; try { json = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('text image provider returned something that is not an image'); }
  const ref = findImageRef(json);
  if (!ref) throw new Error(json?.error || json?.message || 'text image provider returned no image');
  if (ref.startsWith('data:image/')) {
    const m = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is.exec(ref);
    if (!m) throw new Error('bad image data');
    return { mime: m[1], bytes: Buffer.from(m[2], 'base64') };
  }
  const r2 = await fetch(ref, { signal: AbortSignal.timeout(60000) });
  if (!r2.ok) throw new Error(`could not download the text image (${r2.status})`);
  bytes = Buffer.from(await r2.arrayBuffer());
  if (!looksLikeImage(bytes)) throw new Error('downloaded file is not an image');
  return { mime: mimeOf(bytes), bytes };
}

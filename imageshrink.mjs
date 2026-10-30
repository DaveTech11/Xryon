// Shrinks pictures before they are stored (the biggest storage saver for a chat app).
// Uses the "sharp" package; if it is not installed the original bytes are kept, so nothing breaks.
let sharpP = null;
const getSharp = () => (sharpP ||= import('sharp').then((m) => m.default || m).catch(() => null));

// Returns { bytes, mime }. Photos and screenshots become WebP (max side `maxSide`), usually 5-10x smaller.
// GIF and SVG are left alone, and the original is kept whenever the result would not be smaller.
export async function shrinkImage(bytes, mime, { maxSide = 2048, quality = 82 } = {}) {
  try {
    if (!/^image\/(png|jpe?g|webp|heic|heif|avif|bmp|tiff)$/i.test(String(mime))) return { bytes, mime };
    const sharp = await getSharp();
    if (!sharp) return { bytes, mime };
    const out = await sharp(bytes, { failOn: 'none' }).rotate().resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true }).webp({ quality }).toBuffer();
    return out.length < bytes.length ? { bytes: out, mime: 'image/webp' } : { bytes, mime };
  } catch { return { bytes, mime }; }
}

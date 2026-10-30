// Phone photos are often 4-12 MB. Sending them as-is makes the upload slow and makes the AI's image reader
// download a huge file. This shrinks them in the browser first (max 1600px, JPEG) - text in screenshots and
// photos stays perfectly readable, but the upload is usually 5-10x smaller.
const MAX_SIDE = 1600;
const SKIP_UNDER = 350 * 1024; // already small: leave untouched

export async function compressImage(file) {
  try {
    if (!file || !/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type || "")) return file; // gif/svg/others stay as they are
    if (file.size < SKIP_UNDER) return file;
    const bitmap = typeof createImageBitmap === "function" ? await createImageBitmap(file) : null;
    if (!bitmap) return file;
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // PNGs with transparency become white instead of black
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file; // never make it bigger
    const name = String(file.name || "image").replace(/\.[a-z0-9]+$/i, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file; // any problem: just send the original
  }
}

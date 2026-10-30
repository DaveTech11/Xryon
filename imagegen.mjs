// Image generation for Xyron.
//
// Primary provider: Google Gemini image models ("nano banana") using the key in
// GEMINI_API_KEY.
//
// Every function here throws a plain Error on failure. The server logs the real
// reason and sends the browser a generic "image_unavailable" code, so provider
// messages (and anything that could hint at a key) never reach the user.

import { genigptImage, genigptEnabled } from './genigpt.mjs';

const GEMINI_KEY = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const MODELS = () => [
  process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
  ...String(process.env.GEMINI_IMAGE_FALLBACK_MODELS ?? 'gemini-3.1-flash-image-preview')
    .split(',').map(s => s.trim()).filter(Boolean),
];
const TIMEOUT_MS = Number(process.env.IMAGE_TIMEOUT_MS) || 45000;
// Hard limits so the chat never hangs: Gemini gets one shared time budget for all of its
// attempts, and the whole request (every provider together) is cut off after TOTAL_MS.
const GEMINI_BUDGET_MS = () => Number(process.env.GEMINI_BUDGET_MS) || 50000;
const TOTAL_MS = () => Number(process.env.IMAGE_TOTAL_TIMEOUT_MS) || 110000;

export const imageProviderConfigured = () => Boolean(genigptEnabled() || GEMINI_KEY() || POLLINATIONS_KEY() || HF_KEY());

// ---------- Pollinations (gen.pollinations.ai) ----------
// Used ONLY for a few text-to-image shortcuts it is good at (see POLLINATIONS_SHORTCUTS).
// Everything else - normal /image prompts, other shortcuts, and any request that
// carries an uploaded reference image - keeps going to Gemini exactly as before.
// If Pollinations fails for any reason the request silently falls back to Gemini.
const POLLINATIONS_KEY = () => process.env.POLLINATIONS_API_KEY || '';
const POLLINATIONS_URL = () => (process.env.POLLINATIONS_API_URL || 'https://gen.pollinations.ai').replace(/\/+$/, '');
// shortcut -> output size (multiples of 16 so every model accepts it)
export const POLLINATIONS_SHORTCUTS = {
  '/wallpaper': { width: 1792, height: 1024 },
  '/3d': { width: 1024, height: 1024 },
  '/pixel': { width: 1024, height: 1024 },
  '/sticker': { width: 1024, height: 1024 },
  '/watercolor': { width: 1024, height: 1024 },
  '/oilpaint': { width: 1024, height: 1024 },
  '/sketch': { width: 1024, height: 1024 },
  '/cartoon': { width: 1024, height: 1024 },
  '/logo': { width: 1024, height: 1024 },
  '/appicon': { width: 1024, height: 1024 },
  '/poster': { width: 1024, height: 1536 },
  '/banner': { width: 1792, height: 1024 },
  '/youtube': { width: 1792, height: 1024 },
  '/isometric': { width: 1024, height: 1024 },
  '/lowpoly': { width: 1024, height: 1024 },
  '/lineart': { width: 1024, height: 1024 },
  '/tattoo': { width: 1024, height: 1024 },
  '/minimal': { width: 1024, height: 1024 },
  '/album': { width: 1024, height: 1024 },
  '/chibi': { width: 1024, height: 1024 },
  '/comic': { width: 1024, height: 1024 },
};
export const usesPollinations = (shortcut) => Boolean(POLLINATIONS_KEY() && shortcut && POLLINATIONS_SHORTCUTS[shortcut]);

// ---------- Hugging Face Inference Providers ----------
// Used ONLY for the shortcuts below (text-to-image). Same rules as Pollinations:
// uploaded-photo requests and every other prompt stay on Gemini, and any failure
// silently falls back to Gemini.
const HF_KEY = () => process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || '';
const HF_URL = () => (process.env.HF_API_URL || 'https://router.huggingface.co/hf-inference/models').replace(/\/+$/, '');
// One or more models, tried in order. A model answering 404/410 (removed or deprecated on
// the provider, e.g. FLUX.1-schnell on hf-inference) is remembered as dead until restart
// so it is not retried on every image. Set HF_IMAGE_MODEL (comma separated) to choose.
const HF_MODELS = () => String(process.env.HF_IMAGE_MODEL || 'stabilityai/stable-diffusion-xl-base-1.0,black-forest-labs/FLUX.1-schnell')
  .split(',').map(x => x.trim()).filter(Boolean);
const hfDead = new Set();
export const HF_SHORTCUTS = {
  '/anime': { width: 1024, height: 1024 },
  '/manga': { width: 1024, height: 1024 },
  '/cyberpunk': { width: 1024, height: 1024 },
  '/fantasy': { width: 1024, height: 1024 },
  '/neon': { width: 1024, height: 1024 },
};
export const usesHuggingFace = (shortcut) => Boolean(HF_KEY() && shortcut && HF_SHORTCUTS[shortcut]);

async function huggingFaceImage(prompt, shortcut) {
  const key = HF_KEY();
  if (!key) throw new Error('HF_TOKEN is not set');
  const size = HF_SHORTCUTS[shortcut] || { width: 1024, height: 1024 };
  const models = HF_MODELS().filter(m => !hfDead.has(m));
  if (!models.length) throw new Error('huggingface: every configured model is deprecated/unavailable (set HF_IMAGE_MODEL)');
  let lastErr = new Error('Hugging Face request failed');
  for (const model of models) {
    try {
      const r = await fetch(`${HF_URL()}/${model}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'image/png' },
        body: JSON.stringify({ inputs: prompt.slice(0, 1500), parameters: { width: size.width, height: size.height } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const type = (r.headers.get('content-type') || '').split(';')[0].trim();
      if (!r.ok) {
        if (r.status === 404 || r.status === 410) hfDead.add(model);
        lastErr = new Error(`huggingface/${model}: HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
        continue;
      }
      if (!type.startsWith('image/')) { lastErr = new Error(`huggingface/${model}: unexpected content-type ${type}`); continue; }
      return { mime: type, bytes: Buffer.from(await r.arrayBuffer()) };
    } catch (e) {
      lastErr = new Error(`huggingface/${model}: ${e.message}`);
    }
  }
  throw lastErr;
}


// ---------- Prompt polish (Pollinations, Hugging Face and the keyless fallback) ----------
// These are diffusion models: they do much better with a descriptive "caption" than with an
// instruction like "Create a clean professional logo: chatgpt". Short or instruction-style
// prompts are what produced the nonsense pictures, so every shortcut gets a purpose-built
// template plus a negative prompt that rules out the usual junk (garbled text, extra limbs...).
// Gemini understands instructions fine, so they still get the original prompt.
const NEGATIVE_PROMPT = 'blurry, low quality, lowres, jpeg artifacts, distorted, deformed, disfigured, bad anatomy, extra fingers, extra limbs, cropped, out of frame, duplicate, watermark, signature, gibberish text, misspelled text, random letters, cluttered, messy';
const QUALITY = 'sharp focus, highly detailed, well composed';
const STYLE_TEMPLATES = {
  logo: s => `minimalist vector logo design for ${s}, flat design, one simple memorable geometric symbol, bold clean shapes, balanced symmetrical composition, centered on a plain solid white background, professional brand identity, crisp edges, high contrast, no text`,
  appicon: s => `modern mobile app icon for ${s}, a single bold simple symbol, smooth gradient background, rounded square, soft glossy highlights, clean vector style, centered, no text`,
  poster: s => `professional poster artwork for ${s}, striking central subject, bold graphic design, strong focal point, balanced layout with clear negative space, dramatic lighting, vibrant cohesive color palette, ${QUALITY}`,
  banner: s => `wide panoramic banner artwork for ${s}, clean wide composition, strong focal point, soft depth, balanced colors, ${QUALITY}, no text`,
  youtube: s => `eye-catching video thumbnail artwork about ${s}, bold saturated colors, strong contrast, one clear dramatic subject, expressive, dynamic composition, ${QUALITY}, no text`,
  wallpaper: s => `ultra-wide desktop wallpaper of ${s}, epic scenic composition, premium lighting, rich colors, clean negative space, ${QUALITY}`,
  '3d': s => `high quality 3D render of ${s}, smooth realistic materials, soft studio lighting, subtle reflections, octane render, clean background, ${QUALITY}`,
  isometric: s => `isometric 3D illustration of ${s}, tiny detailed diorama, clean geometry, soft shadows, pastel palette, plain background, ${QUALITY}`,
  lowpoly: s => `low-poly 3D scene of ${s}, faceted geometric shapes, soft gradient lighting, stylish minimal palette, ${QUALITY}`,
  pixel: s => `pixel art of ${s}, crisp square pixels, limited retro color palette, clean outlines, 16-bit game sprite style, simple background`,
  sticker: s => `die-cut sticker illustration of ${s}, bold clean outlines, flat vibrant colors, cute simple design, thick white border, plain white background`,
  watercolor: s => `soft watercolor painting of ${s}, delicate washes of color, gentle bleeding edges, visible paper texture, light airy palette, artistic`,
  oilpaint: s => `classical oil painting of ${s}, rich textured brush strokes, deep warm colors, dramatic chiaroscuro lighting, museum quality, ${QUALITY}`,
  sketch: s => `detailed pencil sketch of ${s}, fine graphite linework, careful cross-hatching shading, white paper background, hand drawn, ${QUALITY}`,
  lineart: s => `clean black line art of ${s}, smooth confident ink lines, no shading, white background, elegant minimal style, ${QUALITY}`,
  cartoon: s => `playful cartoon illustration of ${s}, bold outlines, bright flat colors, expressive friendly characters, clean simple background, ${QUALITY}`,
  comic: s => `dynamic comic book illustration of ${s}, bold ink outlines, halftone shading, vivid colors, dramatic action composition, ${QUALITY}`,
  chibi: s => `cute chibi character of ${s}, big head, small body, big sparkling eyes, soft pastel colors, clean linework, simple background`,
  anime: s => `anime illustration of ${s}, expressive detailed eyes, clean linework, polished cel shading, vibrant colors, cinematic composition, ${QUALITY}`,
  manga: s => `black and white manga panel of ${s}, detailed ink linework, screentone shading, dramatic composition, high contrast, ${QUALITY}`,
  cyberpunk: s => `cyberpunk scene of ${s}, neon-lit futuristic city at night, rain reflections, glowing signs, atmospheric haze, cinematic lighting, ${QUALITY}`,
  fantasy: s => `epic fantasy artwork of ${s}, magical atmosphere, dramatic lighting, intricate details, painterly concept art, ${QUALITY}`,
  scifi: s => `epic science-fiction concept art of ${s}, futuristic technology, grand scale, cinematic lighting, ${QUALITY}`,
  neon: s => `glowing neon light artwork of ${s}, vivid neon tubes, dark background, soft light bloom, high contrast, ${QUALITY}`,
  glow: s => `${s} with elegant atmospheric glow, soft volumetric light, luminous particles, dreamy mood, ${QUALITY}`,
  dark: s => `dramatic dark moody artwork of ${s}, deep shadows, subtle rim lighting, cinematic, ${QUALITY}`,
  luxury: s => `premium luxury advertisement photo of ${s}, elegant gold and black palette, soft studio lighting, glossy reflections, high-end commercial look, ${QUALITY}`,
  glass: s => `glossy glassmorphism artwork of ${s}, translucent frosted glass, soft gradients, smooth reflections, modern clean design, ${QUALITY}`,
  minimal: s => `clean minimalist composition featuring ${s}, lots of negative space, simple shapes, soft muted palette, calm balanced layout`,
  vintage: s => `nostalgic vintage photograph of ${s}, faded warm film tones, soft grain, retro mood, ${QUALITY}`,
  dream: s => `surreal dreamscape featuring ${s}, floating elements, soft pastel sky, ethereal light, imaginative, ${QUALITY}`,
  tattoo: s => `tattoo design of ${s}, bold black linework, balanced composition, fine detail shading, white background, flash tattoo style`,
  album: s => `striking album cover artwork for ${s}, bold central visual, artistic color treatment, square composition, ${QUALITY}, no text`,
  realistic: s => `photorealistic photo of ${s}, natural lighting, realistic textures, shot on a full-frame camera, 50mm lens, ${QUALITY}`,
  cinematic: s => `cinematic movie still of ${s}, dramatic lighting, shallow depth of field, anamorphic lens, film grain, color graded, ${QUALITY}`,
  hdr: s => `crisp high dynamic range photo of ${s}, rich detail in shadows and highlights, vivid but natural color, ${QUALITY}`,
  bw: s => `dramatic black and white photograph of ${s}, deep contrast, rich tonal range, fine grain, ${QUALITY}`,
  product: s => `premium product photograph of ${s}, centered on a clean seamless background, soft studio lighting, subtle reflection, commercial advertising look, ${QUALITY}`,
  mockup: s => `realistic product mockup showing ${s}, clean studio scene, soft shadows, neutral background, ${QUALITY}`,
  food: s => `mouth-watering professional food photograph of ${s}, fresh ingredients, soft natural window light, shallow depth of field, appetizing, ${QUALITY}`,
  nature: s => `breathtaking nature photograph of ${s}, golden hour light, rich natural colors, wide landscape, ${QUALITY}`,
  architecture: s => `realistic architectural visualization of ${s}, clean lines, natural daylight, wide-angle view, ${QUALITY}`,
  room: s => `realistic luxury interior design of ${s}, warm natural light, tasteful decor, wide-angle view, ${QUALITY}`,
  vehicle: s => `futuristic vehicle concept of ${s}, sleek aerodynamic design, studio lighting, glossy paint reflections, ${QUALITY}`,
  portrait: s => `professional portrait photograph of ${s}, soft flattering studio lighting, sharp natural skin and eyes, shallow depth of field, ${QUALITY}`,
  headshot: s => `clean studio headshot of ${s}, soft even lighting, neutral background, sharp natural face, ${QUALITY}`,
  avatar: s => `polished profile avatar of ${s}, centered face, clean silhouette, simple soft background, stylish digital illustration, ${QUALITY}`,
  fashion: s => `high-end fashion editorial photograph of ${s}, elegant pose, studio lighting, magazine quality, ${QUALITY}`,
};
export function polishImagePrompt(prompt, { shortcut = '', subject = '' } = {}) {
  const key = String(shortcut || '').replace(/^\//, '').toLowerCase();
  let s = String(subject || '').trim();
  // No separate subject sent: strip an instruction-style lead-in such as "Create a clean logo: ".
  if (!s) s = String(prompt || '').trim().replace(/^(?:create|generate|make|draw|design)\s+[^:\n]{3,80}:\s*/i, '');
  s = s.replace(/\s+/g, ' ').replace(/[.\s]+$/, '').slice(0, 700);
  if (!s || /^an original scene$/i.test(s)) s = key === 'logo' || key === 'appicon' ? 'a modern technology brand' : 'a beautiful original scene';
  const tpl = STYLE_TEMPLATES[key];
  return (tpl ? tpl(s) : `${s}, ${QUALITY}, professional quality, clean composition`).slice(0, 1400);
}

// ---------- Keyless last resort (image.pollinations.ai) ----------
// Text-to-image only. Used after every configured provider has failed, so a quota problem
// on one account does not leave the person with no image at all. Disable with FREE_IMAGE_FALLBACK=off.
async function freeFallbackImage(prompt, shortcut) {
  const size = POLLINATIONS_SHORTCUTS[shortcut] || HF_SHORTCUTS[shortcut] || { width: 1024, height: 1024 };
  const qs = new URLSearchParams({ width: String(size.width), height: String(size.height), nologo: 'true', negative_prompt: NEGATIVE_PROMPT, seed: String(Math.floor(Math.random() * 1e9)) });
  const r = await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 1200))}?${qs}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const type = (r.headers.get('content-type') || '').split(';')[0].trim();
  if (!r.ok) throw new Error(`free-fallback: HTTP ${r.status}`);
  if (!type.startsWith('image/')) throw new Error(`free-fallback: unexpected content-type ${type}`);
  return { mime: type, bytes: Buffer.from(await r.arrayBuffer()) };
}

async function pollinationsImage(prompt, shortcut) {
  const key = POLLINATIONS_KEY();
  if (!key) throw new Error('POLLINATIONS_API_KEY is not set');
  const size = POLLINATIONS_SHORTCUTS[shortcut] || { width: 1024, height: 1024 };
  const wanted = (process.env.POLLINATIONS_IMAGE_MODEL || 'flux').trim();
  // First the configured model (if any), then Pollinations' own default.
  const models = [...new Set([wanted, ''])];
  let lastErr = new Error('Pollinations request failed');
  for (const model of models) {
    const qs = new URLSearchParams({ width: String(size.width), height: String(size.height), seed: String(Math.floor(Math.random() * 1e9)), negative_prompt: NEGATIVE_PROMPT, nologo: 'true' });
    if (String(process.env.POLLINATIONS_ENHANCE || 'off').toLowerCase() === 'on') qs.set('enhance', 'true');
    if (model) qs.set('model', model);
    const url = `${POLLINATIONS_URL()}/image/${encodeURIComponent(prompt.slice(0, 1500))}?${qs}`;
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      const type = (r.headers.get('content-type') || '').split(';')[0].trim();
      if (!r.ok) { lastErr = new Error(`pollinations/${model || 'default'}: HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`); continue; }
      if (!type.startsWith('image/')) { lastErr = new Error(`pollinations/${model || 'default'}: unexpected content-type ${type}`); continue; }
      return { mime: type, bytes: Buffer.from(await r.arrayBuffer()) };
    } catch (e) {
      lastErr = new Error(`pollinations/${model || 'default'}: ${e.message}`);
    }
  }
  throw lastErr;
}

// Keys that start with "AQ." are Google Cloud / Vertex AI express-mode keys.
// Keys from Google AI Studio start with "AIza". Each kind only works on its own
// endpoint, so "auto" tries the likelier one first and then the other.
function endpointOrder(key) {
  const pref = (process.env.GEMINI_IMAGE_ENDPOINT || 'auto').toLowerCase();
  if (pref === 'gemini' || pref === 'vertex') return [pref];
  return key.startsWith('AQ.') ? ['vertex', 'gemini'] : ['gemini', 'vertex'];
}

function buildRequest(kind, model, key, body) {
  if (kind === 'vertex') {
    return {
      // Vertex AI express mode documents the key as a ?key= query parameter.
      url: `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      headers: { 'Content-Type': 'application/json' },
      body,
    };
  }
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body,
  };
}

function pickImage(json) {
  const parts = json?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    const d = p.inlineData || p.inline_data;
    if (d?.data) return { mime: d.mimeType || d.mime_type || 'image/png', bytes: Buffer.from(d.data, 'base64') };
  }
  const why = json?.promptFeedback?.blockReason || json?.candidates?.[0]?.finishReason || 'no image in response';
  throw Object.assign(new Error(`Gemini returned no image (${why})`), { soft: true });
}

// Gemini answers 429 when the project is out of quota - on the free tier these image
// models have a limit of 0, so every call fails. Remember it and skip Gemini for a while
// (the error says when to retry, capped at 30 min) instead of waiting for it on every image.
let geminiBlockedUntil = 0;
function noteGeminiQuota(message) {
  const m = /retry in\s+(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:([\d.]+)s)?/i.exec(message || '');
  const asked = m ? ((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0)) * 1000 : 0;
  const ms = Math.min(Math.max(asked, 5 * 60 * 1000), 30 * 60 * 1000);
  geminiBlockedUntil = Date.now() + ms;
}
const geminiAvailable = () => Date.now() >= geminiBlockedUntil;

// inputs: [{mime, bytes}] reference images for image-to-image / style transforms.
async function geminiImage(prompt, inputs = []) {
  const key = GEMINI_KEY();
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  const parts = [
    ...inputs.slice(0, 3).map(i => ({ inlineData: { mimeType: i.mime, data: Buffer.from(i.bytes).toString('base64') } })),
    { text: prompt },
  ];
  const body = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  });

  let lastErr = new Error('Gemini image request failed');
  const budgetEnd = Date.now() + GEMINI_BUDGET_MS();
  for (const kind of endpointOrder(key)) {
    for (const model of MODELS()) {
      const left = budgetEnd - Date.now();
      if (left < 4000) throw Object.assign(new Error(`gemini: time budget used up (${lastErr.message})`), { soft: true });
      const req = buildRequest(kind, model, key, body);
      let r, raw;
      try {
        r = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body, signal: AbortSignal.timeout(Math.min(TIMEOUT_MS, left)) });
        raw = await r.text();
      } catch (e) {
        lastErr = new Error(`${kind}/${model}: network error: ${e.message}`);
        continue;
      }
      let j = null;
      try { j = JSON.parse(raw); } catch { /* not JSON */ }
      if (r.ok) {
        try { return pickImage(j); }
        catch (e) { lastErr = new Error(`${kind}/${model}: ${e.message}`); continue; }
      }
      const msg = j?.error?.message || raw.slice(0, 200);
      lastErr = new Error(`${kind}/${model}: HTTP ${r.status}: ${msg}`);
      // Key rejected by this endpoint: no point trying more models here, try the other endpoint.
      if (r.status === 401 || r.status === 403 || (r.status === 400 && /api key|api_key|credential/i.test(msg))) break;
      // Out of quota: trying other models/endpoints will not help.
      if (r.status === 429) { noteGeminiQuota(msg); throw lastErr; }
      // 404 (model not available on this endpoint) and 5xx: try the next model.
    }
  }
  throw lastErr;
}

async function generateImageInner(prompt, inputs = [], opts = {}) {
  const errors = [];
  const polished = polishImagePrompt(prompt, opts);
  // GeniGPT first: every normal prompt, every style shortcut and every edit of an existing picture.
  // Edits need a public URL for the picture (opts.inputUrls); without one we skip straight to Gemini,
  // which takes the bytes directly. Any failure falls through to the providers below, as before.
  if (genigptEnabled() && (!inputs.length || opts.inputUrls?.length)) {
    try { return await genigptImage(prompt, inputs.length ? opts.inputUrls[0] : ''); }
    catch (e) { errors.push(e.message); console.error('GeniGPT image generation failed, falling back:', e.message); }
  }
  // Pollinations (keyed): only for the chosen shortcuts, text-to-image only.
  if (!inputs.length && usesPollinations(opts.shortcut)) {
    try { return await pollinationsImage(polished, opts.shortcut); }
    catch (e) { errors.push(e.message); console.error('Pollinations image generation failed, falling back:', e.message); }
  }
  // Hugging Face shortcuts go before Gemini when Gemini is known to be out of quota.
  const hfFirst = !inputs.length && usesHuggingFace(opts.shortcut) && !geminiAvailable();
  const tryHf = async () => {
    try { return await huggingFaceImage(polished, opts.shortcut); }
    catch (e) { errors.push(e.message); console.error('Hugging Face image generation failed, falling back:', e.message); return null; }
  };
  if (hfFirst) { const out = await tryHf(); if (out) return out; }
  if (GEMINI_KEY() && geminiAvailable()) {
    try { return await geminiImage(prompt, inputs); }
    catch (e) { errors.push(e.message); console.error('Gemini image generation failed:', e.message); }
  } else if (GEMINI_KEY()) {
    errors.push('gemini: skipped (quota cool-down)');
  }
  if (!hfFirst && !inputs.length && usesHuggingFace(opts.shortcut)) { const out = await tryHf(); if (out) return out; }
  // Last resort: keyless text-to-image, so an exhausted quota does not mean "no image".
  if (!inputs.length && String(process.env.FREE_IMAGE_FALLBACK || 'on').toLowerCase() !== 'off') {
    try { return await freeFallbackImage(polished, opts.shortcut); }
    catch (e) { errors.push(e.message); console.error('Free image fallback failed:', e.message); }
  }
  throw new Error(errors.join(' | ') || 'No image provider is configured (set GEMINI_API_KEY)');
}

// opts: { shortcut: '/logo', subject: 'chatgpt' }. Never takes longer than IMAGE_TOTAL_TIMEOUT_MS.
export function generateImage(prompt, inputs = [], opts = {}) {
  let timer;
  const cap = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('image generation timed out')), TOTAL_MS()); });
  return Promise.race([generateImageInner(prompt, inputs, opts), cap]).finally(() => clearTimeout(timer));
}

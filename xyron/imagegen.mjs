// Image generation for Xyron.
//
// Primary provider: Google Gemini image models ("nano banana") using the key in
// GEMINI_API_KEY. Fallback: OpenAI images, only if OPENAI_API_KEY is set.
//
// Every function here throws a plain Error on failure. The server logs the real
// reason and sends the browser a generic "image_unavailable" code, so provider
// messages (and anything that could hint at a key) never reach the user.

const GEMINI_KEY = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const MODELS = () => [
  process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
  ...String(process.env.GEMINI_IMAGE_FALLBACK_MODELS ?? 'gemini-3.1-flash-image-preview')
    .split(',').map(s => s.trim()).filter(Boolean),
];
const TIMEOUT_MS = Number(process.env.IMAGE_TIMEOUT_MS) || 60000;

export const imageProviderConfigured = () => Boolean(GEMINI_KEY() || process.env.OPENAI_API_KEY || POLLINATIONS_KEY() || HF_KEY());

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

// ---------- Keyless last resort (image.pollinations.ai) ----------
// Text-to-image only. Used after every configured provider has failed, so a quota problem
// on one account does not leave the person with no image at all. Disable with FREE_IMAGE_FALLBACK=off.
async function freeFallbackImage(prompt, shortcut) {
  const size = POLLINATIONS_SHORTCUTS[shortcut] || HF_SHORTCUTS[shortcut] || { width: 1024, height: 1024 };
  const qs = new URLSearchParams({ width: String(size.width), height: String(size.height), nologo: 'true', seed: String(Math.floor(Math.random() * 1e9)) });
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
  const wanted = (process.env.POLLINATIONS_IMAGE_MODEL || '').trim();
  // First the configured model (if any), then Pollinations' own default.
  const models = [...new Set([wanted, ''])];
  let lastErr = new Error('Pollinations request failed');
  for (const model of models) {
    const qs = new URLSearchParams({ width: String(size.width), height: String(size.height), seed: '-1' });
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
  for (const kind of endpointOrder(key)) {
    for (const model of MODELS()) {
      const req = buildRequest(kind, model, key, body);
      let r, raw;
      try {
        r = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body, signal: AbortSignal.timeout(TIMEOUT_MS) });
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

async function openaiImage(prompt) {
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', prompt, size: '1024x1024' }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OpenAI image error (${r.status}): ${j.error?.message || ''}`);
  const item = j.data?.[0];
  if (item?.b64_json) return { mime: 'image/png', bytes: Buffer.from(item.b64_json, 'base64') };
  if (item?.url) {
    const img = await fetch(item.url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!img.ok) throw new Error('Could not download the generated image');
    return { mime: img.headers.get('content-type') || 'image/png', bytes: Buffer.from(await img.arrayBuffer()) };
  }
  throw new Error('OpenAI returned no image');
}

export async function generateImage(prompt, inputs = [], opts = {}) {
  const errors = [];
  // Pollinations (keyed): only for the chosen shortcuts, text-to-image only.
  if (!inputs.length && usesPollinations(opts.shortcut)) {
    try { return await pollinationsImage(prompt, opts.shortcut); }
    catch (e) { errors.push(e.message); console.error('Pollinations image generation failed, falling back:', e.message); }
  }
  // Hugging Face shortcuts go before Gemini when Gemini is known to be out of quota.
  const hfFirst = !inputs.length && usesHuggingFace(opts.shortcut) && !geminiAvailable();
  const tryHf = async () => {
    try { return await huggingFaceImage(prompt, opts.shortcut); }
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
  // OpenAI fallback only handles plain text-to-image.
  if (process.env.OPENAI_API_KEY && !inputs.length) {
    try { return await openaiImage(prompt); }
    catch (e) { errors.push(e.message); console.error('OpenAI image generation failed:', e.message); }
  }
  // Last resort: keyless text-to-image, so an exhausted quota does not mean "no image".
  if (!inputs.length && String(process.env.FREE_IMAGE_FALLBACK || 'on').toLowerCase() !== 'off') {
    try { return await freeFallbackImage(prompt, opts.shortcut); }
    catch (e) { errors.push(e.message); console.error('Free image fallback failed:', e.message); }
  }
  throw new Error(errors.join(' | ') || 'No image provider is configured (set GEMINI_API_KEY)');
}

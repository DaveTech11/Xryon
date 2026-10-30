// Turns the person's words + attached files/images into a safe "storyboard" (JSON) that the browser renders into a video.
// The AI only writes TEXT and picks layouts; it can never supply image URLs, code or HTML - those come from the real attachments.
import { randomUUID } from 'node:crypto';

export const THEMES = ['dark', 'ember', 'ocean', 'light'];
export const MUSIC = ['cinematic', 'upbeat', 'calm', 'none'];
export const SCENE_TYPES = ['title', 'text', 'bullets', 'cards', 'stats', 'image', 'code', 'cta'];
export const MAX_SCENES = 9, MAX_SECONDS = 45;

const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const num = (v, lo, hi, d) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };

export function buildPlanPrompt({ request, docText = '', imageNotes = [], aspect = 'vertical' }) {
  const system = `You are the storyboard writer for Xyron's video maker. Reply with ONE JSON object and nothing else (no markdown fences, no commentary).
The video is rendered by the app from your JSON: ${aspect === 'vertical' ? 'phone-shaped 9:16' : 'widescreen 16:9'}, 20-40 seconds, with animated text, the person's own images and synthesized music.
Schema:
{"title":"short video title","brand":"name shown on screen","theme":"dark|ember|ocean|light","music":"cinematic|upbeat|calm|none",
 "scenes":[{"type":"title|text|bullets|cards|stats|image|code|cta","kicker":"tiny label","title":"headline","text":"one short sentence","items":[{"label":"","value":"","text":""}],"code":"max 6 short lines","image":0,"duration":4.5}]}
Rules:
- 5 to 8 scenes. First scene type "title", last scene type "cta" (title = call to action, text = site or handle if known).
- Use ONLY facts from the person's request, the attached file text and the image notes. Never invent prices, numbers, names or features.
- "image" scenes show attached picture number N (0-based, from the image list). Use every attached image once, near the part of the story it belongs to; "title" = caption.
- "cards" = 2-4 items with label + text (+ value for prices); "stats" = 2-4 items with value + label; "bullets" = 3-4 items with text; "code" only if the request is about code/API.
- Keep text SHORT: titles under 7 words, sentences under 14 words. Write in the language the person used.
- Pick the theme and music that fit the topic (default dark + cinematic).`;
  const parts = [`Request from the person:\n${clean(request, 1500)}`];
  if (imageNotes.length) parts.push('Attached images (number: what the image reader saw):\n' + imageNotes.map((n, i) => `${i}: ${clean(n, 400)}`).join('\n'));
  if (docText) parts.push('Text from the attached file(s):\n<<<\n' + docText.slice(0, 12000) + '\n>>>');
  return { system, user: parts.join('\n\n') };
}

function extractJson(raw) {
  let s = String(raw || '').replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  s = s.slice(a, b + 1);
  for (const t of [s, s.replace(/,\s*([}\]])/g, '$1')]) { try { return JSON.parse(t); } catch { /* try next */ } }
  return null;
}

function cleanScene(s, imageCount) {
  if (!s || typeof s !== 'object') return null;
  const type = SCENE_TYPES.includes(s.type) ? s.type : 'text';
  const out = { type, kicker: clean(s.kicker, 40), title: clean(s.title, 80), text: clean(s.text, 200), duration: num(s.duration, 3, 7, 4.5) };
  const items = (Array.isArray(s.items) ? s.items : []).slice(0, 4).map((i) => typeof i === 'string' ? { label: '', value: '', text: clean(i, 110) } : { label: clean(i?.label, 40), value: clean(i?.value, 16), text: clean(i?.text, 110) }).filter((i) => i.label || i.value || i.text);
  if (items.length) out.items = items;
  if (type === 'code') out.code = String(s.code ?? '').split('\n').slice(0, 6).map((l) => l.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').slice(0, 64)).join('\n').trimEnd();
  if (type === 'image') { const i = Number.isInteger(s.image) ? s.image : parseInt(s.image, 10); if (Number.isInteger(i) && i >= 0 && i < imageCount) out.image = i; else return null; }
  if (type === 'code' && !out.code) return null;
  if ((type === 'bullets' || type === 'cards' || type === 'stats') && !out.items) { out.type = 'text'; }
  return out;
}

// raw = the AI's reply text; imageUrls = the person's real attached images (only these can appear); returns a finished plan.
export function parsePlan(raw, { request = '', imageUrls = [], imageNotes = [], aspect = 'vertical' } = {}) {
  const j = extractJson(raw) || {};
  const images = imageUrls.slice(0, 8);
  let scenes = (Array.isArray(j.scenes) ? j.scenes : []).map((s) => cleanScene(s, images.length)).filter(Boolean).slice(0, MAX_SCENES);
  const title = clean(j.title, 70) || clean(request, 60).replace(/^(?:please\s+)?(?:make|create|generate)\s+(?:me\s+)?(?:a\s+|an\s+)?/i, '') || 'My video';
  if (scenes.length < 2) {
    // The AI gave nothing usable: still make a clean video from the request + images instead of failing.
    scenes = [{ type: 'title', kicker: '', title, text: '', duration: 4 }, ...(clean(request, 200) ? [{ type: 'text', kicker: '', title: '', text: clean(request, 200), duration: 4.5 }] : [])];
  }
  // Every attached image must appear: add the ones the AI skipped just before the last scene.
  const used = new Set(scenes.filter((s) => s.type === 'image').map((s) => s.image));
  const missing = images.map((_, i) => i).filter((i) => !used.has(i)).slice(0, 4);
  if (missing.length) { const extra = missing.map((i) => ({ type: 'image', kicker: '', title: clean(imageNotes[i], 60).split(/[.\n]/)[0] || '', text: '', image: i, duration: 4 })); scenes.splice(Math.max(1, scenes.length - 1), 0, ...extra); scenes = scenes.slice(0, MAX_SCENES + 4); }
  if (scenes[0].type !== 'title') scenes.unshift({ type: 'title', kicker: '', title, text: '', duration: 4 });
  if (scenes[scenes.length - 1].type !== 'cta') scenes.push({ type: 'cta', kicker: '', title: 'Try it today', text: '', duration: 4 });
  const total = scenes.reduce((a, s) => a + s.duration, 0);
  if (total > MAX_SECONDS) scenes.forEach((s) => { s.duration = Math.round(Math.max(2.5, s.duration * MAX_SECONDS / total) * 10) / 10; });
  return { version: 1, id: randomUUID(), title, brand: clean(j.brand, 40) || title.slice(0, 30), aspect: aspect === 'wide' ? 'wide' : 'vertical',
    theme: THEMES.includes(j.theme) ? j.theme : 'dark', music: MUSIC.includes(j.music) ? j.music : 'cinematic', images, scenes };
}

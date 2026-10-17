// Helpers for Xyron Voice: browser speech recognition, text-to-speech and saved preferences.

export function getRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export const isAndroid = () => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || "");
export const isCoarsePointer = () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;

// ---------------------------------------------------------------- preferences
const PREFS_KEY = "xyron_voice_prefs";

export const VOICE_LANGS = [
  ["en-US", "English (US)"], ["en-GB", "English (UK)"], ["en-NG", "English (Nigeria)"], ["en-IN", "English (India)"],
  ["en-ZA", "English (South Africa)"], ["fr-FR", "Français"], ["es-ES", "Español"], ["pt-BR", "Português (Brasil)"],
  ["de-DE", "Deutsch"], ["it-IT", "Italiano"], ["ar-SA", "العربية"], ["hi-IN", "हिन्दी"], ["sw-KE", "Kiswahili"],
  ["ja-JP", "日本語"], ["ko-KR", "한국어"], ["zh-CN", "中文 (普通话)"], ["ru-RU", "Русский"],
];

export function loadVoicePrefs() {
  const device = (typeof navigator !== "undefined" && navigator.language) || "en-US";
  const base = { lang: device, autoSend: true, readAloud: true };
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    if (saved && typeof saved === "object") {
      return {
        lang: typeof saved.lang === "string" && saved.lang ? saved.lang : base.lang,
        autoSend: saved.autoSend !== false,
        readAloud: saved.readAloud !== false,
      };
    }
  } catch { /* storage unavailable or corrupt */ }
  return base;
}

export function saveVoicePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
}

// --------------------------------------------------------------- speech text
// Turns a Markdown chat reply into something that sounds natural when read aloud.
export function cleanForSpeech(md, maxChars = 1100) {
  let t = String(md || "");
  t = t.replace(/```[\s\S]*?```/g, " The code is in the chat. ");
  t = t.replace(/`([^`]*)`/g, "$1");
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  t = t.replace(/https?:\/\/\S+/g, "link");
  t = t.replace(/^\s{0,3}#{1,6}\s*/gm, "");
  t = t.replace(/^\s*[-*+]\s+/gm, "");
  t = t.replace(/^\s*\d+[.)]\s+/gm, "");
  t = t.replace(/[*_~>|]/g, "");
  t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "");
  t = t.replace(/\s+/g, " ").trim();
  if (t.length > maxChars) {
    const cut = t.slice(0, maxChars);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
    t = `${cut.slice(0, end > 200 ? end + 1 : maxChars).trim()} The rest is in the chat.`;
  }
  return t;
}

// Browsers cut off long utterances (Chrome stops after roughly 15 seconds), so speak sentence-sized pieces.
export function chunkSpeech(text, max = 170) {
  const sentences = String(text || "").match(/[^.!?…]+[.!?…]*\s*/g) || [];
  const out = [];
  let cur = "";
  const push = (s) => { if (s.trim()) out.push(s.trim()); };
  for (const raw of sentences) {
    let s = raw;
    while (s.length > max) {
      const at = s.lastIndexOf(",", max) > 60 ? s.lastIndexOf(",", max) + 1 : s.lastIndexOf(" ", max);
      const cutAt = at > 0 ? at : max;
      if (cur) { push(cur); cur = ""; }
      push(s.slice(0, cutAt));
      s = s.slice(cutAt);
    }
    if ((cur + s).length > max) { push(cur); cur = s; } else cur += s;
  }
  push(cur);
  return out;
}

export function pickVoice(lang) {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
  const voices = synth?.getVoices?.() || [];
  if (!voices.length) return null;
  const want = String(lang || "en-US").toLowerCase();
  const prefix = want.split("-")[0];
  const score = (v) => {
    const l = (v.lang || "").toLowerCase().replace("_", "-");
    let s = 0;
    if (l === want) s += 6; else if (l.startsWith(prefix)) s += 3; else return -1;
    if (/google|natural|online|neural|premium|enhanced/i.test(v.name)) s += 3;
    if (v.localService === false) s += 1;
    if (v.default) s += 1;
    return s;
  };
  let best = null, bestScore = -1;
  for (const v of voices) { const sc = score(v); if (sc > bestScore) { best = v; bestScore = sc; } }
  return best;
}

// Speaks `text` aloud in chunks. Returns a cancel function. onEnd fires once, after the last chunk
// (but not when cancelled, so the caller stays in control).
export function speakText(text, { lang = "en-US", onStart, onEnd, onProgress } = {}) {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
  const chunks = chunkSpeech(text);
  if (!synth || !chunks.length || typeof SpeechSynthesisUtterance === "undefined") {
    setTimeout(() => onEnd?.(), 0);
    return () => {};
  }
  let cancelled = false;
  let i = 0;
  let started = false;
  let pos = 0;
  let tick = null;
  const stopTick = () => { clearInterval(tick); tick = null; };
  synth.cancel();
  const next = () => {
    if (cancelled) return;
    if (i >= chunks.length) { onEnd?.(); return; }
    const chunk = chunks[i++];
    const at = text.indexOf(chunk, pos);
    const base = at >= 0 ? at : pos;
    pos = base + chunk.length;
    let gotBoundary = false;
    const u = new SpeechSynthesisUtterance(chunk);
    u.lang = lang;
    u.onboundary = (e) => {
      if (e.name && e.name !== "word") return;
      gotBoundary = true;
      stopTick();
      const len = e.charLength || (chunk.slice(e.charIndex).search(/\s/) + 1) || 1;
      onProgress?.(base + e.charIndex + len);
    };
    const v = pickVoice(lang);
    if (v) u.voice = v;
    u.rate = 1.02;
    u.onstart = () => {
      if (!started) { started = true; onStart?.(); }
      // Some phone browsers never fire word boundaries, so estimate progress from the speaking rate.
      const t0 = Date.now();
      setTimeout(() => {
        if (gotBoundary || cancelled) return;
        tick = setInterval(() => onProgress?.(Math.min(base + chunk.length, base + Math.floor(((Date.now() - t0) / 1000) * 15))), 120);
      }, 500);
    };
    u.onend = () => { stopTick(); onProgress?.(base + chunk.length); next(); };
    u.onerror = (e) => { if (e?.error === "interrupted" || e?.error === "canceled") return; next(); };
    synth.speak(u);
  };
  // Chrome needs a tick after cancel() before speak() works reliably.
  setTimeout(next, 30);
  return () => { cancelled = true; stopTick(); try { synth.cancel(); } catch { /* ignore */ } };
}

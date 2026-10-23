import { api } from "../api/client";
import { isAdminUser } from "../lib/adminEmails";
import { isImageRequest, VISUAL_NOUN, FILLER, GEN_RE, CODE_CONTEXT, words, hasSubject } from "../../imageIntent.mjs";

const KEYS = {
  fontSize: "xryon_font_size",
  persona: "xryon_persona",
  systemPrompt: "xryon_system_prompt",
  clientId: "xryon_client_id",
  msgCount: "xryon_msg_count",
  imgCount: "xryon_img_count",
  msgQuota: "xryon_msg_quota_4h",
  imgQuota: "xryon_img_quota_4h",
  fileCount: "xryon_file_count",
  docCount: "xryon_doc_count",
  darkMode: "xryon_dark_mode",
  codexModel: "xryon_codex_model",
  codexIntroSeen: "xryon_codex_intro_seen",
  selectedModel: "xryon_selected_model",
  xyronMode: "xryon_xyron_mode",
  webSearch: "xryon_web_search",
  richCards: "xryon_rich_cards",
};

// Same one-time key migration as api/client.js, kept here too since this
// module can be imported on its own before client.js runs.
(function migrateLegacyStorageKeys() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const oldKey = localStorage.key(i);
      if (!oldKey || !oldKey.startsWith("xgpt_")) continue;
      const newKey = "xryon_" + oldKey.slice("xgpt_".length);
      if (localStorage.getItem(newKey) == null) localStorage.setItem(newKey, localStorage.getItem(oldKey));
      localStorage.removeItem(oldKey);
    }
  } catch { /* storage unavailable — nothing to migrate */ }
})();

export function getSetting(key, fallback) {
  try { return localStorage.getItem(KEYS[key]) || fallback; } catch { return fallback; }
}

export function setSetting(key, value) {
  try { localStorage.setItem(KEYS[key], value); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent("xryon-setting", { detail: { key, value } })); } catch { /* not in a browser */ }
}

// On/off switches shared by the chat "+" menu and Settings (they stay in sync through the event above).
//   webSearch: off by default      richCards: on by default
export const isWebSearchOn = () => getSetting("webSearch", "off") === "on";
export const isRichCardsOn = () => getSetting("richCards", "on") !== "off";
export function onSettingChange(callback) {
  const handler = () => callback();
  window.addEventListener("xryon-setting", handler);
  window.addEventListener("storage", handler);
  return () => { window.removeEventListener("xryon-setting", handler); window.removeEventListener("storage", handler); };
}

export function getClientId() {
  let id = getSetting("clientId", null);
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setSetting("clientId", id);
  }
  return id;
}

// Exactly three public plans.
export const TIERS = {
  free: { label: "Free", dailyLimit: 10, imgLimit: 5, fileLimit: 5, docLimit: 5, features: ["chat", "limited image", "limited files", "limited documentation"] },
  premium: { label: "Premium", dailyLimit: 500, imgLimit: 50, fileLimit: 100, docLimit: 100, features: ["chat", "image", "files", "documentation", "code", "priority"] },
  premium_plus: { label: "Premium+", dailyLimit: Infinity, imgLimit: 200, fileLimit: 500, docLimit: Infinity, features: ["chat", "image", "files", "documentation", "code", "priority"] },
};

export async function getCurrentUser() {
  try { return await api.auth.me(); } catch { return null; }
}

export async function isCurrentUserAdmin() {
  return isAdminUser(await getCurrentUser());
}

export async function getTier() {
  try {
    const user = await getCurrentUser();
    if (isAdminUser(user)) return "admin";
    // The server only returns this account's own subscriptions, and only the server can create them.
    const all = await api.entities.Subscription.filter({ status: "active" });
    const subs = all.filter((s) => !s.expires_at || Date.parse(s.expires_at) > Date.now());
    if (subs.length > 0) {
      const tier = subs[0].tier;
      return tier === "premium_plus" ? "premium_plus" : "premium";
    }
  } catch { /* local free mode */ }
  // Admin switch "free Premium for everyone": the server unlocks Premium for all accounts.
  try {
    const status = await api.premium.status();
    if (status?.freePremium?.enabled) return "premium";
  } catch { /* offline / signed out: stay on the free plan */ }
  return "free";
}

export async function checkPremium() {
  const tier = await getTier();
  return tier !== "free" || tier === "admin";
}

export const FREE_DAILY_LIMIT = 10;
export const FREE_IMAGE_LIMIT = 5;
export const FREE_FILE_LIMIT = 5;
export const FREE_DOCUMENTATION_LIMIT = 5;

function getDailyCounter(key) {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const data = localStorage.getItem(KEYS[key]);
    if (data) {
      const parsed = JSON.parse(data);
      if (parsed.date === today) return Number(parsed.count) || 0;
    }
  } catch { /* ignore */ }
  return 0;
}

function incrementDailyCounter(key) {
  const today = new Date().toISOString().slice(0, 10);
  const count = getDailyCounter(key) + 1;
  try { localStorage.setItem(KEYS[key], JSON.stringify({ date: today, count })); } catch { /* ignore */ }
  return count;
}

export function getDailyMessageCount() { return getDailyCounter("msgCount"); }
export function incrementMessageCount() { return incrementDailyCounter("msgCount"); }
export function getDailyImageCount() { return getDailyCounter("imgCount"); }
export function incrementImageCount() { return incrementDailyCounter("imgCount"); }
export function getDailyFileCount() { return getDailyCounter("fileCount"); }
export function incrementFileCount(amount = 1) {
  let count = getDailyFileCount();
  for (let i = 0; i < amount; i += 1) count = incrementDailyCounter("fileCount");
  return count;
}
export function getDailyDocumentationCount() { return getDailyCounter("docCount"); }
export function incrementDocumentationCount() { return incrementDailyCounter("docCount"); }

// ---------------------------------------------------------------------
// Rolling 4-hour "token quota" for free-tier questions and image gens.
// Unlike the daily counters above, this is a hard block: once a free
// user hits the cap, every further attempt is refused (with a popup)
// until the 4-hour window since their first use in this window elapses.
// ---------------------------------------------------------------------
export const TOKEN_QUOTA_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 hours
// Chat messages and image generation are available without an app-imposed quota.
// Provider/API rate limits can still apply independently.
export const FREE_MESSAGE_QUOTA = Infinity;
export const FREE_IMAGE_QUOTA = Infinity;

function getQuotaState(key) {
  try {
    const raw = localStorage.getItem(KEYS[key]);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.windowStart < TOKEN_QUOTA_WINDOW_MS) {
        return { count: Number(parsed.count) || 0, windowStart: parsed.windowStart };
      }
    }
  } catch { /* ignore */ }
  return { count: 0, windowStart: Date.now() };
}

function saveQuotaState(key, state) {
  try { localStorage.setItem(KEYS[key], JSON.stringify(state)); } catch { /* ignore */ }
}

export function getMessageQuota() { return getQuotaState("msgQuota"); }
export function getImageQuota() { return getQuotaState("imgQuota"); }

export function isMessageQuotaExceeded() { return getMessageQuota().count >= FREE_MESSAGE_QUOTA; }
export function isImageQuotaExceeded() { return getImageQuota().count >= FREE_IMAGE_QUOTA; }

export function recordMessageQuotaUse() {
  const state = getMessageQuota();
  state.count += 1;
  saveQuotaState("msgQuota", state);
  return state.count;
}
export function recordImageQuotaUse() {
  const state = getImageQuota();
  state.count += 1;
  saveQuotaState("imgQuota", state);
  return state.count;
}

export function getQuotaResetMs(kind) {
  const state = kind === "image" ? getImageQuota() : getMessageQuota();
  return Math.max(0, TOKEN_QUOTA_WINDOW_MS - (Date.now() - state.windowStart));
}

// The rolling-window helpers above return a duration ("2h 30m"); these two
// return an actual clock time, e.g. for "usage resets at 9:14 PM" copy.
export function getQuotaResetClockTime(kind) {
  return new Date(Date.now() + getQuotaResetMs(kind));
}

export function getDailyResetClockTime() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
}

export function formatClockTime(date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatQuotaReset(ms) {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export const PERSONAS = {
  concise: "Be concise and direct. Keep answers short.",
  detailed: "Be thorough and detailed. Explain your reasoning.",
  creative: "Be creative and imaginative. Think outside the box.",
  professional: "Be professional and formal. Use precise language.",
};

// The "make / generate / draw ..." rule (isImageRequest) lives in imageIntent.mjs so the server router uses the very same one.
export { isImageRequest };

// ---- Vague brand-picture requests: ask for details first ------------------------------------
// "create a channel pic for me" says nothing about WHAT the picture is. Generating right away gives a
// random face, so Xyron first shows a small form (name, content, style, text) and only then makes it.
// The form's answers come back as a normal request ("Create a channel picture with these details: ...")
// that has plenty of specifics, so it goes straight to generation.
const GENERIC_ASSET = new Set(["channel", "profile", "pfp", "dp", "avatar", "logo", "banner", "thumbnail", "icon", "poster", "flyer", "cover", "brand", "page", "account", "group", "youtube", "telegram", "whatsapp", "discord", "tiktok", "instagram", "twitch", "facebook", "twitter", "business", "shop", "store", "company", "picture", "pic", "photo", "image"]);

export function imageDetailsAsk(text = "") {
  const lower = String(text).toLowerCase().trim();
  if (!lower || lower.startsWith("/") || lower.length > 140) return null;
  const m = lower.match(GEN_RE);
  if (!m) return null;
  const ws = words(m[2].replace(/[?!.]+\s*$/, "").trim());
  if (!ws.length || !ws.some((w) => GENERIC_ASSET.has(w))) return null;
  // Any real detail (a name, a subject, a colour...) means the person already said what they want.
  if (ws.some((w) => !FILLER.has(w) && !GENERIC_ASSET.has(w) && !VISUAL_NOUN.test(w))) return null;
  const has = (...k) => k.some((x) => ws.includes(x));
  const label = has("logo") ? "logo" : has("banner") ? "banner" : has("thumbnail") ? "thumbnail" : has("poster", "flyer") ? "poster" : has("avatar", "pfp", "dp", "profile") ? "profile picture" : has("channel", "youtube", "telegram", "whatsapp", "discord", "tiktok", "twitch", "group") ? "channel picture" : "picture";
  const form = {
    title: `A few quick details for your ${label}:`,
    prefix: `Create a ${label} with these details:`,
    questions: [
      { id: "about", type: "text", question: "Name or topic", placeholder: "e.g. Dave Tech - coding tutorials" },
      { id: "look", question: "What should be in it?", options: ["Logo / lettering only", "A character or mascot", "An abstract symbol or icon", "An illustrated person"] },
      { id: "style", question: "Style", options: ["Neon / cyberpunk", "Minimal black and white", "Cartoon / anime", "3D glossy", "Luxury gold and black"] },
      { id: "text", question: "Show the name as text on it?", options: ["Yes", "No"] },
    ],
    submit: "Create it",
  };
  return `Happy to! I need a few details first so your ${label} is actually yours, not a random picture. (You can also just type exactly what you want.)\n\n:::xyron-ask\n${JSON.stringify(form)}\n:::`;
}

// ---- Follow-up edits of the picture already in the chat -------------------------------------
// "use that image write dave tech on it", "add my name on the picture", "remove the background",
// "make it darker": the person is talking about the last image, so edit it instead of replying in text.
const IMG_NOUN = "(?:image|picture|photo|pic|logo|design|artwork|wallpaper|poster|banner|flyer|card)";
const USE_THAT = new RegExp(`\\buse\\s+(?:that|this|the\\s+(?:same|last|previous))\\s+${IMG_NOUN}\\b`, "i");
const WRITE_VERB = /\b(write|type|add|put|place|insert|print|stamp|label|engrave|overlay|inscribe)\b/i;
const ON_IT = new RegExp(`\\b(?:on|onto|over|across|inside|in)\\s+(?:it|them|that|this|the|same|my)(?:\\s+(?:same|last|previous))?(?:\\s+${IMG_NOUN})?\\s*[.!?]*$|\\b(?:on|onto|over|across|inside|in)\\s+(?:that|this|the|same|previous|last)\\s+${IMG_NOUN}\\b`, "i");
const EDIT_VERB = /\b(remove|erase|delete|change|replace|recolou?r|blur|brighten|darken|crop|enhance|sharpen|colou?rize|resize|retouch|restyle|fix|edit|swap|cut out)\b/i;
const REF_IMG = new RegExp(`\\b(?:that|this|the|same|previous|last)\\s+${IMG_NOUN}\\b`, "i");
const ABOUT_IT = /\b(about|describe|explain|caption for|story|poem|essay|prompt)\b/i;

export function isEditPreviousImageRequest(text = "") {
  const lower = String(text).toLowerCase().trim();
  if (!lower || lower.startsWith("/") || lower.length > 400) return false;
  if (CODE_CONTEXT.test(lower)) return false;
  if (USE_THAT.test(lower)) return true;
  if (WRITE_VERB.test(lower) && ON_IT.test(lower) && !ABOUT_IT.test(lower)) return true;
  if (EDIT_VERB.test(lower) && REF_IMG.test(lower) && !ABOUT_IT.test(lower)) return true;
  if (/^(?:please\s+|pls\s+)?(?:make|turn|change|edit)\s+(?:it|this|that)\b/.test(lower)) return true;
  return false;
}

export function isDocumentationRequest(text = "") {
  const lower = text.toLowerCase();
  return ["documentation", "docs", "document", "readme", "api reference", "api documentation", "technical document", "developer docs"]
    .some((word) => lower.includes(word));
}




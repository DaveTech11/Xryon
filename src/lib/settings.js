import { api } from "../api/client";
import { isAdminUser } from "../lib/adminEmails";

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
export const FREE_MESSAGE_QUOTA = 50;
export const FREE_IMAGE_QUOTA = 5;

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

export function isImageRequest(text = "") {
  const lower = text.toLowerCase().trim();
  const shortcut = lower.split(/\s+/)[0];
  const imageShortcuts = ["/anime", "/realistic", "/cinematic", "/portrait", "/avatar", "/wallpaper", "/logo", "/3d", "/cartoon", "/manga", "/cyberpunk", "/fantasy", "/product", "/sticker", "/pixel", "/oilpaint", "/watercolor", "/sketch", "/neon", "/luxury", "/glass", "/dark", "/hdr", "/bw", "/glow", "/youtube", "/poster", "/banner", "/appicon", "/fashion", "/architecture", "/food", "/nature", "/scifi", "/minimal", "/vintage", "/isometric", "/comic", "/fantasyland", "/headshot", "/mockup", "/album", "/tattoo", "/vehicle", "/room", "/studiolight", "/dream", "/lowpoly", "/chibi", "/lineart"];
  if (imageShortcuts.includes(shortcut)) return true;

  const actionWords = ["generate", "create", "draw", "make", "produce", "design"];
  const imageWords = ["image", "picture", "photo", "drawing", "illustration", "artwork", "painting"];
  const hasActionWord = actionWords.some((a) => lower.includes(a));
  const hasImageWord = imageWords.some((i) => lower.includes(i));
  if (!hasActionWord || !hasImageWord) return false;

  // A bare capability question ("can u generate image", "can you make a picture?")
  // is just asking what Xyron can do, not asking for one — reply normally
  // unless it also carries an explicit request marker like "for me"/"please"/"now".
  const isCapabilityQuestion = /^(can|could|would|will|do|does)\s+(you|u|xyron)\b/.test(lower);
  const hasRequestMarker = /\bfor me\b|\bplease\b|\bright now\b|\bnow\b|\basap\b|\bfor us\b/.test(lower);
  if (isCapabilityQuestion && !hasRequestMarker) return false;

  return true;
}

export function isDocumentationRequest(text = "") {
  const lower = text.toLowerCase();
  return ["documentation", "docs", "document", "readme", "api reference", "api documentation", "technical document", "developer docs"]
    .some((word) => lower.includes(word));
}




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

// ---- "Make / generate / draw ..." -> really make the picture --------------------------------
// A message that ASKS FOR a picture is executed; a message that only asks whether Xyron CAN
// ("can u generate images?") is answered in words. The difference is whether a subject is given.
const VISUAL_NOUN = /^(images?|pictures?|photos?|photographs?|pics?|illustrations?|drawings?|artworks?|art|paintings?|portraits?|wallpapers?|logos?|posters?|banners?|icons?|avatars?|stickers?|memes?|thumbnails?|flyers?|cartoons?|anime|sketch(?:es)?|renders?|mockups?|selfies?|headshots?|tattoos?|pfp|dp|backgrounds?|landscapes?|scenes?|characters?|mascots?|covers?|birthday cards?|cards?)$/i;
const CODE_NOUN = /^(code|script|function|component|prompt|prompts|app|apps|website|websites|webpage|api|generator|gallery|upload|uploader|viewer|tool|class|module|feature|library|bot|program|software|tutorial|essay|story|poem|report|email|letter|summary|list|plan|table|chart|spreadsheet|song|lyrics|video|playlist|document|quiz|game|schedule|resume|cv|caption|slogan|joke|recipe|outline)$/i;
const FILLER = new Set(["a", "an", "the", "some", "any", "me", "us", "my", "for", "please", "pls", "plz", "now", "too", "also", "of", "ai", "generated", "and", "or", "to", "new", "cool", "nice", "beautiful", "image", "images", "picture", "pictures", "photo", "photos", "pic", "pics", "art", "artwork", "drawing", "drawings", "illustration", "illustrations", "something", "anything", "stuff", "it", "them", "here", "again", "just", "one", "more", "few"]);
const GEN_RE = /^(?:(?:hey|hi|hello|yo|bro|abeg|ok|okay|so|now|then|xyron)[\s,!.]+)*(?:(?:please|pls|plz)[\s,]+)?(?:(?:can|could|would|will)\s+(?:you|u|xyron)\s+(?:please\s+|pls\s+|just\s+)?|i\s+(?:want|need|would like|wanna)\s+(?:you\s+to\s+)?|(?:go ahead and|just)\s+)?(?:(?:please|pls|plz)\s+)?(generate|create|make|draw|craft|paint|sketch|render|illustrate|design|produce)\b\s*([\s\S]*)$/i;
const NOT_A_PICTURE = /^(?:an?\s+|the\s+)?(?:conclusions?|attention|blood|breath|lessons?|comparisons?|parallels?|inspiration|up|from|on|out|in|lots|straws?|salary|money)\b/i;
const CODE_CONTEXT = /\b(prompt|code|script|function|component|api|python|javascript|react|html|css|sql|how (?:do|to|can)|tutorial|midjourney|dall-?e|stable diffusion)\b/i;

// "...on the image", "as a jpeg", "like a trademark" -> the person wants a picture even though the
// picture word is not near the start of the sentence ("design 'ASTRA BUG' on the image like a trademark").
const PICTURE_PHRASE = /\b(?:on|as|into|onto|in)\s+(?:an?\s+|the\s+)?(?:image|picture|photo|jpe?g|png|webp)\b|\blike\s+an?\s+(?:trademark|logo|badge|emblem|poster|brand mark)\b/i;
// "I need as a jpeg image", "give me a png", "send it as an image" -> asking for a picture file, no verb needed.
const FORMAT_RE = /\b(?:jpe?g|png|webp)\b/i;
const FORMAT_ASK = /^(?:(?:hey|hi|hello|yo|bro|abeg|ok|okay|so|now|then|xyron)[\s,!.]+)*(?:(?:please|pls|plz)[\s,]+)?(?:i\s+(?:need|want|would like|wanna)|(?:can|could|would|will)\s+(?:you|u)\s+(?:please\s+)?(?:give|send|get|show)\s+me|(?:give|send|get|show)\s+me|as\s+an?|make\s+it\s+(?:as\s+)?an?|i\s+said)\b/i;

const words = (t) => String(t).toLowerCase().replace(/[^a-z0-9'+\s-]/g, " ").split(/\s+/).filter(Boolean);
const hasSubject = (rest) => words(rest).some((w) => !FILLER.has(w));

export function isImageRequest(text = "") {
  const lower = text.toLowerCase().trim();
  const shortcut = lower.split(/\s+/)[0];
  const imageShortcuts = ["/anime", "/realistic", "/cinematic", "/portrait", "/avatar", "/wallpaper", "/logo", "/3d", "/cartoon", "/manga", "/cyberpunk", "/fantasy", "/product", "/sticker", "/pixel", "/oilpaint", "/watercolor", "/sketch", "/neon", "/luxury", "/glass", "/dark", "/hdr", "/bw", "/glow", "/youtube", "/poster", "/banner", "/appicon", "/fashion", "/architecture", "/food", "/nature", "/scifi", "/minimal", "/vintage", "/isometric", "/comic", "/fantasyland", "/headshot", "/mockup", "/album", "/tattoo", "/vehicle", "/room", "/studiolight", "/dream", "/lowpoly", "/chibi", "/lineart", "/textimage"];
  if (imageShortcuts.includes(shortcut)) return true;
  if (lower.startsWith("/") || lower.length > 600) return false;

  // 1) A message that starts like a request: "make a lion", "can you draw a dragon for me", "craft a logo for my shop".
  const m = lower.match(GEN_RE);
  if (m) {
    const verb = m[1];
    const rest = m[2].replace(/[?!.]+\s*$/, "").trim();
    if (!hasSubject(rest)) return false; // "can u generate images?" -> just a question about Xyron
    if (/^(draw|paint|sketch|illustrate)$/.test(verb)) return !NOT_A_PICTURE.test(rest) && !CODE_CONTEXT.test(rest);
    // generate / create / make / craft / render / design / produce: the thing being made must be a picture.
    const head = words(rest).slice(0, 6);
    const v = head.findIndex((w) => VISUAL_NOUN.test(w));
    if (v === -1) return PICTURE_PHRASE.test(rest) && !CODE_CONTEXT.test(rest);
    const c = head.findIndex((w) => CODE_NOUN.test(w));
    if (c !== -1 && (c === v + 1 || c < v)) return false; // "image component", "app image"
    return true;
  }

  // 1b) No verb at all, but a picture format is named: "I need as a jpeg image", "give me a png".
  if (FORMAT_RE.test(lower) && FORMAT_ASK.test(lower) && !CODE_CONTEXT.test(lower)) return true;

  // 2) Older loose rule: an action word and a picture word somewhere in the message.
  const actionWords = ["generate", "create", "draw", "make", "produce", "design", "craft"];
  const imageWords = ["image", "picture", "photo", "drawing", "illustration", "artwork", "painting"];
  if (!actionWords.some((a) => lower.includes(a)) || !imageWords.some((i) => lower.includes(i))) return false;
  if (CODE_CONTEXT.test(lower)) return false; // "give me a prompt to generate an image" is a prompt request
  // A bare capability question ("can u generate image") is about Xyron, not a request.
  if (/^(can|could|would|will|do|does)\s+(you|u|xyron)\b/.test(lower)) {
    const after = lower.replace(/^(can|could|would|will|do|does)\s+(you|u|xyron)\s+/, "").replace(/^(generate|create|draw|make|produce|design|craft)\b/, "");
    if (!hasSubject(after)) return false;
  }
  return true;
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




// Visual answers: when a question is about something people want to SEE (wallpapers, fashion,
// nature, animals, places, products...), Xyron adds a photo gallery under its text reply.
//
// How it decides: the model is told (XYRON_IMAGE_PROMPT) to end such replies with a hidden
// `[[images: search words]]` line. The app strips that line from the text and searches for
// those words. If the model forgot it but the person clearly asked for pictures ("show me
// photos of ...", "... wallpapers"), a small rule-based fallback derives the search words.
// Ordinary questions get neither, so they stay text-only.

export const XYRON_IMAGE_PROMPT = `Visual answers: when the person's question is about something they would want to SEE — wallpapers, fashion/outfits, nature, animals, places/landmarks/travel destinations, products, food, architecture, art, "what does X look like" — answer normally in text, then add, as the very last line of your reply and nothing after it, exactly: [[images: concise search words]]
- Search words: 2-6 specific English words (e.g. "red panda climbing tree", "minimalist dark phone wallpaper", "Santorini Greece sunset").
- Only when real photos would genuinely help. For everything else — code, math, writing, advice, explanations, definitions, chit-chat, files, or when the person attached a ZIP — never add it.
- Never mention this line, never say you are showing pictures; the app turns it into a gallery by itself.`;

const TAG_RE = /\[\[\s*images?\s*:\s*([^\]\n]{2,120}?)\s*\]\]/gi;

// -> { text, query } : the reply without the hidden tag, and the search words if it carried one.
export function extractImageTag(reply = "") {
  let query = null;
  const text = String(reply).replace(TAG_RE, (_m, q) => { if (!query) query = q.trim(); return ""; }).replace(/\s+$/, "");
  return { text, query };
}

const ASK_RE = /\b(show|send|give|find|get|fetch|see|display|share)\b.{0,30}\b(pictures?|photos?|images?|pics?|wallpapers?|snaps?)\b|\b(pictures?|photos?|images?|pics?)\s+of\b|\bwallpapers?\b|\bwhat\s+(does|do|did)\b.{1,60}\blooks?\s+like\b|\bhow\s+(does|do)\b.{1,60}\blooks?\b/i;
const NOT_VISUAL_RE = /\b(code|script|function|bug|error|regex|sql|api|algorithm|component|install|npm|python|javascript|java|html|css|compile|debug)\b/i;

// Rule-based fallback: only for a clear "show me pictures / wallpaper / what does X look like".
export function visualQueryFromText(text = "") {
  const t = String(text).replace(/\s+/g, " ").trim();
  if (t.length < 4 || t.length > 200 || t.startsWith("/") || !ASK_RE.test(t) || NOT_VISUAL_RE.test(t)) return null;
  const q = t
    .replace(/^(hey|hi|hello|please|pls|can you|could you|can u|would you|i want|i need|i'd like|let me see|let me)\b[\s,]*/gi, "")
    .replace(/\b(show|send|give|find|get|fetch|display|share|see)\b( me| us)?/gi, "")
    .replace(/\b(some|a few|few|any|the|a|an|me|for me|please|pls|of|about|what|does|do|did|look like|looks like|looks|look|how)\b/gi, " ")
    .replace(/\b(pictures?|photos?|images?|pics?)\b/gi, "")
    .replace(/[?.!,]+/g, " ").replace(/\s+/g, " ").trim();
  if (q.length < 2) return null;
  return /wallpaper/i.test(t) && !/wallpaper/i.test(q) ? `${q} wallpaper` : q.slice(0, 80);
}

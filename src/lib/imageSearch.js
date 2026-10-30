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

const PIC = "(?:pictures?|photos?|images?|pics?|photographs?|snaps?)";
const ASK_RE = new RegExp(
  String.raw`\b(show|send|give|find|get|fetch|see|display|share|bring)\b.{0,30}\b${PIC}\b|\b${PIC}\s+of\b|\bwallpapers?\b|\bwhat\s+(does|do|did)\b.{1,60}\blooks?\s+like\b|\bhow\s+(does|do)\b.{1,60}\blooks?\b` +
  // "elon musk pictures", "his photos", "more pics", "another picture"  (picture word at the end, no verb needed)
  String.raw`|^(?:\S+\s+){0,5}${PIC}[?!.\s]*$`, "i");
// Not a request to SEE pictures: the person's own picture / files, or making one.
const NOT_ASK_RE = /\b(my|your|profile|avatar|upload|uploaded|attach|attached|this|these|generate|create|make|draw|edit|resize|compress|convert|download|delete|remove|name|size|format|file|quality|ratio|background)\b\s*(?:\S+\s+){0,2}?(?:pictures?|photos?|images?|pics?)/i;
const NOT_VISUAL_RE = /\b(code|script|function|bug|error|regex|sql|api|algorithm|component|install|npm|python|javascript|java|html|css|compile|debug)\b/i;

// Words that point back at something said earlier ("his pictures", "more photos of that").
const PRONOUN = /^(?:his|her|hers|their|theirs|its|him|them|it|he|she|they|that|this|these|those|same|one|ones|him\/her)$/i;
// Words that only say "give me different ones": they are not part of the thing to look for.
const MORE_WORDS = /\b(more|another|other|different|new|fresh|next|again|real|actual|proper|better|good|nice|clear|hd|4k)\b/gi;
const MORE_RE = /\b(more|another|other|different|else|again|next|new)\b/i;

const LEAD_RE = /^(?:(?:hey|hi|hello|ok|okay|please|pls|so|yo|bro|abeg)[\s,!.]+)*(?:(?:can|could|would) (?:you|u) )?(?:please )?(?:tell me (?:more )?about|who(?:'s| is| was| are| were)|what(?:'s| is| was| are| were)|where(?:'s| is| was)|show me|give me (?:info|information|details) (?:on|about)|info(?:rmation)? (?:on|about)|describe|research|look up|search(?: for| up)?|find (?:out )?(?:about )?|google|i (?:want|need) to know (?:about)?)\s+/i;

// The thing the conversation was last about: a Wikipedia card, an earlier gallery, or a short
// "Elon Musk" / "who is Elon Musk" message from the person.
function lastSubject(history = []) {
  for (let i = history.length - 2; i >= 0; i--) {
    const m = history[i];
    if (!m || m.local) continue;
    if (m.role === "assistant") {
      if (m.preview?.title) return String(m.preview.title);
      if (m.images?.query) return String(m.images.query).replace(/\s+(wallpaper|UI design)$/i, "");
      continue;
    }
    if (m.role === "user") {
      const raw = String(m.content || "").replace(/[?!.\s]+$/, "").trim();
      if (!raw || raw.length > 80 || raw.startsWith("/")) continue;
      const t = raw.replace(LEAD_RE, "").trim();
      const q = cleanQuery(t) || t;
      if (!q || PRONOUN.test(q) || ASK_RE.test(raw) && !cleanQuery(raw)) continue;
      if (q.split(/\s+/).length <= 6 && q.length >= 2) return q;
    }
  }
  return null;
}

function cleanQuery(t) {
  return String(t)
    .replace(/^(hey|hi|hello|please|pls|ok|okay|so|yo|bro|abeg|can you|could you|can u|would you|i want|i need|i'd like|i asked for|i said|let me see|let me)\b[\s,]*/gi, "")
    .replace(/\b(show|send|give|find|get|fetch|display|share|see|bring)\b( me| us)?/gi, "")
    .replace(/\b(some|a few|few|any|the|a|an|me|for me|please|pls|of|about|what|does|do|did|look like|looks like|looks|look|how|but|buh|and|it|i|asked|for|to|u|you|can)\b/gi, " ")
    .replace(/\b(pictures?|photos?|images?|pics?|photographs?|snaps?)\b/gi, "")
    .replace(MORE_WORDS, " ")
    .replace(/[?.!,]+/g, " ").replace(/\s+/g, " ").trim()
    .split(" ").filter((w) => w && !PRONOUN.test(w)).join(" ");
}

// -> { query, page } | null.  `history` = the chat so far INCLUDING the message being sent, so
// "his pictures" / "more photos" / "another picture" find what they refer to.
export function imageRequestFromText(text = "", history = []) {
  const t = String(text).replace(/\s+/g, " ").trim();
  if (t.length < 4 || t.length > 200 || t.startsWith("/") || !ASK_RE.test(t) || NOT_VISUAL_RE.test(t)) return null;
  if (!/\b(show|send|give|find|get|fetch|see|display|share|bring)\b|\bof\b|wallpaper|look/i.test(t) && NOT_ASK_RE.test(t)) return null;
  let q = cleanQuery(t);
  let page = 1;
  if (q.length < 2) {
    // "his pictures", "more photos", "another picture": reuse what the chat was about.
    q = lastSubject(history) || "";
    if (q.length < 2) return null;
    if (MORE_RE.test(t)) {
      const seen = history.filter((m) => m.role === "assistant" && m.images?.query && m.images.query.toLowerCase().startsWith(q.toLowerCase().slice(0, 20))).length;
      page = Math.min(10, seen + 1);
    }
  }
  // UI subjects (signup page, login screen, dashboard...) -> look for design shots, not random photos.
  const uiSubject = /\b(sign ?up|sign ?in|log ?in|login|register|landing|dashboard|checkout|onboarding|web ?site|webpage|app|screen|page|form)\b/i.test(q) && !/\b(design|ui|ux|screenshot|mockup)\b/i.test(q);
  if (uiSubject) return { query: `${q} UI design`.slice(0, 80), page };
  return { query: /wallpaper/i.test(t) && !/wallpaper/i.test(q) ? `${q} wallpaper` : q.slice(0, 80), page };
}

// Rule-based fallback: only for a clear "show me pictures / wallpaper / what does X look like".
export function visualQueryFromText(text = "", history = []) {
  return imageRequestFromText(text, history)?.query ?? null;
}

// Added to the system prompt when the person clearly asked for pictures: the app shows the photo
// gallery itself, so the model must not claim it can't send images or answer with code instead.
export const XYRON_IMAGES_SHOWN_PROMPT = `The person asked to SEE images. The app shows a photo gallery under your reply by itself. So: never say you can't send, show or find pictures, never tell them to take screenshots, and do NOT answer with HTML/CSS/code or a mockup unless they asked for code. Reply in one or two short lines (what the pictures show). You may offer to generate a custom image or to build a real working version of it.`;


// Cards on: a ChatGPT-style visual guide. Images sit inside the sections they belong to, each with a
// title and caption, followed by real reference links and a short recommendation.
export const XYRON_IMAGE_GUIDE_PROMPT = `The person asked to SEE images. Answer as a short visual guide (the app turns the image blocks into real pictures, so never say you can't send images, never tell them to take screenshots, and never answer with HTML/CSS/code unless they asked for code):
1. One friendly intro sentence (tie it to what you know about them or their project when it is relevant).
2. Two or three numbered "## 1. Section title" headings. Under each heading put ONE image block, exactly like this (valid JSON, no comments):
:::xyron-images
{"layout":"cards","items":[{"title":"Minimal dark","caption":"Pure black, clean inputs, simple button.","query":"dark minimal signup page UI design"},{"title":"Split screen","caption":"Branding on one side, form on the other.","query":"split screen signup page design"}]}
:::
- 2-3 items per block ("layout":"cards" = large pictures in a row; "layout":"list" = small picture beside each caption, good for a second or third section). 6 images in total at most.
- "query" = 3-7 specific English search words for THAT picture (include "UI design" or "screenshot" for app/web screens). "title" 1-3 words, "caption" one short sentence.
3. A final "## Find more real references" section: 3-4 markdown links to search pages you are sure exist, for example [Dribbble - dark signup pages](https://dribbble.com/search/dark-signup-page) or [Behance - signup page design](https://www.behance.net/search/projects?search=signup%20page%20design). Never invent other URLs.
4. A closing line starting with "**My recommendation:**" that gives one concrete suggestion.
Do NOT add the hidden [[images: ...]] line when you use these blocks. Keep every text line short.`;
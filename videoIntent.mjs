// ONE rule for "is this message asking Xyron to MAKE a video?" - shared by the chat page and the server (like imageIntent.mjs).
// Plain JavaScript, no browser or Node APIs.
import { words, FILLER } from "./imageIntent.mjs";

const VIDEO_NOUN = /\b(?:videos?|reels?|promos?|promotional|trailers?|commercials?|slideshows?|animations?|animated)\b/i;
const MAKE_VERB = /\b(?:make|create|generate|produce|build|design|render|compose|craft|turn|convert|edit)\b/i;
// "video player component", "html video tag", "download a youtube video" are code / download questions, not video requests.
const NOT_A_VIDEO = /\b(?:code|script|function|component|html|css|react|python|javascript|node|api|ffmpeg|tag|player|element|plugin|library|downloader?|embed|codec|compress|trim|cut|convert (?:a |the |this )?(?:video|mp4)|youtube (?:video )?link|watch|summari[sz]e (?:a |the |this )?video)\b/i;
const VIDEO_FILLER = new Set(["video", "videos", "promo", "promos", "promotional", "reel", "reels", "short", "shorts", "trailer", "trailers", "commercial", "commercials", "slideshow", "slideshows", "animation", "animations", "animated", "ad", "ads", "advert", "tiktok", "phone", "vertical", "landscape", "mobile", "file", "files", "image", "images", "photo", "photos", "picture", "pictures", "pic", "pics", "this", "these", "that", "those", "using", "use", "with", "from", "about", "into", "out", "give", "get", "i", "want", "need", "like", "can", "could", "would", "will", "you", "u", "xyron", "do", "does", "make", "create", "generate", "produce", "build", "design", "render", "compose", "craft", "turn", "convert", "edit", "is", "are", "be", "able", "to"]);

export function isVideoRequest(text = "", { hasFiles = false } = {}) {
  const lower = String(text).toLowerCase().trim();
  if (!lower) return false;
  if (/^\/video\b/.test(lower)) return true;
  if (lower.startsWith("/") || lower.length > 1500) return false;
  if (!VIDEO_NOUN.test(lower) || !MAKE_VERB.test(lower) || NOT_A_VIDEO.test(lower)) return false;
  // the verb must come before the video word ("make a promo video ..." / "turn this into a video"), within a short distance
  const v = lower.search(MAKE_VERB);
  const n = lower.slice(v).search(VIDEO_NOUN);
  if (n < 0 || n > 70) return false;
  if (hasFiles) return true; // "make a video from these" with attachments is already a complete request
  // no attachments: there must be a subject ("promo video about my shop"), so "can u make videos?" stays a question about Xyron
  return words(lower).some((w) => !FILLER.has(w) && !VIDEO_FILLER.has(w));
}

// Phone-shaped (9:16) unless the person clearly wants widescreen.
export function videoAspect(text = "") {
  const t = String(text).toLowerCase();
  if (/\b(?:landscape|widescreen|wide|16\s*:\s*9|youtube|desktop|laptop|tv)\b/.test(t) && !/\b(?:vertical|9\s*:\s*16|tiktok|reels?|shorts?|status)\b/.test(t)) return "wide";
  return "vertical";
}

// Shared by the chat page (src/lib/settings.js) and the server router (router.mjs), so there is ONE rule for
// "is this message asking Xryon to make a picture?". Plain JavaScript, no browser or Node APIs, so both can import it.

// ---- "Make / generate / draw ..." -> really make the picture --------------------------------
// A message that ASKS FOR a picture is executed; a message that only asks whether Xyron CAN
// ("can u generate images?") is answered in words. The difference is whether a subject is given.
export const VISUAL_NOUN = /^(images?|pictures?|photos?|photographs?|pics?|illustrations?|drawings?|artworks?|art|paintings?|portraits?|wallpapers?|logos?|posters?|banners?|icons?|avatars?|stickers?|memes?|thumbnails?|flyers?|cartoons?|anime|sketch(?:es)?|renders?|mockups?|selfies?|headshots?|tattoos?|pfp|dp|backgrounds?|landscapes?|scenes?|characters?|mascots?|covers?|birthday cards?|cards?)$/i;
const CODE_NOUN = /^(code|script|function|component|prompt|prompts|app|apps|website|websites|webpage|api|generator|gallery|upload|uploader|viewer|tool|class|module|feature|library|bot|program|software|tutorial|essay|story|poem|report|email|letter|summary|list|plan|table|chart|spreadsheet|song|lyrics|video|playlist|document|quiz|game|schedule|resume|cv|caption|slogan|joke|recipe|outline)$/i;
export const FILLER = new Set(["a", "an", "the", "some", "any", "me", "us", "my", "for", "please", "pls", "plz", "now", "too", "also", "of", "ai", "generated", "and", "or", "to", "new", "cool", "nice", "beautiful", "image", "images", "picture", "pictures", "photo", "photos", "pic", "pics", "art", "artwork", "drawing", "drawings", "illustration", "illustrations", "something", "anything", "stuff", "it", "them", "here", "again", "just", "one", "more", "few"]);
export const GEN_RE = /^(?:(?:hey|hi|hello|yo|bro|abeg|ok|okay|so|now|then|xyron)[\s,!.]+)*(?:(?:please|pls|plz)[\s,]+)?(?:(?:can|could|would|will)\s+(?:you|u|xyron)\s+(?:please\s+|pls\s+|just\s+)?|i\s+(?:want|need|would like|wanna)\s+(?:you\s+to\s+)?|(?:go ahead and|just)\s+)?(?:(?:please|pls|plz)\s+)?(generate|create|make|draw|craft|paint|sketch|render|illustrate|design|produce)\b\s*([\s\S]*)$/i;
const NOT_A_PICTURE = /^(?:an?\s+|the\s+)?(?:conclusions?|attention|blood|breath|lessons?|comparisons?|parallels?|inspiration|up|from|on|out|in|lots|straws?|salary|money)\b/i;
export const CODE_CONTEXT = /\b(prompt|code|script|function|component|api|python|javascript|react|html|css|sql|how (?:do|to|can)|tutorial|midjourney|dall-?e|stable diffusion)\b/i;

// "...on the image", "as a jpeg", "like a trademark" -> the person wants a picture even though the
// picture word is not near the start of the sentence ("design 'ASTRA BUG' on the image like a trademark").
const PICTURE_PHRASE = /\b(?:on|as|into|onto|in)\s+(?:an?\s+|the\s+)?(?:image|picture|photo|jpe?g|png|webp)\b|\blike\s+an?\s+(?:trademark|logo|badge|emblem|poster|brand mark)\b/i;
// "I need as a jpeg image", "give me a png", "send it as an image" -> asking for a picture file, no verb needed.
const FORMAT_RE = /\b(?:jpe?g|png|webp)\b/i;
const FORMAT_ASK = /^(?:(?:hey|hi|hello|yo|bro|abeg|ok|okay|so|now|then|xyron)[\s,!.]+)*(?:(?:please|pls|plz)[\s,]+)?(?:i\s+(?:need|want|would like|wanna)|(?:can|could|would|will)\s+(?:you|u)\s+(?:please\s+)?(?:give|send|get|show)\s+me|(?:give|send|get|show)\s+me|as\s+an?|make\s+it\s+(?:as\s+)?an?|i\s+said)\b/i;

export const words = (t) => String(t).toLowerCase().replace(/[^a-z0-9'+\s-]/g, " ").split(/\s+/).filter(Boolean);
export const hasSubject = (rest) => words(rest).some((w) => !FILLER.has(w));

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

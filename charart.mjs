// ChatArt AI Vision: reads images for Xryon.
//   - no words from the user  -> answers the question in the image right away, or describes it
//   - words / a caption       -> does exactly what the user asked about the image
const CHARART_API_URL = process.env.CHARART_API_URL || "https://prexzyapis.com/ai/charart";
const CHARART_MODEL = process.env.CHARART_MODEL || "gpt-5.5";

export function buildVisionPrompt(userText = "") {
  const ask = String(userText || "").trim();
  const rules = `You are looking at an image the user just sent.

How to respond:
1. If the image contains a question or a problem (maths, science, homework, an exam or quiz question, multiple choice, a puzzle, code with an error), answer it immediately. Show the key working step by step, then state the final answer clearly.
2. If the image is a photo, screenshot, design, document or anything else, describe it clearly: the main objects, people if visible, the place or setting, colors and style, and any text written on it.
3. Reply in the same language the user writes in. Be direct. Do not greet and do not ask what the user wants when the answer is already visible in the image.`;
  if (!ask) return rules;
  return `${rules}

The user also wrote this message with the image. Follow it exactly. It overrides the default behaviour above:
"""
${ask}
"""`;
}

// The API's reply shape can vary, so look in the common places.
export function extractText(data) {
  if (typeof data === "string") return data.trim();
  if (!data || typeof data !== "object") return "";
  for (const c of [data.result, data.response, data.message, data.answer, data.text, data.reply, data.output, data.data]) {
    if (typeof c === "string" && c.trim()) return c.trim();
    if (c && typeof c === "object") { const inner = extractText(c); if (inner) return inner; }
  }
  return "";
}

// Reads one image. `imageUrl` must be a public link the ChatArt server can open.
export async function charartReadImage(imageUrl, userText = "", { timeoutMs = 90000 } = {}) {
  const qs = new URLSearchParams({
    prompt: buildVisionPrompt(userText),
    mode: "vision",
    model: CHARART_MODEL,
    image: imageUrl,
    imageName: "image.jpg",
  });
  let res, raw, json = null;
  try {
    res = await fetch(`${CHARART_API_URL}?${qs}`, { signal: AbortSignal.timeout(timeoutMs) });
    raw = await res.text();
    try { json = JSON.parse(raw); } catch { /* plain-text reply */ }
  } catch (e) {
    throw new Error(`Could not reach ChatArt: ${e.message}`);
  }
  if (!res.ok) throw new Error(json?.error || json?.message || `ChatArt error (${res.status})`);
  if (json && json.status === false) throw new Error(json.error || json.message || "ChatArt reported an error.");
  const text = extractText(json ?? raw);
  if (!text) throw new Error("ChatArt returned an empty response.");
  return text;
}

// ---------------------------------------------------------------------------------------------
// ChatArt CHAT: one endpoint, three modes (v6, v5, vision), with optional image.
//   GET https://prexzyapis.com/ai/charart?prompt=&mode=&model=&image=&imageName=
// The API is stateless (a plain GET), so "remembering" an image is done on OUR side: the server keeps the
// last image of each conversation plus short notes about it, and sends both again with every follow-up.
// Mode / model values can be changed without touching code (CHARART_MODE_*, CHARART_MODEL_*).
// ---------------------------------------------------------------------------------------------
export const CHARART_MODES = {
  v6: { mode: process.env.CHARART_MODE_V6 || "v6", model: process.env.CHARART_MODEL_V6 || CHARART_MODEL },
  v5: { mode: process.env.CHARART_MODE_V5 || "v5", model: process.env.CHARART_MODEL_V5 || "gpt-5" },
  vision: { mode: process.env.CHARART_MODE_VISION || "vision", model: CHARART_MODEL },
};
export const isCharartMode = (m) => Object.prototype.hasOwnProperty.call(CHARART_MODES, m);

// If the chosen mode is down, try the others. Image modes keep "vision" in the chain so a picture is still read.
function modeChain(mode, hasImage) {
  const first = isCharartMode(mode) ? mode : "v6";
  const rest = ["v6", "v5", ...(hasImage ? ["vision"] : [])].filter((m) => m !== first);
  return [first, ...rest];
}

const PROMPT_LIMIT = 6500; // GET URL: keep it well under typical 8 KB limits once encoded

// Builds one flat prompt from the chat history. Oldest turns are dropped first when it gets too long.
export function buildChatPrompt({ history = [], system = "", imageNotes = "", newImage = false, userText = "" }) {
  const head = [
    "You are Xryon, a friendly, accurate AI assistant. Reply in the same language the user writes in.",
    system && String(system).trim(),
    imageNotes && !newImage
      ? `The user shared an image earlier in this chat and it is still attached. Notes about that image from before:\n${imageNotes}\nWhen the user talks about "it", "this", "the picture" or asks a follow-up, they mean this image. Answer about the image; do not say you cannot see it.`
      : "",
    newImage ? buildVisionPrompt(userText) : "",
  ].filter(Boolean).join("\n\n");
  const tail = "Reply to the latest user message now.";
  const turns = history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && String(m.content || "").trim())
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${String(m.content).trim().slice(0, 1800)}`);
  let kept = turns.slice(-14);
  const size = () => head.length + tail.length + kept.join("\n\n").length + 40;
  while (kept.length > 1 && size() > PROMPT_LIMIT) kept = kept.slice(1);
  return `${head.slice(0, 2600)}\n\nConversation so far:\n${kept.join("\n\n")}\n\n${tail}`.slice(-PROMPT_LIMIT - 400);
}

async function charartCall(modeName, prompt, imageUrl, timeoutMs) {
  const cfg = CHARART_MODES[modeName];
  const qs = new URLSearchParams({ prompt, mode: cfg.mode, model: cfg.model });
  if (imageUrl) { qs.set("image", imageUrl); qs.set("imageName", "image.jpg"); }
  let res, raw, json = null;
  try {
    res = await fetch(`${CHARART_API_URL}?${qs}`, { signal: AbortSignal.timeout(timeoutMs) });
    raw = await res.text();
    try { json = JSON.parse(raw); } catch { /* plain-text reply */ }
  } catch (e) {
    throw new Error(`Could not reach ChatArt (${modeName}): ${e.message}`);
  }
  if (!res.ok) throw new Error(json?.error || json?.message || `ChatArt ${modeName} error (${res.status})`);
  if (json && (json.status === false || json.success === false)) throw new Error(json.error || json.message || `ChatArt ${modeName} reported an error.`);
  const text = extractText(json ?? raw);
  if (!text) throw new Error(`ChatArt ${modeName} returned an empty response.`);
  return text;
}

// Returns { reply, modeUsed }. `mode` is v6 | v5 | vision. `imageUrl` must be a public link ChatArt can open.
export async function charartChat({ mode = "v6", prompt, imageUrl = "", timeoutMs = 90000 }) {
  const errors = [];
  for (const m of modeChain(mode, Boolean(imageUrl))) {
    try { return { reply: await charartCall(m, prompt, imageUrl, timeoutMs), modeUsed: m }; }
    catch (e) { errors.push(e.message); console.error(`ChatArt ${m} failed:`, e.message); }
  }
  throw new Error(errors.join(" | "));
}

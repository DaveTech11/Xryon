// ChatGPT-style rich answers: instead of plain markdown only, Xyron can ask the model to emit
// small structured blocks that the app turns into UI:
//
//   :::xyron-list   ...JSON...  :::   -> option cards (thumbnail, badge, bullets, link chips, note)
//   :::xyron-picks  ...JSON...  :::   -> name picks (logo thumbnail, name, vibe line, Copy button)
//   :::xyron-ask    ...JSON...  :::   -> a tappable question form (radios / checkboxes + submit button)
//   [Name](https://url "pill")        -> a small source pill inside normal text
//
// The blocks stay inside the saved message text, so they survive reloads and history. If the JSON
// is broken the block is simply shown as normal text, so a bad reply never crashes the chat.

export const XYRON_RICH_PROMPT = `Rich answers (use sparingly, only when it genuinely helps; never for code, math, short answers or chit-chat):

1) Option cards - when you recommend 2-6 specific products, tools, places, apps or services that people would want to look at, write one short intro sentence, then a block exactly like this (valid JSON, no comments):
:::xyron-list
{"items":[{"title":"Cloudflare Workers AI","badge":"Best free quota","image":"cloudflare logo","bullets":["Short fact one.","Short fact two."],"links":[{"label":"Docs","url":"https://developers.cloudflare.com/workers-ai/"}],"note":"Limitation: one honest drawback."}]}
:::
- "image" is 2-5 English search words for a photo of the item (omit it if a photo makes no sense). badge, bullets (max 4, one line each), links (max 3, real https URLs you are sure of) and note are optional. Never invent URLs.
- When you use this block, do NOT add the hidden [[images: ...]] line.

2) Question form - when you truly need 1-3 details before you can give the right answer, ask them as a form instead of a text list:
:::xyron-ask
{"title":"To give you the right code, tell me:","questions":[{"id":"stack","question":"What is your app built with?","options":["Node.js + React","Next.js","Python / FastAPI","Something else"]},{"id":"goal","question":"What do you need most?","options":["Image generation","Editing uploaded photos"],"multi":false}],"submit":"Get the code"}
:::
- 2-4 short options per question, max 3 questions, "multi":true allows several picks. Put one short sentence before the block and write nothing after it - the answer arrives as the person's next message. Do not ask when the answer is already in the conversation.

3) Sources - when you rely on a website, you may cite it inline as a pill: [Cloudflare](https://developers.cloudflare.com "pill"). Only real URLs; max 3 per answer.

4) Document cards - when the person asks you to WRITE something they will copy, reuse or send, put the finished text inside a document card instead of a code block or loose paragraphs. The first line is exactly :::xyron-doc, a type, a pipe, a short title, and the last line is :::
- type "prompt": a prompt for another AI or coding agent (e.g. "give me a prompt to upgrade my app"). Shows a card with Copy and Expand.
- type "report": anything meant to be sent to someone - a report, email, letter, proposal, summary for a boss, application, complaint, message draft. Shows the same card plus a Gmail button that opens a ready email with this text. For an email you may add a second pipe and the subject line.
Example:
:::xyron-doc report | Weekly Sales Report | Weekly sales report - 12 Oct
Hi team,

Here is this week's summary...
:::
- Write the full finished text inside, in Markdown, ready to use. Put at most two short sentences outside the card (before it); never repeat the text outside the card.
- Do NOT use a card for code, explanations, answers to questions, short one-line messages, or when they only want advice about writing. Never put a code file (path=...) inside a card.
- This card replaces the "copyable fenced block" rule for prompts and reports only.`;

const BLOCK_RE = /:::xyron-(list|ask|images|picks)[ \t]*\n([\s\S]*?)\n[ \t]*:::/g;

const str = (v, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const httpsUrl = (u) => { try { const x = new URL(String(u)); return x.protocol === "https:" ? x.href : ""; } catch { return ""; } };

function cleanList(raw) {
  const items = (Array.isArray(raw?.items) ? raw.items : []).slice(0, 8).map((it) => ({
    title: str(it?.title, 80),
    badge: str(it?.badge, 40),
    image: str(it?.image, 80),
    bullets: (Array.isArray(it?.bullets) ? it.bullets : []).map((b) => str(b, 220)).filter(Boolean).slice(0, 4),
    links: (Array.isArray(it?.links) ? it.links : []).map((l) => ({ label: str(l?.label, 24), url: httpsUrl(l?.url) })).filter((l) => l.label && l.url).slice(0, 3),
    note: str(it?.note, 220),
  })).filter((it) => it.title);
  return items.length ? { items } : null;
}

function cleanAsk(raw) {
  const questions = (Array.isArray(raw?.questions) ? raw.questions : []).slice(0, 4).map((q, i) => {
    const text = q?.type === "text";
    return {
      id: str(q?.id, 30) || `q${i + 1}`,
      question: str(q?.question, 140),
      type: text ? "text" : "choice",
      placeholder: text ? str(q?.placeholder, 80) : "",
      optional: text && q?.optional === true,
      options: text ? [] : (Array.isArray(q?.options) ? q.options : []).map((o) => str(o, 80)).filter(Boolean).slice(0, 5),
      multi: !text && q?.multi === true,
    };
  }).filter((q) => q.question && (q.type === "text" || q.options.length >= 2));
  return questions.length ? { title: str(raw?.title, 140), prefix: str(raw?.prefix, 120), questions, submit: str(raw?.submit, 40) || "Continue" } : null;
}

function cleanPicks(raw) {
  const items = (Array.isArray(raw?.items) ? raw.items : []).slice(0, 6).map((it) => ({
    name: str(it?.name || it?.title, 80),
    tagline: str(it?.tagline || it?.desc || it?.description, 140),
    logo: str(it?.logo || it?.image, 80),
  })).filter((it) => it.name);
  return items.length ? { items } : null;
}

function cleanImages(raw) {
  const items = (Array.isArray(raw?.items) ? raw.items : []).slice(0, 6).map((it) => ({
    title: str(it?.title, 80),
    caption: str(it?.caption, 200),
    query: str(it?.query, 90),
  })).filter((it) => it.query && (it.title || it.caption));
  return items.length ? { items, layout: raw?.layout === "list" ? "list" : "cards" } : null;
}

// text -> [{ type: "text", value } | { type: "list" | "ask" | "images" | "picks", data }]
export function splitRich(text = "") {
  const parts = [];
  let last = 0;
  let m;
  BLOCK_RE.lastIndex = 0;
  while ((m = BLOCK_RE.exec(text))) {
    let data = null;
    try { const json = JSON.parse(m[2]); data = m[1] === "list" ? cleanList(json) : m[1] === "images" ? cleanImages(json) : m[1] === "picks" ? cleanPicks(json) : cleanAsk(json); } catch { data = null; }
    if (!data) continue; // broken block: leave it inside the surrounding text
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    parts.push({ type: m[1], data });
    last = BLOCK_RE.lastIndex;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts.length ? parts : [{ type: "text", value: text }];
}

export const hasRichList = (text = "") => /:::xyron-list/.test(text);
export const hasRichPicks = (text = "") => /:::xyron-picks/.test(text);
export const hasRichImages = (text = "") => /:::xyron-images/.test(text);

// The person's answers, turned into the message that gets sent back to the model.
export function formatAnswers(ask, answers) {
  const lines = ask.questions
    .map((q) => `${q.question} ${(answers[q.id] || []).map((a) => String(a).trim()).filter(Boolean).join(", ")}`.trim())
    .filter((l, i) => (answers[ask.questions[i].id] || []).some((a) => String(a).trim()));
  return `${ask.prefix ? `${ask.prefix}\n` : ""}${lines.join("\n")}`;
}


// ---- Document cards (:::xyron-doc prompt|report | Title | optional subject) ---------------------
// A prompt or a report/email the person will copy or send. They are cut out of the message BEFORE
// code fences are parsed, so a prompt that itself contains ``` blocks stays in one piece.
const DOC_RE = /(?:^|\n)[ \t]*:::xyron-doc[ \t]+(prompt|report|email)[ \t]*\|[ \t]*([^\n|]{1,120}?)[ \t]*(?:\|[ \t]*([^\n]{0,150}?))?[ \t]*\n([\s\S]*?)(?:\n[ \t]*:::[ \t]*(?=\n|$)|\s*(?![\s\S]))/g;

// text -> [{ type: "text", value } | { type: "doc", data: { kind, title, subject, body } }]
export function splitDocs(text = "") {
  const parts = [];
  let last = 0;
  let m;
  DOC_RE.lastIndex = 0;
  while ((m = DOC_RE.exec(text))) {
    const body = String(m[4] || "").trim();
    if (!body) continue;
    const start = m.index + (m[0].startsWith("\n") ? 1 : 0);
    if (start > last) parts.push({ type: "text", value: text.slice(last, start) });
    const kind = m[1] === "prompt" ? "prompt" : "report"; // "email" is a report
    const title = str(m[2], 120) || (kind === "prompt" ? "Prompt" : "Report");
    parts.push({ type: "doc", data: { kind, title, subject: str(m[3], 150) || title, body } });
    last = DOC_RE.lastIndex;
  }
  if (!parts.length) return [{ type: "text", value: text }];
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

export const hasRichDoc = (text = "") => /:::xyron-doc/.test(text);

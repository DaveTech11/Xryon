// Free fallback provider (api-rebix gptlogic) used by server.mjs when the
// premium/primary providers are unavailable or a free user is over quota.
//
// Endpoint shape:  GET /api/gptlogic?q=<user text>&prompt=<system prompt>
// It is a GET-only API, so everything travels in the URL. Long URLs get
// rejected (414 / truncated) by the edge, so buildGptLogicUrl() shrinks the
// optional extras first and the oldest context next, and never the system
// prompt below or the user's latest message.

export const GPTLOGIC_URL = process.env.GPTLOGIC_API_URL || 'https://api-rebix.vercel.app/api/gptlogic';

// All the free api-rebix chat endpoints share one shape: GET <base>/<name>?q=...
// gptlogic additionally takes a separate `prompt` (system prompt); the others only
// take `q`, so for those the system prompt is folded into q.
export const REBIX_BASE = (process.env.REBIX_API_BASE || 'https://api-rebix.vercel.app/api').replace(/\/+$/, '');
export const FREE_ENDPOINTS = ['gptlogic', 'claude-haiku', 'claude-session', 'deepseek-v3'];
export function endpointUrl(name) {
  if (name === 'gptlogic') return GPTLOGIC_URL;
  if (name === 'deepseek-v3' && process.env.DEEPSEEK_API_URL) return process.env.DEEPSEEK_API_URL;
  const envKey = `REBIX_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_URL`;
  return process.env[envKey] || `${REBIX_BASE}/${name}`;
}

// Keep the whole request URL comfortably below typical 8 KB edge limits.
const MAX_URL_LENGTH = 7000;

export const XYRON_FALLBACK_PROMPT = `You are Xyron AI, a highly capable AI assistant.

RESPONSE STYLE:
- Understand the user's intent before answering.
- Give the answer directly first.
- Organize complex answers with clear Markdown headings.
- Use numbered steps for procedures.
- Use bullet points for lists.
- Use tables when comparing structured information.
- Use fenced code blocks with the correct language for code.
- Use short paragraphs with plenty of spacing.
- Use bold text to highlight important information.
- Use examples when they make an explanation easier.
- Avoid unnecessary repetition.
- Do not over-explain simple questions.
- For technical questions, provide practical, ready-to-use solutions.
- Preserve important details from the user's request.
- If something is uncertain, say so instead of inventing information.

MATCH THE FORMAT TO THE QUESTION:
- Simple questions get a short, plain answer with no headings, tables or extra sections. Example: "What is 5 + 5?" -> "10".
- Only use headings, steps, tables and code blocks when the question is complex enough to benefit from them, such as "How do I build a Telegram bot?".
- Never force the same layout on every reply.

CODE:
- Always use a fenced code block.
- Specify the language when known.
- Make code complete and runnable when practical.
- Explain where the code belongs.
- Explain dependencies and setup commands when necessary.

TONE:
- Natural, intelligent, friendly and confident.
- Adapt the amount of detail to the user's question.
- Don't sound robotic.`;

// The endpoint only takes one `q`, so earlier turns are folded into it as a
// short transcript. A single-message chat is sent as-is.
function buildQuery(messages) {
  const msgs = (Array.isArray(messages) ? messages : []).filter((m) => (m?.content || '').trim());
  if (!msgs.length) return '';
  const last = String(msgs[msgs.length - 1].content);
  const history = msgs.slice(-7, -1);
  if (!history.length) return last;
  const transcript = history
    .map((m) => `${m.role === 'assistant' ? 'Xyron' : 'User'}: ${String(m.content).slice(0, 600)}`)
    .join('\n');
  return `Conversation so far:\n${transcript}\n\nLatest message from the user (answer this one):\n${last}`;
}

// Returns a URL guaranteed to be <= MAX_URL_LENGTH (unless the base prompt
// alone exceeds it, which it doesn't). `system` is the app's own persona /
// image-context text; it is appended to the base prompt when it fits.
export function buildGptLogicUrl(messages, system = '') {
  let q = buildQuery(messages);
  let extra = String(system || '').trim();
  const make = () => {
    const prompt = extra ? `${XYRON_FALLBACK_PROMPT}\n\nADDITIONAL CONTEXT:\n${extra}` : XYRON_FALLBACK_PROMPT;
    return `${GPTLOGIC_URL}?q=${encodeURIComponent(q)}&prompt=${encodeURIComponent(prompt)}`;
  };
  let url = make();
  while (url.length > MAX_URL_LENGTH && extra.length) {
    extra = extra.length > 200 ? extra.slice(0, Math.floor(extra.length / 2)) : '';
    url = make();
  }
  // Still too long: keep the END of the query, which holds the latest message.
  while (url.length > MAX_URL_LENGTH && q.length > 200) {
    q = q.slice(Math.floor(q.length * 0.2));
    url = make();
  }
  return url;
}

// Pulls the reply text out of whatever shape the proxy answered with: a JSON
// object with one of the usual fields, or plain text.
export function extractReplyText(parsed, raw = '') {
  if (parsed && typeof parsed === 'object') {
    // Some proxies answer 200 with {status:false, message:"..."} on failure.
    if (parsed.status === false) return '';
    const candidates = [
      parsed.response, parsed.reply, parsed.text, parsed.answer, parsed.result,
      parsed.output, parsed.content, parsed.data, parsed.message,
      parsed.choices?.[0]?.message?.content, parsed.choices?.[0]?.text,
    ];
    const hit = candidates.find((c) => typeof c === 'string' && c.trim());
    return hit ? hit.trim() : '';
  }
  if (typeof parsed === 'string' && parsed.trim()) return parsed.trim();
  // Not JSON at all. Accept plain text, but never an HTML error page.
  const body = String(raw || '').trim();
  return body && !/^\s*<(!doctype|html)/i.test(body) ? body : '';
}

// Combines the caller's abort signal (set when another provider already won the
// race) with a per-provider timeout, so a slow endpoint is cut off instead of
// making the whole reply wait.
function withTimeout(ms, outer) {
  const t = AbortSignal.timeout(ms);
  return outer && typeof AbortSignal.any === 'function' ? AbortSignal.any([t, outer]) : t;
}

// URL for the endpoints that only understand `q`: the system prompt and the
// conversation are both folded into it, shrinking extras first, then oldest context.
export function buildPlainUrl(endpoint, messages, system = '') {
  const base = endpointUrl(endpoint);
  let q = buildQuery(messages);
  let extra = String(system || '').trim();
  const make = () => {
    const sys = extra ? `${XYRON_FALLBACK_PROMPT}\n\nADDITIONAL CONTEXT:\n${extra}` : XYRON_FALLBACK_PROMPT;
    return `${base}?q=${encodeURIComponent(`${sys}\n\n---\n${q}`)}`;
  };
  let url = make();
  while (url.length > MAX_URL_LENGTH && extra.length) {
    extra = extra.length > 200 ? extra.slice(0, Math.floor(extra.length / 2)) : '';
    url = make();
  }
  while (url.length > MAX_URL_LENGTH && q.length > 200) {
    q = q.slice(Math.floor(q.length * 0.2));
    url = make();
  }
  return url;
}

// Calls one free endpoint by name. Throws with a diagnosable message on any
// failure (HTTP error, timeout, empty/HTML body) so the caller can switch to the
// next provider. `timeoutMs` is how long this endpoint may take before we give up.
export async function callRebixModel(endpoint, messages, system = '', { timeoutMs = 25000, signal, fetchImpl = fetch } = {}) {
  const url = endpoint === 'gptlogic' ? buildGptLogicUrl(messages, system) : buildPlainUrl(endpoint, messages, system);
  let r, raw;
  try {
    r = await fetchImpl(url, { signal: withTimeout(timeoutMs, signal) });
    raw = await r.text();
  } catch (e) {
    throw Error(e?.name === 'TimeoutError' ? `${endpoint} timed out after ${Math.round(timeoutMs / 1000)}s` : `${endpoint} unreachable: ${e.message}`);
  }
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { /* plain-text body */ }
  if (!r.ok) {
    throw Error(parsed?.error || parsed?.message || `${endpoint} error (${r.status}): ${raw.slice(0, 200)}`);
  }
  const text = extractReplyText(parsed, raw);
  if (!text) {
    const detail = parsed && (parsed.error || parsed.message);
    throw Error(detail ? `${endpoint}: ${detail}` : `${endpoint} returned no usable text. Raw: ${raw.slice(0, 300)}`);
  }
  return text;
}

// Kept for compatibility with older callers.
export function callGptLogic(messages, system = '', fetchImpl = fetch, opts = {}) {
  return callRebixModel('gptlogic', messages, system, { timeoutMs: 45000, ...opts, fetchImpl });
}

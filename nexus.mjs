// Nexus AI provider (https://nexus-labs-vvrb.onrender.com/chat).
//
// The key is read from the server environment ONLY (NEXUS_API_KEY) - never put it in code or in a
// VITE_* variable, because anything in the frontend is public. Set it in Render -> Environment.
//
// The request is sent as JSON with the key in the "X-API-Key" header and the prompt in "message",
// which is the format the Nexus endpoint accepts (tested with curl).
// Set NEXUS_AUTH_HEADER / NEXUS_PROMPT_FIELD in the environment only if Nexus changes.
// The reply is read from whichever of the usual fields it comes back in.

export const NEXUS_API_URL = process.env.NEXUS_API_URL || 'https://nexus-labs-vvrb.onrender.com/chat';
export const nexusConfigured = () => Boolean(process.env.NEXUS_API_KEY);

function pickText(j) {
  if (!j) return '';
  if (typeof j === 'string') return j;
  const direct = j.output ?? j.reply ?? j.response ?? j.text ?? j.answer ?? j.content ?? j.result ?? j.message;
  if (typeof direct === 'string' && direct.trim()) return direct;
  if (direct && typeof direct === 'object') {
    const inner = pickText(direct);
    if (inner) return inner;
  }
  const choice = j.choices?.[0];
  const fromChoice = choice?.message?.content ?? choice?.text;
  if (typeof fromChoice === 'string' && fromChoice.trim()) return fromChoice;
  if (j.data) return pickText(j.data);
  return '';
}

// prompt: one flat string (system instructions + conversation). Throws on any failure so the caller can fall back.
export async function callNexus(prompt, { signal, timeoutMs } = {}) {
  const key = (process.env.NEXUS_API_KEY || '').trim().replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '');
  if (!key) throw Error('Nexus AI key is not set (NEXUS_API_KEY).');
  const limit = AbortSignal.timeout(timeoutMs || Number(process.env.NEXUS_TIMEOUT_MS) || 45000);
  const headerName = process.env.NEXUS_AUTH_HEADER || 'X-API-Key';
  const headers = { 'Content-Type': 'application/json' };
  headers[headerName] = headerName.toLowerCase() === 'authorization' ? `Bearer ${key}` : key;
  const field = process.env.NEXUS_PROMPT_FIELD;
  const body = { [field || 'message']: prompt };
  const r = await fetch(NEXUS_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: signal && AbortSignal.any ? AbortSignal.any([limit, signal]) : limit,
  });
  const raw = await r.text();
  let j = null;
  try { j = JSON.parse(raw); } catch { /* plain text reply */ }
  if (!r.ok) throw Error(`Nexus AI error (${r.status}): ${(j?.error?.message || j?.error || j?.message || raw).toString().slice(0, 200)}`);
  const text = (j ? pickText(j) : raw).trim();
  if (!text) throw Error(`Nexus AI returned an empty response. Raw: ${raw.slice(0, 200)}`);
  return text;
}

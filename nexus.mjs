// Nexus AI provider (https://nexus-labs.myng.net/chat).
//
// The key is read from the server environment ONLY (NEXUS_API_KEY) - never put it in code or in a
// VITE_* variable, because anything in the frontend is public. Set it in Render -> Environment.
//
// The request is sent as JSON with the key in the "X-API-Key" header and the prompt in "message",
// which is the format the Nexus endpoint accepts (tested with curl).
// Set NEXUS_AUTH_HEADER / NEXUS_PROMPT_FIELD in the environment only if Nexus changes.
// The reply is read from whichever of the usual fields it comes back in.

export const NEXUS_API_URL = process.env.NEXUS_API_URL || 'https://nexus-labs.myng.net/chat';
export const nexusConfigured = () => Boolean(cleanKey(process.env.NEXUS_API_KEY));

let workingStyle = '';

// Removes the usual copy-paste mistakes from the key typed into Render: quotes, "Bearer ", "X-API-Key: ",
// "NEXUS_API_KEY=" in front, and spaces or line breaks inside.
function cleanKey(raw) {
  const quotes = (v) => v.replace(/^["'`]+|["'`]+$/g, '').trim();
  let k = quotes(String(raw || '').trim());
  k = k.replace(/^(?:export\s+)?NEXUS_API_KEY\s*=\s*/i, '');
  k = quotes(k).replace(/^(?:x-api-key|authorization)\s*:\s*/i, '');
  k = quotes(k).replace(/^Bearer\s+/i, '').replace(/\s+/g, '');
  return k;
}
// Safe description for logs: never prints the key itself.
function describeKey(k) { return k.length > 8 ? `${k.length} chars, starts "${k.slice(0, 3)}", ends "${k.slice(-3)}"` : `${k.length} chars - looks too short`; }

// Printed once at start-up so the Render log shows exactly what the server will use.
export function logNexusConfig() {
  const k = cleanKey(process.env.NEXUS_API_KEY);
  console.log(`[nexus] url=${NEXUS_API_URL}${process.env.NEXUS_API_URL ? ' (from NEXUS_API_URL env - delete that variable in Render to use the built-in default)' : ' (built-in default)'} key=${k ? describeKey(k) : 'NOT SET'} header=${process.env.NEXUS_AUTH_HEADER || 'X-API-Key (auto-tries Bearer if rejected)'}`);
}

// Builds an error that says what really went wrong: the message carries the address, the auth styles tried, the key
// shape and a plain-English hint; err.detail holds the raw server reply and headers for the full log block.
function nexusError(e, { status, tried = [], key = '', raw = '', headers } = {}) {
  const code = (e?.name === 'TimeoutError' || e?.code === 23) ? 'TIMEOUT' : (e?.name === 'AbortError' || e?.code === 20) ? 'ABORTED' : (e?.cause?.code || e?.code || '');
  let hint = '';
  if (status === 401 || status === 403) hint = `Nexus rejected the key. Check NEXUS_API_KEY in Render (no quotes/spaces, key for THIS endpoint) and delete NEXUS_API_URL if it points to an old address.`;
  else if (status === 404) hint = 'Address not found: NEXUS_API_URL is wrong (it should be https://nexus-labs.myng.net/chat).';
  else if (status === 429) hint = 'Nexus rate limit or quota reached for this key.';
  else if (status >= 500) hint = 'Nexus server itself is failing or waking up; try again shortly.';
  else if (code === 'ENOTFOUND') hint = 'Address does not resolve: check NEXUS_API_URL for typos.';
  else if (code === 'ECONNREFUSED' || code === 'ECONNRESET') hint = 'Could not connect to the Nexus server (it may be down).';
  else if (code === 'TIMEOUT') hint = 'Nexus did not answer in time (NEXUS_TIMEOUT_MS / NEXUS_ROUTE_TIMEOUT_MS).';
  else if (code === 'ABORTED') hint = 'The request was cancelled before Nexus answered.';
  const err = Error(`${e.message}${code ? ` [${code}]` : ''} | url=${NEXUS_API_URL} | auth tried: ${tried.join(', ') || 'none'} | key ${describeKey(key)}${hint ? ` | HINT: ${hint}` : ''}`);
  const keep = ['content-type', 'www-authenticate', 'server', 'x-request-id', 'retry-after', 'cf-ray'];
  err.detail = { status: status || null, code: code || null, url: NEXUS_API_URL, authTried: tried, key: describeKey(key), hint,
    reply: String(raw || '').slice(0, 500), headers: headers ? Object.fromEntries(keep.filter((h) => headers.get(h)).map((h) => [h, headers.get(h)])) : {} };
  return err;
}

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

// Text carried by one streamed chunk (several common shapes), '' when the chunk has none.
function pickDelta(j) {
  if (!j || typeof j !== 'object') return typeof j === 'string' ? j : '';
  const c = j.choices?.[0];
  const d = c?.delta?.content ?? j.delta ?? j.token ?? j.chunk ?? j.text ?? j.content ?? j.reply ?? j.output ?? j.response;
  return typeof d === 'string' ? d : (d && typeof d === 'object' ? pickDelta(d) : '');
}

// prompt: one flat string (system instructions + conversation). Throws on any failure so the caller can fall back.
// model (optional): sent as "model" when the Nexus endpoint offers several (e.g. nexus-1-pro-flagship).
// onToken (optional): asks the endpoint to stream and is called with each piece of text as it arrives. If the endpoint
// answers with one plain JSON reply instead of a stream, onToken is called once with the whole text. The full text is returned either way.
export async function callNexus(prompt, { signal, timeoutMs, model, onToken } = {}) {
  const key = cleanKey(process.env.NEXUS_API_KEY);
  if (!key) throw Error('Nexus AI key is not set (NEXUS_API_KEY).');
  const perTry = timeoutMs || Number(process.env.NEXUS_TIMEOUT_MS) || 45000;
  const field = process.env.NEXUS_PROMPT_FIELD;
  const body = { [field || 'message']: prompt };
  if (model) body.model = model;
  if (typeof onToken === 'function') body.stream = true;
  const payload = JSON.stringify(body);
  const send = (style) => {
    // Each attempt gets its own full timeout, so a rejected key style can't use up the time of the next one.
    const limit = AbortSignal.timeout(perTry);
    const sig = signal && AbortSignal.any ? AbortSignal.any([limit, signal]) : limit;
    const headers = { 'Content-Type': 'application/json' };
    if (style === 'bearer') headers.Authorization = `Bearer ${key}`;
    else if (style === 'x-api-key') headers['X-API-Key'] = key;
    else if (style === 'api-key') headers['api-key'] = key;
    else headers[style] = style.toLowerCase() === 'authorization' ? `Bearer ${key}` : key; // custom NEXUS_AUTH_HEADER
    return fetch(NEXUS_API_URL, { method: 'POST', headers, body: payload, signal: sig });
  };
  // The key is tried the way you configured it first (default X-API-Key). If Nexus answers 401/403 the other usual ways of
  // sending a key are tried once each, and the one that works is remembered for the next request.
  let custom = String(process.env.NEXUS_AUTH_HEADER || '').trim();
  if (/^authorization$/i.test(custom)) custom = 'bearer'; // same thing, avoids sending the identical request twice
  if (/^x-api-key$/i.test(custom)) custom = 'x-api-key';
  const order = [...new Set([workingStyle, 'x-api-key', custom, 'bearer', 'api-key'].filter(Boolean))];
  let r; const tried = [];
  for (const style of order) {
    tried.push(style);
    try {
      try { r = await send(style); }
      catch (e) {
        if (e?.name !== 'TimeoutError' || signal?.aborted) throw e;
        console.warn(`[nexus] no answer within ${perTry}ms using \"${style}\", retrying once (server may be waking up)`);
        r = await send(style);
      }
    } catch (e) { throw nexusError(e, { tried, key }); }
    if (r.status !== 401 && r.status !== 403) { if (r.ok) workingStyle = style; break; }
    console.warn(`[nexus] ${r.status} from ${NEXUS_API_URL} using auth style "${style}" (key ${describeKey(key)})`);
    if (style !== order[order.length - 1]) await r.arrayBuffer().catch(() => {});
  }
  if (typeof onToken === 'function' && r.ok && r.body) {
    const reader = r.body.getReader(); const dec = new TextDecoder();
    let raw = '', buf = '', streamed = '', sse = false;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      const chunk = dec.decode(value, { stream: true }); raw += chunk; buf += chunk;
      if (!sse && /^\s*(?:data:|event:|:)/.test(raw)) sse = true;
      if (!sse) continue;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim(); if (!payload || payload === '[DONE]') continue;
        let piece = '';
        try { piece = pickDelta(JSON.parse(payload)); } catch { piece = payload; }
        if (piece) { streamed += piece; onToken(piece); }
      }
    }
    if (streamed.trim()) return streamed.trim();
    let jj = null; try { jj = JSON.parse(raw); } catch { /* plain text */ }
    const whole = (jj ? pickText(jj) : raw).trim();
    if (!whole) throw Error(`Nexus AI returned an empty response. Raw: ${raw.slice(0, 200)}`);
    onToken(whole);
    return whole;
  }
  const raw = await r.text();
  let j = null;
  try { j = JSON.parse(raw); } catch { /* plain text reply */ }
  if (!r.ok) {
    const msg = (j?.error?.message || j?.error || j?.message || raw).toString().slice(0, 200);
    throw nexusError(Error(`Nexus AI error (${r.status}): ${msg}`), { status: r.status, tried, key, raw, headers: r.headers });
  }
  const text = (j ? pickText(j) : raw).trim();
  if (!text) throw Error(`Nexus AI returned an empty response. Raw: ${raw.slice(0, 200)}`);
  return text;
}

// Keep-alive: free Render services go to sleep after ~15 minutes without traffic and then need 30-60 s to
// wake up, which made the first chat message after a quiet spell time out and fall back to the free models.
// This pings each AI service's address every few minutes (and once at start-up) so it stays awake.
// Needs no key; any reply, even a 404, counts as "awake". Turn it off with NEXUS_KEEPALIVE_MIN=0,
// change the interval with NEXUS_KEEPALIVE_MIN=<minutes> (default 10), add more addresses with
// KEEPALIVE_URLS=https://a.onrender.com,https://b.onrender.com
export function startKeepAlive(extraUrls = []) {
  const minutes = process.env.NEXUS_KEEPALIVE_MIN === undefined ? 10 : Number(process.env.NEXUS_KEEPALIVE_MIN);
  if (!(minutes > 0)) return null;
  const targets = new Set();
  for (const raw of [NEXUS_API_URL, ...extraUrls, ...String(process.env.KEEPALIVE_URLS || '').split(',')]) {
    try { const u = new URL(String(raw).trim()); if (u.protocol === 'https:' || u.protocol === 'http:') targets.add(u.origin + '/'); } catch { /* not a URL */ }
  }
  if (!targets.size) return null;
  const ping = () => {
    for (const url of targets) {
      const t0 = Date.now();
      fetch(url, { method: 'GET', headers: { 'User-Agent': 'XyronKeepAlive/1.0' }, signal: AbortSignal.timeout(90000) })
        .then((r) => console.log(`[keepalive] ${url} -> ${r.status} in ${Date.now() - t0}ms`))
        .catch((e) => console.error(`[keepalive] ${url} failed: ${e.message}`));
    }
  };
  ping();
  const timer = setInterval(ping, Math.max(1, minutes) * 60 * 1000);
  timer.unref?.();
  return timer;
}

// ---------------------------------------------------------------------------------------------------------------------
// Nexus AI v1 (OpenAI-style): POST https://nexus-labs.myng.net/v1/chat/completions   Authorization: Bearer <key>
//
// Why this exists: the old paths squeezed the whole conversation into ONE flat text field (/chat) or into a GET URL
// (the free backup endpoints, capped near 7,000 characters). A big coding request - the project files, the earlier
// turns and the instructions - did not fit, so it was cut or refused. This sends a real `messages` array in a POST
// body (no URL limit), streams the reply, and only gives up when the connection goes quiet, not after a fixed
// 2 minutes, so long builds finish.
//
// Same NEXUS_API_KEY as before. Optional environment variables:
//   NEXUS_V1_BASE        default https://nexus-labs.myng.net/v1
//   NEXUS_CODEX_MODEL    force a model id (otherwise it is read from GET /v1/models, preferring a pro/flagship/code one)
//   CODEX_MAX_TOKENS     reply length cap (default 16000)
//   CODEX_IDLE_MS        give up if nothing arrives for this long (default 90000)
//   CODEX_TOTAL_MS       hard cap for one reply (default 600000)
// ---------------------------------------------------------------------------------------------------------------------
export const NEXUS_V1_BASE = (process.env.NEXUS_V1_BASE || 'https://nexus-labs.myng.net/v1').replace(/\/+$/, '');

let v1Model = '';
let v1ModelAt = 0;

// Picks the model to use. Never throws: if the list cannot be read, falls back to the flagship name the app already uses.
export async function pickNexusV1Model(signal) {
  if (process.env.NEXUS_CODEX_MODEL) return process.env.NEXUS_CODEX_MODEL.trim();
  if (v1Model && Date.now() - v1ModelAt < 30 * 60 * 1000) return v1Model;
  const fallback = process.env.NEXUS_V1_PRO_MODEL || 'nexus-1-pro-flagship';
  try {
    const key = cleanKey(process.env.NEXUS_API_KEY);
    const limit = AbortSignal.timeout(15000);
    const r = await fetch(`${NEXUS_V1_BASE}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: signal && AbortSignal.any ? AbortSignal.any([limit, signal]) : limit,
    });
    if (r.ok) {
      const j = await r.json().catch(() => null);
      const ids = (Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : []).map((m) => (typeof m === 'string' ? m : m?.id)).filter(Boolean);
      if (ids.length) {
        const pick = ids.includes(fallback) ? fallback
          : ids.find((i) => /flagship/i.test(i)) || ids.find((i) => /pro/i.test(i)) || ids.find((i) => /cod(e|er|ex)/i.test(i)) || ids[0];
        v1Model = pick; v1ModelAt = Date.now();
        console.log(`[nexus-v1] models: ${ids.slice(0, 12).join(', ')} -> using ${pick}`);
        return pick;
      }
    }
  } catch { /* use the fallback name */ }
  return fallback;
}

// messages: [{role:'system'|'user'|'assistant', content}]. Returns the full reply text; onToken gets each piece as it arrives.
// Errors: err.noV1 = true means this address has no chat/completions route (404/405), so the caller should stop trying it;
//         err.partial = true means some text was already sent to the person, so the caller must not silently switch provider.
export async function callNexusChat(messages, { signal, model, maxTokens, temperature, onToken } = {}) {
  const key = cleanKey(process.env.NEXUS_API_KEY);
  if (!key) throw Error('Nexus AI key is not set (NEXUS_API_KEY).');
  const idleMs = Number(process.env.CODEX_IDLE_MS) || 90000;
  const totalMs = Number(process.env.CODEX_TOTAL_MS) || 600000;
  const chosen = model || await pickNexusV1Model(signal);
  const body = {
    model: chosen,
    messages: messages.filter((m) => String(m?.content ?? '').trim()).map((m) => ({ role: m.role === 'assistant' || m.role === 'system' ? m.role : 'user', content: String(m.content) })),
    max_tokens: maxTokens || Number(process.env.CODEX_MAX_TOKENS) || 16000,
    stream: true,
  };
  if (typeof temperature === 'number') body.temperature = temperature;

  // Idle watchdog: a streaming reply may run for minutes, but silence for idleMs means the connection is stuck.
  const ctl = new AbortController();
  let idle = null;
  const bump = () => { clearTimeout(idle); idle = setTimeout(() => ctl.abort(Object.assign(Error(`Nexus AI went quiet for ${Math.round(idleMs / 1000)}s`), { name: 'TimeoutError' })), idleMs); };
  const total = setTimeout(() => ctl.abort(Object.assign(Error(`Nexus AI took longer than ${Math.round(totalMs / 1000)}s`), { name: 'TimeoutError' })), totalMs);
  const onOuter = () => ctl.abort(signal.reason);
  if (signal) { if (signal.aborted) ctl.abort(signal.reason); else signal.addEventListener('abort', onOuter, { once: true }); }
  const cleanup = () => { clearTimeout(idle); clearTimeout(total); signal?.removeEventListener?.('abort', onOuter); };

  let sent = 0;
  try {
    bump();
    let r;
    try {
      r = await fetch(`${NEXUS_V1_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, Accept: 'text/event-stream, application/json' },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
    } catch (e) { throw nexusError(Object.assign(e, { message: ctl.signal.reason?.message || e.message }), { tried: ['bearer(v1)'], key }); }
    if (!r.ok) {
      const raw = await r.text().catch(() => '');
      let j = null; try { j = JSON.parse(raw); } catch { /* not json */ }
      const msg = (j?.error?.message || j?.error || j?.message || raw).toString().slice(0, 300);
      const err = nexusError(Error(`Nexus v1 error (${r.status}): ${msg}`), { status: r.status, tried: ['bearer(v1)'], key, raw, headers: r.headers });
      if (r.status === 404 || r.status === 405) err.noV1 = true;
      throw err;
    }
    const type = String(r.headers.get('content-type') || '');
    // Server ignored stream:true and sent one JSON object.
    if (!/event-stream/i.test(type) || !r.body) {
      const raw = await r.text();
      let j = null; try { j = JSON.parse(raw); } catch { /* plain text */ }
      const text = (j ? pickText(j) : raw).trim();
      if (!text) throw Error(`Nexus v1 returned an empty response. Raw: ${raw.slice(0, 200)}`);
      if (typeof onToken === 'function') { sent += text.length; onToken(text); }
      return text;
    }
    const reader = r.body.getReader(); const dec = new TextDecoder();
    let buf = '', out = '', finish = '';
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      bump();
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const p = line.slice(5).trim(); if (!p || p === '[DONE]') continue;
        let j = null; try { j = JSON.parse(p); } catch { continue; }
        if (j?.error) throw Error(`Nexus v1 stream error: ${String(j.error?.message || j.error).slice(0, 200)}`);
        const piece = pickDelta(j);
        if (j?.choices?.[0]?.finish_reason) finish = j.choices[0].finish_reason;
        if (piece) { out += piece; sent += piece.length; if (typeof onToken === 'function') onToken(piece); }
      }
    }
    if (!out.trim()) throw Error('Nexus v1 returned an empty response.');
    if (finish === 'length') console.warn('[nexus-v1] reply hit the max_tokens cap; the build screen will ask for the rest (raise CODEX_MAX_TOKENS if this repeats).');
    return out.trim();
  } catch (e) {
    if (sent > 0) e.partial = true;
    throw e;
  } finally { cleanup(); }
}

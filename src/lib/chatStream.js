import { api } from "../api/client";

// Main chat, streamed. Sends the same payload as the normal xryonChat call (plus stream:true) and gets
// Server-Sent Events back: {t:"piece"} while the AI writes, then {done:true, reply, savedMessageId, ...}.
// onText(textSoFar) is called as the text grows. Resolves with { data } shaped exactly like the one-shot call,
// so the caller's code after it does not change.
//
// Some providers hand over the whole answer at once. It is revealed with a quick typing effect so the reply
// still appears smoothly instead of popping in; it never makes a reply slower than the server sent it by more
// than a moment, and it catches up at once when the stream is finished.
//
// Falls back to the normal one-shot call when the server can't stream (older server, proxy that blocks it).
const TICK_MS = 28;

async function oneShot(payload, signal, onText) {
  const res = await api.functions.invoke("xryonChat", payload, { signal });
  return res;
}

export async function streamMainChat(payload, { signal, onText } = {}) {
  let res;
  try {
    res = await fetch("/api/functions/xryonChat", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, stream: true }),
      signal,
    });
  } catch (e) {
    if (e?.name === "AbortError" || signal?.aborted) throw e;
    return oneShot(payload, signal);
  }
  const isSse = /text\/event-stream/i.test(res.headers.get("content-type") || "");
  // Not OK (sign-in needed, limits, old server...): the normal call reports it the way the app already expects.
  if (!res.ok) return oneShot(payload, signal);
  // Server answered with plain JSON (it ignored stream:true): use it as is.
  if (!isSse || !res.body) return { data: await res.json() };

  let target = "";
  let shown = 0;
  let final = null;
  let failure = null;
  let finished = false;
  let wake = null;
  const timer = setInterval(() => {
    if (shown < target.length) {
      const remaining = target.length - shown;
      shown = Math.min(target.length, shown + Math.max(3, Math.ceil(remaining / 12)));
      onText?.(target.slice(0, shown));
    }
    if (finished && shown >= target.length && wake) wake();
  }, TICK_MS);
  const onAbort = () => { clearInterval(timer); wake?.(); };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        let msg;
        try { msg = JSON.parse(line.slice(5).trim()); } catch { continue; }
        if (msg.error) { failure = new Error(msg.error); continue; }
        if (msg.done) { final = msg; continue; }
        if (msg.t) target += msg.t;
      }
    }
  } catch (e) {
    clearInterval(timer);
    signal?.removeEventListener("abort", onAbort);
    throw e;
  }
  if (failure) { clearInterval(timer); signal?.removeEventListener("abort", onAbort); throw failure; }
  if (!final) { clearInterval(timer); signal?.removeEventListener("abort", onAbort); throw new Error("The AI didn't send anything back. Try again."); }
  // Let the typing effect finish what is already on its way (the final text may be longer than what streamed).
  if (typeof final.reply === "string" && final.reply.length > target.length) target = final.reply;
  finished = true;
  if (shown < target.length) await new Promise((resolve) => { wake = resolve; });
  clearInterval(timer);
  signal?.removeEventListener("abort", onAbort);
  if (signal?.aborted) { const e = new Error("Aborted"); e.name = "AbortError"; throw e; }
  const { done: _done, ...data } = final;
  return { data };
}

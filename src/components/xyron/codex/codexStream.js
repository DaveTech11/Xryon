import { api } from "../../../api/client";

// Streams the AI's answer from /api/functions/xryonChatStream (Server-Sent Events) and calls
// onText(piece) as each piece arrives. Resolves with the full text.
// If the stream endpoint isn't there (older server) or fails before any text arrived, it falls back
// to the normal one-shot xryonChat call, so building always works.
export async function streamChat(payload, { signal, onText, onMeta } = {}) {
  let got = "";
  try {
    const res = await fetch("/api/functions/xryonChatStream", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
    if (!res.ok || !res.body) {
      const e = new Error(`stream unavailable (${res.status})`);
      e.fallback = true;
      throw e;
    }
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
        if (msg.meta) { onMeta?.(msg.meta); continue; }
        if (msg.error) { const e = new Error(msg.error); e.fromServer = true; throw e; }
        if (msg.t) { got += msg.t; onText?.(msg.t); }
      }
    }
    if (!got) { const e = new Error("The AI didn't send anything back. Try again."); e.fallback = true; throw e; }
    return got;
  } catch (e) {
    if (e?.name === "AbortError" || got || (!e.fallback && e.fromServer)) throw e;
    // Nothing arrived yet: try the regular endpoint once.
    const res = await api.functions.invoke("xryonChat", payload, { signal });
    const reply = res.data?.reply;
    if (!reply) throw new Error(res.data?.error || "The AI didn't send anything back. Try again.");
    if (res.data?.codexMeta) onMeta?.(res.data.codexMeta);
    onText?.(reply);
    return reply;
  }
}

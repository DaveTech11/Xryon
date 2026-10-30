import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DEFAULT_FREE_ORDER, CHAT_ONLY_ENDPOINTS, FREE_ENDPOINTS } from "../rebix.mjs";

// Loads the real ai() (and its provider-health helpers) out of server.mjs and runs it against stub providers.
const src = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const from = src.indexOf("const providerDown=new Map()");
const to = src.indexOf("// Server-side source of truth");
assert.ok(from > 0 && to > from, "could not find ai() in server.mjs");
const body = src.slice(from, to).replace(/\nfunction isPremiumUser[\s\S]*$/, "");

function makeAi(stubs) {
  const factory = new Function("stubs", "DEFAULT_FREE_ORDER", "CHAT_ONLY_ENDPOINTS", "FREE_ENDPOINTS",
    `const {callNexus,callNexusChat,nexusConfigured,callRebixModel}=stubs;const VORTYX_API_KEY='',VORTYX_API_URL='';\n${body}\nreturn ai;`);
  return factory(stubs, DEFAULT_FREE_ORDER, CHAT_ONLY_ENDPOINTS, FREE_ENDPOINTS);
}
const sleep = (ms, sig) => new Promise((res, rej) => { const t = setTimeout(res, ms); sig?.addEventListener("abort", () => { clearTimeout(t); rej(Object.assign(Error("aborted"), { name: "AbortError" })); }, { once: true }); });
const msgs = [{ role: "user", content: "hi" }];

test("fast Nexus answer: backups are never called", async () => {
  const called = [];
  const ai = makeAi({ nexusConfigured: () => true, callNexus: async () => { await sleep(80); return "from nexus"; }, callRebixModel: async (n) => { called.push(n); return "backup"; } });
  assert.equal(await ai(msgs, ""), "from nexus");
  await sleep(2300); assert.deepEqual(called, []);
});

test("Nexus silent for 2s: a backup answers and Nexus is cancelled", async () => {
  let nexusAborted = false; const called = [];
  const ai = makeAi({ nexusConfigured: () => true,
    callNexus: async (_p, o) => { try { await sleep(30000, o.signal); } catch (e) { nexusAborted = true; throw e; } return "late"; },
    callRebixModel: async (n) => { called.push(n); await sleep(100); return `from ${n}`; } });
  const t0 = Date.now(); const out = await ai(msgs, ""); const ms = Date.now() - t0;
  assert.equal(out, "from prexzy-deepseek-flash");
  assert.ok(ms >= 1900 && ms < 3500, `switched after ${ms}ms`);
  assert.equal(nexusAborted, true);
  assert.equal(called[0], "prexzy-deepseek-flash");
});

test("Nexus fails at once: backups start immediately", async () => {
  const ai = makeAi({ nexusConfigured: () => true, callNexus: async () => { throw Error("boom"); }, callRebixModel: async (n) => { await sleep(50); return `from ${n}`; } });
  const t0 = Date.now(); const out = await ai(msgs, ""); assert.ok(Date.now() - t0 < 800); assert.equal(out, "from prexzy-deepseek-flash");
});

test("streaming: backup wins before Nexus's first token, Nexus tokens are dropped", async () => {
  const tokens = [];
  const ai = makeAi({ nexusConfigured: () => true,
    callNexus: async (_p, o) => { await sleep(3200, o.signal); o.onToken?.("NEXUS"); return "NEXUS"; },
    callRebixModel: async () => { await sleep(300); return "backup answer"; } });
  assert.equal(await ai(msgs, "", { onToken: (t) => tokens.push(t) }), "backup answer");
  assert.deepEqual(tokens, []);
});

test("streaming: Nexus starts at 2.5s and keeps the win over a slower backup", async () => {
  const tokens = []; let backupAborted = false;
  const ai = makeAi({ nexusConfigured: () => true,
    callNexus: async (_p, o) => { await sleep(2500, o.signal); o.onToken("Hel"); await sleep(100); o.onToken("lo"); return "Hello"; },
    callRebixModel: async (n, m, s, o) => { try { await sleep(6000, o.signal); } catch (e) { backupAborted = true; throw e; } return "slow backup"; } });
  assert.equal(await ai(msgs, "", { onToken: (t) => tokens.push(t) }), "Hello");
  assert.deepEqual(tokens, ["Hel", "lo"]);
  await sleep(50); assert.equal(backupAborted, true);
});

test("a stream that breaks after text was sent is not replaced (partial)", async () => {
  const ai = makeAi({ nexusConfigured: () => true,
    callNexus: async (_p, o) => { o.onToken("start"); await sleep(50); throw Error("dropped"); },
    callRebixModel: async () => "backup" });
  await assert.rejects(ai(msgs, "", { onToken: () => {} }), (e) => e.partial === true);
});

test("everything failing gives the busy message", async () => {
  const ai = makeAi({ nexusConfigured: () => true, callNexus: async () => { throw Error("x"); }, callRebixModel: async () => { throw Error("y"); } });
  await assert.rejects(ai(msgs, ""), /busy right now/);
});

test("the chat-only backup is skipped for coding requests but used for chat", async () => {
  const seen = { chat: [], code: [] };
  const mk = (bucket) => makeAi({ nexusConfigured: () => false, callNexus: async () => "", callRebixModel: async (n) => { bucket.push(n); throw Error("no"); } });
  await mk(seen.chat)(msgs, "plain chat", { fallback: true }).catch(() => {});
  await mk(seen.code)(msgs, "When a coding task needs more than one file ...", { fallback: true }).catch(() => {});
  assert.ok(seen.chat.includes("prexzy-deepseek-chat"));
  assert.ok(!seen.code.includes("prexzy-deepseek-chat"));
  assert.ok(seen.code.includes("prexzy-glm"));
});

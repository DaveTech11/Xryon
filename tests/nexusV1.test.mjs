import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

// Mock of https://nexus-labs.myng.net/v1 : checks the Bearer key, lists models, streams or returns JSON.
let mode = "stream";
let lastBody = null, lastAuth = null;
const server = http.createServer((req, res) => {
  lastAuth = req.headers.authorization || null;
  if (req.url === "/v1/models") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ data: [{ id: "nexus-1-mini" }, { id: "nexus-1-pro-flagship" }] })); }
  if (req.url !== "/v1/chat/completions") { res.statusCode = 404; return res.end("nope"); }
  if (mode === "404") { res.statusCode = 404; return res.end("not found"); }
  let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
    lastBody = JSON.parse(raw);
    if (mode === "json") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ choices: [{ message: { content: "whole answer" } }] })); }
    res.setHeader("content-type", "text/event-stream");
    const piece = (t, f) => `data: ${JSON.stringify({ choices: [{ delta: { content: t }, finish_reason: f || null }] })}\n\n`;
    res.write(piece("Hel")); res.write(piece("lo "));
    if (mode === "break") return setTimeout(() => res.destroy(), 20);
    res.write(piece("world", "stop")); res.end("data: [DONE]\n\n");
  });
});
await new Promise((r) => server.listen(0, r));
process.env.NEXUS_V1_BASE = `http://127.0.0.1:${server.address().port}/v1`;
process.env.NEXUS_API_KEY = "Bearer sk-test-123"; // pasted with "Bearer " on purpose: must be cleaned
const { callNexusChat, pickNexusV1Model } = await import("../nexus.mjs");

test("picks the flagship model from /v1/models", async () => { assert.equal(await pickNexusV1Model(), "nexus-1-pro-flagship"); });

test("streams pieces in order, sends Bearer key and a real messages array", async () => {
  mode = "stream"; const got = [];
  const out = await callNexusChat([{ role: "system", content: "sys" }, { role: "user", content: "hi" }], { onToken: (t) => got.push(t) });
  assert.equal(out, "Hello world");
  assert.deepEqual(got, ["Hel", "lo ", "world"]);
  assert.equal(lastAuth, "Bearer sk-test-123");
  assert.equal(lastBody.model, "nexus-1-pro-flagship");
  assert.equal(lastBody.stream, true);
  assert.ok(lastBody.max_tokens >= 8000);
  assert.deepEqual(lastBody.messages.map((m) => m.role), ["system", "user"]);
});

test("a ~300 KB request goes through intact (no URL limit)", async () => {
  mode = "stream";
  const big = "x".repeat(300000);
  await callNexusChat([{ role: "user", content: big }]);
  assert.equal(lastBody.messages[0].content.length, 300000);
});

test("accepts a plain JSON reply when the server ignores stream:true", async () => {
  mode = "json"; const got = [];
  assert.equal(await callNexusChat([{ role: "user", content: "hi" }], { onToken: (t) => got.push(t) }), "whole answer");
  assert.deepEqual(got, ["whole answer"]);
});

test("404 is flagged noV1 so the caller stops trying this route", async () => {
  mode = "404";
  await assert.rejects(callNexusChat([{ role: "user", content: "hi" }]), (e) => e.noV1 === true);
});

test("a stream that dies after text was sent is marked partial", async () => {
  mode = "break";
  await assert.rejects(callNexusChat([{ role: "user", content: "hi" }], { onToken: () => {} }), (e) => e.partial === true);
});

test.after(() => server.close());

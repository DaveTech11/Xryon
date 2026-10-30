// Live progress for an REA investigation, shown in the chat while the server works (plan, tool calls, checking).
// The server sends {type:'start'|'plan'|'progress'|'thought'|'tool'|'result'|'verify'|'done', ...} events; this turns them into a small Markdown block.
export function newTrail() {
  return { kind: "", name: "", plan: [], done: new Set(), tools: [], thought: "", verifying: false, finished: false };
}

export function applyStep(t, e = {}) {
  if (e.type === "start") { t.kind = String(e.kind || "").toUpperCase(); t.name = String(e.name || ""); }
  else if (e.type === "plan") { t.plan = Array.isArray(e.items) ? e.items : []; t.done = new Set(); }
  else if (e.type === "progress") { for (const i of e.done || []) t.done.add(i); }
  else if (e.type === "thought") t.thought = String(e.text || "");
  else if (e.type === "tool") t.tools.push({ n: e.n, label: e.label || e.tool, status: "run" });
  else if (e.type === "result") { const x = t.tools.find((y) => y.n === e.n); if (x) { x.status = e.ok ? "ok" : "fail"; x.note = e.ok ? "" : e.note || ""; } }
  else if (e.type === "verify") t.verifying = true;
  else if (e.type === "done") { t.verifying = false; t.finished = true; }
  return t;
}

export function trailMarkdown(t) {
  const out = [`**Reverse engineering with REA**${t.kind ? ` · ${t.kind}` : ""}${t.name ? ` · ${t.name}` : ""}`];
  if (t.plan.length) out.push("", "**Plan**", ...t.plan.map((p, i) => `- ${t.done.has(i) ? "✓" : "○"} ${p}`));
  if (t.tools.length) {
    out.push("", "**Working**", ...t.tools.slice(-8).map((x) => `- ${x.status === "ok" ? "✓" : x.status === "fail" ? "✗" : "…"} ${x.label}${x.status === "fail" && x.note ? ` (${x.note.slice(0, 60)})` : ""}`));
  }
  if (t.thought && !t.finished) out.push("", `_${t.thought}_`);
  if (t.verifying) out.push("", "Checking every finding against the evidence…");
  if (t.finished) out.push("", "Writing the answer…");
  else if (!t.tools.length && !t.plan.length) out.push("", "Opening the file and planning the work…");
  return out.join("\n");
}

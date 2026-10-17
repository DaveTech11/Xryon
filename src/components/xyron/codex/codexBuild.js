import { parseContentBlocks } from "../../../lib/codeBlocks";
import { languageFor, safePath } from "./codexImport";

// ---------------------------------------------------------------------------
// Everything the Codex "build" screen needs that is not UI:
//  - the instructions sent to the AI
//  - turning its reply into { project, plan, files, summary }
//  - merging follow-up changes into the current project
//  - preparing a project for the browser sandbox
//  - a ZIP download
// Nothing in here executes code.
// ---------------------------------------------------------------------------

export const BUILD_SYSTEM_PROMPT = `You are Xyron Codex, an AI software engineer inside a coding workspace. Every message here is a coding task: build exactly what the person asks for.

Reply in exactly this structure:

PROJECT: <short-kebab-case-name>
PLAN:
- <3 to 6 short bullets: what you will build and which files you will create>

Then write every file in full, each as its own fenced block whose info string is the language, a space, then path= and the relative path. Example:

\`\`\`html path=index.html
...complete file...
\`\`\`

\`\`\`css path=style.css
...complete file...
\`\`\`

After the last file:

SUMMARY:
<2 to 5 short sentences: what it does, how to open or run it (exact commands for Node or Python projects), and anything you could not verify>

Rules:
- Write every file completely. No placeholders, no "rest of the code here", no TODO stubs.
- The files must be wired together correctly: matching paths, imports, ids and class names.
- Unless the person asks for a framework, Node or Python, build plain HTML + CSS + JavaScript that works by opening index.html. Put styles and scripts in their own files and link them with relative paths.
- Never put API keys or secrets in code. Read them from environment variables and add a .env.example file.
- You cannot run code, install packages or test anything here. Never say that you did.
- When changing an existing project, return ONLY the files that change, each one in full, using the same paths.
- If the person asks a question and no code change is needed, answer under SUMMARY: and write no files.
- Inside README.md use indented code, never triple backticks.`;

const MAX_CONTEXT_CHARS = 60000;

// What the AI gets for a follow-up: the files as they are now + the request.
export function buildUserMessage(request, project, history = []) {
  const parts = [];
  if (history.length) {
    parts.push(`Earlier requests in this project:\n${history.slice(-6).map((h, i) => `${i + 1}. ${h}`).join("\n")}`);
  }
  if (project && project.files.length) {
    let used = 0;
    const chunks = [];
    const skipped = [];
    for (const f of project.files) {
      const block = `=== ${f.path} ===\n${f.value}\n`;
      if (used + block.length > MAX_CONTEXT_CHARS) { skipped.push(f.path); continue; }
      used += block.length;
      chunks.push(block);
    }
    parts.push(`Current project "${project.name}". These are its files right now:\n\n${chunks.join("\n")}${skipped.length ? `\n(Not shown because they are large: ${skipped.join(", ")})` : ""}`);
  }
  parts.push(`Request: ${request}`);
  return parts.join("\n\n");
}

const DEFAULT_NAMES = { html: "index.html", css: "style.css", js: "app.js", javascript: "app.js", jsx: "App.jsx", ts: "index.ts", typescript: "index.ts", python: "main.py", py: "main.py", json: "data.json", bash: "run.sh", sh: "run.sh", md: "README.md" };

export function slugify(text = "", fallback = "xyron-project") {
  const s = String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return s || fallback;
}

// Splits the AI's reply into its parts. Tolerant: if the model skipped the headings it still finds the files.
export function parseBuildReply(reply = "") {
  const text = String(reply).replace(/\r\n/g, "\n");
  const blocks = parseContentBlocks(text);
  const files = [];
  const seen = new Set();
  const textChunks = [];
  let loose = 0;

  for (const b of blocks) {
    if (b.type === "text") { textChunks.push(b.value); continue; }
    let path = b.path ? safePath(b.path.replace(/^["'`]|["'`]$/g, "")) : null;
    if (!path) {
      // A code block with no usable path: only keep it if it is the only code in the reply.
      loose += 1;
      path = DEFAULT_NAMES[(b.lang || "").toLowerCase()] || null;
    }
    if (!path || !b.value.trim()) continue;
    if (seen.has(path)) { const i = files.findIndex((f) => f.path === path); files[i] = { path, value: b.value }; continue; }
    seen.add(path);
    files.push({ path, value: b.value });
  }
  // Several unlabelled blocks of the same kind would overwrite each other; that is not a usable project.
  if (loose > 1 && !blocks.some((b) => b.type === "code" && b.path)) files.length = Math.min(files.length, 1);

  const prose = textChunks.join("\n");
  const projectMatch = prose.match(/^\s*PROJECT:\s*(.+)$/im);
  const planMatch = prose.match(/PLAN:\s*\n([\s\S]*?)(?=\n\s*(?:SUMMARY:|$)|$)/i);
  const summaryMatch = prose.match(/SUMMARY:\s*\n?([\s\S]*)$/i);

  const plan = (planMatch ? planMatch[1] : "")
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((l) => l && !/^SUMMARY:/i.test(l));

  let summary = summaryMatch ? summaryMatch[1].trim() : "";
  if (!summary) {
    // No SUMMARY heading: use whatever prose is left after removing the headings and plan.
    summary = prose
      .replace(/^\s*PROJECT:.*$/im, "")
      .replace(/PLAN:\s*\n[\s\S]*?(?=\n\n|$)/i, "")
      .trim();
  }

  return {
    project: projectMatch ? slugify(projectMatch[1]) : "",
    plan: plan.slice(0, 8),
    files,
    summary,
  };
}

// Incremental parser for text that is still arriving: finds the plan, the files (the last one may still be
// open) and the summary so the screen can show them as they are written. Display only; the finished reply is
// parsed again with parseBuildReply.
export function parseLive(text = "") {
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  const files = [];
  const pre = [];
  const post = [];
  let cur = null;
  for (const line of lines) {
    if (!cur) {
      const m = line.match(/^```([\w.+-]*)[ \t]*(?:path=(.+?))?[ \t]*$/);
      if (m) { cur = { lang: m[1], path: (m[2] || "").trim(), buf: [], closed: false }; files.push(cur); continue; }
      (files.length ? post : pre).push(line);
    } else if (/^```\s*$/.test(line)) { cur.closed = true; cur = null; } else cur.buf.push(line);
  }
  const preText = pre.join("\n");
  const projectMatch = preText.match(/^\s*PROJECT:\s*(.+)$/im);
  const planMatch = preText.match(/PLAN:\s*\n([\s\S]*)$/i);
  const plan = (planMatch ? planMatch[1] : "").split("\n").map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean);
  const postText = post.join("\n");
  const sm = postText.match(/SUMMARY:\s*\n?([\s\S]*)$/i);
  const summary = (sm ? sm[1] : files.length ? postText : "").trim();
  return {
    project: projectMatch ? slugify(projectMatch[1]) : "",
    plan,
    planDone: files.length > 0 || /SUMMARY:/i.test(preText),
    files: files.map((f, i) => ({
      path: f.path ? (safePath(f.path) || f.path) : (DEFAULT_NAMES[(f.lang || "").toLowerCase()] || `file-${i + 1}.txt`),
      value: f.buf.join("\n"),
      closed: f.closed,
    })),
    summary,
    // Text with no files at all is just an answer.
    answer: files.length === 0 && preText.trim().length >= 12 && !/^\s*(PROJECT|PLAN):/im.test(preText) ? preText.trim() : "",
  };
}

// Files from a follow-up replace files with the same path; new paths are added.
export function mergeFiles(current = [], changes = []) {
  const map = new Map(current.map((f) => [f.path, f]));
  for (const f of changes) map.set(f.path, f);
  return [...map.values()];
}

// Light, honest checks: only things we can really verify in the browser without running the project.
export function checkFile(file) {
  const ext = (file.path.split(".").pop() || "").toLowerCase();
  if (ext === "json") {
    try { JSON.parse(file.value); return { checked: true, error: null }; } catch (e) { return { checked: true, error: e.message }; }
  }
  if (ext === "js" || ext === "mjs" || ext === "cjs") {
    // Modules and top-level await can't be parsed by new Function, so those are skipped rather than guessed at.
    if (/^\s*(import|export)\s/m.test(file.value) || /^\s*await\s/m.test(file.value)) return { checked: false, error: null };
    try {
      // eslint-disable-next-line no-new-func
      new Function(file.value);
      return { checked: true, error: null };
    } catch (e) { return { checked: true, error: e.message }; }
  }
  return { checked: false, error: null };
}

// ---------------------------------------------------------------------------
// Sandbox
// ---------------------------------------------------------------------------
const dirOf = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/") + 1) : "");

function resolveRef(fromDir, ref) {
  if (!ref || /^(https?:)?\/\//i.test(ref) || /^(data|blob):/i.test(ref)) return null;
  const clean = ref.split("#")[0].split("?")[0].replace(/^\.\//, "");
  const parts = (clean.startsWith("/") ? clean.slice(1) : fromDir + clean).split("/");
  const out = [];
  for (const part of parts) { if (part === "..") out.pop(); else if (part && part !== ".") out.push(part); }
  return out.join("/");
}

const NODE_HINTS = /\b(require\s*\(|process\.(env|argv|exit)|from\s+['"](fs|path|http|https|express|node:[a-z]+|telegraf|dotenv)['"]|module\.exports)\b/;

// Decides whether a project can run in the browser sandbox, and prepares what to run.
// -> { ok:true, kind:"html"|"js", value, entry, notes:[] } | { ok:false, reason }
export function prepareSandbox(files = []) {
  if (!files.length) return { ok: false, reason: "There's nothing to run yet." };
  const byPath = new Map(files.map((f) => [f.path, f]));
  const htmlEntry = byPath.get("index.html") || files.find((f) => /(^|\/)index\.html?$/i.test(f.path)) || files.find((f) => /\.html?$/i.test(f.path));

  if (htmlEntry) {
    const baseDir = dirOf(htmlEntry.path);
    const notes = [];
    let html = htmlEntry.value;
    html = html.replace(/<link\b[^>]*?>/gi, (tag) => {
      if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) return tag;
      const href = (tag.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
      const path = resolveRef(baseDir, href);
      if (path === null) { if (href) notes.push(`${href} is a remote file; the sandbox has no network, so it won't load.`); return tag; }
      const file = byPath.get(path);
      if (!file) { notes.push(`${href} isn't in the project.`); return tag; }
      return `<style>\n${file.value}\n</style>`;
    });
    html = html.replace(/<script\b([^>]*?)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, pre, src, post) => {
      const path = resolveRef(baseDir, src);
      if (path === null) { notes.push(`${src} is a remote script; the sandbox has no network, so it won't load.`); return tag; }
      const file = byPath.get(path);
      if (!file) { notes.push(`${src} isn't in the project.`); return tag; }
      const attrs = `${pre} ${post}`.replace(/\s+/g, " ").trim();
      return `<script${attrs ? " " + attrs.replace(/\bdefer\b|\basync\b/gi, "").trim() : ""}>\n${file.value.replace(/<\/script/gi, "<\\/script")}\n</script>`;
    });
    return { ok: true, kind: "html", value: html, entry: htmlEntry.path, notes };
  }

  const pyFiles = files.filter((f) => /\.py$/i.test(f.path));
  const jsEntries = files.filter((f) => /\.(m?js|cjs)$/i.test(f.path));
  if (pyFiles.length && !jsEntries.length) {
    const entry = pyFiles.find((f) => /(^|\/)(main|app|run|index)\.py$/i.test(f.path)) || pyFiles[0];
    const all = pyFiles.map((f) => f.value).join("\n");
    const blocked = all.match(/^\s*(?:import|from)\s+(flask|django|fastapi|uvicorn|telegram|telebot|discord|selenium|tkinter|pygame|requests|aiohttp|playwright|pyautogui)\b/m);
    if (blocked) return { ok: false, reason: `This Python project uses \`${blocked[1]}\`, which needs network access, a window or a server. The browser sandbox has none of those, so it can't run it. Download the ZIP and run it with \`python ${entry.path}\` on your machine.` };
    const notes = [];
    if (/\binput\s*\(/.test(all)) notes.push("`input()` isn't supported in the sandbox. The program will stop with an error at that line.");
    return { ok: true, kind: "python", value: entry.value, entry: entry.path, files: pyFiles.map((f) => ({ path: f.path, value: f.value })), notes };
  }
  const entry = jsEntries.find((f) => /(^|\/)(index|main|app)\.(m?js|cjs)$/i.test(f.path)) || jsEntries[0];
  if (jsEntries.length > 1 || NODE_HINTS.test(entry.value) || /^\s*import\s/m.test(entry.value) || files.some((f) => f.path.endsWith("package.json"))) {
    return { ok: false, reason: "This is a Node.js project (it uses modules, packages or the file system). The sandbox runs in the browser with no Node, no npm install and no network, so it can't run this. Download the ZIP and run `npm install` then `npm start` on your machine." };
  }
  return { ok: true, kind: "js", value: entry.value, entry: entry.path, notes: [] };
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------
export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// A ZIP that unpacks into one folder named after the project.
export async function zipProject(name, files) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  files.forEach((f) => zip.file(`${name}/${f.path}`, f.value));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export function saveTextFile(path, text) {
  saveBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), path.split("/").pop() || "file.txt");
}

export const formatSize = (n) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

// "run it", "run it in the sandbox", "test this", "preview it" ... — a request to RUN, not to change code.
export function isRunIntent(text = "") {
  const t = text.trim().toLowerCase().replace(/[.!?]+$/g, "");
  if (!t || t.length > 90) return false;
  if (/\b(add|change|make|fix|update|remove|build|create|write|rewrite|refactor|implement|improve)\b/.test(t)) return false;
  if (t === "sandbox") return true;
  if (/\bsandbox\b/.test(t) && /\b(run|test|try|open|launch|preview|execute|start|use|in)\b/.test(t)) return true;
  return /^(please\s+)?(can you\s+|could you\s+)?(run|test|try|preview|launch|execute|start)\s+(it|this|that|the\s+(app|project|code|website|site|game|page|bot))\b/.test(t) || /^(run|test|preview|launch|execute)$/.test(t);
}

export const languageOf = languageFor;

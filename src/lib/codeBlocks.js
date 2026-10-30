// Splits a message's raw text into alternating "text" and "code" segments,
// the same fenced ```lang ... ``` blocks Xyron is instructed to use. A code
// fence can optionally carry a `path=` annotation right after the language
// (```jsx path=src/App.jsx) — see XYRON_MULTI_FILE_PROMPT in lib/persona.js
// — which is how a multi-file build is told apart from a single snippet.
const FENCE_RE = /```([\w.+-]*)[ \t]*(?:path=([^\n`]+))?[ \t]*\n([\s\S]*?)```/g;

// ---- Safety net: code the model forgot to tag with a path ----------------------------------
// The prompts ask for `path=`-tagged blocks (those become Download / ZIP cards), but models sometimes
// answer a "give me a simple html / bot file" request with a bare ```html block, which would show
// as a copy-and-paste wall of code. A bare block that is clearly a whole file (a real language and
// not a tiny snippet) is therefore given a sensible file name here, so it is delivered as a file.
const FILE_LANGS = {
  html: "html", htm: "html", css: "css", js: "js", javascript: "js", mjs: "mjs", cjs: "cjs", jsx: "jsx", ts: "ts", typescript: "ts", tsx: "tsx",
  py: "py", python: "py", php: "php", java: "java", go: "go", rust: "rs", rs: "rs", rb: "rb", ruby: "rb", c: "c", cpp: "cpp", "c++": "cpp", cs: "cs", csharp: "cs",
  sql: "sql", json: "json", yaml: "yml", yml: "yml", vue: "vue", svelte: "svelte", kotlin: "kt", swift: "swift", dart: "dart",
};
const MIN_FILE_LINES = 8;

function guessFileName(lang, code) {
  const ext = FILE_LANGS[lang.toLowerCase()];
  // A first-line comment naming the file wins: "// bot.js", "# main.py", "<!-- index.html -->".
  const first = code.split("\n", 3).join("\n");
  const named = first.match(/^\s*(?:\/\/|#|\/\*|<!--)\s*(?:file(?:name)?:?\s*)?([\w./-]+\.[a-z0-9]{1,5})\b/i);
  if (named && /\.[a-z0-9]{1,5}$/i.test(named[1]) && !named[1].startsWith("/")) return named[1].replace(/^\.\//, "");
  if (ext === "html") return "index.html";
  if (ext === "css") return "style.css";
  if (ext === "json") return /"(dependencies|devDependencies|scripts)"\s*:/.test(code) ? "package.json" : "data.json";
  if (ext === "py") return /telebot|telegram|discord|aiogram/i.test(code) ? "bot.py" : "main.py";
  if (ext === "js" || ext === "mjs" || ext === "cjs") return /baileys|makeWASocket|telegraf|node-telegram-bot-api|discord\.js|new Client\(|bot\.on\(/i.test(code) ? `bot.${ext}` : `index.${ext}`;
  return ext ? `main.${ext}` : "";
}

function autoPaths(blocks) {
  const used = new Set(blocks.filter((b) => b.type === "code" && b.path).map((b) => b.path.toLowerCase()));
  for (const b of blocks) {
    if (b.type !== "code" || b.path || !FILE_LANGS[(b.lang || "").toLowerCase()]) continue;
    const lines = b.value.split("\n").length;
    const isWholeHtml = /<!doctype html|<html[\s>]/i.test(b.value);
    if (lines < MIN_FILE_LINES && !isWholeHtml) continue;
    let name = guessFileName(b.lang, b.value);
    if (!name) continue;
    if (used.has(name.toLowerCase())) {
      const dot = name.lastIndexOf(".");
      let n = 2;
      while (used.has(`${name.slice(0, dot)}-${n}${name.slice(dot)}`.toLowerCase())) n++;
      name = `${name.slice(0, dot)}-${n}${name.slice(dot)}`;
    }
    used.add(name.toLowerCase());
    b.path = name;
  }
  return blocks;
}

export function parseContentBlocks(text = "") {
  const blocks = [];
  let lastIndex = 0;
  let match;
  FENCE_RE.lastIndex = 0;
  while ((match = FENCE_RE.exec(text))) {
    if (match.index > lastIndex) {
      blocks.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    const [, lang, path, code] = match;
    blocks.push({
      type: "code",
      lang: (lang || "").trim(),
      path: path ? path.trim() : "",
      value: code.replace(/\n$/, ""),
    });
    lastIndex = FENCE_RE.lastIndex;
  }
  if (lastIndex < text.length) blocks.push({ type: "text", value: text.slice(lastIndex) });
  if (!blocks.length) blocks.push({ type: "text", value: text });
  return autoPaths(blocks);
}

// The subset of code blocks that carry a real path — these are what the
// "download as ZIP" bundle is built from, so a single throwaway snippet
// with no path never triggers a zip offer.
export function extractFileBlocks(text = "") {
  return parseContentBlocks(text).filter((b) => b.type === "code" && b.path);
}

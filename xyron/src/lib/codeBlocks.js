// Splits a message's raw text into alternating "text" and "code" segments,
// the same fenced ```lang ... ``` blocks Xyron is instructed to use. A code
// fence can optionally carry a `path=` annotation right after the language
// (```jsx path=src/App.jsx) — see XYRON_MULTI_FILE_PROMPT in lib/persona.js
// — which is how a multi-file build is told apart from a single snippet.
const FENCE_RE = /```([\w.+-]*)[ \t]*(?:path=([^\n`]+))?[ \t]*\n([\s\S]*?)```/g;

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
  return blocks;
}

// The subset of code blocks that carry a real path — these are what the
// "download as ZIP" bundle is built from, so a single throwaway snippet
// with no path never triggers a zip offer.
export function extractFileBlocks(text = "") {
  return parseContentBlocks(text).filter((b) => b.type === "code" && b.path);
}

// Saves text as a file in the browser (no server round-trip).
export function downloadTextFile(path = "file.txt", text = "") {
  const name = path.split("/").pop() || "file.txt";
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Zip name from the shared top-level folder (e.g. "my-bot/src/a.js" -> "my-bot.zip").
export function zipNameFor(paths = []) {
  const roots = new Set(paths.map((p) => p.replace(/^\/+/, "").split("/")[0]));
  const multi = paths.every((p) => p.replace(/^\/+/, "").includes("/"));
  return roots.size === 1 && multi ? `${[...roots][0]}.zip` : "xyron-project.zip";
}

// File name for a code block that has no path of its own: "python" -> main.py, "html" -> index.html, "ts" -> code.ts ...
const EXT = {
  javascript: "js", js: "js", mjs: "js", cjs: "js", jsx: "jsx", typescript: "ts", ts: "ts", tsx: "tsx",
  python: "py", py: "py", html: "html", htm: "html", css: "css", scss: "scss", json: "json", xml: "xml", svg: "svg",
  bash: "sh", sh: "sh", shell: "sh", zsh: "sh", powershell: "ps1", ps1: "ps1", bat: "bat", cmd: "bat",
  sql: "sql", md: "md", markdown: "md", yaml: "yaml", yml: "yml", toml: "toml", txt: "txt", text: "txt",
  java: "java", kotlin: "kt", kt: "kt", swift: "swift", c: "c", cpp: "cpp", "c++": "cpp", cs: "cs", csharp: "cs",
  go: "go", rust: "rs", rs: "rs", php: "php", ruby: "rb", rb: "rb", dart: "dart", lua: "lua", r: "r", vue: "vue",
};
const BASE = { html: "index", py: "main", md: "README", json: "data", css: "styles", sql: "query", sh: "script", ps1: "script", bat: "script" };

export function codeFileName(lang = "", path = "") {
  const fromPath = String(path || "").split("/").pop();
  if (fromPath) return fromPath;
  const key = String(lang || "").toLowerCase().replace(/[^a-z0-9+#-]/g, "");
  const ext = EXT[key] || (key && key.length <= 6 ? key : "txt");
  return `${BASE[ext] || "code"}.${ext}`;
}

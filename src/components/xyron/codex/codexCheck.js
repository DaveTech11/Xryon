// ---------------------------------------------------------------------------
// Honest, static checks for an AI-written project. Nothing here runs the code.
//  - scanBalance():   brackets / strings / comments in JS, TS, CSS and Python
//  - checkProject():  wiring between files (HTML -> scripts/styles, imports, ids,
//                     package.json) so "looks fine, doesn't work" bugs are caught
// No imports on purpose: this file is unit-tested directly with Node.
// ---------------------------------------------------------------------------

const NODE_BUILTINS = new Set([
  "assert", "async_hooks", "buffer", "child_process", "cluster", "console", "constants", "crypto", "dgram", "diagnostics_channel",
  "dns", "domain", "events", "fs", "http", "http2", "https", "inspector", "module", "net", "os", "path", "perf_hooks", "process",
  "punycode", "querystring", "readline", "repl", "stream", "string_decoder", "sys", "timers", "tls", "trace_events", "tty", "url",
  "util", "v8", "vm", "wasi", "worker_threads", "zlib",
]);

const ext = (p = "") => (p.split(".").pop() || "").toLowerCase();
const dirOf = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/") + 1) : "");

function resolvePath(fromDir, ref) {
  const clean = String(ref).split("#")[0].split("?")[0];
  const parts = (clean.startsWith("/") ? clean.slice(1) : fromDir + clean.replace(/^\.\//, "")).split("/");
  const out = [];
  for (const part of parts) { if (part === "..") out.pop(); else if (part && part !== ".") out.push(part); }
  return out.join("/");
}

// ---------------------------------------------------------------------------
// Bracket / string / comment scanner
// ---------------------------------------------------------------------------
const OPEN = { "(": ")", "[": "]", "{": "}" };
const CLOSE = { ")": "(", "]": "[", "}": "{" };
const REGEX_PREV = new Set(["", "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^"]);
const REGEX_WORDS = new Set(["return", "typeof", "case", "in", "of", "delete", "void", "throw", "new", "else", "do"]);

// JSX text contains apostrophes ("don't"), which would look like unterminated strings. Skip those files.
export const looksLikeJsx = (code) => /<[A-Z][A-Za-z0-9.]*[\s/>]|<\/[a-zA-Z][\w.]*>\s*\)|return\s*\(\s*<|=>\s*\(?\s*<[a-zA-Z]/.test(code) && /\b(React|jsx|useState|className=)/.test(code);

// Returns null when the code looks balanced, otherwise a short human message.
export function scanBalance(code, kind = "js") {
  const src = String(code);
  if (kind === "py") return scanPython(src);
  const css = kind === "css";
  const stack = []; // entries: { ch, line } where ch is ( [ { or "T" (template ${ })
  let line = 1;
  let prevSig = ""; let prevWord = "";
  let i = 0;
  const n = src.length;
  const readTemplate = () => { // after an opening ` or the closing } of ${ }: scans template text
    while (i < n) {
      const c = src[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "\n") line++;
      if (c === "`") { i++; return true; }
      if (c === "$" && src[i + 1] === "{") { stack.push({ ch: "T", line }); i += 2; return false; }
      i++;
    }
    return "eof";
  };
  while (i < n) {
    const c = src[i];
    if (c === "\n") { line++; i++; continue; }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end < 0) return `Unclosed comment starting on line ${line}`;
      for (let k = i; k < end; k++) if (src[k] === "\n") line++;
      i = end + 2; continue;
    }
    if (!css && c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === '"' || c === "'") {
      const startLine = line; i++;
      for (;;) {
        if (i >= n || src[i] === "\n") { if (css && src[i - 1] === "\\") { i++; continue; } return `Unterminated string on line ${startLine}`; }
        if (src[i] === "\\") { if (src[i + 1] === "\n") line++; i += 2; continue; }
        if (src[i] === c) { i++; break; }
        i++;
      }
      prevSig = "s"; prevWord = ""; continue;
    }
    if (!css && c === "`") {
      i++; const startLine = line;
      const r = readTemplate();
      if (r === "eof") return `Unterminated template literal starting on line ${startLine}`;
      prevSig = "s"; prevWord = ""; continue;
    }
    if (!css && c === "/") {
      // regex literal or division?
      if (REGEX_PREV.has(prevSig) || (prevSig === "w" && REGEX_WORDS.has(prevWord))) {
        let j = i + 1; let inClass = false; let ok = false;
        while (j < n && src[j] !== "\n") {
          const d = src[j];
          if (d === "\\") { j += 2; continue; }
          if (d === "[") inClass = true; else if (d === "]") inClass = false;
          else if (d === "/" && !inClass) { ok = true; break; }
          j++;
        }
        if (ok) { i = j + 1; while (/[a-z]/i.test(src[i] || "")) i++; prevSig = "s"; prevWord = ""; continue; }
      }
      prevSig = "/"; prevWord = ""; i++; continue;
    }
    if (OPEN[c]) { stack.push({ ch: c, line }); prevSig = c; prevWord = ""; i++; continue; }
    if (CLOSE[c]) {
      const top = stack.pop();
      if (!top) return `Unexpected "${c}" on line ${line}`;
      if (top.ch === "T") {
        if (c !== "}") return `Mismatched "${c}" on line ${line} (the \${ opened on line ${top.line} needs a })`;
        i++; const r = readTemplate();
        if (r === "eof") return `Unterminated template literal near line ${top.line}`;
        prevSig = "s"; prevWord = ""; continue;
      }
      if (OPEN[top.ch] !== c) return `Mismatched "${c}" on line ${line} (the "${top.ch}" opened on line ${top.line} needs a "${OPEN[top.ch]}")`;
      prevSig = c; prevWord = ""; i++; continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    if (/[A-Za-z_$]/.test(c)) { let j = i; while (j < n && /[\w$]/.test(src[j])) j++; prevWord = src.slice(i, j); prevSig = "w"; i = j; continue; }
    if (/\d/.test(c)) { let j = i; while (j < n && /[\w.]/.test(src[j])) j++; prevSig = "s"; prevWord = ""; i = j; continue; }
    prevSig = c; prevWord = ""; i++;
  }
  const left = stack[stack.length - 1];
  if (left) return left.ch === "T" ? `Unclosed \${ in a template literal near line ${left.line}` : `Unclosed "${left.ch}" opened on line ${left.line}`;
  return null;
}

function scanPython(src) {
  const stack = []; let line = 1; let i = 0; const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "\n") { line++; i++; continue; }
    if (c === "#") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === '"' || c === "'") {
      const triple = src.startsWith(c.repeat(3), i);
      const startLine = line;
      if (triple) {
        const end = src.indexOf(c.repeat(3), i + 3);
        if (end < 0) return `Unterminated triple-quoted string starting on line ${startLine}`;
        for (let k = i; k < end; k++) if (src[k] === "\n") line++;
        i = end + 3; continue;
      }
      i++;
      for (;;) {
        if (i >= n || src[i] === "\n") return `Unterminated string on line ${startLine}`;
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === c) { i++; break; }
        i++;
      }
      continue;
    }
    if (OPEN[c]) stack.push({ ch: c, line });
    else if (CLOSE[c]) {
      const top = stack.pop();
      if (!top) return `Unexpected "${c}" on line ${line}`;
      if (OPEN[top.ch] !== c) return `Mismatched "${c}" on line ${line} (the "${top.ch}" opened on line ${top.line})`;
    }
    i++;
  }
  const left = stack[stack.length - 1];
  if (left) return `Unclosed "${left.ch}" opened on line ${left.line}`;
  // Python refuses files that mix tabs and spaces to indent the same block.
  const lines = src.split("\n");
  let tabs = 0; let spaces = 0;
  for (const l of lines) { if (/^\t+\S/.test(l)) tabs++; else if (/^ {2,}\S/.test(l)) spaces++; }
  if (tabs && spaces) return "Mixes tabs and spaces for indentation";
  return null;
}

// ---------------------------------------------------------------------------
// Whole-project wiring checks
// ---------------------------------------------------------------------------
const isRemote = (ref) => !ref || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref);
const JS_EXTS = ["", ".js", ".mjs", ".cjs", ".json", ".jsx", ".ts", ".tsx", "/index.js", "/index.mjs", "/index.cjs", "/index.ts"];

function pkgName(spec) {
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

// -> [{ path, severity: "error" | "note", message }]. Only "error" items are worth sending back to the AI.
export function checkProject(files = []) {
  const problems = [];
  const add = (path, message, severity = "error") => problems.push({ path, message, severity });
  const byPath = new Map(files.map((f) => [f.path, f]));
  const has = (p) => byPath.has(p);
  const htmlFiles = files.filter((f) => /\.html?$/i.test(f.path));
  const jsFiles = files.filter((f) => /\.(m?js|cjs|jsx|ts|tsx)$/i.test(f.path));
  const pkgFile = byPath.get("package.json");
  let pkg = null;
  if (pkgFile) { try { pkg = JSON.parse(pkgFile.value); } catch { /* reported as a JSON syntax error elsewhere */ } }

  // 1) HTML pages: every local script / stylesheet / linked page must exist
  for (const h of htmlFiles) {
    const base = dirOf(h.path);
    const html = h.value.replace(/<!--[\s\S]*?-->/g, "");
    const refs = [];
    for (const m of html.matchAll(/<script\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) refs.push(["script", m[1]]);
    for (const m of html.matchAll(/<link\b[^>]*?>/gi)) {
      if (!/rel\s*=\s*["']?(?:stylesheet|manifest|icon|shortcut icon)/i.test(m[0])) continue;
      const href = (m[0].match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
      if (href) refs.push(["link", href]);
    }
    for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"'#]+\.html?)(?:[?#][^"']*)?["']/gi)) refs.push(["page", m[1]]);
    for (const [kind, ref] of refs) {
      if (isRemote(ref)) continue;
      const target = resolvePath(base, ref);
      if (!has(target)) add(h.path, `${h.path} ${kind === "script" ? "loads the script" : kind === "link" ? "links the file" : "links to the page"} "${ref}", but ${target} is not in the project.`);
    }
  }

  // 2) JS that looks up element ids the HTML never defines
  if (htmlFiles.length && jsFiles.length) {
    const allText = [...htmlFiles, ...jsFiles].map((f) => f.value).join("\n");
    const defined = (id) => {
      const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\bid\\s*=\\s*\\\\?["']?${esc}(?=[\\s"'>\\\\/])`, "i").test(allText)
        || new RegExp(`\\.id\\s*=\\s*["'\`]${esc}["'\`]`).test(allText)
        || new RegExp(`\\bid\\s*:\\s*["'\`]${esc}["'\`]`).test(allText)
        || new RegExp(`setAttribute\\(\\s*["']id["']\\s*,\\s*["'\`]${esc}["'\`]`).test(allText)
        || new RegExp(`\\bid\\s*=\\s*\\\\?["'][^"']*\\$\\{`).test(allText);
    };
    for (const j of jsFiles) {
      const seen = new Set();
      for (const m of j.value.matchAll(/getElementById\(\s*["']([\w-]+)["']\s*\)/g)) {
        if (seen.has(m[1])) continue; seen.add(m[1]);
        if (!defined(m[1])) add(j.path, `${j.path} calls getElementById("${m[1]}"), but no element with id="${m[1]}" exists in the HTML.`);
      }
    }
  }

  // 3) Node / module projects
  const noHtml = htmlFiles.length === 0;
  if (pkg) {
    const main = typeof pkg.main === "string" ? resolvePath("", pkg.main) : "";
    if (main && !has(main)) add("package.json", `package.json "main" points to ${main}, which is not in the project.`);
    const start = pkg.scripts && typeof pkg.scripts.start === "string" ? pkg.scripts.start : "";
    const sm = start.match(/^\s*(?:node|nodemon|tsx|ts-node|bun)\s+(?:--[\w-]+(?:=\S+)?\s+)*([^\s&|;]+)/);
    if (sm && /\.(m?js|cjs|ts)$/i.test(sm[1])) {
      const target = resolvePath("", sm[1]);
      if (!has(target)) add("package.json", `The start script runs ${target}, but that file is not in the project.`);
    }
  }
  const deps = pkg ? { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.optionalDependencies || {}) } : null;
  const plainJs = jsFiles.filter((f) => /\.(m?js|cjs)$/i.test(f.path));
  for (const j of jsFiles) {
    const base = dirOf(j.path);
    const code = j.value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const specs = [];
    for (const m of code.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)) specs.push(m[1]);
    for (const m of code.matchAll(/^\s*(?:import|export)\s[^'"\n]*?\bfrom\s*["']([^"']+)["']/gm)) specs.push(m[1]);
    for (const m of code.matchAll(/^\s*import\s*["']([^"']+)["']/gm)) specs.push(m[1]);
    const done = new Set();
    for (const spec of specs) {
      if (done.has(spec)) continue; done.add(spec);
      if (spec.startsWith(".") || spec.startsWith("/")) {
        const target = resolvePath(base, spec);
        if (!JS_EXTS.some((e) => has(target + e)) && !/\.(css|svg|png|jpe?g|gif|webp|html?)$/i.test(spec)) add(j.path, `${j.path} imports "${spec}", but ${target} is not in the project.`);
      } else if (noHtml && deps && !spec.startsWith("node:") && !spec.startsWith("@/") && !spec.startsWith("~")) {
        const name = pkgName(spec);
        if (!NODE_BUILTINS.has(name) && !(name in deps)) add(j.path, `${j.path} uses the package "${name}", but it is not listed in package.json dependencies.`);
      }
    }
  }
  // CommonJS vs ES modules must agree with package.json "type"
  if (pkg && noHtml) {
    const isModule = pkg.type === "module";
    for (const j of plainJs.filter((f) => /\.js$/i.test(f.path))) {
      const usesImport = /^\s*(?:import\s[^(]*?from\s*["']|import\s*["']|export\s+(?:default|const|function|class|async|\{))/m.test(j.value);
      const usesRequire = /\b(?:require\(|module\.exports\b)/.test(j.value);
      if (usesImport && usesRequire) continue;
      if (usesImport && !isModule) add(j.path, `${j.path} uses import/export, but package.json has no "type": "module", so Node will reject it. Add "type": "module" or use require().`);
      else if (usesRequire && isModule) add(j.path, `${j.path} uses require()/module.exports, but package.json sets "type": "module", so Node will reject it. Use import/export or remove "type".`);
    }
  }
  // Node project with third-party imports and no package.json
  if (!pkg && noHtml && plainJs.length) {
    const third = new Set();
    for (const j of plainJs) {
      for (const m of j.value.matchAll(/\brequire\(\s*["']([^./][^"']*)["']\s*\)|^\s*import\s[^'"\n]*?from\s*["']([^./][^"']*)["']/gm)) {
        const name = pkgName(m[1] || m[2]);
        if (!NODE_BUILTINS.has(name) && !name.startsWith("node:")) third.add(name);
      }
    }
    if (third.size) add("package.json", `The project uses ${[...third].slice(0, 4).join(", ")} but has no package.json to install ${third.size === 1 ? "it" : "them"}.`);
  }

  // 4) Python: third-party imports need a requirements.txt
  const pyFiles = files.filter((f) => /\.py$/i.test(f.path));
  if (pyFiles.length && !has("requirements.txt")) {
    const third = new Set();
    const PY_STD = /^(os|sys|re|json|math|random|time|datetime|collections|itertools|functools|pathlib|typing|dataclasses|argparse|logging|subprocess|threading|asyncio|csv|sqlite3|unittest|copy|string|io|hashlib|base64|uuid|shutil|tempfile|urllib|http|socket|struct|heapq|bisect|enum|abc|contextlib|traceback|statistics|decimal|fractions|textwrap|glob|operator|queue|signal|platform|secrets|zipfile|gzip|pickle|html|xml|email|smtplib|ssl|select|configparser|getpass|inspect|warnings|weakref|__future__|tkinter|turtle|curses|pprint|calendar|zoneinfo|concurrent|multiprocessing|ctypes|array|numbers|cmath|timeit|cProfile|pdb|doctest|difflib|fnmatch|linecache|locale|gettext|codecs|unicodedata|stat|errno|atexit|gc|sched|webbrowser|wave|colorsys|imaplib|ftplib|telnetlib|xmlrpc|mimetypes|binascii|shlex|readline|cmd|code|dis|ast|token|tokenize|keyword|types|builtins|site|sysconfig|venv|zipapp|runpy|importlib|pkgutil|modulefinder|trace|tracemalloc|faulthandler|selectors|mmap|ipaddress|secrets|hmac|graphlib|tomllib)$/;
    const local = new Set(pyFiles.map((f) => f.path.split("/").pop().replace(/\.py$/, "")));
    for (const f of pyFiles) {
      for (const m of f.value.matchAll(/^\s*(?:import|from)\s+([A-Za-z_][\w]*)/gm)) {
        if (!PY_STD.test(m[1]) && !local.has(m[1])) third.add(m[1]);
      }
    }
    if (third.size) add("requirements.txt", `The code imports ${[...third].slice(0, 4).join(", ")} but there is no requirements.txt listing ${third.size === 1 ? "it" : "them"}.`);
  }

  // 5) Environment variables read in code deserve a .env.example (a note, not a failure)
  const readsEnv = files.some((f) => /\.(m?js|cjs|ts)$/i.test(f.path) && /process\.env\.[A-Z_]{3,}/.test(f.value)) || pyFiles.some((f) => /os\.(environ|getenv)/.test(f.value));
  if (readsEnv && !files.some((f) => /(^|\/)\.env\.example$/.test(f.path))) add(".env.example", "The code reads environment variables but there is no .env.example showing which ones.", "note");

  return problems;
}

// "The model wrote a file name in its PLAN that it never wrote." Used to detect a reply that stopped early.
const PLAN_FILE_RE = /(?:^|[\s`"'(])((?:[\w.-]+\/)*(?:\.env\.example|[\w.-]+\.(?:html?|css|m?js|cjs|jsx|tsx?|json|py|md|txt|ya?ml|sh|sql)))(?=$|[\s`"'),.:;])/gi;
export function plannedFiles(plan = []) {
  const out = new Set();
  for (const line of plan) for (const m of String(line).matchAll(PLAN_FILE_RE)) out.add(m[1].replace(/^\.\//, ""));
  return [...out];
}

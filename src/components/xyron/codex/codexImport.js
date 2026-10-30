import JSZip from "jszip";

// Safe project import for Codex. Files are only READ as text and handed to the
// editor. Nothing here executes uploaded code.

export const IMPORT_LIMITS = {
  maxZipBytes: 10 * 1024 * 1024, // compressed upload
  maxTotalBytes: 5 * 1024 * 1024, // extracted text, all files
  maxFileBytes: 1024 * 1024, // one file
  maxFiles: 200,
  maxDepth: 8,
};

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".cache", "__pycache__", ".venv", "venv", "coverage", ".idea", ".vscode"]);

const EXT_LANG = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "jsx",
  ts: "typescript", tsx: "typescript", json: "json", html: "html", htm: "html",
  css: "css", scss: "css", py: "python", sh: "bash",
};
const TEXT_EXT = new Set([
  ...Object.keys(EXT_LANG), "md", "txt", "yml", "yaml", "toml", "ini", "cfg", "xml", "svg", "lock", "gitignore", "env.example",
]);
const TEXT_NAMES = new Set(["Dockerfile", "Procfile", "Makefile", "LICENSE", "README", ".gitignore", ".npmrc", ".nvmrc", ".env.example"]);

export function languageFor(name = "") {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return EXT_LANG[ext] || "javascript";
}

function isSecretName(base) {
  const b = base.toLowerCase();
  return (b === ".env" || (b.startsWith(".env.") && b !== ".env.example") || b.endsWith(".pem") || b.endsWith(".key") || b === "id_rsa" || b === "credentials.json");
}

function isTextName(base) {
  if (TEXT_NAMES.has(base)) return true;
  const ext = base.includes(".") ? base.split(".").pop().toLowerCase() : "";
  return TEXT_EXT.has(ext);
}

// Returns a cleaned relative path, or null if the path is unsafe.
export function safePath(raw = "") {
  const p = String(raw).replace(/\\/g, "/");
  if (!p || p.includes("\0") || p.startsWith("/") || /^[a-zA-Z]:/.test(p)) return null;
  const parts = p.split("/").filter((s) => s !== "" && s !== ".");
  if (!parts.length || parts.some((s) => s === "..")) return null;
  return parts.join("/");
}

function judge(path, size, state) {
  const parts = path.split("/");
  const base = parts[parts.length - 1];
  if (parts.length > IMPORT_LIMITS.maxDepth) return "folder nesting too deep";
  if (parts.slice(0, -1).some((d) => SKIP_DIRS.has(d))) return "generated or dependency folder (skipped)";
  if (isSecretName(base)) return "looks like a secret or credential file (skipped)";
  if (!isTextName(base)) return "unsupported file type";
  if (size > IMPORT_LIMITS.maxFileBytes) return "file too large";
  if (state.count >= IMPORT_LIMITS.maxFiles) return "file limit reached";
  return null;
}

/**
 * @param {File[]} fileList files picked or dropped by the user
 * @returns {{projectName:string, files:{name:string,language:string,content:string}[], rejected:{name:string,reason:string}[], fatal?:string}}
 */
export async function importFiles(fileList) {
  const picked = Array.from(fileList || []);
  const files = [];
  const rejected = [];
  const state = { count: 0, bytes: 0 };
  let projectName = "imported";

  const accept = (path, content) => {
    state.count += 1;
    state.bytes += content.length;
    files.push({ name: path, language: languageFor(path), content });
  };

  for (const f of picked) {
    const isZip = /\.zip$/i.test(f.name);
    if (!isZip) {
      const path = safePath(f.name);
      if (!path) { rejected.push({ name: f.name, reason: "unsafe file name" }); continue; }
      const why = judge(path, f.size, state);
      if (why) { rejected.push({ name: f.name, reason: why }); continue; }
      if (state.bytes + f.size > IMPORT_LIMITS.maxTotalBytes) { rejected.push({ name: f.name, reason: "total size limit reached" }); continue; }
      accept(path, await f.text());
      if (picked.length === 1) projectName = path.replace(/\.[^.]+$/, "");
      continue;
    }

    if (f.size > IMPORT_LIMITS.maxZipBytes) {
      return { projectName, files, rejected, fatal: `"${f.name}" is larger than ${IMPORT_LIMITS.maxZipBytes / 1024 / 1024} MB.` };
    }
    let zip;
    try {
      zip = await JSZip.loadAsync(f);
    } catch {
      return { projectName, files, rejected, fatal: `"${f.name}" is not a valid ZIP archive.` };
    }
    projectName = f.name.replace(/\.zip$/i, "");

    const entries = Object.values(zip.files).filter((e) => !e.dir);
    // Drop a single shared top-level folder so paths stay short.
    const cleaned = entries.map((e) => ({ entry: e, path: safePath(e.name) }));
    const bad = cleaned.filter((c) => !c.path);
    if (bad.length) {
      return { projectName, files, rejected, fatal: `Rejected "${f.name}": it contains unsafe paths (for example "../" or absolute paths).` };
    }
    const tops = new Set(cleaned.map((c) => c.path.split("/")[0]));
    const strip = tops.size === 1 && cleaned.every((c) => c.path.includes("/"));
    if (strip) projectName = [...tops][0];

    for (const { entry, path } of cleaned) {
      const rel = strip ? path.split("/").slice(1).join("/") : path;
      // jszip exposes the declared size on an internal field; it is only used as a pre-check.
      const declared = /** @type {any} */ (entry)._data?.uncompressedSize ?? 0;
      const why = judge(rel, declared, state);
      if (why) { rejected.push({ name: rel, reason: why }); continue; }
      if (state.bytes + declared > IMPORT_LIMITS.maxTotalBytes) {
        return { projectName, files, rejected, fatal: "The extracted project is larger than the 5 MB limit." };
      }
      const content = await entry.async("string");
      // Real size check after reading, in case the declared size was wrong.
      if (content.length > IMPORT_LIMITS.maxFileBytes) { rejected.push({ name: rel, reason: "file too large" }); continue; }
      if (state.bytes + content.length > IMPORT_LIMITS.maxTotalBytes) {
        return { projectName, files, rejected, fatal: "The extracted project is larger than the 5 MB limit." };
      }
      if (content.includes("\0")) { rejected.push({ name: rel, reason: "binary content" }); continue; }
      accept(rel, content);
    }
  }

  return { projectName, files, rejected };
}

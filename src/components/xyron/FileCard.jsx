import React, { useMemo, useState } from "react";
import { ChevronDown, Download, FileArchive, FileCode2, Loader2, Play } from "lucide-react";
import { downloadTextFile, zipNameFor } from "../../lib/downloadFile";
import CodeSandbox from "./CodeSandbox";

// File cards for code Xyron writes (blocks tagged `path=...`).
//   one file   -> one card: [file icon]  name / "JSX · 24 lines"   [Download]
//   many files -> one ZIP card: [zip icon] "Project name" / "ZIP · 5 files" [Download],
//                 with the individual files tucked under "Show files".
// Tapping a card (not the button) opens the file in the code viewer.

const baseName = (path) => String(path || "").split("/").pop() || "file";
const extOf = (path) => (baseName(path).includes(".") ? baseName(path).split(".").pop().toUpperCase() : "FILE");
const lineCount = (value) => (value ? value.split("\n").length : 0);

function prettyZipTitle(zipName) {
  const stem = zipName.replace(/\.zip$/i, "").replace(/[-_]+/g, " ").trim() || "Xyron project";
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

export async function buildZip(files, folder = "") {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  files.forEach((f) => zip.file(`${folder ? folder + "/" : ""}${f.path.replace(/^\/+/, "")}`, f.value));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

// ZIP mode: the person attached a ZIP project, so the download is THEIR project with the
// files Xyron wrote/changed merged in (Xyron only has to write what changed). If the original
// can't be fetched any more, falls back to a ZIP of just Xyron's files.
export async function buildMergedZip(sourceUrl, files) {
  const { default: JSZip } = await import("jszip");
  let zip;
  let merged = true;
  try {
    const res = await fetch(sourceUrl, { credentials: "include" });
    if (!res.ok) throw new Error("original unavailable");
    zip = await JSZip.loadAsync(await res.arrayBuffer());
  } catch {
    zip = new JSZip();
    merged = false;
  }
  const names = Object.keys(zip.files).filter((n) => !/(^|\/)__MACOSX\//.test(n));
  const tops = new Set(names.map((n) => n.split("/")[0]));
  const only = tops.size === 1 ? [...tops][0] : null;
  const root = only && names.some((n) => n.startsWith(only + "/")) ? only + "/" : "";
  files.forEach((f) => {
    let path = f.path.replace(/^(\.?\/)+/, "");
    if (root && !path.startsWith(root)) path = root + path;
    zip.file(path, f.value);
  });
  return { blob: await zip.generateAsync({ type: "blob", compression: "DEFLATE" }), merged, name: `${root ? root.slice(0, -1) : "xyron-project"}-updated.zip` };
}


// Run button support: works out what the sandbox should run for a set of files.
//   HTML project -> index.html (or the first .html) with its local .css / .js files inlined, so it previews like a real page
//   one JS file  -> runs as a script
//   Python       -> main.py (or the first .py) with the other files available to import
// Anything else (React/Vite/Node projects, etc.) has no Run button; it needs a real build, so Download is the way.
const clean = (p) => String(p || "").replace(/^(\.?\/)+/, "");
function findFile(files, ref) {
  const want = clean(ref).split(/[?#]/)[0];
  return files.find((f) => clean(f.path) === want) || files.find((f) => baseName(f.path) === baseName(want));
}
export function prepareRun(files) {
  const lower = (f) => clean(f.path).toLowerCase();
  const html = files.find((f) => /(^|\/)index\.html?$/.test(lower(f))) || files.find((f) => /\.html?$/.test(lower(f)));
  if (html) {
    let doc = html.value;
    doc = doc.replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, (tag) => {
      const href = (tag.match(/href=["']([^"']+)["']/i) || [])[1];
      const f = href && !/^(https?:)?\/\//i.test(href) ? findFile(files, href) : null;
      return f ? `<style>${f.value}</style>` : tag;
    });
    doc = doc.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, a, src, b) => {
      const f = !/^(https?:)?\/\//i.test(src) ? findFile(files, src) : null;
      return f ? `<script${a}${b}>${f.value.replace(/<\/script/gi, "<\\/script")}</script>` : tag;
    });
    return { lang: "html", value: doc };
  }
  const py = files.filter((f) => /\.py$/.test(lower(f)));
  if (py.length) {
    const entry = py.find((f) => /(^|\/)(main|app|index)\.py$/.test(lower(f))) || py[0];
    return { lang: "python", value: entry.value, files: files.filter((f) => /\.py$/.test(lower(f))).map((f) => ({ path: clean(f.path), value: f.value })), entry: clean(entry.path) };
  }
  const js = files.length === 1 && /\.(js|mjs)$/.test(lower(files[0])) && !/\b(require\(|import\s.+from|export\s)/.test(files[0].value) ? files[0] : null;
  if (js) return { lang: "js", value: js.value };
  return null;
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function Card({ icon: Icon, title, subtitle, onOpen, onDownload, onRun = null, busy = false, compact = false }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border border-white/10 bg-[#1e1e20] text-left ${compact ? "p-2" : "p-2.5 sm:p-3"} ${onOpen ? "cursor-pointer transition hover:bg-[#252528]" : ""}`}
      onClick={onOpen}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={onOpen ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } } : undefined}
    >
      {/* thumbnail: a little "page" with the file-type icon at its foot */}
      <div className={`relative grid shrink-0 place-items-end justify-items-center overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-[#2b2b2e] to-[#202022] pb-2 ${compact ? "h-11 w-10" : "h-14 w-12 sm:h-16 sm:w-14"}`}>
        <Icon className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} text-neutral-400`} strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={`truncate font-medium text-white ${compact ? "text-[13px]" : "text-sm sm:text-[15px]"}`}>{title}</div>
        <div className="mt-0.5 truncate text-xs uppercase tracking-wide text-neutral-500">{subtitle}</div>
      </div>
      {onRun && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRun(); }}
          aria-label={`Run ${title} in sandbox`}
          title="Run in sandbox"
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/25 active:scale-95"
        >
          <Play className="h-4 w-4" />
          <span className="hidden sm:inline">Run</span>
        </button>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDownload?.(); }}
        disabled={busy}
        aria-label={`Download ${title}`}
        className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-white/20 active:scale-95 disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 sm:hidden" />}
        <span className={busy ? "" : "hidden sm:inline"}>{busy ? "Building…" : "Download"}</span>
      </button>
    </div>
  );
}

// files: [{ path, value, index }] — `index` is the block's position in the message,
// handed back through onView so the caller can open its code viewer.
export default function FileCards({ files = [], onView, zipSource = null, projectName = "" }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [sandbox, setSandbox] = useState(false);
  const runPrep = useMemo(() => (zipSource ? null : prepareRun(files)), [files, zipSource]);
  const onRun = runPrep ? () => setSandbox(true) : null;
  const sandboxView = sandbox && runPrep ? <CodeSandbox lang={runPrep.lang} value={runPrep.value} files={runPrep.files || []} entry={runPrep.entry || ""} onClose={() => setSandbox(false)} /> : null;

  if (!files.length) return null;

  // ZIP mode (a ZIP project was attached): one complete, updated ZIP — even for a single changed file.
  if (zipSource) {
    const downloadProject = async () => {
      if (busy) return;
      setBusy(true);
      setError(false);
      try {
        const { blob, merged, name } = await buildMergedZip(zipSource, files);
        saveBlob(blob, name);
        if (!merged) setError(true);
      } catch (e) { console.error("Failed to build zip:", e); setError(true); }
      setBusy(false);
    };
    return (
      <div className="my-2">
        <Card
          icon={FileArchive}
          title="Updated project"
          subtitle={`ZIP · complete project · ${files.length} ${files.length === 1 ? "file" : "files"} added or changed`}
          onDownload={downloadProject}
          busy={busy}
        />
        {error && <p className="mt-1.5 text-[11px] text-neutral-400">Couldn&apos;t merge with your original ZIP, so this download only has the files Xyron wrote. Re-attach your ZIP and ask again for the full project.</p>}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-1.5 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-neutral-500 transition hover:bg-white/5 hover:text-neutral-200"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
          {open ? "Hide changed files" : `Show ${files.length} changed ${files.length === 1 ? "file" : "files"}`}
        </button>
        {open && (
          <div className="mt-1 space-y-1.5">
            {files.map((f) => (
              <Card key={f.path + f.index} compact icon={FileCode2} title={f.path.replace(/^\/+/, "")} subtitle={`${extOf(f.path)} · ${lineCount(f.value)} lines`} onOpen={() => onView?.(f.index)} onDownload={() => downloadTextFile(f.path, f.value)} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // No ZIP attached: one file -> its own card; two or more -> ONE "Download as ZIP" card (below).
  if (files.length === 1) {
    const f = files[0];
    return (
      <div className="my-2">
        <Card
          icon={FileCode2}
          title={baseName(f.path)}
          subtitle={`${extOf(f.path)} · ${lineCount(f.value)} lines`}
          onOpen={() => onView?.(f.index)}
          onDownload={() => downloadTextFile(f.path, f.value)}
          onRun={onRun}
        />
        {sandboxView}
      </div>
    );
  }

  // A Codex-style project (PROJECT: name) is zipped as name.zip that unpacks into one folder called name/, like the Codex studio does.
  const zipName = projectName ? `${projectName}.zip` : zipNameFor(files.map((f) => f.path));
  const sharedRoot = files.every((f) => f.path.replace(/^\/+/, "").includes("/")) && new Set(files.map((f) => f.path.replace(/^\/+/, "").split("/")[0])).size === 1;
  const downloadZip = async () => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try { saveBlob(await buildZip(files, projectName && !sharedRoot ? projectName : ""), zipName); }
    catch (e) { console.error("Failed to build zip:", e); setError(true); }
    setBusy(false);
  };

  return (
    <div className="my-2">
      <Card
        icon={FileArchive}
        title={prettyZipTitle(zipName)}
        subtitle={`ZIP · ${files.length} files`}
        onDownload={downloadZip}
        onRun={onRun}
        busy={busy}
      />
      {sandboxView}
      {error && <p className="mt-1.5 text-[11px] text-neutral-400">Couldn&apos;t build the ZIP. Download the files one by one instead.</p>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-1.5 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-neutral-500 transition hover:bg-white/5 hover:text-neutral-200"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
        {open ? "Hide files" : `Show ${files.length} files`}
      </button>
      {open && (
        <div className="mt-1 space-y-1.5">
          {files.map((f) => (
            <Card
              key={f.path + f.index}
              compact
              icon={FileCode2}
              title={f.path.replace(/^\/+/, "")}
              subtitle={`${extOf(f.path)} · ${lineCount(f.value)} lines`}
              onOpen={() => onView?.(f.index)}
              onDownload={() => downloadTextFile(f.path, f.value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

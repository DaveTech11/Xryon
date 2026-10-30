import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DevToolsHub from "./brain/DevToolsHub";
import { downloadTextFile } from "../lib/downloadFile";
import { ItemsView, TasksView, SearchAllView, QuestionsView, ConceptsView, ReviewView, exportBrain, importBrain } from "./brain/BrainTools";
import {
  ArrowLeft, BookOpen, Bookmark, Check, CheckCircle2, ChevronDown, ChevronLeft, Compass, Download, ExternalLink, FileText, Filter,
  FolderOpen, Github, HelpCircle, History, Layers, LayoutGrid, Library, Loader2, Menu, MoreHorizontal, Network, Pencil,
  Plus, Scale, Search, Star, Table2, Upload, Wrench, X,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Xyron Brain: developer workspace. Projects, sources and code come   */
/* straight from GitHub (public API, optional token for private repos). */
/* Everything you annotate is saved locally in this browser.            */
/* ------------------------------------------------------------------ */

const GH = "https://api.github.com";
const SERIF = { fontFamily: "'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif" };
const LS = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
};

const NAV = [
  { group: null, items: [
    { key: "projects", label: "Projects", icon: LayoutGrid },
    { key: "method", label: "Methodology", icon: Compass },
    { key: "devtools", label: "Dev Tools", icon: Wrench },
  ] },
  { group: "project", items: [{ key: "home", label: "Project Home", icon: FolderOpen, badge: "GITHUB" }] },
  { group: "Build the project", items: [
    { key: "sources", label: "Sources", icon: BookOpen, badge: "GITHUB" },
    { key: "matrix", label: "Code Matrix", icon: Table2 },
    { key: "synthesis", label: "Synthesis", icon: Layers },
    { key: "concepts", label: "Concepts & Relations", icon: Network },
    { key: "prep", label: "Preparation", icon: CheckCircle2 },
  ] },
  { group: "Step back and review", items: [
    { key: "questions", label: "Open Questions", icon: HelpCircle },
    { key: "journey", label: "Project Journey", icon: History },
    { key: "review", label: "Project Review", icon: Star },
  ] },
  { group: "Library", bottom: true, items: [
    { key: "all", label: "All Sources", icon: Library },
    { key: "collections", label: "Collections", icon: Bookmark },
  ] },
];

const STATUS = {
  integrated: { label: "Integrated", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  reading: { label: "Reading", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  unread: { label: "To read", cls: "border-white/15 bg-white/5 text-neutral-400" },
};

const CODE_EXT = new Set(["js", "jsx", "mjs", "cjs", "ts", "tsx", "json", "html", "css", "scss", "py", "sh", "md", "txt", "yml", "yaml", "toml", "go", "rs", "java", "kt", "swift", "rb", "php", "c", "h", "cpp", "cs", "sql", "vue", "svelte", "xml", "env.example"]);
const SKIP = /(^|\/)(node_modules|\.git|dist|build|\.next|\.cache|__pycache__|venv|\.venv|coverage|\.idea|\.vscode)\//;
const SECRET = /(^|\/)(\.env(\..*)?|.*\.pem|.*\.key|id_rsa|credentials\.json)$/i;

const extOf = (p) => (p.includes(".") ? p.split(".").pop().toLowerCase() : "");
const baseOf = (p) => p.split("/").pop();
const topOf = (p) => (p.includes("/") ? p.split("/")[0] : "(root)");
const fmtSize = (n = 0) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n > 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);
const ago = (d) => {
  if (!d) return "";
  const days = Math.round((Date.now() - new Date(d).getTime()) / 86400000);
  return days < 1 ? "today" : days < 30 ? `${days}d ago` : days < 365 ? `${Math.round(days / 30)}mo ago` : `${Math.round(days / 365)}y ago`;
};

function parseTarget(input) {
  const t = input.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/^@/, "").replace(/\/+$/, "");
  const parts = t.split("/").filter(Boolean);
  if (parts.length >= 2) return { repo: `${parts[0]}/${parts[1]}` };
  if (parts.length === 1) return { user: parts[0] };
  return {};
}

export default function XyronIntelligence() {
  const nav = useNavigate();
  const [view, setView] = useState(() => LS.get("xb_view", "projects"));
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [repos, setRepos] = useState(() => LS.get("xb_repos", []));
  const [repoName, setRepoName] = useState(() => LS.get("xb_repo", ""));
  const [files, setFiles] = useState({}); // full_name -> [{path,size,sha}]
  const [meta, setMeta] = useState({}); // full_name -> {commits, issues, readme}
  const [notes, setNotes] = useState(() => LS.get("xb_notes", {}));
  const [token, setToken] = useState(() => LS.get("xb_token", ""));
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [banner, setBanner] = useState(() => LS.get("xb_banner", true));
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState({ status: [], ext: [], collection: "" });
  const [filterOpen, setFilterOpen] = useState(false);
  const [selPath, setSelPath] = useState("");
  const [mobileDetail, setMobileDetail] = useState(false);
  const [saved, setSaved] = useState(true);
  const [brainKey, setBrainKey] = useState(0);

  const repo = useMemo(() => repos.find((r) => r.full_name === repoName) || null, [repos, repoName]);
  const list = repo ? files[repo.full_name] || [] : [];

  useEffect(() => { LS.set("xb_view", view); }, [view]);
  useEffect(() => { LS.set("xb_repos", repos); }, [repos]);
  useEffect(() => { LS.set("xb_repo", repoName); }, [repoName]);
  useEffect(() => { LS.set("xb_token", token); }, [token]);
  useEffect(() => { LS.set("xb_notes", notes); setSaved(true); }, [notes]);

  const headers = useMemo(() => {
    const h = { Accept: "application/vnd.github+json" };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  const gh = useCallback(async (path, opts = {}) => {
    const r = await fetch(path.startsWith("http") ? path : GH + path, { headers: { ...headers, ...(opts.headers || {}) } });
    if (!r.ok) {
      if (r.status === 403 || r.status === 429) throw new Error("GitHub rate limit reached. Add a token in Import to raise it.");
      if (r.status === 404) throw new Error("Not found. If it is private, add a token with repo access.");
      throw new Error(`GitHub error ${r.status}`);
    }
    return opts.text ? r.text() : r.json();
  }, [headers]);

  const importFrom = async (input) => {
    setError(""); setLoading("Importing from GitHub…");
    try {
      const t = parseTarget(input);
      let incoming = [];
      if (t.repo) incoming = [await gh(`/repos/${t.repo}`)];
      else if (t.user) {
        try { incoming = await gh(`/users/${t.user}/repos?per_page=100&sort=updated`); }
        catch (e) { if (token) incoming = await gh(`/user/repos?per_page=100&sort=updated`); else throw e; }
      } else throw new Error("Enter a GitHub username, owner/repo, or a github.com link.");
      const slim = incoming.map((r) => ({
        full_name: r.full_name, name: r.name, description: r.description, language: r.language, stars: r.stargazers_count,
        updated: r.pushed_at || r.updated_at, branch: r.default_branch, url: r.html_url, private: r.private, issues: r.open_issues_count,
      }));
      setRepos((prev) => [...slim, ...prev.filter((p) => !slim.some((s) => s.full_name === p.full_name))]);
      if (slim.length === 1) { setRepoName(slim[0].full_name); setView("sources"); }
      else setView("projects");
      setImportOpen(false);
    } catch (e) { setError(e.message); }
    setLoading("");
  };

  const loadRepo = useCallback(async (r) => {
    if (!r || files[r.full_name]) return;
    setLoading("Loading code…"); setError("");
    try {
      const tree = await gh(`/repos/${r.full_name}/git/trees/${encodeURIComponent(r.branch || "HEAD")}?recursive=1`);
      const out = (tree.tree || [])
        .filter((n) => n.type === "blob" && !SKIP.test(n.path + "") && !SECRET.test(n.path) && (CODE_EXT.has(extOf(n.path)) || /^(Dockerfile|Procfile|Makefile|LICENSE)$/.test(baseOf(n.path))))
        .map((n) => ({ path: n.path, size: n.size || 0, sha: n.sha }))
        .slice(0, 600);
      setFiles((f) => ({ ...f, [r.full_name]: out }));
    } catch (e) { setError(e.message); }
    setLoading("");
  }, [files, gh]);

  const loadMeta = useCallback(async (r) => {
    if (!r || meta[r.full_name]) return;
    const [commits, issues] = await Promise.all([
      gh(`/repos/${r.full_name}/commits?per_page=30`).catch(() => []),
      gh(`/repos/${r.full_name}/issues?state=open&per_page=30`).catch(() => []),
    ]);
    let readme = "";
    try { readme = await gh(`/repos/${r.full_name}/readme`, { text: true, headers: { Accept: "application/vnd.github.raw" } }); } catch { /* no readme */ }
    setMeta((m) => ({ ...m, [r.full_name]: { commits, issues: issues.filter((i) => !i.pull_request), readme } }));
  }, [meta, gh]);

  useEffect(() => { if (repo) { loadRepo(repo); loadMeta(repo); } }, [repo]); // eslint-disable-line react-hooks/exhaustive-deps

  const keyOf = (path) => `${repoName}:${path}`;
  const noteOf = (path) => notes[keyOf(path)] || {};
  const patchNote = (path, patch) => { setSaved(false); setNotes((n) => ({ ...n, [keyOf(path)]: { ...(n[keyOf(path)] || {}), ...patch } })); };
  const statusOf = (path) => noteOf(path).status || "unread";
  const collsOf = (f) => [topOf(f.path), ...(noteOf(f.path).collections || [])];

  const allCollections = useMemo(() => {
    const m = new Map();
    list.forEach((f) => collsOf(f).forEach((c) => m.set(c, (m.get(c) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [list, notes]); // eslint-disable-line react-hooks/exhaustive-deps

  const exts = useMemo(() => [...new Set(list.map((f) => extOf(f.path)).filter(Boolean))].sort(), [list]);

  const visible = useMemo(() => list.filter((f) => {
    if (q && !f.path.toLowerCase().includes(q.toLowerCase())) return false;
    if (filters.status.length && !filters.status.includes(statusOf(f.path))) return false;
    if (filters.ext.length && !filters.ext.includes(extOf(f.path))) return false;
    if (filters.collection && !collsOf(f).includes(filters.collection)) return false;
    return true;
  }), [list, q, filters, notes]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = list.find((f) => f.path === selPath) || null;
  useEffect(() => { if (!selected && visible[0] && window.innerWidth >= 1024) setSelPath(visible[0].path); }, [visible, selected]);

  const go = (key) => { setView(key); setDrawer(false); setMobileDetail(false); };
  const pickRepo = (r) => { setRepoName(r.full_name); setSelPath(""); setFilters({ status: [], ext: [], collection: "" }); setView("home"); };
  const needsRepo = ["home", "sources"].includes(view);
  const githubView = ["projects", "home", "sources"].includes(view);

  const askXyron = (f) => {
    LS.set("xb_prompt", `Review this file from ${repoName}: ${f.path}. Explain what it does and suggest improvements.`);
    nav("/");
  };

  const counts = useMemo(() => {
    const c = { integrated: 0, reading: 0, unread: 0 };
    list.forEach((f) => { c[statusOf(f.path)] += 1; });
    return c;
  }, [list, notes]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------ sidebar ------------------------------ */
  const sidebar = (
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[82vw] max-w-[300px] flex-col border-r border-white/10 bg-[#0b0908] transition-transform lg:static lg:z-auto lg:max-w-none lg:translate-x-0 ${collapsed ? "lg:w-[68px]" : "lg:w-[270px]"} ${drawer ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-neutral-200 text-black"><Github className="h-5 w-5" /></div>
        {!collapsed && <div className="min-w-0 flex-1"><div className="truncate text-[17px] font-semibold" style={SERIF}>Xyron Brain</div><div className="text-[10px] font-semibold uppercase tracking-[.14em] text-neutral-400">Developer workspace</div></div>}
        <button className="rounded-lg p-1.5 text-neutral-400 hover:bg-white/5 lg:hidden" onClick={() => setDrawer(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
      </div>
      <div className={collapsed ? "px-3 pb-3" : "px-4 pb-2"}>
        <button onClick={() => nav("/")} aria-label="Back to Xyron chat" title="Back to Xyron chat" className={`flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[.06] px-3 py-2.5 text-sm font-semibold text-neutral-100 hover:bg-white/10 ${collapsed ? "justify-center" : ""}`}>
          <ArrowLeft className="h-4 w-4" />{!collapsed && <span>Back to chat</span>}
        </button>
      </div>
      {!collapsed && (
        <div className="px-4 pb-3">
          <button onClick={() => { setDrawer(false); setImportOpen(true); }} className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[.03] px-3 py-2.5 text-sm text-neutral-400">
            <Search className="h-4 w-4" /><span className="flex-1 text-left">Go to GitHub repo…</span>
          </button>
        </div>
      )}
      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {NAV.map((g, gi) => (
          <div key={gi} className={g.bottom ? "mt-4 border-t border-white/10 pt-3" : gi ? "mt-3" : ""}>
            {gi === 1 && <div className="mb-3 border-t border-white/10" />}
            {g.group && g.group !== "project" && !collapsed && <div className="px-2 pb-1.5 pt-1 text-xs font-semibold text-neutral-400">{g.group}</div>}
            {g.items.map(({ key, label, icon: I, badge }) => {
              const active = view === key;
              return (
                <button key={key} onClick={() => go(key)} title={label} className={`relative mb-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] transition ${active ? "bg-white/[.07] text-white" : "text-neutral-300 hover:bg-white/5"}`}>
                  {active && <span className="absolute left-0 top-2 h-[calc(100%-16px)] w-[3px] rounded-full bg-amber-400" />}
                  <I className="h-[18px] w-[18px] shrink-0 text-neutral-400" />
                  {!collapsed && <span className="flex-1 truncate">{label}</span>}
                  {!collapsed && badge && <span className="rounded-full border border-amber-400/30 bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">{badge}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <button onClick={() => setCollapsed(!collapsed)} className="absolute -right-3 top-[44%] hidden h-6 w-6 place-items-center rounded-full border border-white/15 bg-[#161210] text-neutral-300 lg:grid" aria-label="Collapse sidebar">
        <ChevronLeft className={`h-4 w-4 transition ${collapsed ? "rotate-180" : ""}`} />
      </button>
      <div className="flex items-center gap-3 border-t border-white/10 px-4 py-3 text-xs text-neutral-400">
        <span className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${saved ? "bg-emerald-400" : "bg-amber-400"}`} />{!collapsed && (saved ? "Saved locally" : "Saving…")}</span>
        {!collapsed && <span className="ml-auto flex items-center gap-1 text-emerald-300"><Check className="h-3.5 w-3.5" />Auto</span>}
      </div>
    </aside>
  );

  /* ------------------------------- header ------------------------------ */
  const titles = {
    projects: ["Projects", "Your GitHub repositories"], method: ["Methodology", "Prompt library: your reusable ways of working"],
    home: [repo?.name || "Project Home", repo?.full_name || "Pick a project"], sources: ["Sources", repo?.full_name || ""],
    matrix: ["Code Matrix", "Snippets: code you reuse, one tap to copy"], synthesis: ["Synthesis", "Notes that pull your thinking together"],
    concepts: ["Concepts & Relations", "Map the ideas in your project and how they connect"], prep: ["Preparation", "Tasks: to do, in progress, done"],
    questions: ["Open Questions", "What you still need to figure out"], journey: ["Project Journey", "A running log of what you did and learned"],
    review: ["Project Review", "Your week at a glance, plus a focus timer"], all: ["All Sources", "Search everything you have saved"],
    collections: ["Collections", "Bookmarks grouped by tag"], devtools: ["Dev Tools", "Push to GitHub, scripts, JSON, JWT, API tester and more"],
  };
  const [title, sub] = titles[view] || titles.projects;

  const header = (
    <header className="flex items-start gap-2 border-b border-white/10 px-4 py-3 sm:px-6 sm:py-4">
      <button className="mt-1 rounded-lg p-1.5 text-neutral-300 hover:bg-white/5 lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
      <button className="mt-1 rounded-lg p-1.5 text-neutral-300 hover:bg-white/5" onClick={() => nav("/")} aria-label="Back to Xyron" title="Back to Xyron"><ArrowLeft className="h-5 w-5" /></button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-semibold sm:text-[30px]" style={SERIF}>{title}</h1>
        <p className="truncate text-sm text-neutral-300">{sub}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {githubView && <button onClick={() => setImportOpen(true)} className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/5 sm:px-4"><Plus className="h-4 w-4" /><span className="hidden sm:inline">Add repo</span></button>}
        {githubView && <button onClick={() => setImportOpen(true)} className="flex items-center gap-2 rounded-full bg-[#f1e9df] px-3 py-2 text-sm font-semibold text-black sm:px-4"><Upload className="h-4 w-4" /><span className="hidden sm:inline">Import from GitHub</span></button>}
        <div className="relative">
          <button onClick={() => setMenuOpen(!menuOpen)} className="flex items-center gap-1 px-2 py-2 text-sm font-semibold text-neutral-200" aria-label="More"><span className="hidden sm:inline">More</span><ChevronDown className="hidden h-4 w-4 sm:block" /><MoreHorizontal className="h-5 w-5 sm:hidden" /></button>
          {menuOpen && (
            <div className="absolute right-0 z-30 mt-1 w-52 rounded-xl border border-white/10 bg-[#161210] p-1 text-sm shadow-2xl">
              <button className="block w-full rounded-lg px-3 py-2 text-left hover:bg-white/5" onClick={() => { setMenuOpen(false); exportBrain(); }}>Export my brain (JSON)</button>
              <label className="block cursor-pointer rounded-lg px-3 py-2 hover:bg-white/5">Import brain file<input type="file" accept="application/json,.json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; setMenuOpen(false); if (!f) return; try { const n = await importBrain(f); setBrainKey((k) => k + 1); alert(`Imported ${n} new item${n === 1 ? "" : "s"}.`); } catch (err) { alert(err.message || "Could not import that file."); } }} /></label>
              <button className="block w-full rounded-lg px-3 py-2 text-left hover:bg-white/5" onClick={() => { setMenuOpen(false); setBanner(true); LS.set("xb_banner", true); }}>Show sample note</button>
              {repo && <a className="block rounded-lg px-3 py-2 hover:bg-white/5" href={repo.url} target="_blank" rel="noreferrer">Open on GitHub</a>}
              <button className="block w-full rounded-lg px-3 py-2 text-left text-red-300 hover:bg-white/5" onClick={() => { setMenuOpen(false); if (confirm("Clear saved notes and repos from this browser?")) { setNotes({}); setRepos([]); setRepoName(""); setFiles({}); setMeta({}); } }}>Clear local data</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );

  /* ------------------------------- views ------------------------------- */
  const EmptyRepo = () => (
    <Empty icon={Github} title="No project selected" text="Import a GitHub username or repository to see its code as sources." action="Import from GitHub" onAction={() => setImportOpen(true)} />
  );

  const ProjectsView = () => repos.length === 0 ? (
    <Empty icon={Github} title="Connect GitHub" text="Enter a username (like torvalds) or owner/repo. Public repos need no login." action="Import from GitHub" onAction={() => setImportOpen(true)} />
  ) : (
    <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">
      {repos.map((r) => (
        <button key={r.full_name} onClick={() => pickRepo(r)} className={`rounded-2xl border p-4 text-left transition hover:bg-white/[.04] ${r.full_name === repoName ? "border-amber-400/40 bg-amber-400/[.05]" : "border-white/10"}`}>
          <div className="flex items-center gap-2"><FolderOpen className="h-4 w-4 text-neutral-400" /><span className="truncate text-lg font-semibold" style={SERIF}>{r.name}</span>{r.private && <span className="rounded border border-white/15 px-1.5 text-[10px] text-neutral-400">private</span>}</div>
          <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-neutral-400">{r.description || "No description."}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
            {r.language && <span>{r.language}</span>}<span className="flex items-center gap-1"><Star className="h-3 w-3" />{r.stars}</span><span>{ago(r.updated)}</span>
          </div>
        </button>
      ))}
    </div>
  );

  const HomeView = () => {
    const m = meta[repo.full_name];
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <div className="rounded-2xl border border-white/10 p-5">
          <h2 className="text-2xl font-semibold" style={SERIF}>{repo.name}</h2>
          <p className="mt-1 text-sm text-neutral-300">{repo.description || "No description."}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[["Sources", list.length], ["Integrated", counts.integrated], ["Open issues", m ? m.issues.length : "…"], ["Branch", repo.branch]].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-white/10 p-3"><div className="truncate text-lg font-semibold">{v}</div><div className="text-xs text-neutral-400">{k}</div></div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => go("sources")} className="rounded-full bg-[#f1e9df] px-4 py-2 text-sm font-semibold text-black">Open sources</button>
            <a href={repo.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold"><ExternalLink className="h-4 w-4" />GitHub</a>
          </div>
        </div>
        {m?.readme && <div className="rounded-2xl border border-white/10 p-5"><h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-neutral-400">README</h3><pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words text-sm leading-6 text-neutral-200">{m.readme.slice(0, 6000)}</pre></div>}
      </div>
    );
  };

  /* ---------------- sources: list + detail (the screenshot) ---------------- */
  const SourcesView = () => (
    <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 sm:px-6 sm:pb-6">
      {banner && (
        <div className="mb-3 flex items-start gap-3 rounded-2xl border border-white/10 px-4 py-3 text-sm text-neutral-200 sm:items-center sm:rounded-full sm:px-5">
          <p className="flex-1"><b className="text-white">A note about the sample:</b> sources are read-only views of public code. Your notes stay in this browser.</p>
          <button onClick={() => { setBanner(false); LS.set("xb_banner", false); }} aria-label="Dismiss"><X className="h-5 w-5 text-neutral-400" /></button>
        </div>
      )}
      <div className="grid min-h-0 flex-1 overflow-hidden rounded-3xl border border-white/10 lg:grid-cols-[minmax(300px,380px)_1fr]">
        {/* list */}
        <div className={`min-h-0 flex-col border-white/10 lg:flex lg:border-r ${mobileDetail ? "hidden" : "flex"}`}>
          <div className="p-3 sm:p-4">
            <div className="flex items-center gap-2 rounded-2xl border border-white/15 px-4 py-2.5"><Search className="h-4 w-4 text-neutral-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this library…" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-neutral-500" /></div>
            <div className="mt-3 flex items-center justify-between">
              <button onClick={() => setFilterOpen(!filterOpen)} className="flex items-center gap-2 text-sm font-semibold text-neutral-200"><Filter className="h-4 w-4" />Filters{(filters.status.length + filters.ext.length + (filters.collection ? 1 : 0)) > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-[10px] text-black">{filters.status.length + filters.ext.length + (filters.collection ? 1 : 0)}</span>}</button>
              <span className="text-sm text-neutral-400">{visible.length} sources</span>
            </div>
            {filterOpen && (
              <div className="mt-3 space-y-3 rounded-xl border border-white/10 p-3 text-xs">
                <Chips label="Status" options={Object.entries(STATUS).map(([k, v]) => [k, v.label])} value={filters.status} onToggle={(k) => setFilters((f) => ({ ...f, status: f.status.includes(k) ? f.status.filter((x) => x !== k) : [...f.status, k] }))} />
                <Chips label="Type" options={exts.slice(0, 14).map((e) => [e, "." + e])} value={filters.ext} onToggle={(k) => setFilters((f) => ({ ...f, ext: f.ext.includes(k) ? f.ext.filter((x) => x !== k) : [...f.ext, k] }))} />
                {filters.collection && <button className="rounded-full border border-amber-400/40 px-3 py-1 text-amber-300" onClick={() => setFilters((f) => ({ ...f, collection: "" }))}>Collection: {filters.collection} ✕</button>}
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-white/10">
            {loading && !list.length && <Loading text={loading} />}
            {visible.map((f) => (
              <button key={f.path} onClick={() => { setSelPath(f.path); setMobileDetail(true); }} className={`relative block w-full border-b border-white/10 px-5 py-4 text-left transition ${f.path === selPath ? "bg-[#1a0f0b]" : "hover:bg-white/[.03]"}`}>
                {f.path === selPath && <span className="absolute inset-y-0 left-0 w-[3px] bg-amber-400" />}
                <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="break-words text-lg font-semibold leading-snug" style={SERIF}>{baseOf(f.path)}</div><div className="mt-1 truncate text-sm text-neutral-400">{topOf(f.path)} · {fmtSize(f.size)}</div></div>
                  <span className="shrink-0 pt-1 text-[11px] font-bold uppercase tracking-wider text-neutral-300">{STATUS[statusOf(f.path)].label}</span></div>
              </button>
            ))}
            {!loading && visible.length === 0 && <p className="p-6 text-center text-sm text-neutral-400">No sources match.</p>}
          </div>
        </div>
        {/* detail */}
        <div className={`min-h-0 overflow-y-auto lg:block ${mobileDetail ? "block" : "hidden"}`}>
          {selected ? <Detail f={selected} /> : <Empty icon={BookOpen} title="Select a source" text="Pick a file on the left to read it and record why it matters." />}
        </div>
      </div>
    </div>
  );

  const Detail = ({ f }) => <SourceDetail key={f.path} f={f} repo={repo} note={noteOf(f.path)} status={statusOf(f.path)} patch={(p) => patchNote(f.path, p)}
    gh={gh} onBack={() => setMobileDetail(false)} onAsk={() => askXyron(f)} collections={allCollections.map(([c]) => c)} />;

  const body = () => {
    if (view === "projects") return <ProjectsView />;
    if (needsRepo && !repo) return <EmptyRepo />;
    switch (view) {
      case "home": return <HomeView />;
      case "sources": return <SourcesView />;
      case "method": return <ItemsView key={view + brainKey} kind="prompts" />;
      case "matrix": return <ItemsView key={view + brainKey} kind="snippets" />;
      case "synthesis": return <ItemsView key={view + brainKey} kind="notes" />;
      case "journey": return <ItemsView key={view + brainKey} kind="journal" />;
      case "collections": return <ItemsView key={view + brainKey} kind="links" />;
      case "prep": return <TasksView key={brainKey} />;
      case "concepts": return <ConceptsView key={brainKey} />;
      case "questions": return <QuestionsView key={brainKey} />;
      case "review": return <ReviewView key={brainKey} />;
      case "all": return <SearchAllView key={brainKey} go={go} />;
      case "devtools": return <DevToolsHub />;
      default: return <ProjectsView />;
    }
  };

  const isSources = view === "sources";

  return (
    <div className="fixed inset-0 z-[5] flex bg-[#0b0908] text-[#ece6dd]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {drawer && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setDrawer(false)} />}
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        {header}
        {error && <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-200 sm:mx-6"><span className="flex-1">{error}</span><button onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}
        {loading && list.length > 0 && <div className="flex items-center gap-2 px-6 pt-3 text-xs text-neutral-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />{loading}</div>}
        <main className={`min-h-0 flex-1 ${isSources && repo ? "flex flex-col pt-3" : "overflow-y-auto"}`}>{body()}</main>
      </div>
      {importOpen && <ImportDialog token={token} setToken={setToken} busy={!!loading} error={error} onClose={() => setImportOpen(false)} onImport={importFrom} />}
    </div>
  );
}

/* ------------------------------ pieces ------------------------------ */

function Badge({ s }) {
  return <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS[s].cls}`}>{STATUS[s].label}</span>;
}
function Loading({ text = "Loading…" }) {
  return <div className="flex items-center justify-center gap-2 p-10 text-sm text-neutral-400"><Loader2 className="h-4 w-4 animate-spin" />{text}</div>;
}
function Empty({ icon: I, title, text, action, onAction }) {
  return (
    <div className="grid h-full min-h-[300px] place-items-center p-8 text-center">
      <div className="max-w-sm"><I className="mx-auto h-10 w-10 text-neutral-600" /><h3 className="mt-4 text-xl font-semibold" style={SERIF}>{title}</h3><p className="mt-1 text-sm text-neutral-400">{text}</p>
        {action && <button onClick={onAction} className="mt-5 rounded-full bg-[#f1e9df] px-5 py-2.5 text-sm font-semibold text-black">{action}</button>}</div>
    </div>
  );
}
function Chips({ label, options, value, onToggle }) {
  return (
    <div><div className="mb-1.5 font-semibold uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="flex flex-wrap gap-1.5">{options.map(([k, l]) => (
        <button key={k} onClick={() => onToggle(k)} className={`rounded-full border px-3 py-1 ${value.includes(k) ? "border-amber-400/50 bg-amber-400/10 text-amber-200" : "border-white/15 text-neutral-300"}`}>{l}</button>))}</div></div>
  );
}

function ImportDialog({ token, setToken, busy, error, onClose, onImport }) {
  const [v, setV] = useState("");
  return (
    <div className="fixed inset-0 z-[60] grid place-items-end bg-black/70 sm:place-items-center sm:p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-t-3xl border border-white/10 bg-[#120e0c] p-5 sm:rounded-3xl">
        <div className="flex items-center gap-2"><Github className="h-5 w-5" /><h2 className="flex-1 text-xl font-semibold" style={SERIF}>Import from GitHub</h2><button onClick={onClose} aria-label="Close"><X className="h-5 w-5 text-neutral-400" /></button></div>
        <p className="mt-2 text-sm text-neutral-400">Paste a username, owner/repo, or a github.com link.</p>
        <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && v.trim() && onImport(v)} placeholder="e.g. vercel/next.js or your-username" className="mt-3 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-[15px] outline-none focus:border-white/30" />
        <label className="mt-3 block text-xs text-neutral-400">Token (optional, for private repos and higher limits)</label>
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_… (stored only in this browser)" className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-[15px] outline-none focus:border-white/30" />
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        <button disabled={busy || !v.trim()} onClick={() => onImport(v)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#f1e9df] py-3 text-sm font-semibold text-black disabled:opacity-40">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Import</button>
      </div>
    </div>
  );
}

function Editable({ label, value, placeholder, onSave }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(value || "");
  return (
    <div>
      <div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-neutral-300">{label}</span>
        <button className="text-xs font-semibold text-neutral-300" onClick={() => { if (edit) onSave(draft.trim()); else setDraft(value || ""); setEdit(!edit); }}>{edit ? "Save" : "Edit"}</button></div>
      {edit ? <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} className="mt-3 w-full rounded-xl border border-white/15 bg-black/40 p-3 text-[15px] leading-6 outline-none" />
        : <p className="mt-3 text-[15px] leading-7 text-neutral-200">{value || <span className="text-neutral-500">{placeholder}</span>}</p>}
    </div>
  );
}

function SourceDetail({ f, repo, note, status, patch, gh, onBack, onAsk, collections }) {
  const [code, setCode] = useState(null);
  const [reading, setReading] = useState(false);
  const [menu, setMenu] = useState(false);
  const [cite, setCite] = useState(false);
  const [editPurpose, setEditPurpose] = useState(false);
  const [purpose, setPurpose] = useState(note.purpose || "");
  const [adding, setAdding] = useState(false);
  const [newColl, setNewColl] = useState("");
  const [err, setErr] = useState("");
  const colls = note.collections || [];
  const purposeText = note.purpose || `Read to understand how ${baseOf(f.path)} fits the project.`;

  const read = async () => {
    setReading(true); setErr("");
    try {
      const text = await gh(`/repos/${repo.full_name}/contents/${f.path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(repo.branch || "HEAD")}`, { text: true, headers: { Accept: "application/vnd.github.raw" } });
      setCode(text);
      if (status === "unread") patch({ status: "reading" });
    } catch (e) { setErr(e.message); }
    setReading(false);
  };

  return (
    <div className="p-4 sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="rounded-lg p-1.5 text-neutral-300 hover:bg-white/5 lg:hidden" aria-label="Back to list"><ChevronLeft className="h-5 w-5" /></button>
          <Badge s={status} />
        </div>
        <div className="relative">
          <button onClick={() => setMenu(!menu)} className="grid h-11 w-11 place-items-center rounded-full border border-white/15 hover:bg-white/5" aria-label="More"><MoreHorizontal className="h-5 w-5" /></button>
          {menu && (
            <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-white/10 bg-[#161210] p-1 text-sm shadow-2xl">
              {Object.entries(STATUS).map(([k, v]) => <button key={k} onClick={() => { patch({ status: k }); setMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/5">{status === k ? <Check className="h-4 w-4" /> : <span className="w-4" />}Mark {v.label.toLowerCase()}</button>)}
              <a href={`${repo.url}/blob/${repo.branch}/${f.path}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/5"><span className="w-4" />Open on GitHub</a>
            </div>
          )}
        </div>
      </div>

      <h2 className="mt-4 break-words text-2xl font-bold leading-tight sm:text-[28px]" style={SERIF}>{baseOf(f.path)}</h2>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-neutral-300">
        <span className="break-all">{repo.full_name}</span><span>· {fmtSize(f.size)}</span><span className="flex items-center gap-1"><FileText className="h-4 w-4" />{extOf(f.path) ? `.${extOf(f.path)}` : "file"}</span>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button onClick={read} disabled={reading} className="flex items-center gap-2 rounded-full bg-[#f1e9df] px-5 py-3 text-[15px] font-semibold text-black disabled:opacity-60">{reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}{code == null ? "Continue reading" : "Reload code"}</button>
        <button onClick={onAsk} className="flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 text-[15px] font-semibold hover:bg-white/5"><Scale className="h-4 w-4" />Compare AI output</button>
      </div>
      {err && <p className="mt-3 text-sm text-red-300">{err}</p>}

      {code != null && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-black/40">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs text-neutral-400"><span className="truncate">{f.path}</span><span className="flex shrink-0 items-center gap-4"><button onClick={() => downloadTextFile(baseOf(f.path), code)} className="flex items-center gap-1 font-semibold text-neutral-200 hover:text-white" aria-label={`Download ${baseOf(f.path)}`}><Download className="h-3.5 w-3.5" />Download</button><button onClick={() => setCode(null)}>Close</button></span></div>
          <pre className="max-h-[420px] overflow-auto p-4 text-[13px] leading-6 text-neutral-200"><code>{code.length > 60000 ? code.slice(0, 60000) + "\n… truncated" : code}</code></pre>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-start gap-x-3 gap-y-1 text-[15px] leading-7">
        <span className="text-xs font-bold uppercase tracking-wider text-neutral-300 sm:pt-1">Reading purpose</span>
        {editPurpose ? (
          <span className="flex min-w-0 flex-1 gap-2"><input autoFocus value={purpose} onChange={(e) => setPurpose(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 outline-none" /><button className="text-sm font-semibold" onClick={() => { patch({ purpose: purpose.trim() }); setEditPurpose(false); }}>Save</button></span>
        ) : (<span className="flex items-center gap-2 text-neutral-200">{purposeText}<button onClick={() => { setPurpose(note.purpose || ""); setEditPurpose(true); }} aria-label="Edit purpose"><Pencil className="h-4 w-4 text-neutral-400" /></button></span>)}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 text-sm"><span className="font-semibold text-neutral-300">{status === "integrated" ? "Worked-through source" : "In progress"}</span>
        {status === "integrated" && <span className="flex items-center gap-1 font-semibold text-emerald-400"><Check className="h-4 w-4" />Shaping project thinking</span>}</div>

      <div className="my-6 border-t border-white/10" />
      <div className="grid gap-6 md:grid-cols-2">
        <Editable label="Why it belongs" value={note.why} placeholder={`Say why ${baseOf(f.path)} belongs in this project.`} onSave={(v) => patch({ why: v })} />
        <Editable label="What it contributed" value={note.contributed} placeholder="Record what this source contributed." onSave={(v) => patch({ contributed: v })} />
      </div>

      <div className="mt-7"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-neutral-300">Collections</span>
        <span className="flex items-center gap-1 text-xs font-semibold text-neutral-300"><Bookmark className="h-3.5 w-3.5" />Manage collections</span></div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm"><FolderOpen className="h-4 w-4 text-neutral-400" />{topOf(f.path)}</span>
          {colls.map((c) => <span key={c} className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm"><FolderOpen className="h-4 w-4 text-neutral-400" />{c}<button onClick={() => patch({ collections: colls.filter((x) => x !== c) })} aria-label={`Remove ${c}`}><X className="h-3.5 w-3.5 text-neutral-400" /></button></span>)}
          {adding ? (
            <span className="flex items-center gap-1"><input list="xb-colls" autoFocus value={newColl} onChange={(e) => setNewColl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newColl.trim()) { patch({ collections: [...new Set([...colls, newColl.trim()])] }); setNewColl(""); setAdding(false); } }} placeholder="Collection name" className="w-40 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-sm outline-none" /><datalist id="xb-colls">{collections.map((c) => <option key={c} value={c} />)}</datalist></span>
          ) : <button onClick={() => setAdding(true)} className="rounded-full border border-dashed border-white/25 px-3 py-2 text-sm font-semibold text-neutral-300">+ Add</button>}
        </div></div>

      <div className="mt-7 rounded-2xl border border-white/10">
        <button onClick={() => setCite(!cite)} className="flex w-full items-center justify-between px-5 py-4 text-left text-lg font-semibold" style={SERIF}>Citation details<ChevronDown className={`h-5 w-5 transition ${cite ? "rotate-180" : ""}`} /></button>
        {cite && (
          <dl className="grid gap-x-4 gap-y-2 border-t border-white/10 px-5 py-4 text-sm sm:grid-cols-[110px_1fr]">
            {[["Repository", repo.full_name], ["Branch", repo.branch], ["Path", f.path], ["Blob SHA", f.sha], ["Size", fmtSize(f.size)], ["Updated", ago(repo.updated)]].map(([k, v]) => (<React.Fragment key={k}><dt className="text-neutral-400">{k}</dt><dd className="break-all text-neutral-200">{v}</dd></React.Fragment>))}
            <dt className="text-neutral-400">Link</dt><dd><a className="inline-flex items-center gap-1 break-all text-amber-300" target="_blank" rel="noreferrer" href={`${repo.url}/blob/${repo.branch}/${f.path}`}>View on GitHub <ExternalLink className="h-3.5 w-3.5" /></a></dd>
          </dl>
        )}
      </div>
    </div>
  );
}

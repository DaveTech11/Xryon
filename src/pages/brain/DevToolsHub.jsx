import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Ban, Binary, Braces, Calculator, Check, Clock, Copy, Diff, Download, Fingerprint, GitBranch, Github,
  Globe, Hash, KeyRound, Link2, Loader2, Lock, Palette, Regex, Search, Terminal, Type, Upload, X,
} from "lucide-react";

/* Dev Tools hub: tap a tool and it opens. Everything runs in your browser. */

const SERIF = { fontFamily: "'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif" };
const GH = "https://api.github.com";
const LS = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* blocked */ } },
};
const inputCls = "w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-[15px] outline-none placeholder:text-neutral-500 focus:border-white/30";
const mono = "font-mono text-[13px]";
const pill = "rounded-full bg-[#f1e9df] px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-40";
const ghost = "rounded-full border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/5 disabled:opacity-40";
const label = "mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-400";

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch {
    try { const a = document.createElement("textarea"); a.value = t; a.style.position = "fixed"; a.style.opacity = "0"; document.body.appendChild(a); a.select(); document.execCommand("copy"); a.remove(); return true; } catch { return false; }
  }
}
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const fileB64 = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = () => rej(new Error("Could not read " + f.name)); r.readAsDataURL(f); });
const fmtSize = (n = 0) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n > 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);

function CopyBtn({ text, className = "" }) {
  const [ok, setOk] = useState(false);
  return <button type="button" onClick={async () => { if (await copyText(text)) { setOk(true); setTimeout(() => setOk(false), 1200); } }} className={`flex items-center text-xs text-neutral-400 hover:text-white ${className}`}><Copy className="mr-1 h-3.5 w-3.5" />{ok ? "Copied" : "Copy"}</button>;
}
function Out({ text, error, name }) {
  if (error) return <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>;
  if (text === "" || text == null) return null;
  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-black/40">
      <div className="flex justify-end gap-4 px-3 pt-2">{name && <button type="button" onClick={() => download(name, text)} className="flex items-center text-xs text-neutral-400 hover:text-white"><Download className="mr-1 h-3.5 w-3.5" />Download</button>}<CopyBtn text={text} /></div>
      <pre className={`max-h-96 overflow-auto whitespace-pre-wrap break-all px-4 pb-4 ${mono} leading-6 text-neutral-200`}>{text}</pre>
    </div>
  );
}
const Note = ({ children }) => <p className="mt-3 text-xs leading-5 text-neutral-500">{children}</p>;
const Chip = ({ on, onClick, children }) => <button type="button" onClick={onClick} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${on ? "border-amber-400/50 bg-amber-400/10 text-amber-200" : "border-white/15 text-neutral-300"}`}>{children}</button>;

/* ------------------------------ GitHub connection ------------------------------ */
function useGithub() {
  const [token, setTokenState] = useState(() => LS.get("xb_token", ""));
  const [user, setUser] = useState(null);
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);
  const call = async (path, { method = "GET", body } = {}) => {
    const r = await fetch(GH + path, { method, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) {
      let m = ""; try { m = (await r.json()).message; } catch { /* no body */ }
      const e = new Error(r.status === 401 ? "GitHub rejected that token. Make a new one and try again." : m || `GitHub error ${r.status}`); e.status = r.status; throw e;
    }
    return r.status === 204 ? null : r.json();
  };
  useEffect(() => {
    if (!token) { setUser(null); return undefined; }
    let live = true; setChecking(true); setErr("");
    fetch(GH + "/user", { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 401 ? "GitHub rejected that token." : `GitHub error ${r.status}`))))
      .then((u) => { if (live) setUser(u); })
      .catch((e) => { if (live) { setUser(null); setErr(e.message); } })
      .finally(() => { if (live) setChecking(false); });
    return () => { live = false; };
  }, [token]);
  const setToken = (t) => { LS.set("xb_token", t); setTokenState(t); };
  return { token, setToken, user, err, checking, call };
}

function ConnectBox({ gh }) {
  const [v, setV] = useState("");
  if (gh.user) {
    return (
      <div className="mb-5 flex items-center rounded-2xl border border-emerald-500/30 bg-emerald-500/[.06] p-3">
        <img src={gh.user.avatar_url} alt="" className="mr-3 h-9 w-9 rounded-full" />
        <div className="min-w-0 flex-1 text-sm"><div className="truncate font-semibold text-emerald-200">Connected as {gh.user.login}</div><div className="text-xs text-neutral-400">Token stays in this browser only</div></div>
        <button onClick={() => gh.setToken("")} className={ghost}>Disconnect</button>
      </div>
    );
  }
  return (
    <div className="mb-5 rounded-2xl border border-white/10 p-4">
      <h3 className="flex items-center text-base font-semibold" style={SERIF}><Github className="mr-2 h-4 w-4" />Connect GitHub</h3>
      <p className="mt-1 text-sm text-neutral-400">Paste a personal access token. It needs <b className="text-neutral-200">Contents: read and write</b> (fine-grained) or the <b className="text-neutral-200">repo</b> scope (classic).</p>
      <a href="https://github.com/settings/tokens/new?scopes=repo&description=Xyron%20Brain" target="_blank" rel="noreferrer noopener" className="mt-1 inline-block text-sm text-amber-300 underline">Create a token on GitHub</a>
      <form onSubmit={(e) => { e.preventDefault(); if (v.trim()) gh.setToken(v.trim()); }} className="mt-3 flex gap-2">
        <input type="password" value={v} onChange={(e) => setV(e.target.value)} placeholder="ghp_… or github_pat_…" autoComplete="off" className={inputCls} />
        <button className={`${pill} flex shrink-0 items-center`} disabled={!v.trim() || gh.checking}>{gh.checking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Connect</button>
      </form>
      {gh.err && <p className="mt-2 text-sm text-red-300">{gh.err}</p>}
    </div>
  );
}

/* ------------------------------ Push files to GitHub ------------------------------ */
const SKIP = /(^|\/)(node_modules|\.git|dist|build|\.next|__pycache__|\.venv|venv)\//;
const RISKY = /(^|\/)(\.env(\..*)?|.*\.pem|.*\.key|id_rsa|id_ed25519|credentials\.json|.*\.pfx)$/i;
const enc = (p) => p.split("/").map(encodeURIComponent).join("/");

function PushTool() {
  const gh = useGithub();
  const [repos, setRepos] = useState([]);
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("");
  const [folder, setFolder] = useState("");
  const [msg, setMsg] = useState("Add files from Xyron");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const [allowRisky, setAllowRisky] = useState(false);
  const [drag, setDrag] = useState(false);
  const [nr, setNr] = useState(null);
  const [txt, setTxt] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!gh.user) { setRepos([]); return; }
    gh.call("/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member")
      .then((r) => { setRepos(r); if (r[0] && !repo) { setRepo(r[0].full_name); setBranch(r[0].default_branch); } })
      .catch((e) => setErr(e.message));
  }, [gh.user]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickRepo = (name) => { setRepo(name); const r = repos.find((x) => x.full_name === name); if (r) setBranch(r.default_branch); };
  const addFiles = (list) => {
    const incoming = [...list].map((f) => ({ path: (f.webkitRelativePath || f.name).replace(/^\/+/, ""), file: f, size: f.size })).filter((x) => !SKIP.test(x.path));
    setFiles((p) => { const m = new Map(p.map((x) => [x.path, x])); incoming.forEach((x) => m.set(x.path, x)); return [...m.values()]; });
  };
  const ready = files.filter((f) => (allowRisky || !RISKY.test(f.path)) && f.size <= 25 * 1048576);
  const prefix = folder.trim().replace(/^\/+|\/+$/g, "");

  const makeRepo = async (e) => {
    e.preventDefault(); setErr("");
    try {
      const r = await gh.call("/user/repos", { method: "POST", body: { name: nr.name.trim(), description: nr.desc.trim(), private: nr.priv, auto_init: true } });
      setRepos((p) => [r, ...p]); setRepo(r.full_name); setBranch(r.default_branch); setNr(null);
    } catch (er) { setErr(er.message); }
  };

  const push = async () => {
    setBusy(true); setErr(""); setLog([]);
    let ok = 0;
    for (const f of ready) {
      const target = (prefix ? prefix + "/" : "") + f.path;
      try {
        let sha;
        try { sha = (await gh.call(`/repos/${repo}/contents/${enc(target)}?ref=${encodeURIComponent(branch)}`)).sha; } catch (e) { if (e.status !== 404) throw e; }
        const res = await gh.call(`/repos/${repo}/contents/${enc(target)}`, { method: "PUT", body: { message: msg.trim() || "Add files from Xyron", content: await fileB64(f.file), branch, ...(sha ? { sha } : {}) } });
        ok += 1; setLog((l) => [...l, { ok: true, path: target, url: res.content?.html_url, updated: !!sha }]);
      } catch (e) { setLog((l) => [...l, { ok: false, path: target, msg: e.message }]); }
    }
    setBusy(false);
    if (ok === ready.length) setFiles([]);
  };

  return (
    <div>
      <ConnectBox gh={gh} />
      {gh.user && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={label}>Repository</label><select value={repo} onChange={(e) => pickRepo(e.target.value)} className={inputCls}>{repos.map((r) => <option key={r.id} value={r.full_name}>{r.full_name}{r.private ? " (private)" : ""}</option>)}</select></div>
            <div><label className={label}>Branch</label><input value={branch} onChange={(e) => setBranch(e.target.value)} className={inputCls} /></div>
            <div><label className={label}>Folder in repo (optional)</label><input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="e.g. src/assets" className={inputCls} /></div>
            <div><label className={label}>Commit message</label><input value={msg} onChange={(e) => setMsg(e.target.value)} className={inputCls} /></div>
          </div>
          <button type="button" onClick={() => setNr({ name: "", desc: "", priv: true })} className="text-sm text-amber-300 underline">Create a new repository instead</button>

          <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
            className={`rounded-2xl border-2 border-dashed p-6 text-center ${drag ? "border-amber-400/60 bg-amber-400/5" : "border-white/15"}`}>
            <Upload className="mx-auto h-8 w-8 text-neutral-500" />
            <p className="mt-2 text-sm text-neutral-300">Drop files here, or choose them</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <label className={`${ghost} cursor-pointer`}>Choose files<input type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} /></label>
              <label className={`${ghost} cursor-pointer`}>Choose a folder<input type="file" multiple webkitdirectory="" directory="" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} /></label>
              <button type="button" onClick={() => setTxt({ name: "README.md", body: "" })} className={ghost}>Write a text file</button>
            </div>
          </div>

          {files.length > 0 && (
            <div className="rounded-2xl border border-white/10">
              <div className="flex items-center border-b border-white/10 px-4 py-2.5 text-sm"><span className="flex-1 font-semibold">{ready.length} of {files.length} ready to push</span><button onClick={() => setFiles([])} className="text-neutral-400 hover:text-white">Clear</button></div>
              <div className="max-h-64 overflow-y-auto">{files.map((f) => {
                const risky = RISKY.test(f.path), big = f.size > 25 * 1048576;
                return (
                  <div key={f.path} className="flex items-center border-b border-white/5 px-4 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{f.path}</span>
                    {risky && <span className="mx-2 rounded-full border border-red-400/40 px-2 text-[10px] text-red-300">{allowRisky ? "secret?" : "skipped: secret"}</span>}
                    {big && <span className="mx-2 rounded-full border border-red-400/40 px-2 text-[10px] text-red-300">over 25 MB</span>}
                    <span className="mx-2 text-xs text-neutral-500">{fmtSize(f.size)}</span>
                    <button onClick={() => setFiles((p) => p.filter((x) => x.path !== f.path))} aria-label="Remove"><X className="h-4 w-4 text-neutral-400" /></button>
                  </div>);
              })}</div>
              {files.some((f) => RISKY.test(f.path)) && <label className="flex items-center border-t border-white/10 px-4 py-2.5 text-xs text-neutral-400"><input type="checkbox" checked={allowRisky} onChange={(e) => setAllowRisky(e.target.checked)} className="mr-2" />Include files that look like secrets (.env, keys). Not recommended.</label>}
            </div>
          )}

          <button onClick={push} disabled={busy || !ready.length || !repo || !branch} className={`${pill} flex items-center !px-7`}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{busy ? "Pushing…" : `Push ${ready.length || ""} file${ready.length === 1 ? "" : "s"} to ${repo || "GitHub"}`}</button>
          {err && <p className="text-sm text-red-300">{err}</p>}
          {log.length > 0 && (
            <div className="rounded-2xl border border-white/10 p-3 text-sm">{log.map((l, i) => (
              <div key={i} className="flex items-start py-1">{l.ok ? <Check className="mr-2 mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <X className="mr-2 mt-0.5 h-4 w-4 shrink-0 text-red-400" />}
                <span className="min-w-0 break-all">{l.ok ? <a href={l.url} target="_blank" rel="noreferrer noopener" className="text-emerald-200 underline">{l.path}</a> : l.path}{l.ok ? (l.updated ? " (updated)" : " (added)") : ` failed: ${l.msg}`}</span></div>))}</div>
          )}
          <Note>Each file becomes one commit on the branch you pick. Existing files with the same path are overwritten. Files that look like secrets are skipped unless you allow them.</Note>
        </div>
      )}

      {nr && (
        <div className="fixed inset-0 z-[80] grid place-items-end bg-black/70 sm:place-items-center sm:p-6" onClick={() => setNr(null)}>
          <form onSubmit={makeRepo} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-3 rounded-t-3xl border border-white/10 bg-[#120e0c] p-5 sm:rounded-3xl">
            <h3 className="text-xl font-semibold" style={SERIF}>New repository</h3>
            <input autoFocus value={nr.name} onChange={(e) => setNr({ ...nr, name: e.target.value })} placeholder="repository-name" className={inputCls} />
            <input value={nr.desc} onChange={(e) => setNr({ ...nr, desc: e.target.value })} placeholder="Description (optional)" className={inputCls} />
            <label className="flex items-center text-sm text-neutral-300"><input type="checkbox" checked={nr.priv} onChange={(e) => setNr({ ...nr, priv: e.target.checked })} className="mr-2" />Private</label>
            <button className={`${pill} w-full`} disabled={!nr.name.trim()}>Create</button>
          </form>
        </div>
      )}
      {txt && (
        <div className="fixed inset-0 z-[80] grid place-items-end bg-black/70 sm:place-items-center sm:p-6" onClick={() => setTxt(null)}>
          <form onSubmit={(e) => { e.preventDefault(); if (!txt.name.trim()) return; addFiles([new File([txt.body], txt.name.trim())]); setTxt(null); }} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg space-y-3 rounded-t-3xl border border-white/10 bg-[#120e0c] p-5 sm:rounded-3xl">
            <h3 className="text-xl font-semibold" style={SERIF}>New text file</h3>
            <input value={txt.name} onChange={(e) => setTxt({ ...txt, name: e.target.value })} placeholder="file name, e.g. README.md" className={inputCls} />
            <textarea value={txt.body} onChange={(e) => setTxt({ ...txt, body: e.target.value })} rows={9} placeholder="File contents" className={`${inputCls} ${mono}`} />
            <button className={`${pill} w-full`}>Add to push list</button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ PowerShell / Git scripts ------------------------------ */
const q1 = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;           // bash single quote
const qp = (s) => `'${String(s).replace(/'/g, "''")}'`;               // PowerShell single quote
const qc = (s) => `"${String(s).replace(/"/g, '\\"')}"`;              // cmd double quote
const TASKS = {
  first: { label: "Push a local folder to a new GitHub repo", f: ["folder", "url", "branch", "msg"], cmds: (o, q) => ["git init", "git add .", `git commit -m ${q(o.msg)}`, `git branch -M ${o.branch}`, `git remote add origin ${o.url}`, `git push -u origin ${o.branch}`] },
  update: { label: "Push new changes", f: ["folder", "branch", "msg"], cmds: (o, q) => ["git add .", `git commit -m ${q(o.msg)}`, `git push origin ${o.branch}`] },
  pull: { label: "Pull latest, then push (fixes a rejected push)", f: ["folder", "branch"], cmds: (o) => [`git pull --rebase origin ${o.branch}`, `git push origin ${o.branch}`] },
  clone: { label: "Clone a repo", f: ["url"], cmds: (o) => [`git clone ${o.url}`] },
  newbranch: { label: "Create a branch and push it", f: ["folder", "branch", "msg"], cmds: (o, q) => [`git checkout -b ${o.branch}`, "git add .", `git commit -m ${q(o.msg)}`, `git push -u origin ${o.branch}`] },
  gh: { label: "Create the repo with GitHub CLI (gh) and push", f: ["folder", "name", "vis"], cmds: (o) => [`gh repo create ${o.name} --${o.vis} --source=. --remote=origin --push`] },
  undo: { label: "Undo the last commit (keeps your files)", f: ["folder"], cmds: () => ["git reset --soft HEAD~1"] },
  force: { label: "Force push (overwrites the remote, be careful)", f: ["folder", "branch"], warn: true, cmds: (o) => [`git push --force-with-lease origin ${o.branch}`] },
};
const CHEATS = [
  ["git status", "See what changed"], ["git add .", "Stage everything"], ["git commit -m \"message\"", "Save a snapshot"], ["git push", "Upload commits"], ["git pull", "Download and merge updates"],
  ["git log --oneline -10", "Last 10 commits, short"], ["git diff", "See unstaged changes"], ["git stash", "Shelve changes temporarily"], ["git stash pop", "Bring shelved changes back"],
  ["git checkout -b feature-name", "Create and switch to a branch"], ["git branch -d feature-name", "Delete a merged branch"], ["git restore file.txt", "Discard changes to a file"],
  ["git remote -v", "Show linked remotes"], ["git rm --cached file.txt", "Stop tracking a file (keep it on disk)"],
];

function ScriptTool() {
  const [shell, setShell] = useState("powershell");
  const [task, setTask] = useState("first");
  const [o, setO] = useState({ folder: "C:\\Users\\you\\my-project", url: "https://github.com/your-name/your-repo.git", branch: "main", msg: "First commit", name: "my-project", vis: "private" });
  const t = TASKS[task];
  const set = (k) => (e) => setO((p) => ({ ...p, [k]: e.target.value }));
  const q = shell === "powershell" ? qp : shell === "bash" ? q1 : qc;
  const script = useMemo(() => {
    const L = [];
    const run = (c) => {
      L.push(c);
      if (shell === "powershell") L.push(`if ($LASTEXITCODE -ne 0) { Write-Error ${qp("Failed: " + c.split("\n")[0])}; exit 1 }`);
      else if (shell === "cmd") L.push("if errorlevel 1 exit /b 1");
    };
    if (shell === "powershell") { L.push("# Run in PowerShell"); if (t.f.includes("folder")) L.push(`Set-Location -LiteralPath ${qp(o.folder)}`); }
    else if (shell === "bash") { L.push("#!/usr/bin/env bash", "set -e"); if (t.f.includes("folder")) L.push(`cd ${q1(o.folder)}`); }
    else { L.push("@echo off"); if (t.f.includes("folder")) L.push(`cd /d ${qc(o.folder)}`); }
    t.cmds(o, q).forEach(run);
    return L.join("\n");
  }, [shell, task, o]); // eslint-disable-line react-hooks/exhaustive-deps
  const ext = shell === "powershell" ? "ps1" : shell === "bash" ? "sh" : "bat";
  const field = (k, l, ph) => t.f.includes(k) && (
    <div key={k}><label className={label}>{l}</label>
      {k === "vis" ? <select value={o.vis} onChange={set("vis")} className={inputCls}><option value="private">Private</option><option value="public">Public</option></select>
        : <input value={o[k]} onChange={set(k)} placeholder={ph} className={inputCls} />}</div>
  );
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">{[["powershell", "PowerShell"], ["bash", "Bash / Terminal"], ["cmd", "Command Prompt"]].map(([k, l]) => <Chip key={k} on={shell === k} onClick={() => setShell(k)}>{l}</Chip>)}</div>
      <label className={label}>What do you want to do?</label>
      <select value={task} onChange={(e) => setTask(e.target.value)} className={inputCls}>{Object.entries(TASKS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
      {t.warn && <p className="mt-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">Force pushing replaces what is on GitHub. Only use it on your own branch.</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {field("folder", "Project folder on your computer", shell === "bash" ? "/home/you/my-project" : "C:\\Users\\you\\my-project")}
        {field("url", "GitHub repo URL", "https://github.com/you/repo.git")}
        {field("branch", "Branch", "main")}
        {field("msg", "Commit message", "What changed")}
        {field("name", "Repo name", "my-project")}
        {field("vis", "Visibility")}
      </div>
      <Out text={script} name={`push.${ext}`} />
      <Note>
        {shell === "powershell" && <>Open the folder, right-click, choose Open in Terminal, paste and press Enter. To run a saved file: <code className="text-neutral-300">powershell -ExecutionPolicy Bypass -File .\push.ps1</code>. </>}
        {shell === "bash" && <>Save as push.sh and run <code className="text-neutral-300">bash push.sh</code>. </>}
        {shell === "cmd" && <>Save as push.bat and double-click it, or paste the lines into Command Prompt. </>}
        You need Git installed and to be signed in to GitHub (Git Credential Manager asks the first time). Xyron cannot run scripts for you, so use <b className="text-neutral-300">Push Files to GitHub</b> if you want to upload straight from the browser.
      </Note>
      <h3 className="mb-2 mt-8 text-lg font-semibold" style={SERIF}>Git cheat sheet</h3>
      <div className="rounded-2xl border border-white/10">{CHEATS.map(([c, d]) => (
        <div key={c} className="flex items-center border-b border-white/5 px-4 py-2.5 last:border-0"><div className="min-w-0 flex-1"><code className="break-all text-[13px] text-amber-200">{c}</code><div className="text-xs text-neutral-500">{d}</div></div><CopyBtn text={c} /></div>))}</div>
    </div>
  );
}

/* ------------------------------ .gitignore generator ------------------------------ */
const IGN = {
  Node: "node_modules/\nnpm-debug.log*\nyarn-error.log*\ndist/\nbuild/\n.next/\n.cache/\ncoverage/\n*.tsbuildinfo",
  Python: "__pycache__/\n*.py[cod]\n.venv/\nvenv/\n*.egg-info/\n.pytest_cache/\n.mypy_cache/\ndist/\nbuild/",
  Java: "*.class\n*.jar\n*.war\ntarget/\n.gradle/\nbuild/\nout/",
  Go: "*.exe\n*.test\n*.out\nvendor/\nbin/",
  Rust: "target/\nCargo.lock\n**/*.rs.bk",
  ".NET": "bin/\nobj/\n*.user\n*.suo\n.vs/\npackages/",
  PHP: "vendor/\ncomposer.phar\n*.log",
  Ruby: "*.gem\n.bundle/\nvendor/bundle/\nlog/\ntmp/",
  Android: "*.apk\n*.aab\n.gradle/\nlocal.properties\n/build\n/captures\n.externalNativeBuild/",
  "Env & secrets": ".env\n.env.*\n!.env.example\n*.pem\n*.key\nsecrets.json\ncredentials.json",
  macOS: ".DS_Store\n.AppleDouble\n.LSOverride\n._*",
  Windows: "Thumbs.db\nehthumbs.db\nDesktop.ini\n$RECYCLE.BIN/",
  "VS Code": ".vscode/*\n!.vscode/settings.json\n!.vscode/extensions.json",
  JetBrains: ".idea/\n*.iml",
  Logs: "*.log\nlogs/",
};
function GitignoreTool() {
  const [sel, setSel] = useState(["Node", "Env & secrets", "macOS", "Windows"]);
  const text = sel.map((k) => `# ${k}\n${IGN[k]}`).join("\n\n") + "\n";
  return (
    <div>
      <div className="flex flex-wrap gap-2">{Object.keys(IGN).map((k) => <Chip key={k} on={sel.includes(k)} onClick={() => setSel((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))}>{k}</Chip>)}</div>
      <Out text={sel.length ? text : ""} name=".gitignore" />
      <Note>Put this file in the root of your project before your first push so folders like node_modules and secret files never reach GitHub. Already pushed a secret? Rotate it, because deleting the file does not remove it from history.</Note>
    </div>
  );
}

/* ------------------------------ Generic text tool ------------------------------ */
function TextTool({ actions, placeholder, rows = 7, extra }) {
  const [v, setV] = useState("");
  const [r, setR] = useState({ text: "", error: "" });
  const run = (fn) => { try { setR({ text: String(fn(v)), error: "" }); } catch (e) { setR({ text: "", error: e.message || "Invalid input" }); } };
  return (
    <div>
      <textarea value={v} onChange={(e) => setV(e.target.value)} rows={rows} placeholder={placeholder} spellCheck={false} className={`${inputCls} ${mono}`} />
      {extra}
      <div className="mt-3 flex flex-wrap gap-2">{actions.map(([l, fn]) => <button key={l} type="button" onClick={() => run(fn)} className={ghost}>{l}</button>)}</div>
      <Out {...r} />
    </div>
  );
}

/* ------------------------------ JSON ------------------------------ */
function parseJson(s) {
  try { return JSON.parse(s); } catch (e) {
    const m = /position (\d+)/.exec(e.message); let where = "";
    if (m) { const pos = Number(m[1]); const before = s.slice(0, pos).split("\n"); where = ` (line ${before.length}, column ${before[before.length - 1].length + 1})`; }
    throw new Error(e.message.replace(/ in JSON at position \d+.*/, "") + where);
  }
}
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
function JsonTool() {
  const [indent, setIndent] = useState("2");
  const ind = indent === "tab" ? "\t" : Number(indent);
  return <TextTool placeholder='{"paste":"JSON here"}' rows={9}
    extra={<div className="mt-3 flex items-center gap-2 text-sm text-neutral-400">Indent<select value={indent} onChange={(e) => setIndent(e.target.value)} className="rounded-lg border border-white/15 bg-black/40 px-2 py-1"><option value="2">2 spaces</option><option value="4">4 spaces</option><option value="tab">Tab</option></select></div>}
    actions={[["Format", (s) => JSON.stringify(parseJson(s), null, ind)], ["Minify", (s) => JSON.stringify(parseJson(s))], ["Sort keys", (s) => JSON.stringify(sortKeys(parseJson(s)), null, ind)], ["Validate", (s) => { parseJson(s); return "Valid JSON"; }]]} />;
}

function toTS(json, root = "Root") {
  const decls = new Map();
  const pascal = (s) => s.replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c || "").toUpperCase()).replace(/^./, (c) => c.toUpperCase()) || "Item";
  const single = (s) => s.replace(/ies$/, "y").replace(/s$/, "");
  const typeOf = (v, name) => {
    if (v === null) return "null";
    if (Array.isArray(v)) { if (!v.length) return "unknown[]"; const ts = [...new Set(v.map((x) => typeOf(x, single(name))))]; return (ts.length > 1 ? `(${ts.join(" | ")})` : ts[0]) + "[]"; }
    if (typeof v === "object") {
      const body = Object.entries(v).map(([k, val]) => `  ${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${typeOf(val, k)};`).join("\n");
      let n = pascal(name), i = 1; const decl = (nm) => `interface ${nm} {\n${body}\n}`;
      while (decls.has(n) && decls.get(n) !== decl(n)) { i += 1; n = pascal(name) + i; }
      decls.set(n, decl(n)); return n;
    }
    return typeof v === "string" ? "string" : typeof v === "number" ? "number" : typeof v === "boolean" ? "boolean" : "unknown";
  };
  const t = typeOf(parseJson(json), root);
  return decls.size ? [...decls.values()].reverse().join("\n\n") : `type ${root} = ${t};`;
}

/* ------------------------------ Encoders ------------------------------ */
const b64enc = (s, urlSafe) => { const b = btoa(String.fromCharCode(...new TextEncoder().encode(s))); return urlSafe ? b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : b; };
const b64dec = (s) => { let t = s.trim().replace(/-/g, "+").replace(/_/g, "/"); while (t.length % 4) t += "="; return new TextDecoder().decode(Uint8Array.from(atob(t), (c) => c.charCodeAt(0))); };
const parseUrl = (s) => {
  const u = new URL(s.trim());
  const rows = [["Protocol", u.protocol], ["Host", u.host], ["Path", u.pathname], ["Hash", u.hash || "-"]];
  const params = [...u.searchParams.entries()];
  return rows.map(([k, v]) => `${k.padEnd(9)} ${v}`).join("\n") + (params.length ? "\n\nQuery\n" + params.map(([k, v]) => `  ${k} = ${v}`).join("\n") : "");
};

function JwtTool() {
  const [v, setV] = useState("");
  let out = "", error = "";
  if (v.trim()) {
    try {
      const parts = v.trim().split(".");
      if (parts.length < 2) throw new Error("A JWT has three parts separated by dots.");
      const h = JSON.parse(b64dec(parts[0])), p = JSON.parse(b64dec(parts[1]));
      const when = (x) => new Date(x * 1000).toLocaleString();
      const notes = [];
      if (p.exp) notes.push(`exp  ${when(p.exp)}  ${p.exp * 1000 < Date.now() ? "(EXPIRED)" : "(still valid)"}`);
      if (p.iat) notes.push(`iat  ${when(p.iat)}`);
      if (p.nbf) notes.push(`nbf  ${when(p.nbf)}`);
      out = `HEADER\n${JSON.stringify(h, null, 2)}\n\nPAYLOAD\n${JSON.stringify(p, null, 2)}${notes.length ? "\n\nTIMES\n" + notes.join("\n") : ""}`;
    } catch (e) { error = e.message.includes("JSON") ? "That does not look like a valid JWT." : e.message; }
  }
  return <div><textarea value={v} onChange={(e) => setV(e.target.value)} rows={5} placeholder="Paste a JWT (eyJ…)" spellCheck={false} className={`${inputCls} ${mono}`} /><Out text={out} error={error} /><Note>This only decodes the token. It does not check the signature, so never trust a token just because it decodes. Do not paste production tokens into tools you do not trust.</Note></div>;
}

function HashTool() {
  const [v, setV] = useState("");
  const [key, setKey] = useState("");
  const [out, setOut] = useState("");
  useEffect(() => {
    let live = true;
    (async () => {
      if (!v || !crypto.subtle) { setOut(""); return; }
      const data = new TextEncoder().encode(v); const rows = [];
      for (const a of ["SHA-1", "SHA-256", "SHA-384", "SHA-512"]) rows.push(`${a.padEnd(8)} ${hex(await crypto.subtle.digest(a, data))}`);
      if (key) { const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); rows.push(`HMAC-256 ${hex(await crypto.subtle.sign("HMAC", k, data))}`); }
      if (live) setOut(rows.join("\n"));
    })();
    return () => { live = false; };
  }, [v, key]);
  return <div><textarea value={v} onChange={(e) => setV(e.target.value)} rows={5} placeholder="Type text to hash" className={`${inputCls} ${mono}`} /><input value={key} onChange={(e) => setKey(e.target.value)} placeholder="HMAC secret key (optional)" className={`${inputCls} mt-3`} /><Out text={out} /></div>;
}

function PasswordTool() {
  const [len, setLen] = useState(20);
  const [opt, setOpt] = useState({ lower: true, upper: true, digits: true, symbols: true });
  const [n, setN] = useState(0);
  const sets = { lower: "abcdefghijklmnopqrstuvwxyz", upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", digits: "0123456789", symbols: "!@#$%^&*()-_=+[]{};:,.?" };
  const pool = Object.entries(opt).filter(([, on]) => on).map(([k]) => sets[k]).join("");
  const pws = useMemo(() => {
    if (!pool) return [];
    const pick = () => { const lim = 256 - (256 % pool.length); const b = new Uint8Array(1); for (;;) { crypto.getRandomValues(b); if (b[0] < lim) return pool[b[0] % pool.length]; } };
    return Array.from({ length: 5 }, () => Array.from({ length: len }, pick).join(""));
  }, [len, pool, n]);
  const bits = pool ? Math.round(len * Math.log2(pool.length)) : 0;
  return (
    <div>
      <label className={label}>Length: {len}</label>
      <input type="range" min="8" max="64" value={len} onChange={(e) => setLen(Number(e.target.value))} className="w-full accent-amber-400" />
      <div className="mt-3 flex flex-wrap gap-2">{Object.keys(sets).map((k) => <Chip key={k} on={opt[k]} onClick={() => setOpt((p) => ({ ...p, [k]: !p[k] }))}>{k}</Chip>)}<button onClick={() => setN((x) => x + 1)} className={ghost}>Generate again</button></div>
      <Out text={pws.join("\n")} />
      {pool && <Note>About {bits} bits of entropy. {bits >= 80 ? "Strong." : bits >= 60 ? "Decent." : "Make it longer."} Generated in your browser with secure randomness.</Note>}
    </div>
  );
}

function UuidTool() {
  const [count, setCount] = useState(5);
  const [upper, setUpper] = useState(false);
  const [dash, setDash] = useState(true);
  const [n, setN] = useState(0);
  const ids = useMemo(() => Array.from({ length: count }, () => { let u = crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); }); if (!dash) u = u.replace(/-/g, ""); return upper ? u.toUpperCase() : u; }), [count, upper, dash, n]);
  return <div><div className="flex flex-wrap gap-2">{[1, 5, 10, 25].map((c) => <Chip key={c} on={count === c} onClick={() => setCount(c)}>{c}</Chip>)}<Chip on={upper} onClick={() => setUpper(!upper)}>UPPERCASE</Chip><Chip on={dash} onClick={() => setDash(!dash)}>Dashes</Chip><button onClick={() => setN((x) => x + 1)} className={ghost}>Generate again</button></div><Out text={ids.join("\n")} /></div>;
}

/* ------------------------------ Time / Colors / Case / Chmod ------------------------------ */
function TimeTool() {
  const [v, setV] = useState(String(Math.floor(Date.now() / 1000)));
  let out = "", error = "";
  try {
    const t = v.trim(); if (!t) throw new Error("");
    const d = /^-?\d+(\.\d+)?$/.test(t) ? new Date(Number(t) < 1e11 ? Number(t) * 1000 : Number(t)) : new Date(t);
    if (isNaN(d)) throw new Error("Could not read that date.");
    const diff = Math.round((d.getTime() - Date.now()) / 1000), a = Math.abs(diff);
    const rel = a < 60 ? `${a}s` : a < 3600 ? `${Math.round(a / 60)}m` : a < 86400 ? `${Math.round(a / 3600)}h` : `${Math.round(a / 86400)}d`;
    out = `ISO:      ${d.toISOString()}\nLocal:    ${d.toLocaleString()}\nUTC:      ${d.toUTCString()}\nUnix s:   ${Math.floor(d.getTime() / 1000)}\nUnix ms:  ${d.getTime()}\nRelative: ${diff < 0 ? rel + " ago" : "in " + rel}`;
  } catch (e) { error = e.message; }
  return <div><div className="flex gap-2"><input value={v} onChange={(e) => setV(e.target.value)} placeholder="Unix time or a date" className={inputCls} /><button onClick={() => setV(String(Math.floor(Date.now() / 1000)))} className={ghost}>Now</button></div><Out text={out} error={error} /></div>;
}

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
function parseColor(s) {
  s = s.trim().toLowerCase(); let m;
  if ((m = /^#?([0-9a-f]{3})$/.exec(s))) return [...m[1]].map((c) => parseInt(c + c, 16));
  if ((m = /^#?([0-9a-f]{6})$/.exec(s))) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  if ((m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(s))) return [m[1], m[2], m[3]].map((x) => clamp(Number(x), 0, 255));
  if ((m = /^hsla?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)%[\s,]+(\d+(?:\.\d+)?)%/.exec(s))) {
    const h = Number(m[1]) / 360, sl = Number(m[2]) / 100, l = Number(m[3]) / 100;
    const f = (n) => { const k = (n + h * 12) % 12; return Math.round(255 * (l - sl * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return [f(0), f(8), f(4)];
  }
  return null;
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}
function ColorTool() {
  const [v, setV] = useState("#fbbf24");
  const rgb = parseColor(v);
  const H = rgb ? "#" + rgb.map((x) => x.toString(16).padStart(2, "0")).join("") : "#000000";
  return (
    <div>
      <div className="flex gap-2"><input value={v} onChange={(e) => setV(e.target.value)} placeholder="#fbbf24, rgb(251,191,36) or hsl(43,96%,56%)" className={inputCls} /><input type="color" value={H} onChange={(e) => setV(e.target.value)} className="h-[50px] w-14 shrink-0 cursor-pointer rounded-xl border border-white/15 bg-black/40 p-1" aria-label="Pick a color" /></div>
      {rgb ? <><div className="mt-3 h-16 rounded-xl border border-white/10" style={{ background: H }} /><Out text={`HEX  ${H}\nRGB  rgb(${rgb.join(", ")})\nHSL  hsl(${rgbToHsl(rgb)[0]}, ${rgbToHsl(rgb)[1]}%, ${rgbToHsl(rgb)[2]}%)`} /></> : v.trim() && <Out error="Could not read that color." />}
    </div>
  );
}

function CaseTool() {
  const [v, setV] = useState("");
  const words = v.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w.toLowerCase());
  const cap = (w) => w[0].toUpperCase() + w.slice(1);
  const out = words.length ? [`camelCase     ${words.map((w, i) => (i ? cap(w) : w)).join("")}`, `PascalCase    ${words.map(cap).join("")}`, `snake_case    ${words.join("_")}`, `kebab-case    ${words.join("-")}`, `CONSTANT_CASE ${words.join("_").toUpperCase()}`, `Title Case    ${words.map(cap).join(" ")}`, `lower case    ${words.join(" ")}`, `UPPER CASE    ${words.join(" ").toUpperCase()}`].join("\n") : "";
  return <div><input value={v} onChange={(e) => setV(e.target.value)} placeholder="Type or paste a name, e.g. user profile id" className={inputCls} /><Out text={out} /></div>;
}

function ChmodTool() {
  const [p, setP] = useState([true, true, true, true, false, true, true, false, true]);
  const digits = [0, 1, 2].map((i) => (p[i * 3] ? 4 : 0) + (p[i * 3 + 1] ? 2 : 0) + (p[i * 3 + 2] ? 1 : 0));
  const octal = digits.join("");
  const sym = p.map((on, i) => (on ? "rwx"[i % 3] : "-")).join("");
  const setOctal = (s) => { if (!/^[0-7]{3}$/.test(s)) return; setP([...s].flatMap((d) => [(+d & 4) > 0, (+d & 2) > 0, (+d & 1) > 0])); };
  return (
    <div>
      <div className="overflow-x-auto"><table className="text-sm"><thead><tr className="text-xs text-neutral-400"><th className="pr-6 text-left" /><th className="px-4">Read</th><th className="px-4">Write</th><th className="px-4">Execute</th></tr></thead>
        <tbody>{["Owner", "Group", "Others"].map((r, ri) => <tr key={r}><td className="py-2 pr-6">{r}</td>{[0, 1, 2].map((ci) => <td key={ci} className="px-4 text-center"><input type="checkbox" checked={p[ri * 3 + ci]} onChange={() => setP((x) => x.map((v, i) => (i === ri * 3 + ci ? !v : v)))} className="h-5 w-5 accent-amber-400" /></td>)}</tr>)}</tbody></table></div>
      <div className="mt-4"><label className={label}>Octal</label><input value={octal} onChange={(e) => setOctal(e.target.value)} maxLength={3} className={`${inputCls} !w-28 ${mono}`} /></div>
      <Out text={`${sym}\nchmod ${octal} file`} />
      <div className="mt-2 flex flex-wrap gap-2">{[["755", "scripts, folders"], ["644", "normal files"], ["600", "private keys"], ["777", "everyone (avoid)"]].map(([o, d]) => <button key={o} onClick={() => setOctal(o)} className={`${ghost} !py-1.5 text-xs`}>{o} · {d}</button>)}</div>
    </div>
  );
}

/* ------------------------------ Regex / Diff / API / Text tools ------------------------------ */
const REGEX_PRESETS = [["Email", "[\\w.+-]+@[\\w-]+\\.[\\w.-]+"], ["URL", "https?:\\/\\/[^\\s]+"], ["IPv4", "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b"], ["Hex color", "#(?:[0-9a-fA-F]{3}){1,2}\\b"], ["Date (YYYY-MM-DD)", "\\d{4}-\\d{2}-\\d{2}"], ["Numbers", "-?\\d+(?:\\.\\d+)?"]];
function RegexTool() {
  const [pat, setPat] = useState("");
  const [flags, setFlags] = useState("g");
  const [text, setText] = useState("");
  const [rep, setRep] = useState("");
  let segs = null, matches = [], error = "", replaced = "";
  if (pat) {
    try {
      const re = new RegExp(pat, flags.includes("g") ? flags : flags + "g");
      matches = [...text.matchAll(re)].slice(0, 500);
      segs = []; let last = 0;
      matches.forEach((m) => { if (m[0] === "") return; segs.push([false, text.slice(last, m.index)], [true, m[0]]); last = m.index + m[0].length; });
      segs.push([false, text.slice(last)]);
      if (rep) replaced = text.replace(re, rep);
    } catch (e) { error = e.message; }
  }
  return (
    <div>
      <div className="flex gap-2"><input value={pat} onChange={(e) => setPat(e.target.value)} placeholder="Pattern, e.g. \d+" className={`${inputCls} ${mono}`} /><input value={flags} onChange={(e) => setFlags(e.target.value.replace(/[^gimsuy]/g, ""))} className={`${inputCls} !w-20 ${mono}`} aria-label="Flags" /></div>
      <div className="mt-2 flex flex-wrap gap-2">{REGEX_PRESETS.map(([n, r]) => <button key={n} onClick={() => setPat(r)} className={`${ghost} !py-1 text-xs`}>{n}</button>)}</div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Text to test against" className={`${inputCls} mt-3 ${mono}`} />
      {error ? <Out error={error} /> : segs && text && (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/40 p-4"><div className="mb-2 text-xs text-neutral-400">{matches.length} match{matches.length === 1 ? "" : "es"}</div>
          <div className={`whitespace-pre-wrap break-words ${mono} leading-6 text-neutral-300`}>{segs.map(([hit, s], i) => (hit ? <mark key={i} className="rounded bg-amber-400/30 px-0.5 text-amber-100">{s}</mark> : <span key={i}>{s}</span>))}</div></div>
      )}
      {matches.some((m) => m.length > 1) && <Out text={matches.slice(0, 50).map((m, i) => `${i + 1}. ${m.slice(1).map((g) => JSON.stringify(g)).join(", ")}`).join("\n")} />}
      <input value={rep} onChange={(e) => setRep(e.target.value)} placeholder="Replace with (optional, supports $1)" className={`${inputCls} mt-3 ${mono}`} />
      <Out text={replaced} />
    </div>
  );
}

function DiffTool() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const rows = useMemo(() => {
    const x = a.split("\n"), y = b.split("\n");
    if (!a && !b) return null;
    if (x.length > 1500 || y.length > 1500) return "toolong";
    const n = x.length, m = y.length, dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = []; let i = 0, j = 0;
    while (i < n && j < m) { if (x[i] === y[j]) { out.push([" ", x[i]]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push(["-", x[i++]]); else out.push(["+", y[j++]]); }
    while (i < n) out.push(["-", x[i++]]); while (j < m) out.push(["+", y[j++]]);
    return out;
  }, [a, b]);
  return (
    <div>
      <div className="grid gap-3 md:grid-cols-2"><textarea value={a} onChange={(e) => setA(e.target.value)} rows={8} placeholder="Original text" spellCheck={false} className={`${inputCls} ${mono}`} /><textarea value={b} onChange={(e) => setB(e.target.value)} rows={8} placeholder="Changed text" spellCheck={false} className={`${inputCls} ${mono}`} /></div>
      {rows === "toolong" ? <Out error="Please compare up to 1500 lines at a time." /> : rows && (
        <div className="mt-3 overflow-hidden rounded-xl border border-white/10"><div className="border-b border-white/10 px-4 py-2 text-xs text-neutral-400"><span className="text-emerald-300">+{rows.filter((r) => r[0] === "+").length}</span> added, <span className="text-red-300">-{rows.filter((r) => r[0] === "-").length}</span> removed</div>
          <div className="max-h-96 overflow-auto">{rows.map(([t, s], i) => <div key={i} className={`flex ${mono} leading-6 ${t === "+" ? "bg-emerald-500/10 text-emerald-200" : t === "-" ? "bg-red-500/10 text-red-200" : "text-neutral-400"}`}><span className="w-6 shrink-0 select-none text-center">{t}</span><span className="whitespace-pre-wrap break-all pr-3">{s || " "}</span></div>)}</div></div>
      )}
    </div>
  );
}

function ApiTool() {
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("https://api.github.com/zen");
  const [hdr, setHdr] = useState("Accept: application/json");
  const [body, setBody] = useState("");
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const headers = () => Object.fromEntries(hdr.split("\n").map((l) => l.split(/:(.*)/s)).filter((p) => p[0].trim() && p[1] != null).map((p) => [p[0].trim(), p[1].trim()]));
  const curl = () => `curl -X ${method} ${q1(url)}${Object.entries(headers()).map(([k, v]) => ` -H ${q1(k + ": " + v)}`).join("")}${body && !["GET", "HEAD"].includes(method) ? ` -d ${q1(body)}` : ""}`;
  const send = async () => {
    setBusy(true); setRes(null); const t0 = performance.now(); const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 20000);
    try {
      const r = await fetch(url, { method, headers: headers(), body: body && !["GET", "HEAD"].includes(method) ? body : undefined, signal: ac.signal });
      let text = await r.text(); const ms = Math.round(performance.now() - t0);
      try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* not JSON */ }
      setRes({ ok: r.ok, status: `${r.status} ${r.statusText}`, ms, size: text.length, headers: [...r.headers.entries()].map(([k, v]) => `${k}: ${v}`).join("\n"), text: text.slice(0, 200000) });
    } catch (e) { setRes({ error: e.name === "AbortError" ? "Timed out after 20 seconds." : "Request failed. The server may block browser requests (CORS), or the address is wrong. For those, use the cURL command in a terminal." }); }
    clearTimeout(to); setBusy(false);
  };
  return (
    <div>
      <div className="flex gap-2"><select value={method} onChange={(e) => setMethod(e.target.value)} className={`${inputCls} !w-28`}>{["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].map((m) => <option key={m}>{m}</option>)}</select><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/items" inputMode="url" className={inputCls} /></div>
      <textarea value={hdr} onChange={(e) => setHdr(e.target.value)} rows={3} placeholder="Header-Name: value (one per line)" spellCheck={false} className={`${inputCls} mt-3 ${mono}`} />
      {!["GET", "HEAD"].includes(method) && <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Request body" spellCheck={false} className={`${inputCls} mt-3 ${mono}`} />}
      <div className="mt-3 flex flex-wrap gap-2"><button onClick={send} disabled={busy || !url.trim()} className={`${pill} flex items-center`}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send</button><button onClick={() => copyText(curl())} className={ghost}>Copy as cURL</button></div>
      {res?.error && <Out error={res.error} />}
      {res && !res.error && (
        <div className="mt-3"><div className="flex flex-wrap gap-3 text-sm"><span className={`rounded-full border px-3 py-0.5 font-semibold ${res.ok ? "border-emerald-500/40 text-emerald-300" : "border-red-500/40 text-red-300"}`}>{res.status}</span><span className="text-neutral-400">{res.ms} ms</span><span className="text-neutral-400">{fmtSize(res.size)}</span></div>
          <Out text={res.text || "(empty body)"} /><details className="mt-2 text-sm text-neutral-400"><summary className="cursor-pointer">Response headers</summary><pre className={`mt-2 overflow-auto ${mono}`}>{res.headers}</pre></details></div>
      )}
      <Note>Requests are sent from your browser, so APIs that do not allow cross-origin requests will fail here.</Note>
    </div>
  );
}

function TextUtils() {
  const [v, setV] = useState("");
  const lines = v ? v.split("\n") : [];
  const ops = [["Sort A to Z", (l) => [...l].sort((x, y) => x.localeCompare(y))], ["Sort Z to A", (l) => [...l].sort((x, y) => y.localeCompare(x))], ["Reverse lines", (l) => [...l].reverse()], ["Remove duplicates", (l) => [...new Set(l)]], ["Trim lines", (l) => l.map((x) => x.trim())], ["Remove empty lines", (l) => l.filter((x) => x.trim())], ["UPPERCASE", (l) => l.map((x) => x.toUpperCase())], ["lowercase", (l) => l.map((x) => x.toLowerCase())]];
  return (
    <div>
      <textarea value={v} onChange={(e) => setV(e.target.value)} rows={10} placeholder="Paste text, one item per line" spellCheck={false} className={`${inputCls} ${mono}`} />
      <div className="mt-2 text-xs text-neutral-400">{v.length} characters · {v.trim() ? v.trim().split(/\s+/).length : 0} words · {lines.length} lines</div>
      <div className="mt-3 flex flex-wrap gap-2">{ops.map(([l, fn]) => <button key={l} onClick={() => setV(fn(lines).join("\n"))} className={ghost}>{l}</button>)}<CopyBtn text={v} className="px-2" /></div>
    </div>
  );
}

/* ------------------------------ Hub ------------------------------ */
const TOOLS = [
  { id: "push", cat: "GitHub", icon: Upload, name: "Push Files to GitHub", desc: "Connect GitHub, then upload files or whole folders to any repo.", C: PushTool, wide: true },
  { id: "script", cat: "GitHub", icon: Terminal, name: "PowerShell & Git Scripts", desc: "Ready-to-run scripts to push, clone, branch and undo, plus a Git cheat sheet.", C: ScriptTool, wide: true },
  { id: "gitignore", cat: "GitHub", icon: Ban, name: ".gitignore Generator", desc: "Pick your stack and get a clean .gitignore.", C: GitignoreTool },
  { id: "json", cat: "Format & convert", icon: Braces, name: "JSON", desc: "Format, minify, sort keys and validate with line numbers.", C: JsonTool },
  { id: "jsonts", cat: "Format & convert", icon: GitBranch, name: "JSON to TypeScript", desc: "Turn a JSON sample into TypeScript interfaces.", C: () => <TextTool placeholder='{"id":1,"name":"Ada"}' rows={9} actions={[["Generate interfaces", (s) => toTS(s)]]} /> },
  { id: "base64", cat: "Format & convert", icon: Binary, name: "Base64", desc: "Encode and decode, including URL-safe Base64.", C: () => <TextTool placeholder="Text or Base64" actions={[["Encode", (s) => b64enc(s)], ["Encode URL-safe", (s) => b64enc(s, true)], ["Decode", b64dec]]} /> },
  { id: "url", cat: "Format & convert", icon: Link2, name: "URL", desc: "Encode, decode and break a URL into its parts.", C: () => <TextTool placeholder="Text or a full URL" actions={[["Encode", encodeURIComponent], ["Decode", decodeURIComponent], ["Parse URL", parseUrl]]} /> },
  { id: "case", cat: "Format & convert", icon: Type, name: "Case Converter", desc: "camelCase, snake_case, kebab-case and more at once.", C: CaseTool },
  { id: "color", cat: "Format & convert", icon: Palette, name: "Color Converter", desc: "HEX, RGB and HSL with a color picker.", C: ColorTool },
  { id: "text", cat: "Format & convert", icon: Type, name: "Text Utilities", desc: "Sort, dedupe, trim and count lines and words.", C: TextUtils },
  { id: "jwt", cat: "Security", icon: KeyRound, name: "JWT Decoder", desc: "Read a token's header, payload and expiry.", C: JwtTool },
  { id: "hash", cat: "Security", icon: Hash, name: "Hash & HMAC", desc: "SHA-1, SHA-256, SHA-384, SHA-512 and HMAC.", C: HashTool },
  { id: "password", cat: "Security", icon: Lock, name: "Password Generator", desc: "Strong random passwords made in your browser.", C: PasswordTool },
  { id: "uuid", cat: "Security", icon: Fingerprint, name: "UUID Generator", desc: "Random v4 UUIDs, one or many.", C: UuidTool },
  { id: "api", cat: "Build & test", icon: Globe, name: "API Tester", desc: "Send HTTP requests and inspect the response. Copy as cURL.", C: ApiTool, wide: true },
  { id: "regex", cat: "Build & test", icon: Regex, name: "Regex Tester", desc: "Live highlighting, capture groups and replace.", C: RegexTool },
  { id: "diff", cat: "Build & test", icon: Diff, name: "Text Diff", desc: "Compare two texts line by line.", C: DiffTool, wide: true },
  { id: "time", cat: "Build & test", icon: Clock, name: "Time & Epoch", desc: "Unix time, ISO dates and relative time.", C: TimeTool },
  { id: "chmod", cat: "Build & test", icon: Calculator, name: "chmod Calculator", desc: "Tick permissions, get the octal and command.", C: ChmodTool },
];
const CATS = ["GitHub", "Format & convert", "Security", "Build & test"];

export default function DevToolsHub() {
  const [id, setId] = useState(null);
  const [q, setQ] = useState("");
  const tool = TOOLS.find((t) => t.id === id);
  const shown = TOOLS.filter((t) => !q || `${t.name} ${t.desc} ${t.cat}`.toLowerCase().includes(q.toLowerCase()));

  if (tool) {
    const C = tool.C;
    return (
      <div className="p-4 sm:p-6">
        <button onClick={() => setId(null)} className="mb-4 flex items-center text-sm font-semibold text-neutral-300 hover:text-white"><ArrowLeft className="mr-2 h-4 w-4" />All tools</button>
        <div className="mb-5 flex items-center"><span className="mr-3 grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/[.06]"><tool.icon className="h-5 w-5 text-amber-300" /></span><div><h2 className="text-2xl font-semibold leading-tight" style={SERIF}>{tool.name}</h2><p className="text-sm text-neutral-400">{tool.desc}</p></div></div>
        <div className={tool.wide ? "max-w-4xl" : "max-w-3xl"}><C /></div>
      </div>
    );
  }
  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex items-center rounded-2xl border border-white/15 px-4 py-3"><Search className="mr-2 h-4 w-4 text-neutral-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${TOOLS.length} tools…`} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-neutral-500" /></div>
      {CATS.map((c) => {
        const list = shown.filter((t) => t.cat === c);
        if (!list.length) return null;
        return (
          <div key={c} className="mb-8"><h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-400">{c}</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{list.map((t) => (
              <button key={t.id} onClick={() => setId(t.id)} className="flex items-start rounded-2xl border border-white/10 p-4 text-left transition hover:bg-white/[.04]">
                <span className="mr-3 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[.06]"><t.icon className="h-5 w-5 text-amber-300" /></span>
                <span className="min-w-0"><span className="block text-base font-semibold" style={SERIF}>{t.name}</span><span className="mt-0.5 block text-sm leading-5 text-neutral-400">{t.desc}</span></span>
              </button>))}</div></div>
        );
      })}
      {shown.length === 0 && <p className="p-8 text-center text-sm text-neutral-400">No tools match.</p>}
    </div>
  );
}

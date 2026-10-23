import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, ExternalLink, Globe, Link2, Loader2, RefreshCw, Rocket, Trash2, Unplug, X } from "lucide-react";
import { api } from "../../../api/client";

// "Host" panel for Codex.
//  - Xyron link: publishes the project's web files (html/css/js/json/svg) to a public link, instantly.
//  - Render: connect a Render API key, then redeploy a service or create a static site.
//    Render builds from a Git repository, so a NEW Render site needs the repo that holds the files.

const field = "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-white/30";
const btn = "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
const primary = `${btn} bg-white text-black hover:bg-neutral-200`;
const ghost = `${btn} border border-white/15 text-white hover:bg-white/10`;

const HOSTABLE = /\.(html?|css|m?js|json|svg|txt|md|xml)$/i;

function toHostFiles(files, project) {
  const list = files.filter((f) => (f.project || "untitled") === project && HOSTABLE.test(f.name || "") && typeof f.content === "string");
  return list.map((f) => ({ path: f.name, content: f.content }));
}

function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ } }} className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 hover:bg-white/10 hover:text-white" aria-label="Copy link">
      {done ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function XyronLink({ files, project }) {
  const [sites, setSites] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [last, setLast] = useState(null);
  const hostFiles = toHostFiles(files, project);

  const load = useCallback(() => { api.host.list().then((r) => setSites(r.sites || [])).catch(() => {}); }, []);
  useEffect(load, [load]);

  const publish = async () => {
    setBusy(true); setError("");
    try {
      const existing = sites.find((s) => s.name === project);
      const r = await api.host.publish({ name: project, files: hostFiles, siteId: existing?.id });
      setLast(r); load();
    } catch (e) { setError(e?.message || "Could not publish."); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-400">Publish <span className="text-white">{project}</span> to a public link anyone can open. Publishing again updates the same link.</p>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-neutral-400">
        {hostFiles.length ? <>Will publish {hostFiles.length} file{hostFiles.length > 1 ? "s" : ""}: <span className="text-neutral-200">{hostFiles.map((f) => f.path).slice(0, 6).join(", ")}{hostFiles.length > 6 ? "…" : ""}</span></> : "No web files in this project yet (html, css, js, json, svg)."}
      </div>
      <button type="button" onClick={publish} disabled={busy || !hostFiles.length} className={primary}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />} {sites.some((s) => s.name === project) ? "Update link" : "Publish"}
      </button>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {last && (
        <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.05] p-3">
          <Link2 className="h-4 w-4 shrink-0 text-neutral-400" />
          <a href={last.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm text-white underline-offset-2 hover:underline">{last.url}</a>
          <CopyButton text={last.url} />
        </div>
      )}
      {sites.length > 0 && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-widest text-neutral-500">Your hosted sites</p>
          <ul className="space-y-1.5">
            {sites.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{s.name}</p>
                  <a href={s.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-neutral-500 hover:text-neutral-300">{s.url}</a>
                </div>
                <CopyButton text={s.url} />
                <button type="button" aria-label={`Delete ${s.name}`} onClick={async () => { await api.host.remove(s.id).catch(() => {}); load(); }} className="grid h-8 w-8 place-items-center rounded-full text-neutral-500 hover:bg-white/10 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-neutral-600">Hosted pages run in a sandbox and can't use your Xyron account. Up to 2 MB per site.</p>
    </div>
  );
}

function RenderTab({ project }) {
  const [state, setState] = useState("loading"); // loading | off | on
  const [owner, setOwner] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [services, setServices] = useState([]);
  const [shared, setShared] = useState(false); // hosted through Xryon's own Render account
  const [site, setSite] = useState({ name: project.replace(/[^A-Za-z0-9-]+/g, "-").slice(0, 40), repo: "", branch: "main" });

  const loadServices = useCallback(async () => {
    setBusy("services"); setError("");
    try { const r = await api.render.services(); setServices(r.services || []); }
    catch (e) { setError(e?.message || "Could not load your Render services."); if (e?.status === 409 || e?.status === 401) setState("off"); }
    finally { setBusy(""); }
  }, []);

  useEffect(() => {
    api.render.status().then((r) => { setShared(!!r.shared); setOwner(r.ownerName || ""); setState(r.connected ? "on" : "off"); if (r.connected) loadServices(); }).catch(() => setState("off"));
  }, [loadServices]);

  const connect = async (e) => {
    e.preventDefault(); setBusy("connect"); setError("");
    try { const r = await api.render.connect(key.trim()); setOwner(r.ownerName || ""); setKey(""); setState("on"); loadServices(); }
    catch (err) { setError(err?.message || "Could not connect."); } finally { setBusy(""); }
  };

  const deploy = async (s) => {
    setBusy(s.id); setError(""); setInfo("");
    try { await api.render.deploy(s.id); setInfo(`Deploy started for ${s.name}. Watch it on Render.`); }
    catch (err) { setError(err?.message || "Could not start the deploy."); } finally { setBusy(""); }
  };

  const create = async (e) => {
    e.preventDefault(); setBusy("create"); setError(""); setInfo("");
    try { const r = await api.render.createSite(site); setInfo(r.url ? `Created. It will be live at ${r.url} once the first build finishes.` : "Created. Open Render to watch the first build."); loadServices(); }
    catch (err) { setError(err?.message || "Could not create the site."); } finally { setBusy(""); }
  };

  if (state === "loading") return <div className="grid place-items-center py-10"><Loader2 className="h-5 w-5 animate-spin text-neutral-500" /></div>;

  if (state === "off") {
    return (
      <form onSubmit={connect} className="space-y-4">
        <p className="text-sm text-neutral-400">Connect your Render account to deploy from Xyron. In Render, open <span className="text-white">Account Settings → API Keys</span>, create a key and paste it here.</p>
        <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="rnd_…" aria-label="Render API key" className={field} />
        <button type="submit" disabled={!key.trim() || busy === "connect"} className={primary}>{busy === "connect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Connect Render</button>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <p className="text-[11px] text-neutral-600">The key is stored encrypted on the server and only used to call Render for you. A Render key can reach everything in your workspace, so only connect an account you are happy to use here. You can disconnect at any time.</p>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <span className="h-2 w-2 rounded-full bg-white" />
        <p className="min-w-0 flex-1 truncate text-sm text-white">{shared ? "Hosting by Xryon · free" : `Connected${owner ? ` · ${owner}` : ""}`}</p>
        <button type="button" onClick={loadServices} aria-label="Refresh services" className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 hover:bg-white/10 hover:text-white"><RefreshCw className={`h-4 w-4 ${busy === "services" ? "animate-spin" : ""}`} /></button>
        {!shared && <button type="button" onClick={async () => { await api.render.disconnect().catch(() => {}); setState("off"); setServices([]); }} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-neutral-400 hover:bg-white/10 hover:text-white"><Unplug className="h-3.5 w-3.5" /> Disconnect</button>}
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-widest text-neutral-500">Your services</p>
        {services.length === 0 && busy !== "services" && <p className="text-sm text-neutral-500">No services yet.</p>}
        <ul className="space-y-1.5">
          {services.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">{s.name} <span className="ml-1 text-[10px] uppercase tracking-wider text-neutral-500">{String(s.type).replace(/_/g, " ")}</span></p>
                {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-neutral-500 hover:text-neutral-300">{s.url}</a>}
              </div>
              {s.dashboardUrl && <a href={s.dashboardUrl} target="_blank" rel="noreferrer" aria-label="Open in Render" className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 hover:bg-white/10 hover:text-white"><ExternalLink className="h-4 w-4" /></a>}
              {shared && <button type="button" aria-label={`Remove ${s.name}`} disabled={!!busy} onClick={async () => { setBusy(s.id); setError(""); try { await api.render.remove(s.id); loadServices(); } catch (err) { setError(err?.message || "Could not remove it."); } finally { setBusy(""); } }} className="grid h-8 w-8 place-items-center rounded-full text-neutral-500 hover:bg-white/10 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>}
              <button type="button" disabled={!!busy || s.suspended} onClick={() => deploy(s)} className={ghost}>{busy === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Deploy</button>
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={create} className="space-y-2.5 rounded-2xl border border-white/10 p-3">
        <p className="text-xs uppercase tracking-widest text-neutral-500">New static site</p>
        <p className="text-xs text-neutral-500">Render builds from a Git repository. Push your files to GitHub or GitLab first, then paste the address here.</p>
        <input value={site.name} onChange={(e) => setSite({ ...site, name: e.target.value })} placeholder="Site name" aria-label="Site name" className={field} />
        <p className="text-[11px] text-neutral-500">Your link will be xryon-{String(site.name || "app").toLowerCase().replace(/^(?:xryon|xyron)[-_ ]*/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "app"}.onrender.com</p>
        <input value={site.repo} onChange={(e) => setSite({ ...site, repo: e.target.value })} placeholder="https://github.com/you/my-site" aria-label="Repository address" className={field} />
        <input value={site.branch} onChange={(e) => setSite({ ...site, branch: e.target.value })} placeholder="Branch (main)" aria-label="Branch" className={field} />
        <button type="submit" disabled={!!busy || !site.name.trim() || !site.repo.trim()} className={primary}>{busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />} Create on Render</button>
      </form>
      {info && <p role="status" className="text-sm text-neutral-200">{info}</p>}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </div>
  );
}

export default function CodexHostModal({ open, onClose, files = [], project = "untitled" }) {
  const [tab, setTab] = useState("link");
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);
  if (!open) return null;
  // Rendered into <body> so the square-corner Codex workspace theme does not restyle it.
  return createPortal(
    <div className="fixed inset-0 z-[120] grid place-items-end bg-black/70 backdrop-blur-sm sm:place-items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Host your project" className="codex-host max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-[#121212] p-5 text-white shadow-2xl sm:max-w-lg sm:rounded-3xl" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Host</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-neutral-400 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-full border border-white/10 bg-black/40 p-1" role="tablist">
          {[["link", "Xyron link"], ["render", "Render"]].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-full px-3 py-2 text-sm transition ${tab === id ? "bg-white text-black" : "text-neutral-400 hover:text-white"}`}>{label}</button>
          ))}
        </div>
        <div className="mt-5">{tab === "link" ? <XyronLink files={files} project={project} /> : <RenderTab project={project} />}</div>
      </div>
    </div>
  , document.body);
}

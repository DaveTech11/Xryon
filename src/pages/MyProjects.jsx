import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, FolderKanban, Globe, Loader2, Pencil, Rocket, RefreshCw, Code2 } from "lucide-react";
import { api } from "../api/client";
import Sidebar from "../components/xyron/Sidebar";

const META_KEY = "xyron_codex_project_metadata_v1";
function readMeta() { try { return JSON.parse(localStorage.getItem(META_KEY) || "{}"); } catch { return {}; } }
function saveMeta(value) { try { localStorage.setItem(META_KEY, JSON.stringify(value)); } catch { /* storage may be unavailable */ } }
function validUrl(value) { try { const u = new URL(value); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; } }

export default function MyProjects() {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [meta, setMeta] = useState(readMeta);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { api.entities.CodeFile.list().then(setFiles).catch((e) => setNotice(`Could not load saved Codex files: ${e.message}`)).finally(() => setLoading(false)); }, []);
  const projects = useMemo(() => {
    const groups = new Map();
    files.forEach((file) => { const name = file.project || "untitled"; if (!groups.has(name)) groups.set(name, []); groups.get(name).push(file); });
    return [...groups.entries()].map(([name, projectFiles]) => ({ name, files: projectFiles, count: projectFiles.length, updated: projectFiles.reduce((latest, f) => Math.max(latest, new Date(f.updatedAt || f.updated_at || f.createdAt || 0).getTime() || 0), 0) })).sort((a,b) => b.updated-a.updated);
  }, [files]);

  const updateMeta = (name, patch) => setMeta((prev) => { const next = { ...prev, [name]: { ...(prev[name] || {}), ...patch } }; saveMeta(next); return next; });
  const setRenderUrl = (project) => {
    const current = meta[project.name]?.renderUrl || "";
    const value = window.prompt(`Paste the live Render URL for “${project.name}”`, current);
    if (value === null) return;
    const trimmed = value.trim();
    if (trimmed && !validUrl(trimmed)) { setNotice("Enter a valid http:// or https:// URL."); return; }
    updateMeta(project.name, { renderUrl: trimmed }); setNotice(trimmed ? "Live URL saved on this device." : "Live URL removed.");
  };
  const redeploy = async (project) => {
    const details = meta[project.name] || {};
    if (!details.renderServiceId) {
      const serviceId = window.prompt("Enter the Render service ID for this project. You can find it in the Render dashboard URL.", "");
      if (!serviceId?.trim()) return;
      updateMeta(project.name, { renderServiceId: serviceId.trim() });
      details.renderServiceId = serviceId.trim();
    }
    setBusy(project.name); setNotice("");
    try {
      // This endpoint must be implemented by the trusted Xyron server; credentials never belong in the browser.
      const response = await fetch("/api/render/deploy", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ serviceId: details.renderServiceId, projectName: project.name }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || result.error || `Render deployment returned ${response.status}. Connect Render in Codex hosting settings first.`);
      setNotice(result.message || `Deployment queued for ${project.name}.`);
    } catch (e) { setNotice(e.message || "Could not start deployment."); }
    finally { setBusy(""); }
  };

  return <div className="min-h-screen bg-[#171717] text-white md:pl-[68px]">
    <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} desktopOpen={false} />
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-7 sm:py-10">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div><Link to="/codex" className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"><ArrowLeft size={16}/> Back to Codex</Link><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.06]"><FolderKanban size={22}/></div><div><h1 className="text-2xl font-semibold sm:text-3xl">My Projects</h1><p className="mt-1 text-sm text-neutral-400">Your Codex builds, live links, and deployment shortcuts.</p></div></div></div>
        <button onClick={() => setSidebarOpen(true)} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-neutral-300 hover:bg-white/5">Menu</button>
      </div>
      {notice && <div role="status" className="mb-5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-neutral-300">{notice}</div>}
      {loading ? <div className="flex items-center gap-2 py-16 text-neutral-400"><Loader2 className="animate-spin" size={18}/> Loading your projects…</div> : projects.length === 0 ? <div className="rounded-3xl border border-dashed border-white/15 px-6 py-16 text-center"><Code2 className="mx-auto mb-4 text-neutral-500" size={32}/><h2 className="text-lg font-medium">Your next idea starts here</h2><p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">Build something with Codex and your saved code projects will appear here.</p><button onClick={() => navigate("/codex")} className="mt-5 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black">Build a project</button></div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{projects.map((project) => { const details = meta[project.name] || {}; return <article key={project.name} className="flex min-h-[245px] flex-col rounded-2xl border border-white/10 bg-[#202020] p-5 shadow-lg shadow-black/10"><div className="mb-4 flex items-start justify-between gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06] text-neutral-200"><FolderKanban size={20}/></div><span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-neutral-400">{project.count} file{project.count === 1 ? "" : "s"}</span></div><h2 className="truncate text-lg font-semibold" title={project.name}>{project.name}</h2><p className="mt-1 text-xs text-neutral-500">{project.updated ? `Updated ${new Date(project.updated).toLocaleDateString()}` : "Saved in Codex"}</p><div className="mt-4 flex min-h-10 items-center gap-2 text-sm">{details.renderUrl ? <a href={details.renderUrl} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 truncate text-neutral-200 hover:text-white"><Globe size={15}/><span className="truncate">{details.renderUrl.replace(/^https?:\/\//, "")}</span><ExternalLink size={13}/></a> : <span className="text-neutral-500">No live URL linked yet</span>}<button aria-label={`Edit Render URL for ${project.name}`} onClick={() => setRenderUrl(project)} className="ml-auto shrink-0 rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-white"><Pencil size={15}/></button></div><div className="mt-auto grid grid-cols-2 gap-2 pt-5"><button onClick={() => navigate("/codex")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm hover:bg-white/5"><Code2 size={15}/> Continue</button><button onClick={() => redeploy(project)} disabled={busy === project.name} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-60">{busy === project.name ? <Loader2 size={15} className="animate-spin"/> : <Rocket size={15}/>} Redeploy</button></div></article>; })}</div>}
      <p className="mt-7 text-xs leading-relaxed text-neutral-500">Project source files are loaded from your Xyron account. Render links and service IDs are currently saved in this browser. One-tap deployment requires the secure Xyron server endpoint <code>/api/render/redeploy</code> to be configured with a server-side Render API key.</p>
    </main>
  </div>;
}

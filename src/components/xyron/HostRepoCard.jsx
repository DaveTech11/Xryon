import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink, Github, KeyRound, Loader2, Rocket, RefreshCw, Unplug } from "lucide-react";
import { api } from "../../api/client";

// Shown under the AI's reply when someone pastes a GitHub link and asks to host it.
//  1. Not connected  -> asks them to connect their Render account with Xryon (once; the key is stored encrypted).
//  2. Connected      -> reads the repo, suggests the right settings, hosts it on Render.
//  3. Hosting        -> follows the deploy until it is live, then shows the link.
//  4. Afterwards     -> they can redeploy, or paste another GitHub link in the chat to host something else.

const field = "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-white/30";
const btn = "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
const primary = `${btn} bg-white text-black hover:bg-neutral-200`;
const ghost = `${btn} border border-white/15 text-white hover:bg-white/10`;
const label = "mb-1 block text-xs uppercase tracking-widest text-neutral-500";

function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label="Copy link" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ } }} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-white/10 hover:text-white">
      {done ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function parseEnv(text) {
  return String(text || "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return { key: l.slice(0, i).trim(), value: l.slice(i + 1).trim().replace(/^["']|["']$/g, "") }; });
}

export default function HostRepoCard({ repo }) {
  const url = repo?.url;
  const [connected, setConnected] = useState(null); // null = checking
  const [ownerName, setOwnerName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState(null);
  const [envText, setEnvText] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deploy, setDeploy] = useState(null); // { id, name, url, dashboardUrl, phase, status }
  const timer = useRef(null);

  const refreshStatus = useCallback(async () => {
    try { const s = await api.render.status(); setConnected(!!s.connected); setOwnerName(s.ownerName || ""); return !!s.connected; }
    catch { setConnected(false); return false; }
  }, []);
  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  // Once Render is connected, read the repository and suggest settings.
  useEffect(() => {
    if (!connected || !url || info) return undefined;
    let cancelled = false;
    api.render.analyze(repo.branch ? `${url}/tree/${repo.branch}` : url).then((r) => {
      if (cancelled) return;
      setInfo(r);
      setForm({ name: r.name, branch: r.branch, kind: r.kind, runtime: r.runtime || "node", buildCommand: r.buildCommand || "", startCommand: r.startCommand || "", publishPath: r.publishPath || ".", plan: "free" });
      if (r.existing) setDeploy({ id: r.existing.id, name: r.existing.name, url: r.existing.url, dashboardUrl: r.existing.dashboardUrl, phase: "existing" });
    }).catch((e) => { if (!cancelled) setError(e?.message || "Could not read that repository."); });
    return () => { cancelled = true; };
  }, [connected, url, info]);

  // Follow the deploy until it is live or failed.
  useEffect(() => {
    if (!deploy?.id || !["building"].includes(deploy.phase)) return undefined;
    let stop = false;
    const tick = async () => {
      try {
        const s = await api.render.serviceStatus(deploy.id);
        if (stop) return;
        setDeploy((d) => d && ({ ...d, phase: s.phase, status: s.status, url: s.url || d.url, dashboardUrl: s.dashboardUrl || d.dashboardUrl }));
        if (s.phase === "building") timer.current = setTimeout(tick, 6000);
      } catch { if (!stop) timer.current = setTimeout(tick, 10000); }
    };
    timer.current = setTimeout(tick, 4000);
    return () => { stop = true; clearTimeout(timer.current); };
  }, [deploy?.id, deploy?.phase]);

  const connect = async () => {
    setConnecting(true); setError("");
    try { const r = await api.render.connect(apiKey.trim()); setOwnerName(r.ownerName || ""); setApiKey(""); setConnected(true); }
    catch (e) { setError(e?.message || "Could not connect to Render."); }
    finally { setConnecting(false); }
  };
  const disconnect = async () => { await api.render.disconnect().catch(() => {}); setConnected(false); setInfo(null); setForm(null); setDeploy(null); };

  const host = async () => {
    setBusy(true); setError("");
    try {
      const r = await api.render.hostRepo({ repo: url, ...form, envVars: parseEnv(envText) });
      setDeploy({ id: r.id, name: r.name, url: r.url, dashboardUrl: r.dashboardUrl, phase: "building", status: "created" });
    } catch (e) { setError(e?.message || "Could not host this project."); }
    finally { setBusy(false); }
  };
  const redeploy = async () => {
    setBusy(true); setError("");
    try { await api.render.deploy(deploy.id); setDeploy((d) => ({ ...d, phase: "building", status: "created" })); }
    catch (e) { setError(e?.message || "Could not redeploy."); }
    finally { setBusy(false); }
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const shell = "mt-3 w-full max-w-xl space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm";

  if (!url) return null;
  const header = (
    <div className="flex items-center gap-2 text-white">
      <Github className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate font-medium">{repo.owner}/{repo.repo}</span>
      <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-neutral-400">Render</span>
    </div>
  );

  if (connected === null) return <div className={shell}>{header}<p className="flex items-center gap-2 text-neutral-400"><Loader2 className="h-4 w-4 animate-spin" /> Checking your Render connection…</p></div>;

  // Step 1: connect the account with Xryon.
  if (!connected) {
    return (
      <div className={shell}>
        {header}
        <p className="text-neutral-300">Connect your Render account with Xryon first. You only do this once; after that you can host any GitHub project from the chat.</p>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-neutral-400">
          <li>Open <a href="https://dashboard.render.com/u/settings#api-keys" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-white underline underline-offset-2">Render → Account settings → API Keys <ExternalLink className="h-3 w-3" /></a></li>
          <li>Tap <span className="text-neutral-200">Create API Key</span> and copy it (it starts with rnd_).</li>
          <li>Paste it below.</li>
        </ol>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="rnd_…" className={`${field} pl-9`} />
          </div>
          <button type="button" onClick={connect} disabled={connecting || !/^rnd_/.test(apiKey.trim())} className={primary}>{connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Connect</button>
        </div>
        <p className="text-[11px] text-neutral-500">Your key is stored encrypted on the server and only used to deploy for you. Remove it any time from here.</p>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      </div>
    );
  }

  // Step 4: deploying / live / failed / already on Render.
  if (deploy) {
    const live = deploy.phase === "live" || deploy.phase === "existing";
    return (
      <div className={shell}>
        {header}
        {deploy.phase === "building" && <p className="flex items-center gap-2 text-neutral-200"><Loader2 className="h-4 w-4 animate-spin" /> Render is building {deploy.name}. This usually takes a few minutes.</p>}
        {deploy.phase === "failed" && <p className="text-red-300">The build failed. Open the Render logs to see why, fix it in GitHub, and redeploy.</p>}
        {deploy.phase === "existing" && <p className="text-neutral-300"><span className="text-white">{deploy.name}</span> is already on Render. You can redeploy it with the latest code.</p>}
        {deploy.phase === "live" && <p className="flex items-center gap-2 text-emerald-300"><Check className="h-4 w-4" /> {deploy.name} is live.</p>}
        {deploy.url && (
          <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] p-2.5">
            <a href={deploy.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-white underline-offset-2 hover:underline">{deploy.url}</a>
            <CopyButton text={deploy.url} />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {deploy.dashboardUrl && <a href={deploy.dashboardUrl} target="_blank" rel="noreferrer" className={ghost}><ExternalLink className="h-4 w-4" /> {deploy.phase === "failed" ? "View logs" : "Open in Render"}</a>}
          {(live || deploy.phase === "failed") && <button type="button" onClick={redeploy} disabled={busy} className={ghost}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Redeploy</button>}
        </div>
        {live && <p className="text-[11px] text-neutral-500">New pushes to GitHub redeploy automatically. Paste another GitHub link in the chat to host more projects{ownerName ? ` in ${ownerName}` : ""}.</p>}
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      </div>
    );
  }

  // Step 2-3: settings and host.
  return (
    <div className={shell}>
      {header}
      {!info && !error && <p className="flex items-center gap-2 text-neutral-400"><Loader2 className="h-4 w-4 animate-spin" /> Reading the repository…</p>}
      {info && form && (
        <>
          <p className="text-neutral-300">{info.reason}</p>
          <div className="grid grid-cols-2 gap-2">
            {[["static", "Static site", "Free"], ["web", "Web service", "Runs your server"]].map(([k, t, d]) => (
              <button key={k} type="button" onClick={() => setForm((f) => ({ ...f, kind: k }))} aria-pressed={form.kind === k} className={`rounded-xl border px-3 py-2 text-left transition ${form.kind === k ? "border-white bg-white/10" : "border-white/10 hover:bg-white/5"}`}>
                <span className="block text-sm text-white">{t}</span><span className="block text-[11px] text-neutral-500">{d}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setShowSettings((v) => !v)} className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-white">
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showSettings ? "rotate-180" : ""}`} /> Settings
          </button>
          {showSettings && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div><label className={label}>Name</label><input value={form.name} onChange={set("name")} className={field} /></div>
                <div><label className={label}>Branch</label><input value={form.branch} onChange={set("branch")} className={field} /></div>
              </div>
              <div><label className={label}>Build command</label><input value={form.buildCommand} onChange={set("buildCommand")} className={field} placeholder="npm install && npm run build" /></div>
              {form.kind === "static"
                ? <div><label className={label}>Publish folder</label><input value={form.publishPath} onChange={set("publishPath")} className={field} placeholder="dist" /></div>
                : (
                  <>
                    {form.runtime !== "docker" && <div><label className={label}>Start command</label><input value={form.startCommand} onChange={set("startCommand")} className={field} placeholder="npm start" /></div>}
                    <div><label className={label}>Plan</label>
                      <select value={form.plan} onChange={set("plan")} className={field}>
                        <option value="free">Free (sleeps when idle)</option>
                        <option value="starter">Starter (always on, paid by Render)</option>
                      </select>
                    </div>
                  </>
                )}
              <div><label className={label}>Environment variables (optional)</label><textarea rows={3} value={envText} onChange={(e) => setEnvText(e.target.value)} className={`${field} font-mono text-xs`} placeholder={"API_KEY=…\nNODE_ENV=production"} /></div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={host} disabled={busy || !form.name.trim()} className={primary}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Host on Render</button>
            <button type="button" onClick={disconnect} className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300"><Unplug className="h-3.5 w-3.5" /> Disconnect {ownerName || "Render"}</button>
          </div>
        </>
      )}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </div>
  );
}

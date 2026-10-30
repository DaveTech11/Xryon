import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Check, CreditCard, ExternalLink, FolderKanban, Globe, Loader2, Pencil, RefreshCw, Rocket,
  Search, Smartphone, Bitcoin, Trash2, Wallet, X, Code2,
} from "lucide-react";
import { api } from "../../api/client";

const ngn = (n) => `₦${Number(n || 0).toLocaleString("en-NG")}`;
const usd = (n) => `$${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const when = (v) => { const t = Date.parse(v); return t ? new Date(t).toLocaleDateString() : ""; };

const card = "rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl";
const field = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-white/25";
const primary = "inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-neutral-900 transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50";
const ghost = "inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-neutral-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50";

function Notice({ tone = "info", children }) {
  if (!children) return null;
  const cls = tone === "error" ? "border-red-500/30 bg-red-500/10 text-red-200" : tone === "ok" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/[0.04] text-neutral-300";
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

// ------------------------------------------------------------------ Projects
function EditModal({ project, onClose, onSaved }) {
  const isSite = project.kind === "site";
  const [name, setName] = useState(project.name);
  const [branch, setBranch] = useState(project.branch || "main");
  const [autoDeploy, setAutoDeploy] = useState(project.autoDeploy !== false);
  const [files, setFiles] = useState(null);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSite) return;
    api.host.site(project.id).then((s) => setFiles(s.files || [])).catch((e) => setError(e.message || "Could not load the files."));
  }, [isSite, project.id]);

  const save = async () => {
    setBusy(true); setError("");
    try {
      if (isSite) await api.host.publish({ name, files, siteId: project.id });
      else await api.render.update(project.id, { name, branch, autoDeploy });
      onSaved("Saved. " + (isSite ? "Your site is updated." : "Changes sent to Render.")); onClose();
    } catch (e) { setError(e.message || "Could not save."); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md" onClick={() => !busy && onClose()} role="dialog" aria-modal="true" aria-label={`Edit ${project.name}`}>
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-[2rem] border border-white/15 bg-[#0c0c0d] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} disabled={busy} aria-label="Close" className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-neutral-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        <h3 className="pr-10 text-lg font-semibold text-white">Edit project</h3>
        <div className="mt-4 space-y-4 overflow-y-auto pr-1">
          <label className="block text-xs text-neutral-500">Name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={`${field} mt-1`} />
          </label>
          {!isSite && (
            <>
              <label className="block text-xs text-neutral-500">Branch it builds from
                <input value={branch} onChange={(e) => setBranch(e.target.value)} className={`${field} mt-1`} autoCapitalize="none" spellCheck={false} />
              </label>
              <label className="flex items-center justify-between gap-4 rounded-xl border border-white/10 px-4 py-3 text-sm text-neutral-300">
                <span>Auto-deploy when you push to GitHub</span>
                <input type="checkbox" checked={autoDeploy} onChange={(e) => setAutoDeploy(e.target.checked)} className="h-4 w-4" />
              </label>
              {project.shared && <p className="text-[11px] text-neutral-600">Names on Xryon hosting always start with “xryon-”, so the live link may change if you rename.</p>}
              <Link to="/codex" className={ghost}><Code2 className="h-3.5 w-3.5" /> Open the code in Codex</Link>
            </>
          )}
          {isSite && (
            files === null && !error ? <div className="grid place-items-center py-8"><Loader2 className="h-5 w-5 animate-spin text-neutral-500" /></div> : files && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {files.map((f, i) => <button key={f.path} onClick={() => setActive(i)} className={`rounded-lg border px-2.5 py-1 text-xs ${i === active ? "border-white/30 bg-white/10 text-white" : "border-white/10 text-neutral-400 hover:bg-white/5"}`}>{f.path}</button>)}
                </div>
                {files[active] && (
                  <textarea value={files[active].content} spellCheck={false}
                    onChange={(e) => setFiles((prev) => prev.map((f, i) => (i === active ? { ...f, content: e.target.value } : f)))}
                    className={`${field} min-h-[260px] font-mono text-xs leading-5`} aria-label={`Contents of ${files[active].path}`} />
                )}
              </div>
            )
          )}
          <Notice tone="error">{error}</Notice>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className={ghost}>Cancel</button>
          <button onClick={save} disabled={busy || !name.trim() || (isSite && !files)} className={primary}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save changes</button>
        </div>
      </div>
    </div>
  );
}

function ProjectsTab({ notify }) {
  const [state, setState] = useState("loading");
  const [projects, setProjects] = useState([]);
  const [renderOn, setRenderOn] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const out = [];
    let renderConnected = false;
    try {
      const st = await api.render.status();
      renderConnected = !!st.connected;
      if (renderConnected) {
        const r = await api.render.services();
        for (const s of r.services || []) out.push({ kind: "render", id: s.id, name: s.name, url: s.url, branch: s.branch, autoDeploy: s.autoDeploy, shared: s.shared, suspended: s.suspended, repo: s.repo, dashboardUrl: s.dashboardUrl, updatedAt: s.updatedAt || s.createdAt, type: s.type });
      }
    } catch (e) { setError(e.message || "Could not load your Render projects."); }
    try {
      const h = await api.host.list();
      for (const s of h.sites || []) out.push({ kind: "site", id: s.id, name: s.name, url: s.url, files: s.files, updatedAt: s.updatedAt });
    } catch (e) { setError((p) => p || e.message || "Could not load your hosted sites."); }
    out.sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
    setRenderOn(renderConnected); setProjects(out); setState("ready");
  }, []);
  useEffect(() => { load(); }, [load]);

  const redeploy = async (p) => {
    setBusy(p.id); setError("");
    try { await api.render.deploy(p.id); notify(`Deploy started for ${p.name}.`); } catch (e) { setError(e.message || "Could not start the deploy."); }
    setBusy("");
  };
  const remove = async (p) => {
    if (!window.confirm(`Remove “${p.name}”? This takes the live site down.`)) return;
    setBusy(p.id); setError("");
    try { if (p.kind === "site") await api.host.remove(p.id); else await api.render.remove(p.id); notify(`${p.name} removed.`); await load(); } catch (e) { setError(e.message || "Could not remove it."); }
    setBusy("");
  };

  if (state === "loading") return <div className="flex items-center gap-2 py-12 text-sm text-neutral-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading your projects…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-400">Everything you have deployed through Xyron. Open it, edit it, or redeploy.</p>
        <button onClick={() => { setState("loading"); load(); }} className={ghost} aria-label="Refresh"><RefreshCw className="h-3.5 w-3.5" /></button>
      </div>
      <Notice tone="error">{error}</Notice>
      {!renderOn && <Notice>Render isn’t connected yet, so only Xyron-link sites show here. Host a project from Codex → Host to connect it.</Notice>}
      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
          <FolderKanban className="mx-auto mb-3 h-8 w-8 text-neutral-600" />
          <p className="text-sm text-neutral-300">No deployed projects yet</p>
          <p className="mt-1 text-xs text-neutral-500">Build something in Codex, then tap Host.</p>
          <Link to="/codex" className={`${primary} mt-4`}>Open Codex</Link>
        </div>
      ) : projects.map((p) => (
        <article key={`${p.kind}:${p.id}`} className={card}>
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.06]"><Globe className="h-5 w-5 text-neutral-300" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-white" title={p.name}>{p.name}</h3>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-neutral-400">{p.kind === "site" ? "Xyron link" : "Render"}</span>
                {p.suspended && <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-300">Suspended</span>}
              </div>
              {p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1.5 truncate text-xs text-neutral-300 hover:text-white"><span className="truncate">{p.url.replace(/^https?:\/\//, "")}</span><ExternalLink className="h-3 w-3 shrink-0" /></a> : <p className="mt-1 text-xs text-neutral-500">No live link yet</p>}
              <p className="mt-1 text-[11px] text-neutral-600">{p.kind === "site" ? `${p.files} file${p.files === 1 ? "" : "s"}` : (p.branch ? `Branch ${p.branch}` : "")}{when(p.updatedAt) ? ` · Updated ${when(p.updatedAt)}` : ""}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => setEditing(p)} className={ghost}><Pencil className="h-3.5 w-3.5" /> Edit</button>
            {p.kind === "render" && <button onClick={() => redeploy(p)} disabled={busy === p.id} className={ghost}>{busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />} Redeploy</button>}
            {p.kind === "render" && p.dashboardUrl && <a href={p.dashboardUrl} target="_blank" rel="noreferrer" className={ghost}>Dashboard <ExternalLink className="h-3 w-3" /></a>}
            {(p.kind === "site" || p.shared) && <button onClick={() => remove(p)} disabled={busy === p.id} className={`${ghost} text-red-300 hover:bg-red-500/10`}><Trash2 className="h-3.5 w-3.5" /> Remove</button>}
          </div>
        </article>
      ))}
      {editing && <EditModal project={editing} onClose={() => setEditing(null)} onSaved={(m) => { notify(m); load(); }} />}
    </div>
  );
}

// ------------------------------------------------------------------- Wallet
const METHOD_INFO = {
  flutterwave: { name: "Flutterwave", note: "Card, bank transfer, USSD", icon: CreditCard },
  opay: { name: "OPay", note: "OPay wallet, card and bank", icon: Smartphone },
  crypto: { name: "Crypto", note: "USDT, BTC, ETH and more", icon: Bitcoin },
};

function WalletTab({ wallet, reload, notify }) {
  const [params, setParams] = useSearchParams();
  const orderId = params.get("order");
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [pay, setPay] = useState(orderId ? "checking" : "idle");

  // Back from the payment page: ask the server (which asks the provider) whether it was paid.
  useEffect(() => {
    if (!orderId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.payments.verify(orderId);
        if (cancelled) return;
        setPay(r.status === "paid" ? "paid" : r.status === "failed" ? "failed" : "waiting");
        if (r.status === "paid") reload();
      } catch { if (!cancelled) setPay("waiting"); }
    })();
    return () => { cancelled = true; };
  }, [orderId, reload]);

  const dismiss = () => { const n = new URLSearchParams(params); n.delete("order"); n.delete("topup"); setParams(n, { replace: true }); setPay("idle"); };
  const pkgs = wallet?.packages || [];
  const available = wallet?.methods || {};

  const start = async (method) => {
    setBusy(method); setError("");
    try { const { url } = await api.wallet.topup({ packageId: picked.id, method }); window.location.href = url; }
    catch (e) { setError(e.message || "Could not start the payment."); setBusy(""); }
  };
  const methodsFor = (pkg) => (pkg.currency === "usd" ? ["crypto"] : ["flutterwave", "opay"]);

  return (
    <div className="space-y-4">
      {pay === "checking" && <Notice><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Confirming your payment…</Notice>}
      {pay === "paid" && <Notice tone="ok">Payment confirmed. Your wallet has been topped up. <button onClick={dismiss} className="underline">Dismiss</button></Notice>}
      {pay === "failed" && <Notice tone="error">We couldn’t confirm that payment, so your wallet was not charged. <button onClick={dismiss} className="underline">Dismiss</button></Notice>}
      {pay === "waiting" && <Notice>Your payment is still being confirmed. Crypto can take a few minutes; your wallet updates automatically once it’s confirmed. <button onClick={dismiss} className="underline">Dismiss</button></Notice>}
      {params.get("topup") === "canceled" && pay === "idle" && <Notice>Top-up canceled. Nothing was charged.</Notice>}

      <div className={`${card} flex items-center justify-between gap-4`}>
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06]"><Wallet className="h-5 w-5 text-neutral-200" /></span>
          <div><p className="text-xs text-neutral-500">Wallet balance</p><p className="text-xl font-semibold text-white">{wallet ? ngn(wallet.balanceNgn) : "…"}</p></div>
        </div>
        <p className="max-w-[12rem] text-right text-[11px] text-neutral-600">Used to buy domains inside Xyron.</p>
      </div>

      {["ngn", "usd"].map((cur) => (
        <div key={cur} className={card}>
          <p className="text-sm text-neutral-200">{cur === "ngn" ? "Top up in naira (₦)" : "Top up in dollars ($, paid with crypto)"}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {pkgs.filter((x) => x.currency === cur).map((pkg) => (
              <button key={pkg.id} onClick={() => { setPicked(pkg); setError(""); }}
                className={`rounded-xl border px-3 py-3 text-center transition ${picked?.id === pkg.id ? "border-white/40 bg-white/10" : "border-white/10 hover:bg-white/5"}`}>
                <span className="block text-base font-semibold text-white">{cur === "ngn" ? ngn(pkg.amount) : usd(pkg.amount)}</span>
                {cur === "usd" && <span className="block text-[10px] text-neutral-500">adds {ngn(pkg.credit)}</span>}
              </button>
            ))}
          </div>
          {picked?.currency === cur && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-neutral-500">Pay {cur === "ngn" ? ngn(picked.amount) : usd(picked.amount)} with:</p>
              {methodsFor(picked).map((m) => {
                const I = METHOD_INFO[m].icon, ok = !!available[m];
                return (
                  <button key={m} disabled={!!busy || !ok} onClick={() => start(m)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${ok ? "border-white/10 bg-white/[0.04] hover:bg-white/[0.09]" : "cursor-not-allowed border-white/5 opacity-50"}`}>
                    <span className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/10">{busy === m ? <Loader2 className="h-4 w-4 animate-spin" /> : <I className="h-4 w-4" />}</span>
                    <span className="flex-1"><span className="block text-sm font-medium text-white">{METHOD_INFO[m].name}</span><span className="block text-xs text-neutral-500">{ok ? METHOD_INFO[m].note : "Not available yet"}</span></span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
      <Notice tone="error">{error}</Notice>

      {wallet?.ledger?.length > 0 && (
        <div className={card}>
          <p className="mb-2 text-sm text-neutral-200">History</p>
          <ul className="divide-y divide-white/5">
            {wallet.ledger.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                <span className="min-w-0 truncate text-neutral-400">{l.note} <span className="text-neutral-600">· {when(l.at)}</span></span>
                <span className={l.amount >= 0 ? "text-emerald-300" : "text-neutral-300"}>{l.amount >= 0 ? "+" : "−"}{ngn(Math.abs(l.amount))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Domains
function DomainsTab({ wallet, reload, goWallet, notify }) {
  const [query, setQuery] = useState("");
  const [quote, setQuote] = useState(null);
  const [searching, setSearching] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState("");
  const [services, setServices] = useState([]);
  const [sid, setSid] = useState("");
  const [mine, setMine] = useState([]);
  const [connecting, setConnecting] = useState("");
  const [result, setResult] = useState(null);

  const loadMine = useCallback(() => api.domains.mine().then((r) => setMine(r.domains || [])).catch(() => {}), []);
  useEffect(() => {
    loadMine();
    api.render.status().then((st) => (st.connected ? api.render.services() : { services: [] }))
      .then((r) => { const l = (r.services || []).filter((s) => s.type !== "cron_job"); setServices(l); setSid(l[0]?.id || ""); }).catch(() => {});
  }, [loadMine]);

  const search = async (e) => {
    e.preventDefault(); setError(""); setQuote(null); setResult(null); setSearching(true);
    try { setQuote(await api.domains.quote(query.trim())); } catch (err) { setError(err.message || "Could not look that name up."); }
    setSearching(false);
  };
  const buy = async () => {
    setBuying(true); setError("");
    try {
      const r = await api.domains.buy({ domain: quote.name, serviceId: sid || undefined, expectedNgn: quote.priceNgn });
      setResult(r); setQuote(null); notify(`${r.domain.name} is yours.`); reload(); loadMine();
    } catch (err) { setError(err.message || "Could not buy that domain."); }
    setBuying(false);
  };
  const connect = async (d, serviceId) => {
    setConnecting(d.name); setError("");
    try { const r = await api.domains.connect({ domain: d.name, serviceId }); notify(r.verified ? `${d.name} is connected.` : `${d.name} is connecting. DNS can take a few minutes.`); loadMine(); }
    catch (err) { setError(err.message || "Could not connect that domain."); }
    setConnecting("");
  };

  const short = quote?.buyable && wallet ? Math.max(0, quote.priceNgn - wallet.balanceNgn) : 0;
  const statusText = !quote ? "" : quote.status === "available" ? "Available" : quote.status === "taken" ? "Taken" : "Can’t tell right now";

  return (
    <div className="space-y-4">
      <div className={card}>
        <p className="text-sm text-neutral-200">Buy a domain</p>
        <p className="mb-3 text-xs text-neutral-500">Search a name, pay from your wallet, and we can point it at one of your projects for you.</p>
        <form onSubmit={search} className="flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="myapp.com" aria-label="Domain name" autoCapitalize="none" autoCorrect="off" spellCheck={false} className={field} />
          <button type="submit" disabled={searching || !query.trim()} className={primary} aria-label="Search domain">{searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</button>
        </form>
        {quote && (
          <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium text-white">{quote.name}</span>
              <span className={quote.status === "available" ? "text-emerald-300" : "text-neutral-400"}>{statusText}</span>
            </div>
            {quote.buyable ? (
              <>
                <p className="text-sm text-neutral-300">{ngn(quote.priceNgn)} <span className="text-neutral-500">(≈ {usd(quote.priceUsd)}) for the first year</span></p>
                {services.length > 0 && (
                  <label className="block text-xs text-neutral-500">Connect to a project after buying
                    <select value={sid} onChange={(e) => setSid(e.target.value)} className={`${field} mt-1`}>
                      <option value="">Don’t connect yet</option>
                      {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                )}
                {short > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-300">Your wallet has {ngn(wallet.balanceNgn)}. Add at least {ngn(short)} more.</p>
                    <button onClick={goWallet} className={primary}><Wallet className="h-4 w-4" /> Top up wallet</button>
                  </div>
                ) : (
                  <button onClick={buy} disabled={buying} className={primary}>{buying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Buy for {ngn(quote.priceNgn)}</button>
                )}
              </>
            ) : (
              <p className="text-xs text-neutral-500">
                {quote.reason === "not_configured" ? "Buying inside Xyron isn’t switched on yet." : quote.reason === "premium" ? "This is a premium-priced name, which can’t be bought here." : quote.reason === "tld_unsupported" ? "We can’t sell that ending yet. Try .com, .net, .org, .xyz or .dev." : quote.reason === "busy" ? "The registrar is busy. Try again in a few seconds." : quote.status === "taken" ? "Someone already owns this name. Try another." : "Try again in a moment."}
              </p>
            )}
          </div>
        )}
        {result && (
          <div className="mt-3 space-y-2"><Notice tone="ok">{result.domain.name} is yours. Your wallet balance is now {ngn(result.balanceNgn)}.</Notice>
            {result.connect?.ok && <Notice>{result.connect.verified ? "Connected to your project." : "We added the DNS records and asked Render to check them. It can take a few minutes to go live."}</Notice>}
            {result.connect && !result.connect.ok && <Notice tone="error">Bought, but couldn’t connect it yet: {result.connect.message} You can connect it below.</Notice>}
          </div>
        )}
        <div className="mt-3"><Notice tone="error">{error}</Notice></div>
      </div>

      {mine.length > 0 && (
        <div className={card}>
          <p className="mb-2 text-sm text-neutral-200">Your domains</p>
          <ul className="space-y-3">
            {mine.map((d) => (
              <li key={d.id} className="rounded-xl border border-white/10 p-3">
                <div className="flex items-center justify-between gap-2 text-sm"><span className="truncate text-white">{d.name}</span><span className="shrink-0 text-[11px] text-neutral-500">Renews {when(d.expiresAt)}</span></div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {services.length > 0 ? (
                    <>
                      <select defaultValue={d.serviceId || services[0]?.id} id={`dom-${d.id}`} className={`${field} !w-auto !py-1.5 !text-xs`}>
                        {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <button disabled={connecting === d.name} onClick={() => connect(d, document.getElementById(`dom-${d.id}`)?.value)} className={ghost}>{connecting === d.name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />} {d.serviceId ? "Reconnect" : "Connect to project"}</button>
                    </>
                  ) : <span className="text-xs text-neutral-500">Deploy a project to connect this domain.</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------- Panel
const SUBS = [["projects", "Projects", FolderKanban], ["domains", "Domains", Globe], ["wallet", "Wallet", Wallet]];

export default function ProjectsPanel() {
  const [params, setParams] = useSearchParams();
  const sub = SUBS.some(([k]) => k === params.get("sub")) ? params.get("sub") : (params.get("order") ? "wallet" : "projects");
  const [wallet, setWallet] = useState(null);
  const [toast, setToast] = useState("");

  const reload = useCallback(() => api.wallet.get().then(setWallet).catch(() => setWallet({ balanceNgn: 0, ledger: [], packages: [], methods: {} })), []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(""), 5000); return () => clearTimeout(t); }, [toast]);

  const go = useCallback((k) => { const n = new URLSearchParams(params); n.set("tab", "projects"); n.set("sub", k); setParams(n, { replace: true }); }, [params, setParams]);
  const tabs = useMemo(() => SUBS, []);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-2xl border border-white/10 bg-black/30 p-1">
        {tabs.map(([k, label, Icon]) => (
          <button key={k} onClick={() => go(k)} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm transition ${sub === k ? "bg-white/10 text-white" : "text-neutral-500 hover:text-white"}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
      {toast && <Notice tone="ok">{toast}</Notice>}
      {sub === "projects" && <ProjectsTab notify={setToast} />}
      {sub === "domains" && <DomainsTab wallet={wallet} reload={reload} goWallet={() => go("wallet")} notify={setToast} />}
      {sub === "wallet" && <WalletTab wallet={wallet} reload={reload} notify={setToast} />}
    </div>
  );
}

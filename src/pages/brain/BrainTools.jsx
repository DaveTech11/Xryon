import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Check, Code2, Copy, ExternalLink, History, Link2, ListChecks, Pause, Pencil, Pin, PinOff, Play, Plus,
  RotateCcw, Search, Send, Sparkles, StickyNote, Trash2, X,
} from "lucide-react";

/* Real, local-first features for Xyron Brain. Everything is saved in this browser. */

const SERIF = { fontFamily: "'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif" };
const LS = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
};
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const DATA_KEYS = ["xb_data_notes", "xb_data_tasks", "xb_data_snippets", "xb_data_prompts", "xb_data_links", "xb_data_journal", "xb_data_questions", "xb_data_concepts", "xb_data_relations", "xb_data_focus"];

export function useStore(key, initial = []) {
  const [v, setV] = useState(() => LS.get(key, initial));
  const set = (f) => setV((p) => { const n = typeof f === "function" ? f(p) : f; LS.set(key, n); return n; });
  return [v, set];
}

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch {
    try { const a = document.createElement("textarea"); a.value = t; a.style.position = "fixed"; a.style.opacity = "0"; document.body.appendChild(a); a.select(); document.execCommand("copy"); a.remove(); return true; } catch { return false; }
  }
}

export function exportBrain() {
  const out = { app: "xyron-brain", version: 1, exported: new Date().toISOString() };
  DATA_KEYS.forEach((k) => { out[k] = LS.get(k, k === "xb_data_focus" ? {} : []); });
  const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = `xyron-brain-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function importBrain(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== "xyron-brain") throw new Error("This is not a Xyron Brain export.");
  let n = 0;
  DATA_KEYS.forEach((k) => {
    if (k === "xb_data_focus") { if (data[k] && typeof data[k] === "object") LS.set(k, { ...LS.get(k, {}), ...data[k] }); return; }
    if (!Array.isArray(data[k])) return;
    const cur = LS.get(k, []); const ids = new Set(cur.map((x) => x.id));
    const add = data[k].filter((x) => x && x.id && !ids.has(x.id)); n += add.length;
    LS.set(k, [...add, ...cur]);
  });
  return n;
}

function Sheet({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-black/70 sm:place-items-center sm:p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#120e0c] p-5 sm:rounded-3xl">
        <div className="mb-4 flex items-center"><h2 className="flex-1 text-xl font-semibold" style={SERIF}>{title}</h2><button onClick={onClose} aria-label="Close"><X className="h-5 w-5 text-neutral-400" /></button></div>
        {children}
      </div>
    </div>
  );
}
const inputCls = "w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-[15px] outline-none placeholder:text-neutral-500 focus:border-white/30";
const pill = "rounded-full bg-[#f1e9df] px-5 py-2.5 text-sm font-semibold text-black";
const ghost = "rounded-full border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/5";

function EmptyState({ icon: I, title, text, action, onAction }) {
  return (
    <div className="grid min-h-[280px] place-items-center p-8 text-center"><div className="max-w-sm">
      <I className="mx-auto h-10 w-10 text-neutral-600" /><h3 className="mt-4 text-xl font-semibold" style={SERIF}>{title}</h3><p className="mt-1 text-sm text-neutral-400">{text}</p>
      {action && <button onClick={onAction} className={`${pill} mt-5`}>{action}</button>}
    </div></div>
  );
}

/* ------------------------- Notes / Snippets / Prompts / Bookmarks ------------------------- */
const KINDS = {
  notes: { label: "Note", plural: "Notes", key: "xb_data_notes", body: "Write your note…", empty: "Capture ideas, plans and anything you want to keep.", Icon: StickyNote },
  snippets: { label: "Snippet", plural: "Snippets", key: "xb_data_snippets", body: "Paste your code…", empty: "Save code you reuse, then copy it in one tap.", Icon: Code2, code: true, lang: true, copy: true },
  prompts: { label: "Prompt", plural: "Prompt Library", key: "xb_data_prompts", body: "Write the prompt…", empty: "Keep your best prompts and send them straight to Xyron chat.", Icon: Sparkles, copy: true, send: true },
  links: { label: "Bookmark", plural: "Collections", key: "xb_data_links", body: "Why you saved it (optional)", empty: "Save links and group them with tags. Each tag becomes a collection.", Icon: Link2, url: true },
  journal: { label: "Entry", plural: "Journey", key: "xb_data_journal", body: "What did you do or learn today?", empty: "Log what you did and learned. Entries build your project journey over time.", Icon: History },
};
const LANGS = ["javascript", "typescript", "python", "html", "css", "bash", "json", "sql", "go", "java", "other"];

export function ItemsView({ kind }) {
  const cfg = KINDS[kind];
  const nav = useNavigate();
  const [items, setItems] = useStore(cfg.key);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [form, setForm] = useState(null);
  const [copied, setCopied] = useState("");

  const tags = useMemo(() => [...new Set(items.flatMap((i) => i.tags || []))].sort(), [items]);
  const shown = useMemo(() => items
    .filter((i) => (!tag || (i.tags || []).includes(tag)) && (!q || `${i.title} ${i.body} ${i.url || ""}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.ts - a.ts), [items, q, tag]);

  const open = (it) => setForm(it ? { ...it, tagText: (it.tags || []).join(", ") } : { id: "", title: "", body: "", url: "", lang: "javascript", tagText: "" });
  const save = (e) => {
    e.preventDefault();
    let url = (form.url || "").trim();
    if (cfg.url && url && !/^https?:\/\//i.test(url)) url = "https://" + url;
    if (!form.title.trim() && !form.body.trim() && !url) return;
    const rec = { id: form.id || uid(), title: form.title.trim() || (cfg.url ? url : form.body.trim().slice(0, 40)), body: form.body, url, lang: form.lang, pinned: !!form.pinned, ts: form.ts || Date.now(), tags: form.tagText.split(",").map((t) => t.trim()).filter(Boolean) };
    setItems((p) => (form.id ? p.map((x) => (x.id === form.id ? rec : x)) : [rec, ...p]));
    setForm(null);
  };
  const doCopy = async (it) => { if (await copyText(it.body)) { setCopied(it.id); setTimeout(() => setCopied(""), 1200); } };
  const send = (it) => { LS.set("xb_prompt", it.body); nav("/"); };

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-2xl border border-white/15 px-4 py-2.5"><Search className="h-4 w-4 text-neutral-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${cfg.plural.toLowerCase()}…`} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-neutral-500" /></div>
        <button onClick={() => open(null)} className={`${pill} flex items-center`}><Plus className="mr-1.5 h-4 w-4" />New {cfg.label.toLowerCase()}</button>
      </div>
      {tags.length > 0 && <div className="mb-4 flex flex-wrap gap-2">{tags.map((t) => <button key={t} onClick={() => setTag(tag === t ? "" : t)} className={`rounded-full border px-3 py-1 text-xs ${tag === t ? "border-amber-400/50 bg-amber-400/10 text-amber-200" : "border-white/15 text-neutral-300"}`}>#{t}</button>)}</div>}

      {items.length === 0 ? <EmptyState icon={cfg.Icon} title={`No ${cfg.plural.toLowerCase()} yet`} text={cfg.empty} action={`New ${cfg.label.toLowerCase()}`} onAction={() => open(null)} /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((it) => (
            <div key={it.id} className="flex flex-col rounded-2xl border border-white/10 p-4">
              <div className="flex items-start">
                <h3 className="min-w-0 flex-1 break-words text-lg font-semibold leading-snug" style={SERIF}>{it.title}</h3>
                <button onClick={() => setItems((p) => p.map((x) => (x.id === it.id ? { ...x, pinned: !x.pinned } : x)))} className="ml-2 text-neutral-400 hover:text-white" aria-label={it.pinned ? "Unpin" : "Pin"}>{it.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}</button>
              </div>
              {cfg.url && it.url && <a href={it.url} target="_blank" rel="noreferrer noopener" className="mt-1 block truncate text-sm text-amber-300">{it.url.replace(/^https?:\/\//, "")}</a>}
              {it.body && (cfg.code
                ? <pre className="mt-3 max-h-48 overflow-auto rounded-xl bg-black/40 p-3 text-[12.5px] leading-5 text-neutral-200"><code>{it.body}</code></pre>
                : <p className="mt-2 line-clamp-6 whitespace-pre-wrap break-words text-sm leading-6 text-neutral-300">{it.body}</p>)}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-neutral-400">
                {cfg.lang && it.lang && <span className="rounded-full border border-white/15 px-2 py-0.5">{it.lang}</span>}
                {(it.tags || []).map((t) => <span key={t}>#{t}</span>)}
                <span className="ml-auto">{new Date(it.ts).toLocaleDateString()}</span>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                {cfg.copy && <button onClick={() => doCopy(it)} className={`${ghost} flex items-center !px-3 !py-1.5 text-xs`}><Copy className="mr-1.5 h-3.5 w-3.5" />{copied === it.id ? "Copied" : "Copy"}</button>}
                {cfg.send && <button onClick={() => send(it)} className={`${ghost} flex items-center !px-3 !py-1.5 text-xs`}><Send className="mr-1.5 h-3.5 w-3.5" />Use in chat</button>}
                {cfg.url && it.url && <a href={it.url} target="_blank" rel="noreferrer noopener" className={`${ghost} flex items-center !px-3 !py-1.5 text-xs`}><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Open</a>}
                <span className="flex-1" />
                <button onClick={() => open(it)} className="text-neutral-400 hover:text-white" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => { if (confirm(`Delete this ${cfg.label.toLowerCase()}?`)) setItems((p) => p.filter((x) => x.id !== it.id)); }} className="ml-2 text-neutral-400 hover:text-red-300" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
          {shown.length === 0 && <p className="col-span-full p-6 text-center text-sm text-neutral-400">Nothing matches.</p>}
        </div>
      )}

      {form && (
        <Sheet title={`${form.id ? "Edit" : "New"} ${cfg.label.toLowerCase()}`} onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-3">
            <input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className={inputCls} />
            {cfg.url && <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" inputMode="url" className={inputCls} />}
            {cfg.lang && <select value={form.lang} onChange={(e) => setForm({ ...form, lang: e.target.value })} className={inputCls}>{LANGS.map((l) => <option key={l} value={l}>{l}</option>)}</select>}
            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder={cfg.body} rows={cfg.code ? 9 : 6} spellCheck={!cfg.code} className={`${inputCls} ${cfg.code ? "font-mono text-[13px]" : ""}`} />
            <input value={form.tagText} onChange={(e) => setForm({ ...form, tagText: e.target.value })} placeholder="Tags, separated by commas" className={inputCls} />
            <button type="submit" className={`${pill} w-full !py-3`}>Save</button>
          </form>
        </Sheet>
      )}
    </div>
  );
}

/* ----------------------------------- Tasks ----------------------------------- */
const COLS = [["todo", "To do"], ["doing", "In progress"], ["done", "Done"]];
const PRI = { high: "text-red-300 border-red-400/40", med: "text-amber-300 border-amber-400/40", low: "text-neutral-300 border-white/15" };

export function TasksView() {
  const [tasks, setTasks] = useStore("xb_data_tasks");
  const [title, setTitle] = useState("");
  const [pri, setPri] = useState("med");
  const [due, setDue] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const add = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setTasks((p) => [{ id: uid(), title: title.trim(), pri, due, col: "todo", ts: Date.now() }, ...p]);
    setTitle(""); setDue("");
  };
  const move = (id, dir) => setTasks((p) => p.map((t) => { if (t.id !== id) return t; const i = COLS.findIndex(([k]) => k === t.col); return { ...t, col: COLS[Math.min(2, Math.max(0, i + dir))][0] }; }));
  return (
    <div className="p-4 sm:p-6">
      <form onSubmit={add} className="mb-5 flex flex-wrap items-center gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" className={`${inputCls} min-w-[200px] flex-1`} />
        <select value={pri} onChange={(e) => setPri(e.target.value)} className={`${inputCls} !w-auto`} aria-label="Priority"><option value="high">High</option><option value="med">Medium</option><option value="low">Low</option></select>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${inputCls} !w-auto`} aria-label="Due date" />
        <button className={`${pill} flex items-center`}><Plus className="mr-1.5 h-4 w-4" />Add</button>
      </form>
      {tasks.length === 0 ? <EmptyState icon={ListChecks} title="No tasks yet" text="Add a task above, then move it across the board as you work." /> : (
        <div className="grid gap-4 md:grid-cols-3">
          {COLS.map(([key, label], ci) => {
            const list = tasks.filter((t) => t.col === key);
            return (
              <div key={key} className="rounded-2xl border border-white/10 p-3">
                <div className="mb-3 flex items-center px-1"><h3 className="flex-1 text-base font-semibold" style={SERIF}>{label}</h3><span className="text-xs text-neutral-400">{list.length}</span></div>
                <div className="space-y-2">
                  {list.map((t) => (
                    <div key={t.id} className="rounded-xl border border-white/10 bg-white/[.03] p-3">
                      <div className={`break-words text-sm ${key === "done" ? "text-neutral-500 line-through" : "text-neutral-100"}`}>{t.title}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                        <span className={`rounded-full border px-2 py-0.5 ${PRI[t.pri]}`}>{t.pri === "med" ? "medium" : t.pri}</span>
                        {t.due && <span className={t.due < today && key !== "done" ? "text-red-300" : "text-neutral-400"}>{t.due < today && key !== "done" ? "Overdue · " : "Due "}{t.due}</span>}
                        <span className="flex-1" />
                        {ci > 0 && <button onClick={() => move(t.id, -1)} className="text-neutral-400 hover:text-white" aria-label="Move back"><ArrowLeft className="h-4 w-4" /></button>}
                        {ci < 2 && <button onClick={() => move(t.id, 1)} className="text-neutral-400 hover:text-white" aria-label="Move forward"><ArrowRight className="h-4 w-4" /></button>}
                        <button onClick={() => setTasks((p) => p.filter((x) => x.id !== t.id))} className="text-neutral-400 hover:text-red-300" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  ))}
                  {list.length === 0 && <p className="px-1 py-3 text-xs text-neutral-500">Empty</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {tasks.some((t) => t.col === "done") && <div className="mt-4 text-right"><button onClick={() => setTasks((p) => p.filter((t) => t.col !== "done"))} className="text-sm text-neutral-400 hover:text-white">Clear completed</button></div>}
    </div>
  );
}

/* ------------------------------- Focus timer ------------------------------- */
const MODES = { focus: ["Focus", 25], short: ["Short break", 5], long: ["Long break", 15] };
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function beep() {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)(); const o = c.createOscillator(); const g = c.createGain();
    o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.setValueAtTime(0.15, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1);
    o.start(); o.stop(c.currentTime + 1);
  } catch { /* audio blocked */ }
}

export function FocusView() {
  const [mode, setMode] = useState("focus");
  const [left, setLeft] = useState(MODES.focus[1] * 60);
  const [running, setRunning] = useState(false);
  const endAt = useRef(0);
  const [log, setLog] = useStore("xb_data_focus", {});
  const day = new Date().toISOString().slice(0, 10);
  const total = MODES[mode][1] * 60;

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => {
      const s = Math.max(0, Math.round((endAt.current - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) {
        setRunning(false); beep();
        if (mode === "focus") setLog((p) => ({ ...p, [day]: (p[day] || 0) + 1 }));
      }
    }, 250);
    return () => clearInterval(id);
  }, [running, mode, day]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const old = document.title;
    if (running) document.title = `${fmt(left)} · ${MODES[mode][0]}`;
    return () => { document.title = old; };
  }, [running, left, mode]);

  const pick = (m) => { setMode(m); setRunning(false); setLeft(MODES[m][1] * 60); };
  const toggle = () => { if (!running) endAt.current = Date.now() + left * 1000; setRunning(!running); };
  const reset = () => { setRunning(false); setLeft(total); };
  const R = 92, C = 2 * Math.PI * R;
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10); return [d.slice(5), log[d] || 0]; });
  const max = Math.max(1, ...week.map((w) => w[1]));

  return (
    <div className="mx-auto max-w-md p-4 text-center sm:p-6">
      <div className="mb-6 flex justify-center gap-2">{Object.entries(MODES).map(([k, [l]]) => <button key={k} onClick={() => pick(k)} className={`rounded-full border px-4 py-2 text-sm font-semibold ${mode === k ? "border-amber-400/50 bg-amber-400/10 text-amber-200" : "border-white/15 text-neutral-300"}`}>{l}</button>)}</div>
      <div className="relative mx-auto h-[220px] w-[220px]">
        <svg viewBox="0 0 220 220" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="110" cy="110" r={R} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="8" />
          <circle cx="110" cy="110" r={R} fill="none" stroke="#fbbf24" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - left / total)} />
        </svg>
        <div className="absolute inset-0 grid place-items-center"><div><div className="text-5xl font-semibold tabular-nums" style={SERIF}>{fmt(left)}</div><div className="mt-1 text-xs uppercase tracking-widest text-neutral-400">{MODES[mode][0]}</div></div></div>
      </div>
      <div className="mt-6 flex justify-center gap-3">
        <button onClick={toggle} className={`${pill} flex items-center !px-7`}>{running ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}{running ? "Pause" : left === 0 ? "Restart" : "Start"}</button>
        <button onClick={reset} className={`${ghost} flex items-center`}><RotateCcw className="mr-2 h-4 w-4" />Reset</button>
      </div>
      <div className="mt-8 rounded-2xl border border-white/10 p-4 text-left">
        <div className="flex items-baseline"><h3 className="flex-1 text-base font-semibold" style={SERIF}>Focus sessions</h3><span className="text-sm text-neutral-400">Today: {log[day] || 0}</span></div>
        <div className="mt-4 flex h-20 items-end justify-between">{week.map(([d, n]) => <div key={d} className="flex flex-1 flex-col items-center"><div className="w-5 rounded-t bg-amber-400/80" style={{ height: `${(n / max) * 100}%`, minHeight: n ? 4 : 2, opacity: n ? 1 : 0.25 }} /><span className="mt-1.5 text-[10px] text-neutral-500">{d}</span></div>)}</div>
      </div>
    </div>
  );
}

/* ------------------------------- Search all ------------------------------- */
const SEARCH_SRC = [["synthesis", "xb_data_notes", "Synthesis · Notes"], ["prep", "xb_data_tasks", "Preparation · Tasks"], ["matrix", "xb_data_snippets", "Code Matrix · Snippets"], ["method", "xb_data_prompts", "Methodology · Prompts"], ["collections", "xb_data_links", "Collections · Bookmarks"], ["journey", "xb_data_journal", "Project Journey"], ["questions", "xb_data_questions", "Open Questions"], ["concepts", "xb_data_concepts", "Concepts"]];

export function SearchAllView({ go }) {
  const [q, setQ] = useState("");
  const data = useMemo(() => SEARCH_SRC.map(([view, key, label]) => ({ view, label, items: LS.get(key, []) })), []);
  const results = q.trim().length < 2 ? [] : data.map((g) => ({ ...g, items: g.items.filter((i) => `${i.title || i.q || i.name || ""} ${i.body || i.a || ""} ${i.url || ""} ${(i.tags || []).join(" ")}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 20) })).filter((g) => g.items.length);
  const total = data.reduce((n, g) => n + g.items.length, 0);
  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center gap-2 rounded-2xl border border-white/15 px-4 py-3"><Search className="h-4 w-4 text-neutral-400" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search all ${total} saved items…`} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-neutral-500" /></div>
      {q.trim().length < 2 ? <p className="p-8 text-center text-sm text-neutral-400">Type at least 2 letters to search everything you have saved in one place.</p>
        : results.length === 0 ? <p className="p-8 text-center text-sm text-neutral-400">Nothing found.</p>
        : <div className="mt-5 space-y-5">{results.map((g) => (
          <div key={g.view}><h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-neutral-400">{g.label}</h3>
            <div className="space-y-2">{g.items.map((i) => <button key={i.id} onClick={() => go(g.view)} className="block w-full rounded-xl border border-white/10 p-3 text-left hover:bg-white/[.04]"><div className="truncate text-base font-semibold" style={SERIF}>{i.title || i.q || i.name}</div>{(i.body || i.url || i.a) && <div className="mt-0.5 line-clamp-1 text-sm text-neutral-400">{i.body || i.url || i.a}</div>}</button>)}</div></div>))}</div>}
    </div>
  );
}

/* ------------------------------ Open Questions ------------------------------ */
export function QuestionsView() {
  const [qs, setQs] = useStore("xb_data_questions");
  const [text, setText] = useState("");
  const [flt, setFlt] = useState("open");
  const [editing, setEditing] = useState("");
  const [draft, setDraft] = useState("");
  const add = (e) => { e.preventDefault(); if (!text.trim()) return; setQs((p) => [{ id: uid(), q: text.trim(), a: "", done: false, ts: Date.now() }, ...p]); setText(""); };
  const shown = qs.filter((x) => flt === "all" || (flt === "open" ? !x.done : x.done));
  const openN = qs.filter((x) => !x.done).length;
  return (
    <div className="p-4 sm:p-6">
      <form onSubmit={add} className="mb-4 flex gap-2"><input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a question you still need to answer…" className={inputCls} /><button className={`${pill} flex shrink-0 items-center`}><Plus className="mr-1.5 h-4 w-4" />Add</button></form>
      <div className="mb-4 flex gap-2">{[["open", `Open (${openN})`], ["done", `Answered (${qs.length - openN})`], ["all", "All"]].map(([k, l]) => <button key={k} onClick={() => setFlt(k)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${flt === k ? "border-amber-400/50 bg-amber-400/10 text-amber-200" : "border-white/15 text-neutral-300"}`}>{l}</button>)}</div>
      {qs.length === 0 ? <EmptyState icon={Search} title="No questions yet" text="Park the things you still need to figure out. Answer them later and mark them closed." /> : (
        <div className="space-y-3">{shown.map((x) => (
          <div key={x.id} className="rounded-2xl border border-white/10 p-4">
            <div className="flex items-start"><h3 className="min-w-0 flex-1 break-words text-lg font-semibold leading-snug" style={SERIF}>{x.q}</h3>
              <span className={`ml-3 shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${x.done ? "border-emerald-500/40 text-emerald-300" : "border-amber-500/40 text-amber-300"}`}>{x.done ? "Answered" : "Open"}</span></div>
            {editing === x.id ? (
              <div className="mt-3"><textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} placeholder="Your answer…" className={inputCls} />
                <div className="mt-2 flex gap-2"><button className={pill} onClick={() => { setQs((p) => p.map((y) => (y.id === x.id ? { ...y, a: draft.trim(), done: !!draft.trim() } : y))); setEditing(""); }}>Save answer</button><button className={ghost} onClick={() => setEditing("")}>Cancel</button></div></div>
            ) : x.a ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-neutral-300">{x.a}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
              <span>{new Date(x.ts).toLocaleDateString()}</span><span className="flex-1" />
              {editing !== x.id && <button onClick={() => { setEditing(x.id); setDraft(x.a || ""); }} className={`${ghost} !px-3 !py-1.5 text-xs`}>{x.a ? "Edit answer" : "Answer"}</button>}
              <button onClick={() => setQs((p) => p.map((y) => (y.id === x.id ? { ...y, done: !y.done } : y)))} className={`${ghost} flex items-center !px-3 !py-1.5 text-xs`}><Check className="mr-1 h-3.5 w-3.5" />{x.done ? "Reopen" : "Mark answered"}</button>
              <button onClick={() => setQs((p) => p.filter((y) => y.id !== x.id))} className="text-neutral-400 hover:text-red-300" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>))}
          {shown.length === 0 && <p className="p-6 text-center text-sm text-neutral-400">Nothing here.</p>}</div>
      )}
    </div>
  );
}

/* ----------------------------- Concepts & Relations ----------------------------- */
export function ConceptsView() {
  const [nodes, setNodes] = useStore("xb_data_concepts");
  const [rels, setRels] = useStore("xb_data_relations");
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [label, setLabel] = useState("relates to");
  const addNode = (e) => { e.preventDefault(); const n = name.trim(); if (!n || nodes.some((x) => x.name.toLowerCase() === n.toLowerCase())) return; setNodes((p) => [...p, { id: uid(), name: n, ts: Date.now() }]); setName(""); };
  const addRel = (e) => { e.preventDefault(); if (!from || !to || from === to) return; setRels((p) => [...p, { id: uid(), from, to, label: label.trim() || "relates to", ts: Date.now() }]); };
  const delNode = (id) => { setNodes((p) => p.filter((x) => x.id !== id)); setRels((p) => p.filter((r) => r.from !== id && r.to !== id)); };
  const W = 400, H = 320, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 46;
  const pos = Object.fromEntries(nodes.map((n, i) => { const a = (i / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2; return [n.id, nodes.length === 1 ? [cx, cy] : [cx + R * Math.cos(a), cy + R * Math.sin(a)]]; }));
  const nm = (id) => nodes.find((n) => n.id === id)?.name || "?";
  return (
    <div className="p-4 sm:p-6">
      <form onSubmit={addNode} className="mb-4 flex gap-2"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a concept, e.g. Authentication" className={inputCls} /><button className={`${pill} flex shrink-0 items-center`}><Plus className="mr-1.5 h-4 w-4" />Add</button></form>
      {nodes.length === 0 ? <EmptyState icon={Search} title="No concepts yet" text="Add the ideas in your project, then link them to see how they connect." /> : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-2xl border border-white/10 p-2">
            <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Concept map">
              <defs><marker id="xb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#9ca3af" /></marker></defs>
              {rels.map((r) => { const a = pos[r.from], b = pos[r.to]; if (!a || !b) return null; const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1; const x2 = b[0] - (dx / d) * 22, y2 = b[1] - (dy / d) * 22;
                return <g key={r.id}><line x1={a[0]} y1={a[1]} x2={x2} y2={y2} stroke="#9ca3af" strokeOpacity=".7" markerEnd="url(#xb-arrow)" /><text x={(a[0] + b[0]) / 2} y={(a[1] + b[1]) / 2 - 4} fill="#d6d3d1" fontSize="9" textAnchor="middle">{r.label}</text></g>; })}
              {nodes.map((n) => <g key={n.id}><circle cx={pos[n.id][0]} cy={pos[n.id][1]} r="20" fill="#1c1410" stroke="#fbbf24" strokeWidth="1.5" /><text x={pos[n.id][0]} y={pos[n.id][1] + 34} fill="#f5f5f4" fontSize="10" textAnchor="middle">{n.name.length > 16 ? n.name.slice(0, 15) + "…" : n.name}</text></g>)}
            </svg>
          </div>
          <div className="space-y-4">
            <form onSubmit={addRel} className="rounded-2xl border border-white/10 p-4">
              <h3 className="mb-3 text-base font-semibold" style={SERIF}>Link two concepts</h3>
              <select value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} aria-label="From"><option value="">From…</option>{nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</select>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="relation, e.g. depends on" className={`${inputCls} mt-2`} />
              <select value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} mt-2`} aria-label="To"><option value="">To…</option>{nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</select>
              <button disabled={!from || !to || from === to} className={`${pill} mt-3 w-full disabled:opacity-40`}>Add relation</button>
            </form>
            <div className="rounded-2xl border border-white/10 p-4">
              <h3 className="mb-2 text-base font-semibold" style={SERIF}>Relations ({rels.length})</h3>
              {rels.map((r) => <div key={r.id} className="flex items-center py-1.5 text-sm"><span className="min-w-0 flex-1 break-words text-neutral-200">{nm(r.from)} <span className="text-amber-300">{r.label}</span> {nm(r.to)}</span><button onClick={() => setRels((p) => p.filter((x) => x.id !== r.id))} className="ml-2 text-neutral-400 hover:text-red-300" aria-label="Delete relation"><X className="h-4 w-4" /></button></div>)}
              {rels.length === 0 && <p className="text-sm text-neutral-500">None yet.</p>}
              <div className="mt-3 flex flex-wrap gap-2 border-t border-white/10 pt-3">{nodes.map((n) => <span key={n.id} className="flex items-center rounded-full border border-white/15 px-3 py-1 text-xs">{n.name}<button onClick={() => delNode(n.id)} className="ml-2 text-neutral-400 hover:text-red-300" aria-label={`Delete ${n.name}`}><X className="h-3 w-3" /></button></span>)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Project Review ------------------------------- */
export function ReviewView() {
  const weekAgo = Date.now() - 7 * 86400000;
  const L = (k) => LS.get(k, []);
  const tasks = L("xb_data_tasks"), notes = L("xb_data_notes"), journal = L("xb_data_journal"), qs = L("xb_data_questions"), snips = L("xb_data_snippets");
  const focus = LS.get("xb_data_focus", {});
  const sessions = Object.entries(focus).filter(([d]) => new Date(d).getTime() >= weekAgo - 86400000).reduce((n, [, c]) => n + c, 0);
  const wk = (a) => a.filter((x) => x.ts >= weekAgo).length;
  const cards = [
    ["Tasks done", tasks.filter((t) => t.col === "done").length, `${tasks.length} total`],
    ["Open questions", qs.filter((x) => !x.done).length, `${qs.filter((x) => x.done).length} answered`],
    ["Notes this week", wk(notes), `${notes.length} total`],
    ["Journey entries this week", wk(journal), `${journal.length} total`],
    ["Snippets saved this week", wk(snips), `${snips.length} total`],
    ["Focus sessions (7 days)", sessions, "25-minute sessions"],
  ];
  return (
    <div className="p-4 sm:p-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{cards.map(([k, v, sub]) => (
        <div key={k} className="rounded-2xl border border-white/10 p-4"><div className="text-3xl font-semibold" style={SERIF}>{v}</div><div className="mt-1 text-sm text-neutral-200">{k}</div><div className="text-xs text-neutral-500">{sub}</div></div>))}</div>
      <h3 className="mb-1 mt-8 text-center text-lg font-semibold" style={SERIF}>Focus timer</h3>
      <FocusView />
    </div>
  );
}

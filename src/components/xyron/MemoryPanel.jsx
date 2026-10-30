import React, { useEffect, useRef, useState } from "react";
import { Brain, Check, Download, FolderPlus, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import {
  GLOBAL, MEMORY_TYPES, addItem, addProject, clearAllMemory, deleteItem, deleteProject, exportMemory, getMemory,
  importMemory, renameProject, setActiveProject, setMemoryEnabled, subscribeMemory, updateItem,
} from "../../lib/memory";

function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-blue-500" : "bg-neutral-700"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

const typeLabel = (k) => MEMORY_TYPES.find((t) => t.key === k)?.label || "Note";

export default function MemoryPanel() {
  const [mem, setMem] = useState(getMemory);
  const [view, setView] = useState(() => getMemory().activeProject || GLOBAL); // which memory is on screen
  const [text, setText] = useState("");
  const [type, setType] = useState("auto");
  const [newProject, setNewProject] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState("");
  const [confirm, setConfirm] = useState(""); // "project" | "all"
  const [note, setNote] = useState("");
  const fileRef = useRef(null);

  useEffect(() => subscribeMemory(() => setMem(getMemory())), []);
  useEffect(() => { if (view !== GLOBAL && !mem.projects.some((p) => p.id === view)) setView(GLOBAL); }, [mem.projects, view]);
  useEffect(() => { if (!note) return undefined; const t = setTimeout(() => setNote(""), 3500); return () => clearTimeout(t); }, [note]);

  const project = mem.projects.find((p) => p.id === view);
  const items = mem.items.filter((i) => i.scope === view).sort((a, b) => b.updatedAt - a.updatedAt);
  const countFor = (scope) => mem.items.filter((i) => i.scope === scope).length;
  const isActive = mem.activeProject === view;

  const save = () => {
    if (!text.trim()) return;
    addItem({ text, scope: view, type: type === "auto" ? undefined : type });
    setText("");
  };

  const download = () => {
    const blob = new Blob([exportMemory()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `xyron-memory-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const onImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try { const n = importMemory(await file.text()); setNote(n > 0 ? `Imported ${n} memor${n === 1 ? "y" : "ies"}.` : "Nothing new to import."); }
    catch (err) { setNote(err?.message || "Couldn't read that file."); }
  };

  const chip = (id, label, count) => (
    <button key={id} type="button" onClick={() => { setView(id); setConfirm(""); setRenaming(false); }}
      className={`rounded-full border px-3 py-1.5 text-xs transition ${view === id ? "border-white/30 bg-white/10 text-white" : "border-white/10 text-neutral-400 hover:bg-white/5 hover:text-white"}`}>
      {label} <span className="text-neutral-500">{count}</span>
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Brain className="mt-0.5 h-5 w-5 text-neutral-300" />
            <div>
              <h3 className="text-sm font-semibold text-white">Memory</h3>
              <p className="mt-1 text-xs leading-relaxed text-neutral-400">
                Xyron only remembers what you choose to save. In chat, say <span className="text-neutral-200">&ldquo;remember that I prefer Python&rdquo;</span> or add it here.
                Say <span className="text-neutral-200">&ldquo;switch to project Shop App&rdquo;</span> to keep a separate memory per project. Saved on this device.
              </p>
            </div>
          </div>
          <Toggle checked={mem.enabled} onChange={setMemoryEnabled} label="Use memory" />
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center gap-2">
          {chip(GLOBAL, "General", countFor(GLOBAL))}
          {mem.projects.map((p) => chip(p.id, p.name, countFor(p.id)))}
          {showNewProject ? (
            <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); const p = addProject(newProject); if (p) { setView(p.id); setNewProject(""); setShowNewProject(false); } }}>
              <input autoFocus value={newProject} onChange={(e) => setNewProject(e.target.value)} placeholder="Project name" maxLength={60}
                className="h-8 w-36 rounded-full border border-white/15 bg-black/40 px-3 text-xs text-white outline-none placeholder:text-neutral-600 focus:border-white/30" />
              <button type="submit" aria-label="Create project" className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"><Check className="h-3.5 w-3.5" /></button>
              <button type="button" aria-label="Cancel" onClick={() => { setShowNewProject(false); setNewProject(""); }} className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 hover:bg-white/10"><X className="h-3.5 w-3.5" /></button>
            </form>
          ) : (
            <button type="button" onClick={() => setShowNewProject(true)} className="flex items-center gap-1.5 rounded-full border border-dashed border-white/15 px-3 py-1.5 text-xs text-neutral-400 hover:bg-white/5 hover:text-white">
              <FolderPlus className="h-3.5 w-3.5" /> New project
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4">
          <div className="min-w-0">
            {renaming && project ? (
              <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); renameProject(project.id, renameText); setRenaming(false); }}>
                <input autoFocus value={renameText} onChange={(e) => setRenameText(e.target.value)} maxLength={60} className="h-8 w-44 rounded-lg border border-white/15 bg-black/40 px-2 text-sm text-white outline-none" />
                <button type="submit" aria-label="Save name" className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white"><Check className="h-3.5 w-3.5" /></button>
              </form>
            ) : (
              <p className="truncate text-sm font-medium text-white">{project ? project.name : "General memory"}</p>
            )}
            <p className="text-xs text-neutral-500">{project ? "Used only when this project is active." : "Used in every chat."}</p>
          </div>
          <div className="flex items-center gap-2">
            {project && (
              <>
                <button type="button" onClick={() => setActiveProject(isActive ? GLOBAL : project.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${isActive ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300" : "border-white/10 text-neutral-300 hover:bg-white/5"}`}>
                  {isActive ? "Active project" : "Set as active"}
                </button>
                <button type="button" aria-label="Rename project" onClick={() => { setRenameText(project.name); setRenaming((r) => !r); }} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-neutral-400 hover:bg-white/5 hover:text-white"><Pencil className="h-3.5 w-3.5" /></button>
                {confirm === "project" ? (
                  <button type="button" onClick={() => { deleteProject(project.id); setConfirm(""); }} className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/30">Delete project and its memories?</button>
                ) : (
                  <button type="button" aria-label="Delete project" onClick={() => setConfirm("project")} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-neutral-400 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
                )}
              </>
            )}
          </div>
        </div>

        <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={project ? `Add something to remember for ${project.name}…` : "Add something to remember, e.g. I prefer TypeScript"}
            className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-white/25" />
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Memory type" className="h-10 rounded-xl border border-white/10 bg-black/40 px-2 text-sm text-neutral-200 outline-none">
            <option value="auto">Auto type</option>
            {MEMORY_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <button type="submit" disabled={!text.trim()} className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white px-4 text-sm font-medium text-black disabled:opacity-40"><Plus className="h-4 w-4" /> Save</button>
        </form>

        <ul className="mt-4 space-y-2">
          {items.length === 0 && <li className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-neutral-500">Nothing saved here yet.</li>}
          {items.map((i) => (
            <li key={i.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
              {editId === i.id ? (
                <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); updateItem(i.id, { text: editText }); setEditId(null); }}>
                  <textarea autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} maxLength={500} rows={2} className="w-full resize-none rounded-lg border border-white/15 bg-black/40 p-2 text-sm text-white outline-none" />
                  <div className="flex items-center justify-between gap-2">
                    <select value={i.type} onChange={(e) => updateItem(i.id, { type: e.target.value })} aria-label="Memory type" className="h-8 rounded-lg border border-white/10 bg-black/40 px-2 text-xs text-neutral-200">
                      {MEMORY_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                    <div className="flex gap-1">
                      <button type="submit" className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-black">Save</button>
                      <button type="button" onClick={() => setEditId(null)} className="rounded-lg px-3 py-1.5 text-xs text-neutral-400 hover:bg-white/5">Cancel</button>
                    </div>
                  </div>
                </form>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="mb-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-300">{typeLabel(i.type)}</span>
                    <p className="break-words text-sm text-neutral-100">{i.text}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" aria-label="Edit memory" onClick={() => { setEditId(i.id); setEditText(i.text); }} className="grid h-8 w-8 place-items-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white"><Pencil className="h-3.5 w-3.5" /></button>
                    <button type="button" aria-label="Delete memory" onClick={() => deleteItem(i.id)} className="grid h-8 w-8 place-items-center rounded-lg text-neutral-400 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={download} disabled={!mem.items.length} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-neutral-200 hover:bg-white/5 disabled:opacity-40"><Download className="h-3.5 w-3.5" /> Export all</button>
          <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-neutral-200 hover:bg-white/5"><Upload className="h-3.5 w-3.5" /> Import</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
          <div className="flex-1" />
          {confirm === "all" ? (
            <>
              <button type="button" onClick={() => { clearAllMemory(); setConfirm(""); setView(GLOBAL); }} className="rounded-xl bg-red-500/20 px-3 py-2 text-xs text-red-300 hover:bg-red-500/30">Yes, delete everything</button>
              <button type="button" onClick={() => setConfirm("")} className="rounded-xl px-3 py-2 text-xs text-neutral-400 hover:bg-white/5">Cancel</button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirm("all")} disabled={!mem.items.length && !mem.projects.length} className="flex items-center gap-1.5 rounded-xl border border-red-500/20 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /> Delete all memory</button>
          )}
        </div>
        {note && <p role="status" className="mt-3 text-xs text-neutral-400">{note}</p>}
      </div>
    </div>
  );
}

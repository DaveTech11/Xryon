import React, { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, ChevronDown, Clapperboard, Copy, Download, Image as ImageIcon, Music2, Pause, Play, Plus, Scissors, Trash2, Upload, Video, Volume2 } from "lucide-react";

const TRACKS = [
  { id: "video", label: "Video", icon: Video },
  { id: "image", label: "Images", icon: ImageIcon },
  { id: "text", label: "Text & titles", icon: Clapperboard },
  { id: "audio", label: "Audio", icon: Music2 },
];
const fmt = (s) => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, "0")}`;

export default function StudioTimeline({ onSelectMedia }) {
  const picker = useRef(null);
  const [clips, setClips] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [playhead, setPlayhead] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [track, setTrack] = useState("video");
  const [titleText, setTitleText] = useState("Your title");
  const selected = clips.find((c) => c.id === selectedId) || null;
  const duration = Math.max(15, ...clips.map((c) => c.start + c.duration));
  const pxPerSec = 16 * zoom;

  useEffect(() => () => clips.forEach((c) => { if (c.url?.startsWith("blob:")) URL.revokeObjectURL(c.url); }), []);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setPlayhead((p) => p >= duration ? (setPlaying(false), 0) : p + 0.1), 100);
    return () => clearInterval(id);
  }, [playing, duration]);

  function importFiles(files) {
    const next = Array.from(files || []).map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      file,
      url: URL.createObjectURL(file),
      type: file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "image",
      start: playhead,
      duration: file.type.startsWith("video/") ? 10 : file.type.startsWith("audio/") ? 15 : 5,
      trimStart: 0,
      volume: 100,
    }));
    setClips((old) => [...old, ...next]);
    if (next[0]) { setSelectedId(next[0].id); onSelectMedia?.(next[0]); }
  }
  function patchSelected(patch) { setClips((old) => old.map((c) => c.id === selectedId ? { ...c, ...patch } : c)); }
  function removeSelected() {
    if (!selected) return;
    if (selected.url?.startsWith("blob:")) URL.revokeObjectURL(selected.url);
    setClips((old) => old.filter((c) => c.id !== selectedId)); setSelectedId(null);
  }
  function splitSelected() {
    if (!selected) return;
    const local = playhead - selected.start;
    if (local <= 0.15 || local >= selected.duration - 0.15) return;
    const left = { ...selected, id: `${selected.id}-a-${Date.now()}`, duration: local };
    const right = { ...selected, id: `${selected.id}-b-${Date.now()}`, start: playhead, duration: selected.duration - local, trimStart: selected.trimStart + local, name: `${selected.name} (split)` };
    setClips((old) => old.flatMap((c) => c.id === selectedId ? [left, right] : [c])); setSelectedId(right.id);
  }
  function addTitle() {
    const title = { id: `title-${Date.now()}`, name: titleText.trim() || "Title", type: "text", start: playhead, duration: 3, text: titleText.trim() || "Title", volume: 100 };
    setClips((old) => [...old, title]); setSelectedId(title.id); setTrack("text");
  }
  function exportProject() {
    const data = { version: 1, name: "Xyron Studio Project", duration, clips: clips.map(({ file, url, ...c }) => ({ ...c, sourceFileName: file?.name || c.name })) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "xyron-studio-project.json"; a.click(); URL.revokeObjectURL(url);
  }
  const sorted = useMemo(() => [...clips].sort((a, b) => a.start - b.start), [clips]);

  return <section className="xyron-timeline mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d10] text-white">
    <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-3 sm:px-4">
      <div className="mr-auto flex items-center gap-2"><Clapperboard size={17} className="text-rose-200"/><div><p className="text-sm font-semibold">Timeline editor</p><p className="text-[10px] text-neutral-500">Arrange clips · trim · split · export project</p></div></div>
      <button onClick={() => picker.current?.click()} className="flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 text-xs font-semibold text-black"><Plus size={14}/> Add media</button>
      <button onClick={exportProject} className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs text-neutral-300"><Download size={14}/> Save project</button>
      <input ref={picker} type="file" multiple accept="image/*,video/*,audio/*" className="hidden" onChange={(e) => { importFiles(e.target.files); e.target.value = ""; }}/>
    </div>
    <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-3 py-2 sm:px-4">
      <button onClick={() => setPlaying((v) => !v)} className="grid h-9 w-9 place-items-center rounded-full bg-rose-200 text-black" aria-label={playing ? "Pause timeline" : "Play timeline"}>{playing ? <Pause size={15}/> : <Play size={15}/>}</button>
      <span className="font-mono text-xs text-neutral-300">{fmt(playhead)} <span className="text-neutral-600">/</span> {fmt(duration)}</span>
      <div className="ml-auto flex items-center gap-2 text-xs text-neutral-500"><span>Zoom</span><input aria-label="Timeline zoom" type="range" min="0.5" max="2.5" step="0.1" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-20 accent-rose-200 sm:w-28"/></div>
    </div>
    <div className="xyron-timeline-scroll">
      <div className="xyron-timeline-inner" style={{ minWidth: `${Math.max(520, duration * pxPerSec + 90)}px` }}>
        <div className="xyron-ruler"><div className="xyron-track-label">Time</div><div className="xyron-ruler-track" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPlayhead(Math.max(0, (e.clientX - r.left) / pxPerSec)); }}>
          {Array.from({ length: Math.ceil(duration / 5) + 1 }, (_, i) => <span key={i} style={{ left: `${i * 5 * pxPerSec}px` }}>{fmt(i * 5)}</span>)}
        </div></div>
        {TRACKS.map((t) => { const Icon = t.icon; const items = sorted.filter((c) => c.type === t.id); return <div className="xyron-track-row" key={t.id}>
          <div className="xyron-track-label"><Icon size={14}/><span>{t.label}</span><button title={`Add to ${t.label}`} onClick={() => t.id === "text" ? addTitle() : (setTrack(t.id), picker.current?.click())} className="ml-auto rounded p-1 hover:bg-white/10"><Plus size={13}/></button></div>
          <div className="xyron-track-lane" style={{ width: `${duration * pxPerSec}px` }}>
            {items.map((c) => <button key={c.id} onClick={() => { setSelectedId(c.id); setPlayhead(c.start); onSelectMedia?.(c); }} className={`xyron-clip ${c.type} ${selectedId === c.id ? "selected" : ""}`} style={{ left: `${c.start * pxPerSec}px`, width: `${Math.max(34, c.duration * pxPerSec)}px` }} title={`${c.name} · ${fmt(c.duration)}`}>
              {c.type === "image" && c.url ? <img src={c.url} alt=""/> : null}{c.type === "video" && c.url ? <video src={c.url} muted preload="metadata"/> : null}<span>{c.type === "text" ? c.text : c.name}</span>
            </button>)}
            <button className="xyron-playhead" style={{ left: `${playhead * pxPerSec}px` }} aria-label="Move playhead" onClick={() => setPlayhead((p) => Math.min(duration, p + 1))}/>
          </div>
        </div>; })}
        <div className="xyron-playhead-line" style={{ left: `calc(92px + ${playhead * pxPerSec}px)` }}/>
      </div>
    </div>
    <div className="grid gap-3 border-t border-white/10 p-3 sm:grid-cols-[1fr_auto] sm:items-center sm:px-4">
      <div className="min-w-0"><p className="text-xs font-medium text-neutral-300">{selected ? selected.name : "Select a clip to edit"}</p><p className="mt-1 text-[10px] text-neutral-600">{selected ? `${selected.type.toUpperCase()} · starts at ${fmt(selected.start)}` : "Add media to start building your timeline."}</p></div>
      {selected && <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[10px] text-neutral-500">Start <input type="number" min="0" step="0.1" value={selected.start} onChange={(e) => patchSelected({ start: Math.max(0, Number(e.target.value) || 0) })} className="w-16 rounded-lg border border-white/10 bg-black px-2 py-2 text-xs text-white"/></label>
        <label className="flex items-center gap-2 text-[10px] text-neutral-500">Length <input type="number" min="0.2" step="0.5" value={selected.duration} onChange={(e) => patchSelected({ duration: Math.max(0.2, Number(e.target.value) || 0.2) })} className="w-16 rounded-lg border border-white/10 bg-black px-2 py-2 text-xs text-white"/></label>
        {selected.type === "audio" && <label className="flex items-center gap-1 text-neutral-500"><Volume2 size={13}/><input aria-label="Audio volume" type="range" min="0" max="100" value={selected.volume} onChange={(e) => patchSelected({ volume: Number(e.target.value) })} className="w-16 accent-rose-200"/></label>}
        <button onClick={splitSelected} className="flex min-h-9 items-center gap-1 rounded-lg border border-white/10 px-2 text-xs text-neutral-300"><Scissors size={13}/> Split at playhead</button>
        <button onClick={() => { const copy = { ...selected, id: `${selected.id}-copy-${Date.now()}`, start: selected.start + selected.duration }; setClips((old) => [...old, copy]); setSelectedId(copy.id); }} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-neutral-300" title="Duplicate clip"><Copy size={13}/></button>
        <button onClick={removeSelected} className="grid h-9 w-9 place-items-center rounded-lg border border-red-400/20 text-red-300" title="Delete clip"><Trash2 size={13}/></button>
      </div>}
    </div>
    <div className="border-t border-white/10 px-3 py-2 text-[10px] leading-5 text-neutral-600 sm:px-4">Project saving exports an editable timeline description. Final MP4 rendering and AI effects require a configured rendering worker and AI provider; this editor won't claim to render a video until those services are connected.</div>
  </section>;
}

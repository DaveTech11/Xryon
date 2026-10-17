import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Heart, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, ListMusic, Loader2, X } from "lucide-react";
import { useMusic, useMusicTime } from "../../../lib/MusicContext";
import { Cover, Equalizer, fmt } from "./musicUi";

// Same bars every time for the same song, so the "waveform" feels like part of the track.
function barsFor(id, n = 64) {
  let h = 2166136261;
  for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const out = [];
  for (let i = 0; i < n; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    const base = 0.28 + (h % 1000) / 1000 * 0.72;
    out.push(base * (0.65 + 0.35 * Math.sin((i / n) * Math.PI)));
  }
  return out;
}

function Waveform({ id, current, duration, onSeek }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(null);
  const bars = useMemo(() => barsFor(id), [id]);
  const pct = drag ?? (duration ? Math.min(1, current / duration) : 0);

  const at = (e) => {
    const r = ref.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  return (
    <div
      ref={ref}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(current)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") onSeek(current + 5);
        if (e.key === "ArrowLeft") onSeek(current - 5);
      }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(at(e)); }}
      onPointerMove={(e) => { if (drag !== null) setDrag(at(e)); }}
      onPointerUp={(e) => { const p = at(e); setDrag(null); if (duration) onSeek(p * duration); }}
      onPointerCancel={() => setDrag(null)}
      className="flex h-12 w-full cursor-pointer touch-none items-center gap-[3px]"
    >
      {bars.map((b, i) => {
        const done = (i + 0.5) / bars.length <= pct;
        return <span key={i} className="flex-1 rounded-full transition-colors" style={{ height: `${Math.round(b * 100)}%`, background: done ? "#fff" : "rgba(255,255,255,0.35)" }} />;
      })}
    </div>
  );
}

export default function NowPlaying() {
  const m = useMusic();
  const time = useMusicTime();
  const [showQueue, setShowQueue] = useState(false);
  const slotRef = useRef(null);
  const wantSlot = !!m?.track?.videoId && !!m?.expanded && !showQueue;
  const setYtRect = m?.setYtRect;

  // YouTube songs are drawn by the player in MusicContext; tell it where this screen's video slot is.
  useEffect(() => {
    if (!setYtRect) return undefined;
    if (!wantSlot) { setYtRect(null); return undefined; }
    const el = slotRef.current;
    if (!el) return undefined;
    const measure = () => { const r = el.getBoundingClientRect(); setYtRect({ left: r.left, top: r.top, width: r.width, height: r.height }); };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { ro?.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); setYtRect(null); };
  }, [wantSlot, setYtRect]);

  if (!m?.track || !m.expanded) return null;
  const { track } = m;
  const duration = time.duration || track.duration || 0;
  const liked = m.isLiked(track.id);

  const circle = "grid h-11 w-11 place-items-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur transition active:scale-95";

  return (
    <div className="fixed inset-0 z-[90] flex flex-col overflow-hidden text-white" style={{ background: "#000" }}>
      {/* soft blurred copy of the cover behind everything */}
      {track.cover && <img src={track.cover} alt="" aria-hidden referrerPolicy="no-referrer" className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-20 blur-3xl grayscale" />}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/70" />

      <div className="relative mx-auto flex h-full w-full max-w-md flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => m.setExpanded(false)} aria-label="Minimise player" className={circle}><ChevronDown className="h-5 w-5" /></button>
          <span className="text-sm tracking-wide text-white/90">Now Playing</span>
          <button type="button" onClick={() => { m.stop(); }} aria-label="Stop and close player" className={circle}><X className="h-5 w-5" /></button>
        </div>

        {showQueue ? (
          <div className="mt-6 min-h-0 flex-1 overflow-y-auto rounded-3xl bg-black/25 p-2 backdrop-blur [scrollbar-width:thin]">
            <p className="px-3 pb-2 pt-2 text-xs font-semibold uppercase tracking-widest text-white/60">Up next</p>
            {m.queue.map((t, i) => (
              <button key={`${t.id}-${i}`} type="button" onClick={() => m.play(m.queue, i)} className={`flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-white/10 ${i === m.index ? "bg-white/15" : ""}`}>
                <Cover src={t.cover} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="truncate text-xs text-white/60">{t.artist}</p>
                </div>
                {i === m.index && <Equalizer active={m.playing} />}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-6 flex flex-1 flex-col justify-center">
            {track.videoId ? (
              <div className="mx-auto w-full max-w-[22rem]">
                <div ref={slotRef} className="aspect-video w-full rounded-2xl bg-black/40" />
                <p className="mt-2 text-center text-[11px] text-white/50">Playing from YouTube</p>
              </div>
            ) : (
              <div className="mx-auto aspect-square w-full max-w-[22rem] overflow-hidden rounded-[2rem] shadow-2xl shadow-black/40">
                <Cover src={track.cover} size="100%" rounded="rounded-none" iconSize={72} className="!h-full !w-full" />
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm text-white/70">{track.artist}</p>
            <h2 className="truncate text-2xl font-semibold leading-tight">{track.title}</h2>
            <p className="mt-1 text-[11px] text-white/55">{track.source === "youtube" ? "YouTube" : track.source === "lyria" ? "Made by Xyron AI with Google Lyria" : track.full ? "Full song" : "30-second preview"}</p>
          </div>
          <button type="button" onClick={() => m.toggleLike(track)} aria-label={liked ? "Remove from liked songs" : "Add to liked songs"} aria-pressed={liked} className={circle}>
            <Heart className="h-5 w-5" fill={liked ? "#ffffff" : "none"} stroke={liked ? "#ffffff" : "currentColor"} />
          </button>
        </div>

        <div className="mt-4">
          <Waveform id={track.id} current={time.current} duration={duration} onSeek={m.seek} />
          <div className="mt-1 flex justify-between text-xs text-white/70"><span>{fmt(time.current)}</span><span>{fmt(duration)}</span></div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button type="button" onClick={() => m.setRepeat(m.repeat === "off" ? "all" : m.repeat === "all" ? "one" : "off")} aria-label={`Repeat: ${m.repeat}`} className={`grid h-10 w-10 place-items-center rounded-full ${m.repeat !== "off" ? "text-white" : "text-white/55"}`}>
            {m.repeat === "one" ? <Repeat1 className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}
          </button>
          <button type="button" onClick={m.prev} aria-label="Previous song" className="grid h-12 w-12 place-items-center text-white active:scale-90"><SkipBack className="h-7 w-7" fill="currentColor" /></button>
          <button type="button" onClick={m.toggle} aria-label={m.playing ? "Pause" : "Play"} className="grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full border border-white/40 bg-white text-black shadow-lg transition active:scale-95">
            {m.loading ? <Loader2 className="h-8 w-8 animate-spin" /> : m.playing ? <Pause className="h-8 w-8" fill="currentColor" /> : <Play className="ml-1 h-8 w-8" fill="currentColor" />}
          </button>
          <button type="button" onClick={m.next} aria-label="Next song" className="grid h-12 w-12 place-items-center text-white active:scale-90"><SkipForward className="h-7 w-7" fill="currentColor" /></button>
          <button type="button" onClick={() => setShowQueue((v) => !v)} aria-label="Show queue" aria-pressed={showQueue} className={`grid h-10 w-10 place-items-center rounded-full ${showQueue ? "text-white" : "text-white/55"}`}><ListMusic className="h-5 w-5" /></button>
        </div>
        <button type="button" onClick={() => m.setShuffle(!m.shuffle)} aria-pressed={m.shuffle} className={`mx-auto mt-3 flex items-center gap-1.5 text-xs ${m.shuffle ? "text-white" : "text-white/50"}`}><Shuffle className="h-3.5 w-3.5" /> Shuffle {m.shuffle ? "on" : "off"}</button>
      </div>
    </div>
  );
}

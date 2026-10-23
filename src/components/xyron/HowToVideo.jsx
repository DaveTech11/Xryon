import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Play, Pause, RotateCcw } from "lucide-react";

const VIDEO_SRC = "/help/how-to-use-xryon.mp4";
const CAPTIONS_SRC = "/help/how-to-use-xryon.vtt";
const POSTER_SRC = "/help/how-to-use-xryon-poster.jpg";
const CC_KEY = "xryon_captions";

const fmt = (s) => {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

// Full-screen "How to use Xryon" player. Covers the whole screen; the X to close is on the LEFT.
// Controls: play / pause, replay, scrub bar, and captions on/off (captions are read from a WebVTT file
// and drawn by us, so they look the same on every phone and never get hidden by the browser's own UI).
export default function HowToVideo({ open, onClose }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [captionsOn, setCaptionsOn] = useState(() => { try { return localStorage.getItem(CC_KEY) !== "off"; } catch { return true; } });
  const [cue, setCue] = useState("");
  const [failed, setFailed] = useState(false);

  const toggleCaptions = useCallback(() => {
    setCaptionsOn((on) => { const next = !on; try { localStorage.setItem(CC_KEY, next ? "on" : "off"); } catch { /* ignore */ } return next; });
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    if (v.ended) { v.currentTime = 0; }
    if (v.paused || v.ended) v.play().catch(() => {}); else v.pause();
  }, []);

  const replay = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    v.currentTime = 0; setEnded(false); v.play().catch(() => {});
  }, []);

  // Lock page scroll and handle keys while open.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      else if (e.key === " " || e.key === "k") { e.preventDefault(); togglePlay(); }
      else if (e.key === "c" || e.key === "C") toggleCaptions();
      else if (e.key === "r" || e.key === "R") replay();
    };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [open, onClose, togglePlay, toggleCaptions, replay]);

  // Read caption cues. mode "hidden" keeps the cues loading and firing without the browser drawing them.
  useEffect(() => {
    if (!open) return undefined;
    const v = videoRef.current; if (!v) return undefined;
    let track = null;
    const onCue = () => {
      const active = track?.activeCues;
      setCue(active && active.length ? Array.from(active).map((c) => c.text).join("\n") : "");
    };
    const attach = () => {
      track = v.textTracks && v.textTracks[0];
      if (!track) return;
      track.mode = "hidden";
      track.addEventListener("cuechange", onCue);
    };
    attach();
    const t = setTimeout(attach, 300); // some browsers add the <track> a tick later
    return () => { clearTimeout(t); track?.removeEventListener("cuechange", onCue); };
  }, [open]);

  // Reset when reopened.
  useEffect(() => { if (open) { setEnded(false); setTime(0); setCue(""); setFailed(false); } }, [open]);

  if (!open || typeof document === "undefined") return null;

  const seek = (e) => {
    const v = videoRef.current; if (!v || !duration) return;
    v.currentTime = (Number(e.target.value) / 1000) * duration; setTime(v.currentTime); setEnded(false);
  };

  const btn = "grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20 active:scale-95";

  return createPortal(
    <div className="xs-keep-dark fixed inset-0 z-[200] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="How to use Xryon">
      {/* top bar — X on the LEFT */}
      <div className="flex items-center gap-3 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label="Close video" className={btn}><X className="h-5 w-5" /></button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">How to use Xryon</p>
          <p className="truncate text-[11px] text-neutral-400">A quick video tour</p>
        </div>
      </div>

      {/* video */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center" onClick={togglePlay}>
        <video
          ref={videoRef}
          src={VIDEO_SRC}
          poster={POSTER_SRC}
          autoPlay
          playsInline
          preload="auto"
          className="max-h-full w-full max-w-5xl bg-black object-contain"
          onPlay={() => { setPlaying(true); setEnded(false); }}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setEnded(true); }}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onError={() => setFailed(true)}
        >
          <track kind="captions" src={CAPTIONS_SRC} srcLang="en" label="English" default />
        </video>

        {failed && <p className="absolute inset-x-6 text-center text-sm text-neutral-300">The video couldn't load. Check your connection and try again.</p>}

        {captionsOn && cue && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4">
            <p className="max-w-2xl whitespace-pre-line rounded-lg bg-black/75 px-3 py-1.5 text-center text-[15px] leading-snug text-white sm:text-base">{cue}</p>
          </div>
        )}

        {(!playing || ended) && !failed && (
          <button type="button" onClick={(e) => { e.stopPropagation(); ended ? replay() : togglePlay(); }} aria-label={ended ? "Replay" : "Play"} className="absolute grid h-16 w-16 place-items-center rounded-full bg-white/90 text-black shadow-xl transition hover:bg-white active:scale-95">
            {ended ? <RotateCcw className="h-7 w-7" /> : <Play className="ml-0.5 h-7 w-7" fill="currentColor" />}
          </button>
        )}
      </div>

      {/* controls */}
      <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-neutral-400">{fmt(time)}</span>
          <input
            type="range" min={0} max={1000} step={1}
            value={duration ? Math.round((time / duration) * 1000) : 0}
            onChange={seek}
            aria-label="Seek"
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-white"
          />
          <span className="w-10 shrink-0 text-xs tabular-nums text-neutral-400">{fmt(duration)}</span>
        </div>
        <div className="mx-auto mt-3 flex max-w-5xl items-center justify-center gap-3">
          <button type="button" onClick={replay} aria-label="Replay from the start" title="Replay (R)" className={btn}><RotateCcw className="h-5 w-5" /></button>
          <button type="button" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} title="Play / pause (Space)" className="grid h-14 w-14 place-items-center rounded-full bg-white text-black transition hover:bg-neutral-200 active:scale-95">
            {playing ? <Pause className="h-6 w-6" fill="currentColor" /> : <Play className="ml-0.5 h-6 w-6" fill="currentColor" />}
          </button>
          <button
            type="button" onClick={toggleCaptions} aria-pressed={captionsOn} aria-label={captionsOn ? "Turn captions off" : "Turn captions on"} title="Captions (C)"
            className={`grid h-11 min-w-[2.75rem] place-items-center rounded-full border px-3 text-xs font-bold tracking-wide transition active:scale-95 ${captionsOn ? "border-white bg-white text-black" : "border-white/15 bg-white/10 text-white hover:bg-white/20"}`}
          >CC</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

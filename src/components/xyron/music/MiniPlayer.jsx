import React from "react";
import { useLocation } from "react-router-dom";
import { Pause, Play, SkipForward, Loader2 } from "lucide-react";
import { useMusic, useMusicTime } from "../../../lib/MusicContext";
import { Cover, Equalizer } from "./musicUi";
import NowPlaying from "./NowPlaying";

// The song keeps playing on every page (one <audio> / YouTube player lives above the router),
// but the player UI only shows on the Music page. Everywhere else - Chat, Codex, Images - there is
// no bar and no video tile, so nothing covers the conversation. Lock-screen / notification
// controls (Media Session) still work from anywhere.
export default function MiniPlayer() {
  const m = useMusic();
  const time = useMusicTime();
  const { pathname } = useLocation();
  if (!m) return null;
  const onMusicPage = pathname === "/music";
  const show = onMusicPage && m.track && !m.expanded;
  const pct = time.duration ? Math.min(100, (time.current / time.duration) * 100) : 0;

  return (
    <>
      {show && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[6.5rem] z-[60] flex justify-center px-3 md:pl-72" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <div className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl border border-white/15 bg-black/95 shadow-2xl shadow-black/60 backdrop-blur-xl">
            <button type="button" onClick={() => m.setExpanded(true)} aria-label="Open player" className="flex w-full items-center gap-3 p-2 pr-28 text-left">
              <Cover src={m.track.cover} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{m.track.title}</p>
                <p className="flex items-center gap-1.5 truncate text-xs text-white/60">{m.playing && <Equalizer active />}<span className="truncate">{m.track.artist}</span></p>
              </div>
            </button>
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
              <button type="button" onClick={m.toggle} aria-label={m.playing ? "Pause" : "Play"} className="grid h-10 w-10 place-items-center rounded-full bg-white text-black active:scale-95">
                {m.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : m.playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}
              </button>
              <button type="button" onClick={m.next} aria-label="Next song" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white active:scale-95"><SkipForward className="h-4 w-4" fill="currentColor" /></button>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/10"><div className="h-full bg-white" style={{ width: `${pct}%` }} /></div>
          </div>
        </div>
      )}
      {onMusicPage && m.notice && <div role="status" className="pointer-events-none fixed left-1/2 top-4 z-[95] -translate-x-1/2 rounded-full border border-white/15 bg-black px-4 py-2 text-xs text-white shadow-xl">{m.notice}</div>}
      {onMusicPage && <NowPlaying />}
    </>
  );
}

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../api/client";

// One <audio> element lives here, ABOVE the router, so a song keeps playing while the person
// moves between Chat, Music, Codex... The Media Session API puts the song in the phone's
// notification shade / lock screen with play, pause, next, previous and a seek bar.

const PlayerCtx = createContext(null);
const TimeCtx = createContext({ current: 0, duration: 0 });
export const useMusic = () => useContext(PlayerCtx);
export const useMusicTime = () => useContext(TimeCtx);

// Songs from YouTube play in YouTube's own embedded player (its terms don't allow the audio to be
// pulled out or hidden), so a YouTube song shows a small video tile: inside the full player while it
// is open, or as a little floating tile when minimised. Songs from Audius/Deezer/Lyria use <audio>.
let ytApiPromise = null;
function loadYouTubeApi() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { try { prev?.(); } catch { /* ignore */ } resolve(window.YT); };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    tag.onerror = () => { ytApiPromise = null; reject(new Error("YouTube could not be loaded")); };
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

const LIKED_KEY = "xyron_music_liked";
const MADE_KEY = "xyron_music_made";
const RECENT_KEY = "xyron_music_recent";

function readList(key) {
  try { const v = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writeList(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } }

export function MusicProvider({ children }) {
  const audioRef = useRef(null);
  const { pathname } = useLocation();
  const onMusicPage = pathname === "/music";
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState({ current: 0, duration: 0 });
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState("off"); // off | all | one
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [liked, setLiked] = useState(() => readList(LIKED_KEY));
  const [recent, setRecent] = useState(() => readList(RECENT_KEY));
  const [made, setMade] = useState(() => readList(MADE_KEY));
  const [ytBottom, setYtBottom] = useState(6.5); // rem: how far up the mini player bar sits on the Music page
  const [ytRect, setYtRect] = useState(null); // where the full player wants the YouTube video drawn
  const ytWrapRef = useRef(null);
  const ytRef = useRef(null);       // the YT.Player once created
  const ytPending = useRef(null);   // video to start as soon as the player is ready
  const timeRef = useRef({ current: 0, duration: 0 });

  // Latest values for the audio event handlers (they are attached once).
  const live = useRef({});
  live.current = { queue, index, shuffle, repeat };
  timeRef.current = time;
  const failures = useRef(0);
  const retried = useRef(new Set());

  const track = queue[index] || null;

  const flash = useCallback((text) => {
    setNotice(text);
    clearTimeout(flash.t);
    flash.t = setTimeout(() => setNotice(""), 2600);
  }, []);

  const yth = useRef({});
  const ytCreating = useRef(false);

  // Creates (or reuses) the YouTube player and starts a video in it.
  const startYt = useCallback((videoId) => {
    if (ytRef.current?.loadVideoById) { ytRef.current.loadVideoById(videoId); return; }
    ytPending.current = videoId;
    if (ytCreating.current) return;
    ytCreating.current = true;
    loadYouTubeApi().then((YT) => {
      if (!ytWrapRef.current) return;
      const mount = document.createElement("div");
      ytWrapRef.current.appendChild(mount);
      ytRef.current = new YT.Player(mount, {
        width: "100%",
        height: "100%",
        playerVars: { autoplay: 1, playsinline: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, iv_load_policy: 3, origin: window.location.origin },
        events: {
          onReady: () => { if (ytPending.current) { ytRef.current.loadVideoById(ytPending.current); ytPending.current = null; } },
          onStateChange: (e) => yth.current.state?.(e.data),
          onError: () => yth.current.fail?.("That song can't be played here"),
        },
      });
    }).catch(() => { ytCreating.current = false; yth.current.fail?.("YouTube couldn't load. Check your connection."); });
  }, []);

  // Starts a song right now. It must run inside the tap handler so phones allow the sound.
  const startAt = useCallback((list, i) => {
    const audio = audioRef.current;
    const t = list[i];
    if (!audio || !t) return;
    setQueue(list);
    setIndex(i);
    setLoading(true);
    setTime({ current: 0, duration: t.duration || 0 });
    if (t.videoId) {
      audio.pause(); audio.removeAttribute("src"); audio.load();
      startYt(t.videoId);
    } else {
      ytPending.current = null;
      try { ytRef.current?.stopVideo?.(); } catch { /* player not ready */ }
      audio.src = t.src;
      audio.play().catch(() => { /* a failed start surfaces through the error event */ });
    }
    setRecent((cur) => {
      const next = [t, ...cur.filter((x) => x.id !== t.id)].slice(0, 30);
      writeList(RECENT_KEY, next);
      return next;
    });
  }, [startYt]);

  const play = useCallback((list, i = 0) => {
    const clean = (Array.isArray(list) ? list : [list]).filter((t) => t && (t.src || t.videoId));
    if (!clean.length) return;
    failures.current = 0;
    startAt(clean, Math.max(0, Math.min(i, clean.length - 1)));
  }, [startAt]);

  const curIsYt = () => !!live.current.queue[live.current.index]?.videoId;

  const pause = useCallback(() => { if (curIsYt()) ytRef.current?.pauseVideo?.(); else audioRef.current?.pause(); }, []);
  const resume = useCallback(() => { if (curIsYt()) ytRef.current?.playVideo?.(); else audioRef.current?.play().catch(() => {}); }, []);
  const toggle = useCallback(() => {
    if (curIsYt()) {
      const p = ytRef.current;
      if (!p?.getPlayerState) return;
      const st = p.getPlayerState();
      if (st === 1 || st === 3) p.pauseVideo(); else p.playVideo();
      return;
    }
    const a = audioRef.current;
    if (!a || !a.src) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  }, []);

  const seek = useCallback((sec) => {
    if (!Number.isFinite(sec)) return;
    if (curIsYt()) {
      const p = ytRef.current;
      const dur = p?.getDuration?.() || timeRef.current.duration || sec;
      p?.seekTo?.(Math.max(0, Math.min(sec, dur)), true);
      setTime((t) => ({ ...t, current: Math.max(0, Math.min(sec, dur)) }));
      return;
    }
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(sec, a.duration || sec));
  }, []);

  const pickNext = useCallback((auto) => {
    const { queue: q, index: i, shuffle: sh, repeat: rp } = live.current;
    if (!q.length) return -1;
    if (auto && rp === "one") return i;
    if (sh && q.length > 1) {
      let r = i;
      while (r === i) r = Math.floor(Math.random() * q.length);
      return r;
    }
    if (i + 1 < q.length) return i + 1;
    return rp === "all" || !auto ? 0 : -1;
  }, []);

  const next = useCallback(() => {
    const n = pickNext(false);
    if (n >= 0) startAt(live.current.queue, n);
  }, [pickNext, startAt]);

  const prev = useCallback(() => {
    const { queue: q, index: i } = live.current;
    if (timeRef.current.current > 3) { seek(0); return; }
    if (!q.length) return;
    startAt(q, i > 0 ? i - 1 : q.length - 1);
  }, [startAt, seek]);

  const stop = useCallback(() => {
    const a = audioRef.current;
    if (a) { a.pause(); a.removeAttribute("src"); a.load(); }
    try { ytRef.current?.stopVideo?.(); } catch { /* player not ready */ }
    ytPending.current = null;
    setQueue([]); setIndex(-1); setPlaying(false); setLoading(false); setExpanded(false);
  }, []);

  // A song ended on its own: go on to the next one (or repeat).
  const onEnded = useCallback(() => {
    const n = pickNext(true);
    if (n < 0) { setPlaying(false); return; }
    if (n === live.current.index) {
      if (curIsYt()) { ytRef.current?.seekTo?.(0, true); ytRef.current?.playVideo?.(); }
      else { const a = audioRef.current; if (a) { a.currentTime = 0; a.play().catch(() => {}); } }
    } else startAt(live.current.queue, n);
  }, [pickNext, startAt]);

  // A song could not be played: say so and try the next few.
  const onTrackFail = useCallback((message) => {
    const { queue: q, index: i } = live.current;
    failures.current += 1;
    setLoading(false);
    flash(message || "That song can't play right now");
    if (failures.current < Math.min(q.length, 4) && i + 1 < q.length) setTimeout(() => startAt(live.current.queue, i + 1), 700);
    else setPlaying(false);
  }, [flash, startAt]);

  yth.current = {
    fail: onTrackFail,
    state: (code) => {
      if (code === 1) { setPlaying(true); setLoading(false); failures.current = 0; }
      else if (code === 2) setPlaying(false);
      else if (code === 3) setLoading(true);
      else if (code === 5) setLoading(false);
      else if (code === 0) onEnded();
    },
  };

  const addMade = useCallback((t) => {
    if (!t) return;
    setMade((cur) => {
      const next = [t, ...cur.filter((x) => x.id !== t.id)].slice(0, 50);
      writeList(MADE_KEY, next);
      return next;
    });
  }, []);

  const isLiked = useCallback((id) => liked.some((t) => t.id === id), [liked]);
  const toggleLike = useCallback((t) => {
    if (!t) return;
    setLiked((cur) => {
      const next = cur.some((x) => x.id === t.id) ? cur.filter((x) => x.id !== t.id) : [t, ...cur];
      writeList(LIKED_KEY, next);
      return next;
    });
  }, []);

  // Leaving the Music page closes the full player; the song keeps playing in the background.
  useEffect(() => { if (!onMusicPage) setExpanded(false); }, [onMusicPage]);

  // ---- <audio> events ----
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const on = {
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      waiting: () => setLoading(true),
      playing: () => { setLoading(false); setPlaying(true); failures.current = 0; },
      canplay: () => setLoading(false),
      timeupdate: () => setTime({ current: a.currentTime || 0, duration: Number.isFinite(a.duration) ? a.duration : 0 }),
      durationchange: () => setTime({ current: a.currentTime || 0, duration: Number.isFinite(a.duration) ? a.duration : 0 }),
      ended: () => onEnded(),
      error: async () => {
        const { queue: q, index: i } = live.current;
        const t = q[i];
        if (!t || t.videoId || !a.src) return;
        // Deezer preview links expire: fetch a fresh one once and retry the same song.
        if (t.source === "deezer" && !retried.current.has(t.id)) {
          retried.current.add(t.id);
          try {
            const res = await api.music.track(t.id);
            if (res?.track?.src) {
              const fixed = q.map((x, k) => (k === i ? { ...x, src: res.track.src } : x));
              setQueue(fixed);
              a.src = res.track.src;
              a.play().catch(() => {});
              return;
            }
          } catch { /* fall through to skipping */ }
        }
        onTrackFail();
      },
    };
    Object.entries(on).forEach(([k, fn]) => a.addEventListener(k, fn));
    return () => Object.entries(on).forEach(([k, fn]) => a.removeEventListener(k, fn));
  }, [onEnded, onTrackFail]);

  // ---- YouTube: the iframe has no timeupdate event, so ask it where it is twice a second ----
  useEffect(() => {
    if (!track?.videoId) return;
    const id = setInterval(() => {
      const p = ytRef.current;
      if (!p?.getCurrentTime) return;
      const cur = p.getCurrentTime() || 0;
      const dur = p.getDuration?.() || 0;
      setTime((t) => (Math.abs(t.current - cur) < 0.2 && (!dur || t.duration === dur) ? t : { current: cur, duration: dur || t.duration }));
    }, 500);
    return () => clearInterval(id);
  }, [track?.videoId]);

  // ---- Notification / lock-screen controls ----
  const handlers = useRef({});
  handlers.current = { toggle, resume, pause, next, prev, seek };

  useEffect(() => {
    if (!("mediaSession" in navigator) || !track) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album || "Xyron Music",
        artwork: track.cover ? [96, 192, 256, 384, 512].map((n) => ({ src: track.cover, sizes: `${n}x${n}`, type: "image/jpeg" })) : [],
      });
    } catch { /* unsupported metadata */ }
  }, [track]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (name, fn) => { try { ms.setActionHandler(name, fn); } catch { /* action not supported here */ } };
    set("play", () => handlers.current.resume());
    set("pause", () => handlers.current.pause());
    set("previoustrack", () => handlers.current.prev());
    set("nexttrack", () => handlers.current.next());
    set("seekto", (d) => { if (typeof d?.seekTime === "number") handlers.current.seek(d.seekTime); });
    set("seekbackward", (d) => handlers.current.seek(timeRef.current.current - (d?.seekOffset || 10)));
    set("seekforward", (d) => handlers.current.seek(timeRef.current.current + (d?.seekOffset || 10)));
    set("stop", () => handlers.current.pause());
    return () => ["play", "pause", "previoustrack", "nexttrack", "seekto", "seekbackward", "seekforward", "stop"].forEach((n) => set(n, null));
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = !track ? "none" : playing ? "playing" : "paused";
  }, [playing, track]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
    if (!time.duration || !Number.isFinite(time.duration)) return;
    try {
      navigator.mediaSession.setPositionState({ duration: time.duration, playbackRate: 1, position: Math.min(time.current, time.duration) });
    } catch { /* position not accepted */ }
  }, [time]);

  const value = useMemo(() => ({
    queue, index, track, playing, loading, shuffle, repeat, notice, expanded, liked, recent, made,
    play, pause, resume, toggle, next, prev, seek, stop,
    setShuffle, setRepeat, setExpanded, isLiked, toggleLike, addMade, setYtRect, setYtBottom,
  }), [queue, index, track, playing, loading, shuffle, repeat, notice, expanded, liked, recent, made, addMade, play, pause, resume, toggle, next, prev, seek, stop, isLiked, toggleLike]);

  // The YouTube video is only drawn on the Music page: inside the full player when it is open,
  // otherwise as a small tile above the player bar. On every other page it stays mounted (so the
  // song keeps playing) but is moved off screen, so it never covers the chat.
  const showYt = !!track?.videoId && onMusicPage;
  const ytStyle = !showYt
    ? { position: "fixed", left: -9999, top: -9999, width: 200, height: 113, opacity: 0, pointerEvents: "none" }
    : expanded && ytRect
      ? { position: "fixed", left: ytRect.left, top: ytRect.top, width: ytRect.width, height: ytRect.height, zIndex: 95, borderRadius: 16, overflow: "hidden", background: "#000" }
      : { position: "fixed", bottom: `calc(${ytBottom + 4.5}rem + env(safe-area-inset-bottom, 0px))`, right: "0.75rem", width: 200, height: 113, zIndex: 58, borderRadius: 12, overflow: "hidden", background: "#000", boxShadow: "0 10px 30px rgba(0,0,0,.5)" };

  return (
    <PlayerCtx.Provider value={value}>
      <TimeCtx.Provider value={time}>
        {children}
      </TimeCtx.Provider>
      {/* playsInline + preload keep playback going on phones; no controls attribute, so no native download button */}
      <div ref={ytWrapRef} style={ytStyle} aria-hidden={!showYt} />
      <audio ref={audioRef} preload="auto" playsInline controlsList="nodownload noplaybackrate" style={{ display: "none" }} />
    </PlayerCtx.Provider>
  );
}

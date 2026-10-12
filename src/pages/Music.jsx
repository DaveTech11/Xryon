import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Menu, Search, X, Play, Home, Music2, Heart, Clock, RefreshCw, WifiOff, Loader2, Sparkles, ChevronDown } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../lib/AuthContext";
import { useMusic } from "../lib/MusicContext";
import Sidebar from "../components/xyron/Sidebar";
import { ACCENT, PAGE_BG, Cover, Equalizer, fmt } from "../components/xyron/music/musicUi";

const GENRES = [
  { label: "All", q: "" },
  { label: "Afrobeats", q: "afrobeats" },
  { label: "Hip-Hop", q: "hip hop" },
  { label: "Pop", q: "pop hits" },
  { label: "R&B", q: "r&b" },
  { label: "Chill", q: "chill lofi" },
  { label: "Gospel", q: "gospel" },
  { label: "Electronic", q: "electronic" },
];

function Chip({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full border px-4 py-2 text-sm transition ${active ? "border-transparent text-black" : "border-white/20 bg-white/[0.04] text-white/85 hover:bg-white/10"}`}
      style={active ? { background: ACCENT } : undefined}
    >
      {children}
    </button>
  );
}

function TrackRow({ t, list, i }) {
  const m = useMusic();
  const current = m.track?.id === t.id;
  const playingNow = current && m.playing;
  return (
    <div className={`group flex items-center gap-3 rounded-2xl p-1.5 transition ${current ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"}`}>
      <button type="button" onClick={() => (current ? m.toggle() : m.play(list, i))} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Play ${t.title} by ${t.artist}`}>
        <Cover src={t.cover} size={56} rounded="rounded-2xl" />
        <div className="min-w-0 flex-1">
          <p className={`truncate text-[15px] ${current ? "text-white" : "text-white"}`}>{t.title}</p>
          <p className="flex items-center gap-2 truncate text-sm text-white/55">
            <span className="truncate">{t.artist}</span>
            <span className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider ${t.source === "youtube" ? "bg-white/10 text-white/70" : t.source === "lyria" ? "bg-white/10 text-white/70" : t.full ? "bg-white/15 text-white/80" : "bg-white/10 text-white/50"}`}>{t.source === "youtube" ? "YouTube" : t.source === "lyria" ? "AI" : t.full ? "Full" : "30s"}</span>
          </p>
        </div>
      </button>
      {t.full && t.duration > 0 && <span className="hidden text-xs text-white/40 sm:block">{fmt(t.duration)}</span>}
      <button
        type="button"
        onClick={() => m.toggleLike(t)}
        aria-label={m.isLiked(t.id) ? "Unlike" : "Like"}
        aria-pressed={m.isLiked(t.id)}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/45 transition hover:text-white"
      >
        <Heart className="h-[18px] w-[18px]" fill={m.isLiked(t.id) ? "#ffffff" : "none"} stroke={m.isLiked(t.id) ? "#ffffff" : "currentColor"} />
      </button>
      <button
        type="button"
        onClick={() => (current ? m.toggle() : m.play(list, i))}
        aria-label={playingNow ? "Pause" : "Play"}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.12] text-white transition active:scale-95"
      >
        {current && m.loading ? <Loader2 className="h-5 w-5 animate-spin" /> : playingNow ? <Equalizer active /> : <Play className="ml-0.5 h-5 w-5" fill="currentColor" />}
      </button>
    </div>
  );
}

const IDEAS = [
  "Upbeat afrobeats about Lagos nights, talking drums and a catchy hook",
  "Calm lofi piano for studying on a rainy day, instrumental only, no vocals",
  "Emotional gospel worship song with a choir building to a big chorus",
  "Dreamy synth-pop with glittering synths and a soft female vocal",
];

function CreateSong({ onBack }) {
  const m = useMusic();
  const [prompt, setPrompt] = useState("");
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [last, setLast] = useState(null);

  const generate = async () => {
    const text = prompt.trim();
    if (text.length < 5 || busy) return;
    setBusy(true); setError(""); setLast(null);
    try {
      const res = await api.music.generate(text, full);
      if (!res?.track) throw new Error("No song came back. Try again.");
      m.addMade(res.track);
      setLast(res.track);
    } catch (e) {
      setError(e?.message || "Could not create that song right now.");
    } finally { setBusy(false); }
  };

  return (
    <>
      <h1 className="mt-7 text-[28px] font-semibold tracking-tight">Create a song</h1>
      <p className="mt-1 text-sm text-white/60">Describe the music you want and Google Lyria will compose it for you.</p>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        maxLength={600}
        rows={4}
        disabled={busy}
        placeholder="e.g. Upbeat afrobeats about Lagos nights with a catchy chorus"
        aria-label="Describe your song"
        className="mt-5 w-full resize-none rounded-3xl border border-white/20 bg-white/[0.07] p-4 text-[15px] text-white outline-none backdrop-blur placeholder:text-white/40 focus:border-white/50 disabled:opacity-60"
      />
      <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {IDEAS.map((idea) => (
          <button key={idea} type="button" disabled={busy} onClick={() => setPrompt(idea)} className="shrink-0 rounded-full border border-white/20 bg-white/[0.04] px-3.5 py-2 text-xs text-white/80 hover:bg-white/10 disabled:opacity-50">{idea.split(",")[0].slice(0, 34)}</button>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 rounded-full border border-white/15 bg-black/20 p-1" role="radiogroup" aria-label="Song length">
        {[[false, "30-second clip", "Fast"], [true, "Full song", "1-3 min"]].map(([val, label, hint]) => (
          <button key={label} type="button" role="radio" aria-checked={full === val} disabled={busy} onClick={() => setFull(val)} className={`rounded-full px-3 py-2.5 text-sm transition ${full === val ? "text-black" : "text-white/60 hover:text-white"}`} style={full === val ? { background: ACCENT } : undefined}>
            {label} <span className="text-[11px] opacity-70">· {hint}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={generate}
        disabled={busy || prompt.trim().length < 5}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[15px] font-semibold text-black transition active:scale-[0.98] disabled:opacity-50"
        style={{ background: ACCENT }}
      >
        {busy ? <><Loader2 className="h-5 w-5 animate-spin" /> Composing{full ? " (this can take a couple of minutes)" : ""}…</> : <><Sparkles className="h-5 w-5" /> Create song</>}
      </button>
      {error && <p role="alert" className="mt-3 text-center text-sm text-white/70">{error}</p>}

      {last && (
        <div className="mt-6 rounded-3xl border border-white/15 bg-white/[0.06] p-3">
          <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-widest text-white">Your new song</p>
          <TrackRow t={last} list={[last]} i={0} />
          {last.lyrics && (
            <details className="mt-1 px-2 pb-2">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-sm text-white/70"><ChevronDown className="h-4 w-4" /> Lyrics and structure</summary>
              <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap font-sans text-sm text-white/75">{last.lyrics}</pre>
            </details>
          )}
        </div>
      )}

      {m.made.length > 0 && (
        <>
          <h2 className="mt-8 text-lg">Made by you</h2>
          <div className="mt-3 space-y-1">{m.made.filter((t) => t.id !== last?.id).map((t, i, arr) => <TrackRow key={t.id} t={t} list={arr} i={i} />)}</div>
        </>
      )}
      <p className="mt-6 text-center text-[11px] text-white/35">Songs are made with AI and carry an invisible SynthID watermark. Daily limits apply.</p>
      <button type="button" onClick={onBack} className="mx-auto mt-3 block text-xs text-white/50 underline">Back to music</button>
    </>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-1.5">
          <div className="h-14 w-14 animate-pulse rounded-2xl bg-white/10" />
          <div className="flex-1 space-y-2"><div className="h-3 w-2/3 animate-pulse rounded bg-white/10" /><div className="h-2.5 w-1/3 animate-pulse rounded bg-white/5" /></div>
          <div className="h-12 w-12 animate-pulse rounded-full bg-white/10" />
        </div>
      ))}
    </div>
  );
}

export default function MusicPage() {
  const { user } = useAuth();
  const m = useMusic();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState("home"); // home | library | create
  const [canCreate, setCanCreate] = useState(false);
  const [libFilter, setLibFilter] = useState("all"); // all | liked | recent
  const [genre, setGenre] = useState("All");
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");        // what is actually being searched
  const [tracks, setTracks] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error | signin
  const [error, setError] = useState("");
  const req = useRef(0);

  useEffect(() => { api.music.config().then((c) => setCanCreate(!!c?.create)).catch(() => setCanCreate(false)); }, []);

  const first = String(user?.full_name || user?.name || "").trim().split(/\s+/)[0];

  const load = useCallback(async (q) => {
    const mine = ++req.current;
    setStatus("loading"); setError("");
    try {
      const res = q ? await api.music.search(q) : await api.music.trending();
      if (mine !== req.current) return;
      setTracks(res.tracks || []);
      setStatus("ready");
    } catch (e) {
      if (mine !== req.current) return;
      if (e?.status === 401) { setStatus("signin"); return; }
      setError(e?.message || "Couldn't load music.");
      setStatus("error");
    }
  }, []);

  useEffect(() => { load(query); }, [query, load]);

  // Search as you type (after a short pause); Enter searches straight away.
  useEffect(() => {
    const t = term.trim();
    if (t === query) return;
    const id = setTimeout(() => { if (t) { setGenre("All"); setQuery(t); } else setQuery(genre === "All" ? "" : GENRES.find((g) => g.label === genre)?.q || ""); }, 550);
    return () => clearTimeout(id);
  }, [term]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e) => { e.preventDefault(); const t = term.trim(); if (t) { setGenre("All"); setQuery(t); } };
  const pickGenre = (g) => { setGenre(g.label); setTerm(""); setQuery(g.q); setTab("home"); };

  const libList = useMemo(() => {
    if (libFilter === "liked") return m.liked;
    if (libFilter === "recent") return m.recent;
    if (libFilter === "made") return m.made;
    const seen = new Set();
    return [...m.liked, ...m.made, ...m.recent].filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
  }, [libFilter, m.liked, m.recent, m.made]);

  const searching = !!term.trim() && term.trim() === query;
  const heading = searching ? `Results for “${query}”` : genre !== "All" ? genre : "Popular";

  return (
    <div className="min-h-screen text-white" style={{ background: PAGE_BG }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-h-screen flex-col md:pl-72">
        <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-48 pt-[max(1rem,env(safe-area-inset-top))] md:pt-8">
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-white/[0.06] md:hidden"><Menu className="h-5 w-5" /></button>
            <div className="hidden md:block" />
            <form onSubmit={submit} className="relative min-w-0 flex-1 md:max-w-md">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                maxLength={80}
                enterKeyHint="search"
                placeholder="Search any song or artist"
                aria-label="Search music"
                className="w-full rounded-full border border-white/20 bg-white/[0.07] py-3 pl-11 pr-10 text-sm text-white outline-none backdrop-blur placeholder:text-white/40 focus:border-white/50"
              />
              {term && <button type="button" onClick={() => { setTerm(""); setQuery(genre === "All" ? "" : GENRES.find((g) => g.label === genre)?.q || ""); }} aria-label="Clear search" className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-white/60 hover:text-white"><X className="h-4 w-4" /></button>}
            </form>
          </div>

          {tab === "create" ? (
            <CreateSong onBack={() => setTab("home")} />
          ) : tab === "home" ? (
            <>
              <h1 className="mt-7 text-[28px] font-semibold tracking-tight">{first ? `Hello, ${first}` : "Music"}</h1>
              <div className="-mx-5 mt-4 flex gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
                {GENRES.map((g) => <Chip key={g.label} active={genre === g.label && !searching} onClick={() => pickGenre(g)}>{g.label}</Chip>)}
              </div>

              {!searching && genre === "All" && (
                <>
                  <h2 className="mt-7 text-lg">For you</h2>
                  <div className="relative mt-3 overflow-hidden rounded-[1.75rem] p-5" style={{ background: "linear-gradient(135deg,#2a2a2a 0%,#0f0f0f 70%)" }}>
                    {tracks[0]?.cover && <img src={tracks[0].cover} alt="" aria-hidden referrerPolicy="no-referrer" className="pointer-events-none absolute -right-8 -top-4 h-[130%] w-1/2 rounded-3xl object-cover opacity-60 [mask-image:linear-gradient(to_left,black,transparent)]" />}
                    <h3 className="relative text-xl font-semibold">Feel the Beat</h3>
                    <p className="relative mt-1 max-w-[14rem] text-sm text-white/80">Explore trending tracks and hidden gems picked for you.</p>
                    <button
                      type="button"
                      disabled={!tracks.length}
                      onClick={() => m.play(tracks, 0)}
                      className="relative mt-6 inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/15 px-5 py-2.5 text-sm backdrop-blur transition active:scale-95 disabled:opacity-50"
                    >
                      <Play className="h-4 w-4" fill="currentColor" /> Start Listening
                    </button>
                  </div>
                </>
              )}

              <h2 className="mt-7 text-lg">{heading}</h2>
              <div className="mt-3">
                {status === "loading" && <ListSkeleton />}
                {status === "signin" && (
                  <div className="rounded-3xl border border-white/10 bg-black/20 p-8 text-center">
                    <p className="text-sm text-white/80">Sign in to listen to music.</p>
                    <Link to="/login" className="mt-4 inline-block rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black">Sign in</Link>
                  </div>
                )}
                {status === "error" && (
                  <div className="rounded-3xl border border-white/10 bg-black/20 p-8 text-center">
                    <WifiOff className="mx-auto h-8 w-8 text-white/40" />
                    <p className="mt-3 text-sm text-white/80">{error}</p>
                    <button type="button" onClick={() => load(query)} className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black"><RefreshCw className="h-4 w-4" /> Try again</button>
                  </div>
                )}
                {status === "ready" && tracks.length === 0 && <p className="py-12 text-center text-sm text-white/50">Nothing found. Try another song or artist.</p>}
                {status === "ready" && tracks.length > 0 && <div className="space-y-1">{tracks.map((t, i) => <TrackRow key={t.id} t={t} list={tracks} i={i} />)}</div>}
              </div>
              <p className="mt-6 text-center text-[11px] text-white/35">Songs are streamed only, not downloadable. YouTube songs play in YouTube’s own player; “30s” songs are previews.</p>
            </>
          ) : (
            <>
              <h1 className="mt-7 text-[28px] font-semibold tracking-tight">Your library</h1>
              <div className="-mx-5 mt-4 flex gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
                {[["all", "All"], ["liked", "Liked Songs"], ["made", "Made by AI"], ["recent", "Recently Played"]].map(([id, label]) => <Chip key={id} active={libFilter === id} onClick={() => setLibFilter(id)}>{label}</Chip>)}
              </div>
              <div className="mt-5">
                {libList.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-white/15 p-10 text-center">
                    {libFilter === "recent" ? <Clock className="mx-auto h-7 w-7 text-white/30" /> : <Heart className="mx-auto h-7 w-7 text-white/30" />}
                    <p className="mt-3 text-sm text-white/55">{libFilter === "recent" ? "Songs you play will show up here." : libFilter === "made" ? "Songs you create with AI will show up here." : "Tap the heart on a song to keep it here."}</p>
                    <button type="button" onClick={() => setTab("home")} className="mt-4 rounded-full border border-white/25 px-4 py-2 text-sm hover:bg-white/10">Find music</button>
                  </div>
                ) : (
                  <div className="space-y-1">{libList.map((t, i) => <TrackRow key={t.id} t={t} list={libList} i={i} />)}</div>
                )}
              </div>
            </>
          )}
        </main>

        {/* Floating pill navigation, like the reference */}
        <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex justify-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:pl-72">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/15 bg-[#0a0a0a]/90 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl">
            {[["home", "Home", Home], ["library", "Library", Music2], ...(canCreate ? [["create", "Create", Sparkles]] : [])].map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-label={label}
                aria-current={tab === id ? "page" : undefined}
                className={`flex h-12 items-center justify-center gap-2 rounded-full px-5 text-sm transition ${tab === id ? "text-black" : "text-white/60 hover:text-white"}`}
                style={tab === id ? { background: ACCENT } : undefined}
              >
                <Icon className="h-5 w-5" />{tab === id && label}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

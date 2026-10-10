import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Menu, Search, RefreshCw, ImageOff } from "lucide-react";
import { api } from "../api/client";
import Sidebar from "../components/xyron/Sidebar";
import ImageViewer from "../components/xyron/ImageViewer";

function Skeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 15 }).map((_, i) => (
        <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-white/[0.05]" />
      ))}
    </div>
  );
}

// One tile. If the picture fails to load it quietly disappears instead of leaving a broken icon.
function Tile({ item, onOpen, onBroken }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label="Open anime picture"
      className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
    >
      {!loaded && <div className="absolute inset-0 animate-pulse bg-white/[0.05]" />}
      <img
        src={item.thumb}
        alt="Anime"
        loading="lazy"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => onBroken(item.id)}
        className={`h-full w-full object-cover transition duration-300 group-hover:scale-[1.04] ${loaded ? "opacity-100" : "opacity-0"}`}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
    </button>
  );
}

export default function Anime() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error | signin
  const [error, setError] = useState("");
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("anime");
  const [viewing, setViewing] = useState(null);
  const requestId = useRef(0);

  const load = useCallback(async (q) => {
    const mine = ++requestId.current;
    setStatus("loading"); setError("");
    try {
      const res = await api.anime.list(q);
      if (mine !== requestId.current) return;
      setItems(res.images || []);
      setStatus("ready");
    } catch (e) {
      if (mine !== requestId.current) return;
      if (e?.status === 401) { setStatus("signin"); return; }
      setError(e?.message || "Couldn't load pictures.");
      setStatus("error");
    }
  }, []);

  useEffect(() => { load(query); }, [query, load]);

  const submitSearch = (e) => {
    e.preventDefault();
    const t = term.trim();
    setQuery(t ? t : "anime");
  };

  const dropBroken = useCallback((id) => setItems((cur) => cur.filter((x) => x.id !== id)), []);

  // "Describe edits" -> copy the picture into the person's files, then jump to chat with it attached.
  const startEdit = async (prompt) => {
    if (!viewing) return;
    const res = await api.anime.importImage({ u: viewing.u, s: viewing.s });
    navigate("/", { state: { animeEdit: { fileUrl: res.file_url, prompt, at: Date.now() } } });
  };

  return (
    <div className="min-h-screen bg-[#08080a] text-neutral-100">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-h-screen flex-col md:pl-72">
        <header className="xyron-safe-top flex items-center gap-3 border-b border-white/10 bg-black/20 px-4 py-3 backdrop-blur-xl md:hidden">
          <button onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5 text-neutral-400" /></button>
          <span className="font-display tracking-tight">Anime</span>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 md:py-10">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Anime</h1>
              <p className="mt-1 text-sm text-neutral-500">Tap a picture to save it, share it, or describe an edit and Xyron will redo it in chat.</p>
            </div>
            <form onSubmit={submitSearch} className="relative w-full sm:w-72">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                maxLength={50}
                placeholder="Search e.g. naruto, wallpaper"
                className="w-full rounded-full border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-white/30"
              />
            </form>
          </div>

          {status === "loading" && <Skeleton />}

          {status === "signin" && (
            <div className="mx-auto max-w-sm rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
              <p className="text-sm text-neutral-300">Sign in to browse the anime gallery.</p>
              <Link to="/login" className="mt-4 inline-block rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-neutral-200">Sign in</Link>
            </div>
          )}

          {status === "error" && (
            <div className="mx-auto max-w-sm rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
              <ImageOff className="mx-auto h-8 w-8 text-neutral-600" />
              <p className="mt-3 text-sm text-neutral-300">{error}</p>
              <button onClick={() => load(query)} className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-neutral-200">
                <RefreshCw className="h-4 w-4" /> Try again
              </button>
            </div>
          )}

          {status === "ready" && items.length === 0 && (
            <p className="py-16 text-center text-sm text-neutral-500">No pictures found. Try another search.</p>
          )}

          {status === "ready" && items.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {items.map((item) => <Tile key={item.id} item={item} onOpen={setViewing} onBroken={dropBroken} />)}
            </div>
          )}
        </main>
      </div>

      {viewing && (
        <ImageViewer
          images={[viewing.full]}
          index={0}
          title="Anime"
          onClose={() => setViewing(null)}
          onEdit={startEdit}
          editPlaceholder="Describe edits"
        />
      )}
    </div>
  );
}

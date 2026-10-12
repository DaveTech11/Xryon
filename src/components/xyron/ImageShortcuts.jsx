import React, { useMemo, useState } from "react";
import { ChevronDown, Image, Search, Sparkles, Wand2, X } from "lucide-react";

export const IMAGE_SHORTCUTS = [
  ["/anime", "Anime", "Create a detailed anime illustration", "Characters"],
  ["/realistic", "Realistic", "Create a photorealistic image", "Photography"],
  ["/cinematic", "Cinematic", "Create a cinematic movie still", "Photography"],
  ["/portrait", "Portrait", "Create a professional portrait", "People"],
  ["/avatar", "Avatar", "Create a polished profile avatar", "People"],
  ["/wallpaper", "Wallpaper", "Create a premium desktop wallpaper", "Design"],
  ["/logo", "Logo", "Create a clean professional logo", "Design"],
  ["/3d", "3D", "Create a high-quality 3D render", "Design"],
  ["/cartoon", "Cartoon", "Create a playful cartoon illustration", "Characters"],
  ["/manga", "Manga", "Create a detailed manga panel", "Characters"],
  ["/cyberpunk", "Cyberpunk", "Create a dark futuristic cyberpunk scene", "Styles"],
  ["/fantasy", "Fantasy", "Create an epic fantasy artwork", "Styles"],
  ["/product", "Product", "Create a premium product photograph", "Design"],
  ["/sticker", "Sticker", "Create a clean sticker illustration with a simple background", "Design"],
  ["/pixel", "Pixel", "Create detailed pixel art", "Styles"],
  ["/oilpaint", "Oil Paint", "Create a rich classical oil painting", "Styles"],
  ["/watercolor", "Watercolor", "Create a soft watercolor artwork", "Styles"],
  ["/sketch", "Sketch", "Create a detailed pencil sketch", "Styles"],
  ["/neon", "Neon", "Create a glowing neon artwork", "Effects"],
  ["/luxury", "Luxury", "Create a premium luxury advertisement", "Effects"],
  ["/glass", "Glass", "Create a glossy glassmorphism artwork", "Effects"],
  ["/dark", "Dark", "Create a dramatic dark-mode artwork", "Effects"],
  ["/hdr", "HDR", "Create a crisp high-dynamic-range image", "Effects"],
  ["/bw", "Black & White", "Create a dramatic black and white photograph", "Effects"],
  ["/glow", "Glow", "Create an image with elegant atmospheric glow", "Effects"],
];

const BUILTIN_PROMPTS = [
  ...IMAGE_SHORTCUTS.map(([command, label, prefix, category]) => ({ command, label, category, prompt: `${prefix} of ` })),
  { command: "/youtube", label: "YouTube Thumbnail", category: "Social", prompt: "Create an eye-catching YouTube thumbnail about " },
  { command: "/poster", label: "Poster", category: "Design", prompt: "Create a professional poster for " },
  { command: "/banner", label: "Banner", category: "Social", prompt: "Create a wide social media banner for " },
  { command: "/appicon", label: "App Icon", category: "Design", prompt: "Create a modern app icon for " },
  { command: "/fashion", label: "Fashion", category: "People", prompt: "Create a high-end fashion editorial photograph of " },
  { command: "/architecture", label: "Architecture", category: "Photography", prompt: "Create a realistic architectural visualization of " },
  { command: "/food", label: "Food", category: "Photography", prompt: "Create a mouth-watering professional food photograph of " },
  { command: "/nature", label: "Nature", category: "Photography", prompt: "Create a breathtaking nature photograph of " },
  { command: "/scifi", label: "Sci-Fi", category: "Styles", prompt: "Create an epic science-fiction scene showing " },
  { command: "/minimal", label: "Minimal", category: "Design", prompt: "Create a clean minimalist composition featuring " },
  { command: "/vintage", label: "Vintage", category: "Styles", prompt: "Create a nostalgic vintage photograph of " },
  { command: "/isometric", label: "Isometric", category: "Design", prompt: "Create a polished isometric 3D illustration of " },
  { command: "/comic", label: "Comic", category: "Characters", prompt: "Create a dynamic comic-book illustration of " },
  { command: "/fantasyland", label: "Fantasy World", category: "Characters", prompt: "Create an immersive fantasy world showing " },
  { command: "/headshot", label: "Headshot", category: "People", prompt: "Create a clean studio headshot of " },
  { command: "/mockup", label: "Mockup", category: "Design", prompt: "Create a realistic product mockup showing " },
  { command: "/album", label: "Album Cover", category: "Design", prompt: "Create a striking album cover for " },
  { command: "/tattoo", label: "Tattoo", category: "Design", prompt: "Create a tattoo design inspired by " },
  { command: "/vehicle", label: "Vehicle", category: "Design", prompt: "Create a futuristic vehicle concept showing " },
  { command: "/room", label: "Interior", category: "Design", prompt: "Create a realistic luxury interior design for " },
  { command: "/studiolight", label: "Studio Light", category: "Photography", prompt: "Create a studio-lit professional photograph of " },
  { command: "/dream", label: "Dreamscape", category: "Styles", prompt: "Create a surreal dreamscape featuring " },
  { command: "/lowpoly", label: "Low Poly", category: "Styles", prompt: "Create a stylish low-poly 3D scene of " },
  { command: "/chibi", label: "Chibi", category: "Characters", prompt: "Create a cute chibi character of " },
  { command: "/lineart", label: "Line Art", category: "Styles", prompt: "Create clean detailed line art of " },
];

const STYLE_HINTS = {
  anime: ", expressive anime character design, detailed eyes, clean linework, polished shading, cinematic composition",
  realistic: ", photorealistic detail, natural lighting, realistic textures, professional photography",
  cinematic: ", cinematic lighting, dramatic composition, depth of field, film still quality",
  portrait: ", flattering studio lighting, sharp facial detail, professional portrait photography",
  avatar: ", centered composition, clean silhouette, polished details, profile-picture friendly",
  wallpaper: ", ultra-wide composition, premium lighting, clean negative space, high detail",
  logo: ", clean vector-inspired geometry, strong silhouette, professional branding, simple background",
  "3d": ", high-quality 3D render, realistic materials, studio lighting, polished reflections",
  cyberpunk: ", neon city lights, futuristic technology, rain reflections, atmospheric haze",
  fantasy: ", epic fantasy atmosphere, magical lighting, intricate details, dramatic environment",
};

export function expandImagePrompt(text) {
  const value = String(text || "").trim();
  const match = value.match(/^(\/[^\s]+)\s*(.*)$/);
  if (!match) return value;
  const shortcut = IMAGE_SHORTCUTS.find(([command]) => command === match[1].toLowerCase());
  if (!shortcut) return value;
  const [, command, label, prefix] = shortcut;
  const subject = match[2].trim() || "an original scene";
  const key = command.slice(1);
  return `${prefix}: ${subject}${STYLE_HINTS[key] || ", highly detailed, polished composition, professional quality"}.`;
}

export function isImageShortcut(text = "") {
  const command = String(text).trim().split(/\s+/)[0]?.toLowerCase();
  return IMAGE_SHORTCUTS.some(([shortcut]) => shortcut === command);
}

export function getImageShortcut(text = "") {
  const command = String(text).trim().split(/\s+/)[0]?.toLowerCase();
  return IMAGE_SHORTCUTS.find(([shortcut]) => shortcut === command) || null;
}

export function getImageShortcutCommand(text = "") {
  return String(text).trim().split(/\s+/)[0]?.toLowerCase() || "";
}

export default function ImageShortcuts({ onPick, disabled = false, openSignal = 0 }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  // Lets a parent (e.g. a "/image" command) open this gallery without
  // otherwise changing how it behaves when used on its own.
  React.useEffect(() => {
    if (openSignal) setOpen(true);
  }, [openSignal]);

  const categories = useMemo(() => ["All", ...Array.from(new Set(BUILTIN_PROMPTS.map((p) => p.category)))], []);
  const filtered = useMemo(() => BUILTIN_PROMPTS.filter((p) => {
    const matchesCategory = category === "All" || p.category === category;
    const haystack = `${p.command} ${p.label} ${p.prompt}`.toLowerCase();
    return matchesCategory && haystack.includes(query.toLowerCase());
  }), [category, query]);

  const pick = (prompt) => {
    onPick(prompt);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="mb-2">
      <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        <button type="button" disabled={disabled} onClick={() => setOpen((v) => !v)} className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-medium text-neutral-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-40">
          <Wand2 className="h-3.5 w-3.5" /> Image shortcuts <ChevronDown className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`} />
        </button>
        {IMAGE_SHORTCUTS.slice(0, 7).map(([command, label]) => (
          <button key={command} type="button" disabled={disabled} onClick={() => onPick(`${command} `)} className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-neutral-500 transition hover:bg-white/5 hover:text-white disabled:opacity-40">
            <Image className="h-3 w-3" /> {label}
          </button>
        ))}
      </div>

      {open && (
        <div className="mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0b]/95 p-3 shadow-2xl shadow-black/50 backdrop-blur-2xl">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <Search className="h-3.5 w-3.5 text-neutral-600" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search 50+ built-in image prompts…" className="w-full bg-transparent text-xs text-white outline-none placeholder:text-neutral-600" />
            </div>
            <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl text-neutral-500 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
            {categories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] ${category === item ? "bg-white text-black" : "border border-white/10 text-neutral-500 hover:text-white"}`}>{item}</button>)}
          </div>
          <div className="mt-3 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {filtered.map((p) => <button key={p.command} type="button" onClick={() => pick(`${p.command} `)} className="rounded-xl border border-white/10 bg-white/[0.025] p-3 text-left transition hover:border-white/20 hover:bg-white/[0.07]"><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-white">{p.label}</span><span className="text-[9px] text-neutral-600">{p.command}</span></div><p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-neutral-500">{p.prompt}</p></button>)}
            {!filtered.length && <div className="col-span-full py-8 text-center text-xs text-neutral-600">No prompts found.</div>}
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3 text-[10px] text-neutral-600"><Sparkles className="h-3 w-3" /> Type a shortcut directly, e.g. <span className="rounded bg-white/5 px-1.5 py-0.5 text-neutral-400">/anime a futuristic city</span></div>
        </div>
      )}
    </div>
  );
}


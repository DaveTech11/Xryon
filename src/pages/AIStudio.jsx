import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import StudioTimeline from "../components/xyron/StudioTimeline";
import {
  ArrowLeft, ArrowUp, Image as ImageIcon, Video, Sparkles, WandSparkles,
  Upload, Eraser, Layers, Check, ChevronDown, Download, RotateCcw,
  Crop, Palette, Type, Play, X, LayoutTemplate, Plus, SlidersHorizontal
} from "lucide-react";

const TEMPLATES = [
  { id:"pinterest", name:"Pinterest aesthetic", category:"Social", desc:"Soft editorial composition for pins and moodboards.", color:"from-rose-300/30 to-violet-400/20", prompt:"Create a polished Pinterest aesthetic with soft editorial lighting, tasteful composition, and a cohesive color palette." },
  { id:"anime", name:"Anime wallpaper", category:"Wallpaper", desc:"Cinematic anime-inspired wallpaper layout.", color:"from-violet-500/30 to-blue-500/20", prompt:"Turn this into a dramatic anime-inspired wallpaper with cinematic lighting, crisp detail, and a striking background." },
  { id:"product", name:"Product spotlight", category:"Business", desc:"Clean product-focused image with studio lighting.", color:"from-amber-200/20 to-orange-500/20", prompt:"Create a premium product-photo look with clean studio lighting, realistic shadows, and a simple elegant background." },
  { id:"portrait", name:"Portrait glow", category:"Photo", desc:"A refined portrait look with a soft glow.", color:"from-pink-400/25 to-orange-300/20", prompt:"Enhance this portrait with natural soft lighting, refined color grading, and a subtle luminous background." },
  { id:"thumbnail", name:"Video thumbnail", category:"Social", desc:"Bold visual hierarchy for a video cover.", color:"from-red-500/25 to-fuchsia-500/20", prompt:"Design a bold high-contrast video thumbnail composition with clear subject focus and vibrant cinematic lighting." },
  { id:"minimal", name:"Minimal poster", category:"Design", desc:"Minimal typography-ready poster composition.", color:"from-neutral-200/15 to-neutral-500/20", prompt:"Create a minimalist poster aesthetic with generous negative space, balanced composition, and a restrained palette." },
];
const glass = "rounded-2xl border border-white/10 bg-white/[.035]";

export default function AIStudio() {
  const location = useLocation();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const [mode, setMode] = useState("image");
  const [view, setView] = useState("templates");
  const [category, setCategory] = useState("All");
  const [template, setTemplate] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [prompt, setPrompt] = useState("");
  const [background, setBackground] = useState("keep");
  const [bgPrompt, setBgPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [history, setHistory] = useState([]);
  const [ratio, setRatio] = useState("Original");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requested = params.get("template");
    if (requested) {
      const found = TEMPLATES.find(t => t.id === requested);
      if (found) useTemplate(found);
    }
  }, [location.search]);

  useEffect(() => () => { if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);

  function useTemplate(item) {
    setTemplate(item);
    setPrompt(item.prompt);
    setMode(item.id === "thumbnail" ? "video" : "image");
    setView("editor");
    setMessage("");
    setResultUrl("");
  }

  function selectFile(next) {
    if (!next) return;
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setResultUrl("");
    setMessage("");
    setView("editor");
  }

  async function runEdit() {
    if (!file && !preview) {
      setMessage("Upload an image or video first, then describe what you want to change.");
      fileRef.current?.click();
      return;
    }
    if (!prompt.trim() && background === "keep") {
      setMessage("Describe the edit you want Xyron to make.");
      return;
    }
    setBusy(true); setMessage(""); setResultUrl("");
    try {
      let fileUrl = "";
      if (file) {
        const uploaded = await api.integrations.Core.UploadFile({ file });
        fileUrl = uploaded?.file_url || uploaded?.url || "";
      }
      const task = [
        `You are Xyron AI Studio, an image and video editing assistant.`,
        `Media type: ${mode}.`,
        `Template: ${template?.name || "Custom edit"}.`,
        `Edit request: ${prompt || "Apply the selected background operation"}.`,
        `Background operation: ${background === "remove" ? "remove the background and make it transparent" : background === "replace" ? `replace the background with: ${bgPrompt || "a beautiful matching scene"}` : "keep the existing background"}.`,
        `Aspect ratio: ${ratio}.`,
        `Source media URL: ${fileUrl || preview}.`,
        `If the connected image/video editing provider can process the source, perform the edit and return the resulting media URL clearly as MEDIA_URL: https://... . If editing is not enabled, explain that the Xyron media-generation/editing provider must be connected; do not claim the file was edited.`
      ].join("\n");
      const response = await api.functions.invoke("xryonChat", {
        messages: [{ role:"user", content:task }],
        file_urls: fileUrl ? [fileUrl] : [],
        system_prompt: "You power Xyron AI Studio. Be honest about capabilities. Never claim a media edit succeeded unless an output file was actually created."
      });
      const reply = response?.data?.reply || response?.data?.error || "No response returned.";
      const match = reply.match(/MEDIA_URL:\s*(https?:\/\/\S+)/i);
      if (match) {
        const url = match[1].replace(/[)\],.]+$/, "");
        setResultUrl(url);
        setHistory(prev => [{ id:Date.now(), name:template?.name || "AI edit", url, type:mode }, ...prev].slice(0,8));
      }
      setMessage(reply);
    } catch (error) {
      setMessage(error?.message || "Could not reach the AI editing service. Check the Xyron backend connection.");
    } finally { setBusy(false); }
  }

  const visibleTemplates = TEMPLATES.filter(t => category === "All" || t.category === category);
  const activePreview = resultUrl || preview;

  return <div className="ai-studio-root min-h-screen bg-[#070708] text-white md:pl-72">
    <header className="ai-studio-header sticky top-0 z-30 border-b border-white/[.08] bg-[#070708]/90 px-3 py-3 backdrop-blur-2xl sm:px-7">
      <div className="mx-auto flex max-w-[1500px] items-center gap-3">
        <button onClick={() => navigate("/")} aria-label="Back to chat" className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-neutral-400 hover:bg-white/5"><ArrowLeft size={17}/></button>
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-rose-400/20 to-violet-500/20 text-rose-200"><WandSparkles size={18}/></div>
        <div className="min-w-0"><p className="text-sm font-semibold">Xyron AI Studio</p><p className="text-[11px] text-neutral-500">Create, edit, and remix your visuals</p></div>
        <div className="ml-auto hidden items-center gap-2 sm:flex">
          <button onClick={() => {setView("templates");setTemplate(null)}} className={`rounded-xl px-3 py-2 text-xs ${view==="templates"?"bg-white text-black":"text-neutral-400 hover:bg-white/5"}`}><LayoutTemplate size={14} className="mr-1 inline"/> Templates</button>
          <button onClick={() => {setView("editor");fileRef.current?.click()}} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:bg-white/5"><Plus size={14} className="mr-1 inline"/> New project</button>
        </div>
      </div>
    </header>

    <main className="ai-studio-main mx-auto w-full max-w-[1500px] min-w-0 p-3 pb-8 sm:p-7">
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><p className="text-[10px] uppercase tracking-[.28em] text-rose-300/80">Your creative canvas</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Imagine it. <span className="text-neutral-500">Make it.</span></h1><p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">Use a template as your starting point, then personalize images and videos with AI-powered editing tools.</p></div>
        <div className="flex w-fit rounded-xl border border-white/10 bg-white/[.03] p-1">
          <button onClick={() => setMode("image")} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm ${mode==="image"?"bg-white text-black":"text-neutral-400"}`}><ImageIcon size={16}/> Image</button>
          <button onClick={() => setMode("video")} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm ${mode==="video"?"bg-white text-black":"text-neutral-400"}`}><Video size={16}/> Video</button>
        </div>
      </div>

      <div className="ai-studio-tabs mb-5 flex gap-2 border-b border-white/10">
        <button onClick={() => setView("templates")} className={`border-b-2 px-3 pb-3 text-sm ${view==="templates"?"border-rose-300 text-white":"border-transparent text-neutral-500"}`}>Explore templates</button>
        <button onClick={() => setView("editor")} className={`border-b-2 px-3 pb-3 text-sm ${view==="editor"?"border-rose-300 text-white":"border-transparent text-neutral-500"}`}>Editor {template ? `· ${template.name}` : ""}</button>
        <button onClick={() => setView("history")} className={`border-b-2 px-3 pb-3 text-sm ${view==="history"?"border-rose-300 text-white":"border-transparent text-neutral-500"}`}>Recent edits</button>
      </div>

      {view==="templates" && <section>
        <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Find your starting point</h2><p className="mt-1 text-xs text-neutral-500">Choose any template, then press Use template to open it in the editor.</p></div><button onClick={() => {setView("editor");fileRef.current?.click()}} className="shrink-0 rounded-xl border border-white/10 px-3 py-2 text-xs text-neutral-300"><Upload size={14} className="mr-1 inline"/> Upload media</button></div>
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">{["All","Social","Wallpaper","Business","Photo","Design"].map(c=><button key={c} onClick={()=>setCategory(c)} className={`shrink-0 rounded-full border px-4 py-2 text-xs ${category===c?"border-rose-300/40 bg-rose-300/10 text-rose-100":"border-white/10 text-neutral-500 hover:text-white"}`}>{c}</button>)}</div>
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{visibleTemplates.map((t,i)=><article key={t.id} className={`${glass} group overflow-hidden transition hover:border-white/20`}>
          <div className={`relative flex h-44 items-end overflow-hidden bg-gradient-to-br ${t.color} p-5`}>
            <div className="absolute inset-0 opacity-30" style={{backgroundImage:"radial-gradient(circle at 25% 25%, white 0, transparent 22%), radial-gradient(circle at 75% 70%, white 0, transparent 18%)"}}/>
            <div className="relative"><span className="rounded-full border border-white/20 bg-black/20 px-2.5 py-1 text-[10px] text-white/80">{t.category}</span><p className="mt-3 text-xl font-semibold">{t.name}</p></div>
            <Sparkles className="absolute right-5 top-5 text-white/60" size={22}/>
          </div>
          <div className="p-4"><p className="min-h-10 text-xs leading-5 text-neutral-500">{t.desc}</p><button onClick={()=>useTemplate(t)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-rose-100">Use template <ArrowUp size={15}/></button></div>
        </article>)}</div>
      </section>}

      {view==="editor" && <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_350px]">
        <section className={`${glass} min-w-0 min-h-[360px] overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div className="flex items-center gap-2 text-sm font-medium"><SlidersHorizontal size={15} className="text-rose-200"/> Canvas <span className="text-neutral-600">/</span> <span className="text-neutral-400">{template?.name || "Untitled project"}</span></div><div className="flex gap-1"><button onClick={()=>{setPreview("");setFile(null);setResultUrl("")}} title="Clear media" className="grid h-8 w-8 place-items-center rounded-lg text-neutral-500 hover:bg-white/5"><RotateCcw size={15}/></button><button onClick={()=>fileRef.current?.click()} className="flex items-center gap-1 rounded-lg border border-white/10 px-3 text-xs text-neutral-300"><Upload size={13}/> Replace</button></div></div>
          <div className="flex min-h-[300px] min-w-0 items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,.045),transparent_65%)] p-2 sm:min-h-[390px] sm:p-8">
            {activePreview ? (mode==="video" ? <video src={activePreview} controls className="max-h-[600px] max-w-full rounded-xl"/> : <img src={activePreview} alt="Studio canvas preview" className="max-h-[650px] max-w-full rounded-xl object-contain shadow-2xl"/>) : <button onClick={()=>fileRef.current?.click()} className="flex min-h-[300px] w-full max-w-lg flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[.015] p-8 text-center transition hover:border-rose-300/40 hover:bg-white/[.03]"><span className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/5 text-rose-200"><Upload size={22}/></span><span className="mt-4 text-sm font-medium">Upload an image or video</span><span className="mt-2 text-xs text-neutral-600">Drop your own media into the creative workflow</span><span className="mt-4 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black">Choose file</span></button>}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-4 py-3"><button onClick={()=>setBackground("remove")} className={`rounded-lg border px-3 py-2 text-xs ${background==="remove"?"border-rose-300/40 bg-rose-300/10 text-rose-100":"border-white/10 text-neutral-400"}`}><Eraser size={13} className="mr-1 inline"/> Remove background</button><button onClick={()=>setBackground("replace")} className={`rounded-lg border px-3 py-2 text-xs ${background==="replace"?"border-rose-300/40 bg-rose-300/10 text-rose-100":"border-white/10 text-neutral-400"}`}><Layers size={13} className="mr-1 inline"/> Change background</button><button onClick={()=>setBackground("keep")} className={`rounded-lg border px-3 py-2 text-xs ${background==="keep"?"border-rose-300/40 bg-rose-300/10 text-rose-100":"border-white/10 text-neutral-400"}`}><Palette size={13} className="mr-1 inline"/> Keep background</button><div className="ml-auto flex items-center gap-2 text-xs text-neutral-500"><Crop size={13}/><select value={ratio} onChange={e=>setRatio(e.target.value)} className="bg-transparent outline-none"><option className="bg-neutral-900">Original</option><option className="bg-neutral-900">1:1 Square</option><option className="bg-neutral-900">9:16 Story</option><option className="bg-neutral-900">16:9 Landscape</option><option className="bg-neutral-900">4:5 Portrait</option></select></div></div>
        </section>
        <aside className={`${glass} h-fit min-w-0 p-3 sm:p-4`}>
          <div className="flex items-center gap-2"><Sparkles size={17} className="text-rose-200"/><h2 className="font-semibold">AI edit</h2><span className="ml-auto rounded-full border border-white/10 px-2 py-1 text-[9px] uppercase tracking-wider text-neutral-500">Studio</span></div>
          {template && <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/[.025] p-3"><div><p className="text-xs font-medium">{template.name}</p><p className="mt-1 text-[10px] text-neutral-600">Template applied to your workflow</p></div><button onClick={()=>setTemplate(null)} aria-label="Remove template" className="text-neutral-600 hover:text-white"><X size={15}/></button></div>}
          <label className="mt-5 block text-xs font-medium text-neutral-400">Describe your edit</label><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="e.g. Make this a dreamy pink Pinterest wallpaper with soft light..." className="mt-2 min-h-32 w-full resize-y rounded-xl border border-white/10 bg-black/30 p-3 text-sm leading-6 outline-none placeholder:text-neutral-700 focus:border-rose-300/40"/>
          {background==="replace" && <><label className="mt-4 block text-xs font-medium text-neutral-400">New background</label><input value={bgPrompt} onChange={e=>setBgPrompt(e.target.value)} placeholder="Pink clouds, beach at sunset..." className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm outline-none placeholder:text-neutral-700 focus:border-rose-300/40"/></>}
          <div className="mt-4 flex flex-wrap gap-2">{["Make it aesthetic","Improve lighting","Add cinematic glow"].map(p=><button key={p} onClick={()=>setPrompt(old=>old?`${old}. ${p}.`:p)} className="rounded-full border border-white/10 px-2.5 py-1.5 text-[10px] text-neutral-500 hover:text-white">{p}</button>)}</div>
          <button disabled={busy} onClick={runEdit} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-200 to-violet-200 px-4 py-3.5 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-wait disabled:opacity-60">{busy?<><span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black"/> Working on it…</>:<><WandSparkles size={16}/> Generate edit</>}</button>
          {message && <div className="mt-3 whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/30 p-3 text-xs leading-5 text-neutral-400">{message}</div>}
          {resultUrl && <a href={resultUrl} download className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs text-neutral-200 hover:bg-white/5"><Download size={14}/> Download result</a>}
          <p className="mt-4 text-[10px] leading-5 text-neutral-600">AI editing depends on the media provider connected to your Xyron backend. If no edited media URL is returned, this page will show the backend response rather than pretending the edit succeeded.</p>
        </aside>
        <div className="xl:col-span-2"><StudioTimeline onSelectMedia={(clip) => { if (clip?.url && (clip.type === "image" || clip.type === "video")) { setFile(clip.file || null); setPreview(clip.url); setMode(clip.type); setResultUrl(""); } }} /></div>
      </div>}

      {view==="history" && <section><h2 className="text-lg font-semibold">Recent edits</h2><p className="mt-1 text-xs text-neutral-500">Generated results from this session.</p>{history.length ? <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{history.map(item=><button key={item.id} onClick={()=>{setResultUrl(item.url);setView("editor");setMode(item.type)}} className={`${glass} overflow-hidden p-3 text-left`}><img src={item.url} alt={item.name} className="h-40 w-full rounded-xl object-cover"/><p className="mt-3 text-sm">{item.name}</p><p className="mt-1 text-xs text-neutral-500">Open in editor</p></button>)}</div>:<div className={`${glass} mt-5 flex min-h-48 flex-col items-center justify-center text-center`}><Sparkles className="text-neutral-600"/><p className="mt-3 text-sm text-neutral-400">Your edits will appear here</p><button onClick={()=>setView("templates")} className="mt-3 text-xs text-rose-200">Explore templates →</button></div>}</section>}
    </main>
    <input ref={fileRef} type="file" accept={mode==="image"?"image/*":"image/*,video/*"} className="ai-studio-file-input" onChange={e=>{selectFile(e.target.files?.[0]);e.target.value=""}}/>
    <input ref={videoRef} type="file" accept="video/*" className="ai-studio-file-input" onChange={e=>{selectFile(e.target.files?.[0]);e.target.value=""}}/>
  </div>;
}

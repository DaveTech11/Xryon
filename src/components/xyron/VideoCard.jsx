import React, { useEffect, useRef, useState } from "react";
import { Download, Film, Loader2, Play, RefreshCw } from "lucide-react";
import { renderVideo, sizeOf, totalSeconds } from "../../lib/videoMaker";

// Finished videos stay in memory for this tab, so scrolling or re-opening the chat does not render them again.
const done = new Map();

// The storyboard comes from the server; this card plays it on a canvas while recording it into a real video file.
export default function VideoCard({ plan, autoStart = false }) {
  const canvasRef = useRef(null), abortRef = useRef(null);
  const [state, setState] = useState(done.has(plan.id) ? "done" : "idle"); // idle | rendering | done | error
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(done.get(plan.id) || null);
  const [error, setError] = useState("");
  const { W, H } = sizeOf(plan), seconds = Math.round(totalSeconds(plan));

  const start = async () => {
    if (state === "rendering") return;
    setState("rendering"); setProgress(0); setError(""); abortRef.current = new AbortController();
    try {
      const r = await renderVideo(plan, canvasRef.current, { onProgress: setProgress, signal: abortRef.current.signal });
      const item = { url: URL.createObjectURL(r.blob), ext: r.ext, size: r.blob.size };
      done.set(plan.id, item); setResult(item); setState("done");
    } catch (e) { if (e?.name === "AbortError") setState("idle"); else { setError(e?.message || "Could not render the video."); setState("error"); } }
  };
  useEffect(() => { if (autoStart && state === "idle") start(); return () => abortRef.current?.abort(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const name = `${(plan.title || "video").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "video"}.${result?.ext || "mp4"}`;
  const box = `w-full overflow-hidden rounded-2xl border border-white/10 bg-black ${plan.aspect === "wide" ? "max-w-xl" : "max-w-[260px]"}`;
  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className={box} style={{ aspectRatio: `${W} / ${H}` }}>
        {state === "done" && result ? <video src={result.url} controls playsInline className="h-full w-full object-contain" />
          : <div className="relative h-full w-full">
              <canvas ref={canvasRef} className="h-full w-full object-contain" />
              {state !== "rendering" && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-4 text-center">
                <Film className="h-7 w-7 text-neutral-300" /><div className="text-sm font-medium text-white">{plan.title}</div>
                <div className="text-xs text-neutral-400">{plan.scenes.length} scenes · {seconds}s · with music</div>
                <button type="button" onClick={start} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black">{state === "error" ? <RefreshCw className="h-4 w-4" /> : <Play className="h-4 w-4" />}{state === "error" ? "Try again" : "Make the video"}</button>
              </div>}
            </div>}
      </div>
      {state === "rendering" && <div className="w-full max-w-xs">
        <div className="mb-1 flex items-center gap-2 text-xs text-neutral-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Recording your video · keep this tab open · {Math.round(progress * 100)}%</div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${progress * 100}%` }} /></div></div>}
      {state === "error" && <div className="text-xs text-red-300">{error}</div>}
      {state === "done" && result && <div className="flex flex-wrap items-center gap-2">
        <a href={result.url} download={name} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black"><Download className="h-4 w-4" />Download {result.ext.toUpperCase()} ({(result.size / 1048576).toFixed(1)} MB)</a>
        <button type="button" onClick={() => { done.delete(plan.id); setResult(null); setState("idle"); }} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-xs text-neutral-300"><RefreshCw className="h-3.5 w-3.5" />Render again</button></div>}
    </div>
  );
}

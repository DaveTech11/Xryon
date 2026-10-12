import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Play, RotateCcw, Loader2 } from "lucide-react";

// Runs AI-written JavaScript / HTML inside a locked-down iframe:
//  - sandbox="allow-scripts" (no allow-same-origin) => opaque origin, so the
//    code can't touch the app's cookies, storage, DOM or API session.
//  - CSP in the document blocks all network access (fetch, XHR, images, etc).
// It is browser-only: no npm install, no Node, no filesystem.
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:;";
const TIMEOUT_MS = 8000;

const BRIDGE = `
(function(){
  var send=function(t,a){try{parent.postMessage({__xyron:1,type:t,text:a.map(function(x){
    if(typeof x==='string')return x;
    try{return typeof x==='object'?JSON.stringify(x,null,2):String(x)}catch(e){return String(x)}
  }).join(' ')},'*')}catch(e){}};
  ['log','info','warn','error'].forEach(function(k){var o=console[k];console[k]=function(){send(k,[].slice.call(arguments));o&&o.apply(console,arguments)}});
  window.addEventListener('error',function(e){send('error',[e.message+(e.lineno?' (line '+e.lineno+')':'')])});
  window.addEventListener('unhandledrejection',function(e){send('error',['Unhandled promise rejection: '+(e.reason&&e.reason.message||e.reason)])});
  window.addEventListener('load',function(){setTimeout(function(){parent.postMessage({__xyron:1,type:'done'},'*')},0)});
})();`;

function buildDoc(lang, code) {
  const head = `<meta http-equiv="Content-Security-Policy" content="${CSP}"><script>${BRIDGE}<\/script>`;
  if (lang === "html") {
    return /<head[\s>]/i.test(code) ? code.replace(/<head[^>]*>/i, (m) => m + head) : head + code;
  }
  // JS: escape closing script tags so user code can't break out of the wrapper.
  return `<!doctype html><html><head>${head}</head><body><script>${code.replace(/<\/script/gi, "<\\/script")}<\/script></body></html>`;
}

export default function CodeSandbox({ lang = "js", value = "", onClose }) {
  const kind = lang.toLowerCase() === "html" ? "html" : "js";
  const [runId, setRunId] = useState(0);
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState("running");
  const iframeRef = useRef(null);
  const doc = useMemo(() => buildDoc(kind, value), [kind, value]);

  useEffect(() => {
    setLogs([]);
    setStatus("running");
    const onMsg = (e) => {
      if (e.source !== iframeRef.current?.contentWindow || !e.data?.__xyron) return;
      if (e.data.type === "done") setStatus((s) => (s === "running" ? "finished" : s));
      else setLogs((l) => [...l, { type: e.data.type, text: e.data.text }].slice(-500));
    };
    window.addEventListener("message", onMsg);
    const t = setTimeout(() => {
      // An infinite loop can't be interrupted from outside, so drop the iframe.
      setStatus((s) => {
        if (s === "running") { iframeRef.current?.remove(); return "timeout"; }
        return s;
      });
    }, TIMEOUT_MS);
    return () => { window.removeEventListener("message", onMsg); clearTimeout(t); };
  }, [runId, doc]);

  const colors = { error: "text-red-400", warn: "text-amber-300", info: "text-sky-300", log: "text-neutral-200" };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#151517]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
          <span className="flex items-center gap-2 text-sm font-medium text-neutral-200">
            <Play className="h-3.5 w-3.5 text-emerald-400" /> Sandbox · {kind === "html" ? "HTML preview" : "JavaScript"}
            {status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-400" />}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setRunId((n) => n + 1)} title="Run again" aria-label="Run again" className="grid h-7 w-7 place-items-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white"><RotateCcw className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={onClose} title="Close" aria-label="Close" className="grid h-7 w-7 place-items-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {status !== "timeout" && (
          <iframe
            key={runId}
            ref={iframeRef}
            title="Xyron sandbox"
            sandbox="allow-scripts"
            srcDoc={doc}
            className={kind === "html" ? "h-[45vh] w-full bg-white" : "h-0 w-0 border-0"}
          />
        )}

        <div className="max-h-[35vh] min-h-[90px] overflow-auto border-t border-white/10 bg-black/30 px-4 py-3 font-mono text-[12.5px] leading-relaxed">
          {logs.length === 0 && status !== "timeout" && <p className="text-neutral-500">{status === "running" ? "Running…" : "Finished with no console output."}</p>}
          {logs.map((l, i) => <pre key={i} className={`whitespace-pre-wrap break-words ${colors[l.type] || colors.log}`}>{l.text}</pre>)}
          {status === "timeout" && <p className="text-red-400">Stopped: didn't finish within {TIMEOUT_MS / 1000}s (possible infinite loop).</p>}
        </div>
        <p className="border-t border-white/10 px-4 py-2 text-[11px] text-neutral-500">Isolated browser sandbox · no network, no Node, no file access.</p>
      </div>
    </div>
  );
}

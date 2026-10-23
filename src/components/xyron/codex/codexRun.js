import { buildDoc } from "../CodeSandbox";

// Runs an HTML/JavaScript project once in a hidden copy of the same locked-down sandbox the Run button uses
// (opaque origin, no network) and reports what went wrong: uncaught errors, failed promises, console.error and a
// page that stays blank. Used so the AI can find and fix its own runtime mistakes. Browser only; nothing leaves it.
const PROBE = `<script>window.addEventListener('load',function(){setTimeout(function(){try{var b=document.body;parent.postMessage({__xyron:1,type:'probe',text:JSON.stringify({els:b?b.querySelectorAll('*:not(script):not(style)').length:0,text:b?b.innerText.trim().length:0})},'*')}catch(e){}},350)});<\/script>`;

// A loop that never ends would freeze the tab, so projects that contain an obvious one are not auto-run.
const ENDLESS = /\bwhile\s*\(\s*(?:true|1)\s*\)|\bfor\s*\(\s*;\s*;\s*\)/;
// Failures that come from the sandbox having no network, not from a bug.
const NOISE = /Refused to|Content Security Policy|Failed to fetch|NetworkError|Load failed|net::ERR|ResizeObserver loop|Script error\.?$/i;

export const canAutoRun = (prep) => !!prep?.ok && (prep.kind === "html" || prep.kind === "js") && !ENDLESS.test(prep.value);

export function runHeadless(prep, { timeoutMs = 5000, signal } = {}) {
  return new Promise((resolve) => {
    if (typeof document === "undefined" || !canAutoRun(prep)) { resolve({ ran: false, errors: [] }); return; }
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:1024px;height:768px;border:0;visibility:hidden;pointer-events:none";
    const errors = [];
    let blank = false; let probed = false; let done = false;
    let timer = null;
    const finish = (timedOut) => {
      if (done) return; done = true;
      clearTimeout(timer);
      window.removeEventListener("message", onMsg);
      signal?.removeEventListener("abort", onAbort);
      frame.remove();
      const list = [...new Set(errors)].slice(0, 8);
      if (blank && prep.kind === "html" && !list.length) list.push("The page is blank: nothing was drawn after it loaded.");
      resolve({ ran: true, timedOut: !!timedOut, errors: list });
    };
    const onAbort = () => finish(false);
    const onMsg = (e) => {
      if (e.source !== frame.contentWindow || !e.data?.__xyron) return;
      const { type, text } = e.data;
      // Line numbers in these messages point into the wrapper page, not the person's files, so they are removed.
      if (type === "error") { if (text && !NOISE.test(text)) errors.push(String(text).replace(/\s*\(line \d+\)\s*$/, "").slice(0, 400)); }
      else if (type === "probe") {
        probed = true;
        try { const p = JSON.parse(text); blank = p.els < 1 && p.text === 0; } catch { /* ignore */ }
        setTimeout(() => finish(false), 250); // let errors from timers and promises arrive
      }
    };
    window.addEventListener("message", onMsg);
    signal?.addEventListener("abort", onAbort);
    timer = setTimeout(() => finish(!probed), timeoutMs);
    frame.srcdoc = buildDoc(prep.kind, prep.value, PROBE);
    document.body.appendChild(frame);
  });
}

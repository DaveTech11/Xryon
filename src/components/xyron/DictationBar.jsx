import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, Square, X } from "lucide-react";
import { useVoiceListener } from "../../lib/useVoiceListener";
import { loadVoicePrefs } from "../../lib/voice";

// ChatGPT-style dictation: X cancels, the square stops and drops the words into the text box so they can
// be edited, the blue arrow stops and sends the words straight to the AI. Nothing is ever sent as audio -
// the browser turns speech into text and only that text goes to the AI.
const ERRORS = {
  unsupported: "Voice typing isn't supported in this browser. Try Chrome, Edge or Safari.",
  denied: "Microphone access is blocked. Allow it in your browser settings and try again.",
  "no-mic": "No microphone found.",
  network: "Couldn't reach the speech service. Check your connection.",
};

const DOTS = 44;

export default function DictationBar({ onCancel, onDone }) {
  const modeRef = useRef("send");
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const { listening, text, error, heard, start, stop, commit } = useVoiceListener({
    lang: loadVoicePrefs().lang,
    autoSend: false, // only the buttons finish a dictation, silence never sends
    onUtterance: (t) => doneRef.current?.(t, modeRef.current),
  });

  const [talking, setTalking] = useState(false);
  useEffect(() => {
    if (!heard) return undefined;
    setTalking(true);
    const t = setTimeout(() => setTalking(false), 700);
    return () => clearTimeout(t);
  }, [heard]);

  useEffect(() => {
    start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const transcript = `${text.final} ${text.interim}`.replace(/\s+/g, " ").trim();

  const cancel = () => { stop(); onCancel?.(); };
  const finish = (mode) => {
    if (!transcript) { cancel(); return; } // nothing heard: just close
    modeRef.current = mode;
    commit(); // calls onUtterance with everything heard, then stops listening
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
      else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); finish("send"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const status = error ? ERRORS[error] || "Voice typing failed." : transcript ? transcript.slice(-140) : listening ? "Listening..." : "Starting microphone...";

  return (
    <div className="xyron-dictation" role="group" aria-label="Voice typing">
      <p className={`xyron-dict-text ${error ? "is-error" : ""}`} aria-live="polite">{status}</p>
      <div className="xyron-dict-row">
        <button type="button" onClick={cancel} className="xyron-composer-btn xyron-dict-btn" title="Cancel" aria-label="Cancel voice typing">
          <X className="h-[18px] w-[18px]" strokeWidth={2} />
        </button>
        <div className={`xyron-dict-wave ${listening && !error ? "is-live" : ""} ${talking ? "is-talking" : ""}`} aria-hidden="true">
          {Array.from({ length: DOTS }, (_, i) => <span key={i} style={{ animationDelay: `${(i % 11) * 70}ms` }} />)}
        </div>
        <button type="button" onClick={() => finish("edit")} disabled={!!error} className="xyron-composer-btn xyron-dict-btn" title="Stop and edit the text" aria-label="Stop and edit text">
          <Square className="h-3 w-3" fill="currentColor" strokeWidth={2} />
        </button>
        <button type="button" onClick={() => finish("send")} disabled={!!error} className="xyron-composer-btn xyron-dict-send" title="Send" aria-label="Send as text">
          <ArrowUp className="h-5 w-5" strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}

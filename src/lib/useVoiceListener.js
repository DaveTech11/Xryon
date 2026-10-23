import { useCallback, useEffect, useRef, useState } from "react";
import { getRecognitionCtor, isAndroid } from "./voice";

// Speech recognition that keeps listening.
//
// The browser's recognizer ends by itself after a short pause, after ~60 seconds, on network
// hiccups and whenever it hears nothing. The old one-shot setup therefore felt deaf. This hook:
//   * runs continuously and quietly starts a fresh session whenever the browser ends one,
//     carrying the words already heard so nothing is lost between sessions;
//   * rebuilds the transcript from the full results list on every event (no duplicated words);
//   * decides the person has finished speaking after `silenceMs` of quiet and then calls
//     onUtterance(text) with everything heard (when autoSend is on), or lets them send by tapping;
//   * treats "no-speech" and "aborted" as normal, retries network errors with a back-off, and
//     reports only real problems (blocked microphone, no microphone, no connection).
//
// error: "" | "unsupported" | "denied" | "no-mic" | "network"
export function useVoiceListener({ lang = "en-US", silenceMs = 1700, autoSend = true, onUtterance }) {
  const Ctor = getRecognitionCtor();
  const supported = Boolean(Ctor);

  const [listening, setListening] = useState(false);
  const [text, setText] = useState({ final: "", interim: "" });
  const [error, setError] = useState(supported ? "" : "unsupported");
  const [heard, setHeard] = useState(0); // bumps on every recognition result (drives the orb)

  const live = useRef({ lang, silenceMs, autoSend, onUtterance });
  live.current = { lang, silenceMs, autoSend, onUtterance };

  const s = useRef({
    want: false, rec: null, base: "", sessFinal: "", sessInterim: "",
    failures: 0, startedAt: 0, hadResult: false, silenceTimer: null, restartTimer: null, langOverride: null,
  }).current;

  const join = (...parts) => parts.map((p) => (p || "").trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const fullText = () => join(s.base, s.sessFinal, s.sessInterim);
  const publish = () => setText({ final: join(s.base, s.sessFinal), interim: (s.sessInterim || "").trim() });

  const clearTimers = () => { clearTimeout(s.silenceTimer); clearTimeout(s.restartTimer); s.silenceTimer = null; s.restartTimer = null; };

  const killRecognizer = () => {
    const rec = s.rec;
    s.rec = null;
    if (!rec) return;
    rec.onstart = rec.onresult = rec.onerror = rec.onend = null;
    try { rec.abort(); } catch { /* already stopped */ }
  };

  const reset = () => { s.base = ""; s.sessFinal = ""; s.sessInterim = ""; setText({ final: "", interim: "" }); };

  const halt = useCallback(() => {
    s.want = false;
    clearTimers();
    killRecognizer();
    setListening(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = useCallback(() => {
    const t = fullText();
    if (!t) return;
    halt();
    reset();
    live.current.onUtterance?.(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [halt]);

  const armSilence = () => {
    clearTimeout(s.silenceTimer);
    if (!live.current.autoSend) return;
    s.silenceTimer = setTimeout(commit, live.current.silenceMs);
  };

  const begin = useCallback(() => {
    if (!s.want || !Ctor) return;
    killRecognizer();
    const rec = new Ctor();
    rec.lang = s.langOverride || live.current.lang || "en-US";
    // Android Chrome piles up partial results in continuous mode, so there each session handles one
    // phrase and the restart loop below chains them together.
    rec.continuous = !isAndroid();
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    s.sessFinal = "";
    s.sessInterim = "";
    s.hadResult = false;

    rec.onstart = () => { s.startedAt = Date.now(); setListening(true); };

    rec.onresult = (e) => {
      let fin = "";
      let interim = "";
      for (let k = 0; k < e.results.length; k += 1) {
        const res = e.results[k];
        const piece = res[0]?.transcript || "";
        if (res.isFinal) fin += (fin && !/^\s/.test(piece) ? " " : "") + piece;
        else interim += (interim && !/^\s/.test(piece) ? " " : "") + piece;
      }
      s.sessFinal = fin;
      s.sessInterim = interim;
      s.hadResult = true;
      s.failures = 0;
      setHeard((h) => h + 1);
      publish();
      armSilence();
    };

    rec.onerror = (e) => {
      const code = e?.error;
      if (code === "no-speech" || code === "aborted") return; // normal; onend restarts
      if (code === "not-allowed" || code === "service-not-allowed") { s.want = false; clearTimers(); setError("denied"); setListening(false); return; }
      if (code === "audio-capture") { s.want = false; clearTimers(); setError("no-mic"); setListening(false); return; }
      if (code === "language-not-supported") { s.langOverride = "en-US"; return; }
      if (code === "network") {
        s.failures += 1;
        if (s.failures >= 4) { s.want = false; clearTimers(); setError("network"); setListening(false); }
      }
    };

    rec.onend = () => {
      s.rec = null;
      if (!s.want) { setListening(false); return; }
      // Keep what this session heard, then start the next one.
      const carry = join(s.sessFinal, s.sessInterim);
      if (carry) { s.base = join(s.base, carry); s.sessFinal = ""; s.sessInterim = ""; publish(); }
      const quickFail = Date.now() - s.startedAt < 700 && !s.hadResult;
      if (quickFail) {
        s.failures += 1;
        if (s.failures >= 6) { s.want = false; clearTimers(); setError("network"); setListening(false); return; }
      }
      s.restartTimer = setTimeout(begin, quickFail ? Math.min(1500, 200 * 2 ** s.failures) : 120);
    };

    s.rec = rec;
    try { rec.start(); } catch { s.restartTimer = setTimeout(begin, 400); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Ctor]);

  const start = useCallback(() => {
    if (!Ctor) { setError("unsupported"); return; }
    clearTimers();
    killRecognizer();
    s.want = true;
    s.failures = 0;
    s.langOverride = null;
    setError("");
    reset();
    begin();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Ctor, begin]);

  const stop = useCallback(() => { halt(); reset(); }, [halt]);

  const clearError = useCallback(() => setError(Ctor ? "" : "unsupported"), [Ctor]);

  // Switching language or auto-send mid-session takes effect on the next session / silence timer.
  useEffect(() => { if (s.want) armSilence(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [autoSend, silenceMs]);

  useEffect(() => () => { s.want = false; clearTimers(); killRecognizer(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return { supported, listening, text, error, heard, start, stop, commit, clearError };
}

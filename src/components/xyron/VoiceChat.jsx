import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight, AudioLines, Captions, ChevronLeft, Code2, HelpCircle, Hexagon,
  Image as ImageIcon, MessageSquare, Mic, Monitor, MoreHorizontal, X,
} from "lucide-react";
import { useVoiceListener } from "../../lib/useVoiceListener";
import { useOrbLevel } from "../../lib/useOrbLevel";
import { VOICE_LANGS, cleanForSpeech, loadVoicePrefs, saveVoicePrefs, speakText } from "../../lib/voice";

const IMAGE_PROMPT = "What is in this image? Describe it and tell me what it is.";

const ERRORS = {
  unsupported: "Voice input isn't supported in this browser. Try Chrome, Edge or Safari.",
  denied: "Microphone access is blocked. Allow it in your browser's site settings, then tap the mic.",
  "no-mic": "No microphone was found. Plug one in or check your device settings, then tap the mic.",
  network: "Speech recognition couldn't connect. Check your internet, then tap the mic to try again.",
};

function rowIcon(title = "") {
  if (/code|python|js|javascript|react|bug|api|script|sql|html|css|app/i.test(title)) return Code2;
  if (/design|ui|ux|landing|website|logo|layout|portfolio/i.test(title)) return Monitor;
  return HelpCircle;
}

export default function VoiceChat({
  open, onClose, onSend, onNewChat, onOpenHistory, onOpenConversation, userName = "", recent = [],
}) {
  const [screen, setScreen] = useState("home"); // home | speak
  const [phase, setPhase] = useState("idle"); // idle | listening | thinking | speaking | error
  const [prefs, setPrefs] = useState(loadVoicePrefs);
  const [reply, setReply] = useState("");
  const [lastHeard, setLastHeard] = useState("");
  const [captions, setCaptions] = useState(true);
  const [popOpen, setPopOpen] = useState(false);
  const [spoken, setSpoken] = useState({ text: "", upto: 0 });

  const orbRef = useRef(null);
  const liveRef = useRef(null);
  const fileRef = useRef(null);
  const listenerRef = useRef(null);
  const activeRef = useRef(false);
  const screenRef = useRef("home");
  const phaseRef = useRef("idle");
  const prefsRef = useRef(prefs);
  const cancelSpeakRef = useRef(null);
  const guardRef = useRef(null);
  prefsRef.current = prefs;

  const changePhase = (p) => { phaseRef.current = p; setPhase(p); };
  const changeScreen = (s) => { screenRef.current = s; setScreen(s); };

  const stopSpeaking = () => {
    cancelSpeakRef.current?.();
    cancelSpeakRef.current = null;
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  };

  // After the reply has been spoken, go back to listening so the conversation stays hands-free.
  const resumeListening = () => {
    if (!activeRef.current || screenRef.current !== "speak") return;
    changePhase("listening");
    setTimeout(() => {
      if (activeRef.current && screenRef.current === "speak" && phaseRef.current === "listening") listenerRef.current?.start();
    }, 350);
  };

  const handleUtterance = (spoken) => {
    if (!activeRef.current || screenRef.current !== "speak") return;
    changePhase("thinking");
    setLastHeard(spoken);
    setReply("");
    let replied = false;
    const done = (replyText) => {
      if (replied) return;
      replied = true;
      clearTimeout(guardRef.current);
      if (!activeRef.current || screenRef.current !== "speak") return;
      const clean = String(replyText || "").trim();
      if (!clean) {
        setReply("I couldn't get a response. Tap the mic to try again.");
        changePhase("idle");
        return;
      }
      setReply(clean);
      if (prefsRef.current.readAloud) {
        const speech = cleanForSpeech(clean);
        setSpoken({ text: speech, upto: 0 });
        changePhase("speaking");
        cancelSpeakRef.current = speakText(speech, {
          lang: prefsRef.current.lang,
          onProgress: (n) => setSpoken((s) => (n > s.upto ? { ...s, upto: n } : s)),
          onEnd: () => { cancelSpeakRef.current = null; resumeListening(); },
        });
      } else {
        resumeListening();
      }
    };
    guardRef.current = setTimeout(() => done("Sorry, that took too long. Please try again."), 75000);
    Promise.resolve()
      .then(() => onSend(spoken, { onReply: done }))
      // Normally the reply arrives before send() resolves; allow a moment in case it arrives just after.
      .then(() => { setTimeout(() => { if (!replied) done(""); }, 1500); })
      .catch(() => done("Sorry, something went wrong. Please try again."));
  };

  const listener = useVoiceListener({
    lang: prefs.lang,
    autoSend: prefs.autoSend,
    silenceMs: 1700,
    onUtterance: handleUtterance,
  });
  listenerRef.current = listener;

  useOrbLevel(orbRef, { phase: screen === "speak" ? phase : "off", heard: listener.heard });

  // Open / close housekeeping.
  useEffect(() => {
    if (!open) return undefined;
    activeRef.current = true;
    changeScreen("home");
    changePhase("idle");
    setReply("");
    setLastHeard("");
    setPopOpen(false);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      activeRef.current = false;
      document.body.style.overflow = prevOverflow;
      clearTimeout(guardRef.current);
      listenerRef.current?.stop();
      stopSpeaking();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Real recognition problems switch the screen to its error state.
  useEffect(() => {
    if (listener.error && screenRef.current === "speak") changePhase("error");
  }, [listener.error]);

  // Keep the newest words in view.
  useEffect(() => {
    const el = liveRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [listener.text, reply, phase, captions, spoken.upto]);

  const backToHome = () => {
    clearTimeout(guardRef.current);
    listener.stop();
    stopSpeaking();
    changePhase("idle");
    changeScreen("home");
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (popOpen) setPopOpen(false);
      else if (screenRef.current === "speak") backToHome();
      else onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, popOpen, onClose]);

  const startSpeaking = () => {
    changeScreen("speak");
    setReply("");
    setLastHeard("");
    setPopOpen(false);
    if (!listener.supported) { changePhase("error"); return; }
    changePhase("listening");
    listener.start();
  };

  const onMic = () => {
    if (phase === "thinking") return;
    if (phase === "speaking") {
      stopSpeaking();
      changePhase("listening");
      listener.start();
      return;
    }
    if (phase === "listening") {
      if (listener.text.final || listener.text.interim) listener.commit();
      else { listener.stop(); changePhase("idle"); }
      return;
    }
    listener.clearError();
    changePhase("listening");
    listener.start();
  };

  const updatePrefs = (patch) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveVoicePrefs(next);
    // A new language applies from the next session, so restart the one that is running.
    if (patch.lang && screenRef.current === "speak" && phaseRef.current === "listening") {
      prefsRef.current = next;
      setTimeout(() => listenerRef.current?.start(), 0);
    }
  };

  const langOptions = useMemo(() => {
    const has = VOICE_LANGS.some(([code]) => code.toLowerCase() === prefs.lang.toLowerCase());
    return has ? VOICE_LANGS : [[prefs.lang, `Device language (${prefs.lang})`], ...VOICE_LANGS];
  }, [prefs.lang]);

  const onPickImage = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    onClose?.();
    Promise.resolve(onSend?.(IMAGE_PROMPT, { files: [file] })).catch(() => {});
  };

  if (!open) return null;

  const first = String(userName || "").trim().split(/\s+/)[0];
  const heardNow = listener.text;
  const hasHeard = Boolean(heardNow.final || heardNow.interim);
  const listeningNow = phase === "listening";

  let statusText = "Tap the mic to speak";
  if (phase === "listening") statusText = "Go ahead, I'm listening…";
  else if (phase === "thinking") statusText = "Thinking…";
  else if (phase === "speaking") statusText = "Xyron is speaking. Tap the mic to interrupt.";
  else if (phase === "error") statusText = ERRORS[listener.error] || "Something went wrong. Tap the mic to try again.";

  const settings = popOpen && (
    <>
      <div className="xv-scrim" onClick={() => setPopOpen(false)} />
      <div className="xv-pop" role="dialog" aria-label="Voice settings">
        <h3>Voice settings</h3>
        <label className="xv-field">
          <span>Language</span>
          <select className="xv-select" value={prefs.lang} onChange={(e) => updatePrefs({ lang: e.target.value })} aria-label="Speech language">
            {langOptions.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </label>
        <div className="xv-field">
          <span>Send when I stop talking<small>Off: tap the mic to send</small></span>
          <button type="button" role="switch" aria-checked={prefs.autoSend} aria-label="Send when I stop talking" className="xv-btn xv-switch" onClick={() => updatePrefs({ autoSend: !prefs.autoSend })} />
        </div>
        <div className="xv-field">
          <span>Read replies aloud</span>
          <button type="button" role="switch" aria-checked={prefs.readAloud} aria-label="Read replies aloud" className="xv-btn xv-switch" onClick={() => updatePrefs({ readAloud: !prefs.readAloud })} />
        </div>
      </div>
    </>
  );

  return (
    <div className="xv-root" role="dialog" aria-modal="true" aria-label="Xyron voice">
      <div className="xv-panel">
        <div className="xv-bg" aria-hidden="true" />

        {screen === "home" ? (
          <div className="xv-screen" key="home">
            <div className="xv-top">
              <button type="button" className="xv-btn xv-circle" onClick={onClose} aria-label="Close voice" title="Back to chat" autoFocus><ChevronLeft size={20} /></button>
              <button type="button" className="xv-btn xv-circle" onClick={() => setPopOpen((o) => !o)} aria-label="Voice settings" title="Voice settings" aria-expanded={popOpen}><Hexagon size={18} /></button>
            </div>

            <p className="xv-hello">{first ? `Hi, ${first}.` : "Hi there."}</p>
            <h2 className="xv-ask">How can I assist you today?</h2>

            <div className="xv-cards">
              <div className="xv-card xv-card-big">
                <div className="xv-card-head">
                  <span className="xv-chip"><AudioLines size={15} /></span>
                  <button type="button" className="xv-btn xv-dots" onClick={() => setPopOpen(true)} aria-label="Voice settings"><MoreHorizontal size={16} /></button>
                </div>
                <div>
                  <p className="xv-card-title">Let&apos;s find anything with your voice</p>
                  <button type="button" className="xv-btn xv-start xv-red" onClick={startSpeaking}>Start Speaking</button>
                </div>
              </div>

              <div className="xv-card">
                <div className="xv-card-head">
                  <span className="xv-chip"><MessageSquare size={14} /></span>
                  <span className="xv-dots" aria-hidden="true"><MoreHorizontal size={16} /></span>
                </div>
                <div className="xv-card-row">
                  <span className="xv-card-label">Start New<br />Chat</span>
                  <button type="button" className="xv-btn xv-go xv-red" onClick={() => { onClose?.(); onNewChat?.(); }} aria-label="Start new chat"><ArrowUpRight size={15} /></button>
                </div>
              </div>

              <div className="xv-card">
                <div className="xv-card-head">
                  <span className="xv-chip"><ImageIcon size={14} /></span>
                  <span className="xv-dots" aria-hidden="true"><MoreHorizontal size={16} /></span>
                </div>
                <div className="xv-card-row">
                  <span className="xv-card-label">Search by<br />image</span>
                  <button type="button" className="xv-btn xv-go xv-red" onClick={() => fileRef.current?.click()} aria-label="Search by image"><ArrowUpRight size={15} /></button>
                </div>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />

            <div className="xv-recent-head">
              <span>Recently Search</span>
              <button type="button" className="xv-btn" onClick={() => { onClose?.(); onOpenHistory?.(); }}>See All</button>
            </div>
            <div className="xv-list">
              {recent.length === 0 ? (
                <div className="xv-empty">Your recent chats will show up here.</div>
              ) : recent.map((c) => {
                const Icon = rowIcon(c.title);
                return (
                  <button key={c.id} type="button" className="xv-btn xv-row" onClick={() => { onClose?.(); onOpenConversation?.(c.id); }}>
                    <span className="xv-row-ico"><Icon size={15} /></span>
                    <span className="xv-row-t">{c.title}</span>
                  </button>
                );
              })}
            </div>
            {settings}
          </div>
        ) : (
          <div className="xv-screen" key="speak">
            <div className="xv-top">
              <button type="button" className="xv-btn xv-circle" onClick={backToHome} aria-label="Back" title="Back" autoFocus><ChevronLeft size={20} /></button>
              <span className="xv-title">Speaking to Xyron</span>
              <button type="button" className="xv-btn xv-circle" onClick={() => setPopOpen((o) => !o)} aria-label="Voice settings" title="Voice settings" aria-expanded={popOpen}><MoreHorizontal size={18} /></button>
            </div>

            <p className="xv-status" role="status" aria-live="polite">{statusText}</p>

            <div className="xv-orbwrap">
              <div className="xv-orb" ref={orbRef} data-phase={phase} aria-hidden="true">
                <span className="xv-orb-glow" />
                <span className="xv-orb-ball" />
                <span className="xv-ribbon" />
                <span className="xv-ribbon r2" />
                <span className="xv-ring" />
                <span className="xv-ring b" />
                <span className="xv-ring c" />
              </div>
            </div>

            <div className="xv-live" ref={liveRef} aria-live="off">
              {captions && (
                phase === "speaking" && spoken.text ? (
                  <span className="xv-karaoke">
                    {(() => {
                      // Reveal word by word as it is spoken; only the latest words stay, older ones fade out and go.
                      const KEEP = 16, FADE = 5;
                      const said = spoken.text.slice(0, spoken.upto).split(/\s+/).filter(Boolean);
                      const first = Math.max(0, said.length - KEEP);
                      return said.slice(first).map((w, i) => {
                        const op = i < FADE && first > 0 ? Math.max(0.12, 1 - (FADE - i) * 0.18) : 1;
                        return <span key={first + i} className="xv-word" style={{ opacity: op }}>{w}{" "}</span>;
                      });
                    })()}
                  </span>
                ) : phase === "speaking" || (phase === "idle" && reply) ? (
                  <>
                    {lastHeard && <span className="xv-you">{lastHeard}</span>}
                    <span className="xv-reply">{cleanForSpeech(reply, 4000)}</span>
                  </>
                ) : phase === "thinking" ? (
                  <>
                    <span>{lastHeard}</span>
                    <span className="xv-hint">Working on it…</span>
                  </>
                ) : hasHeard ? (
                  <>
                    <span>{heardNow.final}</span>{heardNow.final && heardNow.interim ? " " : ""}
                    <span className="xv-dim">{heardNow.interim}</span>
                  </>
                ) : phase === "error" ? null : (
                  <span className="xv-hint">Ask me anything. I&apos;ll answer out loud and keep listening.</span>
                )
              )}
            </div>

            <div className="xv-dock">
              <button type="button" className={`xv-btn xv-sq ${captions ? "is-on" : ""}`} onClick={() => setCaptions((c) => !c)} aria-pressed={captions} aria-label={captions ? "Hide captions" : "Show captions"} title="Captions"><Captions size={19} /></button>
              <button type="button" className={`xv-btn xv-mic ${listeningNow ? "is-live" : "is-off"}`} onClick={onMic} aria-label={listeningNow ? (hasHeard ? "Send now" : "Stop listening") : phase === "speaking" ? "Interrupt and speak" : "Start listening"} disabled={phase === "thinking"}>
                <span className="xv-mic-ring" /><span className="xv-mic-ring b" /><span className="xv-mic-ring c" />
                <Mic size={26} />
              </button>
              <button type="button" className="xv-btn xv-circle" onClick={onClose} aria-label="End voice chat" title="End"><X size={19} /></button>
            </div>
            {settings}
          </div>
        )}
      </div>
    </div>
  );
}

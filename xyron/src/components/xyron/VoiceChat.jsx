import React, { useEffect, useRef, useState } from "react";
import { Mic, MicOff, X, Volume2 } from "lucide-react";

const GREETING = "Hey, how can I help you?";

function getRecognition() {
  if (typeof window === "undefined") return null;
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.lang = navigator.language || "en-US";
  r.continuous = false;
  r.interimResults = true;
  r.maxAlternatives = 1;
  return r;
}

export default function VoiceChat({ open, onClose, onSend }) {
  const [status, setStatus] = useState("idle"); // idle | speaking | listening | thinking | error
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef(null);
  const activeRef = useRef(false);
  const speakingRef = useRef(false);
  const startingRef = useRef(false);

  const speak = (text, after) => {
    if (!text || typeof window === "undefined" || !window.speechSynthesis) {
      after?.();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*_`#>]/g, ""));
    utterance.rate = 1.02;
    utterance.pitch = 1.02;
    utterance.volume = 1;
    speakingRef.current = true;
    setStatus("speaking");
    utterance.onend = () => {
      speakingRef.current = false;
      if (activeRef.current) after?.();
      else setStatus("idle");
    };
    utterance.onerror = () => {
      speakingRef.current = false;
      if (activeRef.current) after?.();
      else setStatus("idle");
    };
    window.speechSynthesis.speak(utterance);
  };

  const startListening = () => {
    if (!activeRef.current || speakingRef.current || startingRef.current) return;
    const recognition = getRecognition();
    if (!recognition) {
      setSupported(false);
      setStatus("error");
      return;
    }
    recognitionRef.current?.abort();
    startingRef.current = true;
    setTranscript("");
    recognition.onstart = () => {
      startingRef.current = false;
      setStatus("listening");
    };
    recognition.onresult = (event) => {
      let finalText = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const value = event.results[i][0]?.transcript || "";
        if (event.results[i].isFinal) finalText += value;
        else interim += value;
      }
      setTranscript((finalText || interim).trim());
      if (finalText.trim()) {
        recognition.stop();
        setStatus("thinking");
        const result = onSend(finalText.trim(), {
          onReply: (reply) => {
            if (!activeRef.current) return;
            setTranscript("");
            speak(reply || "I didn't get a response.", startListening);
          },
        });
        Promise.resolve(result).catch(() => {
          if (activeRef.current) speak("Sorry, something went wrong.", startListening);
        });
      }
    };
    recognition.onerror = (event) => {
      startingRef.current = false;
      if (!activeRef.current) return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setStatus("error");
        setTranscript("Microphone permission is blocked. Allow microphone access and try again.");
      } else if (event.error !== "aborted" && event.error !== "no-speech") {
        setStatus("error");
        setTranscript("I couldn't hear that. Tap the orb to try again.");
      } else if (activeRef.current) {
        setStatus("listening");
      }
    };
    recognition.onend = () => {
      startingRef.current = false;
      if (activeRef.current && status === "listening") setStatus("listening");
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch { startingRef.current = false; }
  };

  useEffect(() => {
    if (!open) return undefined;
    activeRef.current = true;
    const recognition = getRecognition();
    setSupported(!!recognition);
    setTranscript("");
    if (!recognition) {
      setStatus("error");
      setTranscript("Voice input isn't supported in this browser. Try Chrome or Edge.");
    } else {
      speak(GREETING, startListening);
    }
    return () => {
      activeRef.current = false;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      speakingRef.current = false;
      startingRef.current = false;
    };
  }, [open]);

  if (!open) return null;

  const speaking = status === "speaking";
  const listening = status === "listening";
  const thinking = status === "thinking";

  const toggleListening = () => {
    if (!supported) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      speakingRef.current = false;
      startListening();
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setStatus("idle");
      return;
    }
    startListening();
  };

  return (
    <div className="voice-overlay" role="dialog" aria-modal="true" aria-label="Xyron voice chat">
      <div className="voice-backdrop" onClick={onClose} />
      <div className="voice-panel">
        <button className="voice-close" onClick={onClose} aria-label="Close voice chat"><X className="h-5 w-5" /></button>
        <div className="voice-topline"><span className="voice-brand">Xyron Voice</span><span className="voice-live-dot" /></div>

        <button className={`voice-orb ${speaking ? "is-speaking" : ""} ${listening ? "is-listening" : ""} ${thinking ? "is-thinking" : ""}`} onClick={toggleListening} aria-label="Voice control">
          <span className="voice-orb-core" />
          <span className="voice-orb-liquid liquid-a" />
          <span className="voice-orb-liquid liquid-b" />
          <span className="voice-orb-liquid liquid-c" />
          <span className="voice-orb-ring ring-a" />
          <span className="voice-orb-ring ring-b" />
          <span className="voice-orb-icon">
            {speaking ? <Volume2 className="h-8 w-8" /> : listening ? <Mic className="h-8 w-8" /> : thinking ? <span className="voice-dots">•••</span> : <Mic className="h-8 w-8" />}
          </span>
        </button>

        <div className="voice-status">
          <h2>{speaking ? "Xyron is speaking" : listening ? "Listening…" : thinking ? "Thinking…" : supported ? "Tap the orb and speak" : "Voice unavailable"}</h2>
          <p>{transcript || (speaking ? GREETING : "Talk naturally. Xyron will listen, answer, and speak back.")}</p>
        </div>

        <div className="voice-actions">
          <button onClick={toggleListening} className="voice-mic-btn" disabled={!supported || thinking}>
            {listening ? <><MicOff className="h-4 w-4" /> Stop listening</> : <><Mic className="h-4 w-4" /> Speak</>}
          </button>
          <button onClick={onClose} className="voice-end-btn"><X className="h-4 w-4" /> End</button>
        </div>
      </div>
    </div>
  );
}

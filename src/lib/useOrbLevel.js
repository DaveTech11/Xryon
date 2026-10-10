import { useEffect, useRef } from "react";
import { isCoarsePointer } from "./voice";

// Drives the red orb. Writes a 0..1 value to the CSS variable --xv-level on `orbRef` every frame
// (no React re-render per frame).
//   listening: follows the real microphone loudness on desktop; on phones and tablets it follows
//              recognition activity instead, because opening a second microphone stream next to
//              speech recognition can make recognition fail on some mobile browsers.
//   speaking / thinking: gentle synthetic motion.
export function useOrbLevel(orbRef, { phase, heard }) {
  const synth = useRef(0);
  const analyser = useRef(null);

  // Each recognition result "pings" the orb.
  useEffect(() => { synth.current = 0.8; }, [heard]);

  // Microphone analyser (desktop only, only while listening).
  useEffect(() => {
    if (phase !== "listening" || isCoarsePointer() || !navigator.mediaDevices?.getUserMedia) return undefined;
    let cancelled = false;
    let stream = null;
    let ctx = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        const src = ctx.createMediaStreamSource(stream);
        const node = ctx.createAnalyser();
        node.fftSize = 256;
        src.connect(node);
        analyser.current = { node, data: new Uint8Array(node.fftSize) };
      } catch { /* no mic access here: the orb falls back to recognition activity */ }
    })();
    return () => {
      cancelled = true;
      analyser.current = null;
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close?.().catch(() => {});
    };
  }, [phase]);

  useEffect(() => {
    const el = orbRef.current;
    if (!el) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { el.style.setProperty("--xv-level", "0.25"); return undefined; }
    let raf = 0;
    let cur = 0;
    const loop = () => {
      const t = performance.now() / 1000;
      let target = 0.06;
      if (phase === "listening") {
        let mic = 0;
        const a = analyser.current;
        if (a) {
          a.node.getByteTimeDomainData(a.data);
          let sum = 0;
          for (let i = 0; i < a.data.length; i += 1) { const v = (a.data[i] - 128) / 128; sum += v * v; }
          mic = Math.min(1, Math.sqrt(sum / a.data.length) * 5);
        }
        target = Math.max(0.1, mic, synth.current);
      } else if (phase === "speaking") {
        target = 0.38 + 0.26 * Math.sin(t * 5.1) * Math.sin(t * 2.2 + 1);
      } else if (phase === "thinking") {
        target = 0.22 + 0.1 * Math.sin(t * 3);
      }
      synth.current *= 0.9;
      cur += (target - cur) * 0.22;
      el.style.setProperty("--xv-level", cur.toFixed(3));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [orbRef, phase]);
}

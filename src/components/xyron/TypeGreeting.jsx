import React, { useEffect, useRef, useState } from "react";

// Laptop greeting that types itself out one letter at a time.
//  - brand new user (first time on this browser): "Welcome to Xryon", then it moves on to the next line
//  - everyone else, and after the welcome: "What are we building today?", "Good evening, Dave" or "Hey Dave, u back?"
const TYPE_MS = 58;
const ERASE_MS = 22;
const HOLD_MS = 1500;

function safeGet(k) { try { return window.localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { window.localStorage.setItem(k, v); } catch { /* private mode */ } }

export default function TypeGreeting({ name = "", greeting = "Hello", userKey = "guest" }) {
  const plan = useRef(null);
  if (!plan.current) {
    const flag = `xyron_welcomed_${userKey}`;
    const isNew = !safeGet(flag);
    const pool = ["What are we building today?", `${greeting}${name ? `, ${name}` : ""}`];
    if (name && !isNew) pool.push(`Hey ${name}, u back?`);
    const next = pool[Math.floor(Math.random() * pool.length)];
    plan.current = { isNew, flag, lines: isNew ? ["Welcome to Xryon", next] : [next] };
  }
  const { lines } = plan.current;
  const [line, setLine] = useState(0);
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState("type"); // type -> hold -> erase -> type ...
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => { if (plan.current.isNew) safeSet(plan.current.flag, "1"); }, []);

  useEffect(() => {
    const text = lines[line];
    if (reduced) { setLine(lines.length - 1); setCount(lines[lines.length - 1].length); setPhase("done"); return undefined; }
    let t;
    if (phase === "type") {
      if (count < text.length) t = setTimeout(() => setCount((c) => c + 1), TYPE_MS);
      else if (line < lines.length - 1) t = setTimeout(() => setPhase("erase"), HOLD_MS);
      else setPhase("done");
    } else if (phase === "erase") {
      if (count > 0) t = setTimeout(() => setCount((c) => c - 1), ERASE_MS);
      else { setLine((l) => l + 1); setPhase("type"); }
    }
    return () => clearTimeout(t);
  }, [phase, count, line, lines, reduced]);

  const shown = lines[line].slice(0, count);
  return (
    <span aria-label={lines[lines.length - 1]}>
      <span aria-hidden="true">{shown}</span>
      {phase !== "done" && <span className="xr-caret" aria-hidden="true" />}
    </span>
  );
}

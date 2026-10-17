import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../lib/AuthContext";
import { pushSupported, enablePush, syncPush, promptDismissedRecently, dismissPrompt } from "../lib/push";

const POLL_MS = 30000;

// Admin broadcasts. A black rounded notification drops in at the top; tapping
// it opens a black rounded card with two buttons:
//   Okay -> closes it     More -> opens the app (admin's link, else home)
export default function BroadcastNotifier() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [queue, setQueue] = useState([]);
  const [open, setOpen] = useState(false);
  const handled = useRef(new Set());
  const [askPush, setAskPush] = useState(false);
  const [enabling, setEnabling] = useState(false);

  // Opened from a notification: mark that broadcast as seen so it isn't shown a second time inside the app.
  // (Runs before the first poll so the poll skips it.)
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const params = new URLSearchParams(window.location.search);
    const bc = params.get("bc");
    if (bc) {
      handled.current.add(bc);
      api.broadcasts.ack(bc).catch(() => {});
      params.delete("bc");
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
    }
    if (!("serviceWorker" in navigator)) return undefined;
    const onMsg = (e) => {
      const d = e.data || {};
      if (d.type !== "xyron-notification-click") return;
      if (d.id) {
        handled.current.add(d.id);
        setQueue((q) => q.filter((b) => b.id !== d.id));
        api.broadcasts.ack(d.id).catch(() => {});
      }
      if (d.url && d.url !== "/") navigate(d.url);
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, [isAuthenticated, navigate]);

  // Notifications while the site is closed: ask once (after a few seconds), or quietly re-register if already allowed.
  useEffect(() => {
    if (!isAuthenticated || !pushSupported()) return undefined;
    if (Notification.permission === "granted") { syncPush(); return undefined; }
    if (Notification.permission !== "default" || promptDismissedRecently()) return undefined;
    const t = setTimeout(() => setAskPush(true), 6000);
    return () => clearTimeout(t);
  }, [isAuthenticated]);

  const turnOn = async () => {
    setEnabling(true);
    const r = await enablePush();
    setEnabling(false);
    setAskPush(false);
    if (!r.ok) dismissPrompt();
  };
  const notNow = () => { dismissPrompt(); setAskPush(false); };

  const poll = useCallback(async () => {
    try {
      const items = await api.broadcasts.pending();
      setQueue((q) => {
        const known = new Set(q.map((b) => b.id));
        const fresh = items.filter((b) => !known.has(b.id) && !handled.current.has(b.id));
        return fresh.length ? [...q, ...fresh] : q;
      });
    } catch { /* not signed in / offline: try again next tick */ }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    poll();
    const t = setInterval(poll, POLL_MS);
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [isAuthenticated, poll]);

  const current = queue[0];

  const close = useCallback((goMore) => {
    if (!current) return;
    handled.current.add(current.id);
    api.broadcasts.ack(current.id).catch(() => {});
    setQueue((q) => q.slice(1));
    setOpen(false);
    if (goMore) {
      const url = current.url || "/";
      if (/^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener");
      else navigate(url);
    }
  }, [current, navigate]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") close(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!isAuthenticated) return null;

  return (
    <>
      <AnimatePresence>
        {askPush && !current && (
          <motion.div
            key="push-prompt"
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="fixed left-1/2 top-3 z-[190] w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-white/10 bg-black p-4 shadow-2xl shadow-black/60"
            role="dialog"
            aria-label="Turn on notifications"
          >
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10"><Bell className="h-4 w-4 text-white" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">Turn on notifications</p>
                <p className="mt-0.5 text-xs leading-5 text-neutral-400">Get Xyron announcements on your phone, even when you are not on the website.</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={notNow} className="h-10 rounded-full border border-white/15 bg-white/5 text-sm font-medium text-white hover:bg-white/10">Not now</button>
              <button type="button" onClick={turnOn} disabled={enabling} className="h-10 rounded-full bg-white text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-60">{enabling ? "Turning on..." : "Turn on"}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {current && !open && (
          <motion.button
            key={`n-${current.id}`}
            type="button"
            onClick={() => setOpen(true)}
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="fixed left-1/2 top-3 z-[200] flex w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/10 bg-black px-4 py-3 text-left shadow-2xl shadow-black/60"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10">
              <Bell className="h-4 w-4 text-white" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white">{current.title}</span>
              <span className="block truncate text-xs text-neutral-400">{current.message}</span>
            </span>
            {queue.length > 1 && (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-neutral-300">+{queue.length - 1}</span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {current && open && (
          <motion.div
            key={`m-${current.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] grid place-items-center bg-black/60 px-5 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label={current.title}
          >
            <motion.div
              initial={{ scale: 0.92, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="w-full max-w-sm rounded-3xl border border-white/10 bg-black p-6 shadow-2xl shadow-black/70"
            >
              <h2 className="text-lg font-semibold text-white">{current.title}</h2>
              <p className="mt-2 max-h-[50vh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-neutral-300">
                {current.message}
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => close(false)}
                  className="h-11 rounded-full border border-white/15 bg-white/5 text-sm font-medium text-white hover:bg-white/10">
                  Okay
                </button>
                <button type="button" onClick={() => close(true)}
                  className="h-11 rounded-full bg-white text-sm font-medium text-black hover:bg-neutral-200">
                  More
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

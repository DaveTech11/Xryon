import React, { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

const DISMISSED_KEY = "xyron_pwa_prompt_dismissed_v1";
export default function InstallAppPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [visible, setVisible] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);
  useEffect(() => {
    // Register the existing service worker even when the prompt was dismissed earlier.
    if ("serviceWorker" in navigator && /^https?:$/.test(window.location.protocol)) navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone) return;
    try { if (localStorage.getItem(DISMISSED_KEY)) return; } catch { /* ignore */ }
    const onPrompt = (event) => { event.preventDefault(); setInstallEvent(event); setVisible(true); };
    const onInstalled = () => { setVisible(false); setInstallEvent(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
    if (isIOS) setTimeout(() => { try { if (!localStorage.getItem(DISMISSED_KEY)) { setIosHelp(true); setVisible(true); } } catch { /* ignore */ } }, 1800);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  const dismiss = () => { setVisible(false); setIosHelp(false); try { localStorage.setItem(DISMISSED_KEY, "1"); } catch { /* ignore */ } };
  const install = async () => { if (!installEvent) { setIosHelp(true); return; } installEvent.prompt(); await installEvent.userChoice; setInstallEvent(null); setVisible(false); };
  if (!visible) return null;
  return <aside className="fixed bottom-4 left-3 right-3 z-[100] mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-white/15 bg-[#242424] p-4 text-white shadow-2xl md:bottom-5" role="dialog" aria-label="Install Xyron app"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-black"><Download size={19}/></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Add Xyron to your home screen</p><p className="mt-1 text-xs leading-relaxed text-neutral-400">Launch Xyron like an app, while the website remains available in your browser.</p>{iosHelp && <p className="mt-2 text-xs text-neutral-200">On iPhone or iPad: tap Share in Safari, then choose “Add to Home Screen”.</p>}<div className="mt-3 flex gap-2"><button onClick={install} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black">{iosHelp && !installEvent ? "How to install" : "Install app"}</button><button onClick={dismiss} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-neutral-300">Not now</button></div></div><button onClick={dismiss} aria-label="Dismiss install prompt" className="rounded-lg p-1 text-neutral-400 hover:bg-white/10"><X size={16}/></button></aside>;
}

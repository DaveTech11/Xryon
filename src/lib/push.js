import { api } from "../api/client";

// Web Push helpers: lets admin broadcasts arrive as real notifications even when the site is closed.
const DISMISS_KEY = "xyron_push_prompt_dismissed";
const DISMISS_MS = 7 * 24 * 3600 * 1000;

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export const pushPermission = () => (pushSupported() ? Notification.permission : "unsupported");

export function promptDismissedRecently() {
  try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < DISMISS_MS; } catch { return false; }
}
export function dismissPrompt() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode */ }
}

function keyToBytes(b64url) {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  return reg;
}

async function subscribeAndSave(reg) {
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const publicKey = await api.push.key();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) });
  }
  await api.push.subscribe(sub.toJSON());
  return sub;
}

// Called from a button tap: asks for permission, then subscribes this device.
export async function enablePush() {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: permission };
  try { await subscribeAndSave(await registration()); return { ok: true }; }
  catch (e) { return { ok: false, reason: e?.message || "failed" }; }
}

// Already allowed earlier: quietly make sure this device is still registered with the server.
export async function syncPush() {
  if (!pushSupported() || Notification.permission !== "granted") return;
  try { await subscribeAndSave(await registration()); } catch { /* try again next visit */ }
}

export async function disablePush() {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await api.push.unsubscribe(sub.endpoint).catch(() => {}); await sub.unsubscribe(); }
  } catch { /* ignore */ }
}

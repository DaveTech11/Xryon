// Light / dark theme. Dark is the default. The choice is saved under the same "xryon_dark_mode" key the
// Settings page already used ("dark" | "light"), and is applied to <html> as soon as the app starts so
// every page (chat, settings, premium…) follows it, not just Settings.
import { getSetting, setSetting } from "./settings";

export const isDarkMode = () => getSetting("darkMode", "dark") !== "light";

export function applyTheme(dark = isDarkMode()) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.classList.toggle("light", !dark);
  root.style.colorScheme = dark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#000000" : "#ffffff");
}

export function setDarkMode(dark) {
  setSetting("darkMode", dark ? "dark" : "light");
  applyTheme(dark);
}

// Call once before React renders. Also keeps other tabs / the Settings switch in sync.
export function initTheme() {
  applyTheme();
  if (typeof window === "undefined") return;
  window.addEventListener("xryon-setting", (e) => { if (!e.detail || e.detail.key === "darkMode") applyTheme(); });
  window.addEventListener("storage", () => applyTheme());
}

// Generates src/styles/light.css — the "white theme" overrides.
// The app is styled dark-first with hard-coded Tailwind classes (text-white, bg-white/5, bg-[#08080a]…).
// Instead of touching hundreds of components, this script scans every class used in src/ and writes a
// light counterpart for each, all scoped under `html.light`. Re-run it after adding new dark colours:
//     node tools/gen-light-theme.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const palette = JSON.parse(fs.readFileSync(path.join(root, "tools/tailwind-palette.json"), "utf8"));
const NEUTRAL = palette.neutral;
const SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
const GREYS = new Set(["neutral", "zinc", "gray", "slate", "stone"]);

// text-neutral-N -> readable grey on white
const TEXT_GREY = { 50: "#0a0a0a", 100: "#171717", 200: "#262626", 300: "#3f3f46", 400: "#52525b", 500: "#6b6b73", 600: "#8a8a92", 700: "#a3a3aa", 800: "#d4d4d8", 900: "#e5e5e8", 950: "#f4f4f5" };
const INK = "#0f0f12";
const INK_RGB = "15,15,18";

// ---- collect every class token used in the source ----
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(jsx|js|html)$/.test(f.name)) files.push(p);
  }
})(path.join(root, "src"));
const tokens = new Set();
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  for (const m of text.matchAll(/[A-Za-z0-9:_\-\[\]#\/\.%\(\),]+/g)) tokens.add(m[0]);
}

const hexToRgb = (h) => { h = h.replace("#", ""); if (h.length === 3) h = [...h].map((c) => c + c).join(""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const lum = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
const toHex = (rgb) => "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
// A dark surface becomes the matching pale surface.
const lighten = (hex) => { const rgb = hexToRgb(hex); const inv = rgb.map((v) => 255 - v); return toHex(inv.map((v) => v * 0.985 + 1)); };
const parseAlpha = (s) => {
  if (s == null) return 1;
  const m = String(s).match(/^\[(\.?[\d.]+)\]$/); if (m) return Number(m[1]);
  return Number(s) / 100;
};
const esc = (t) => t.replace(/[^A-Za-z0-9_-]/g, (c) => "\\" + c);
const fmt = (a) => String(Math.round(a * 1000) / 1000).replace(/^0\./, ".");

const STATES = { hover: ":hover", focus: ":focus", active: ":active", disabled: ":disabled", "focus-visible": ":focus-visible", "focus-within": ":focus-within", placeholder: "::placeholder", marker: "::marker" };
const MEDIA = { sm: 640, md: 768, lg: 1024, xl: 1280 };
const colorNames = Object.keys(palette).filter((n) => !GREYS.has(n));

// utility -> declarations (or null when the dark value should stay)
function rule(util) {
  let m;
  // ---- text colour ----
  if ((m = util.match(/^text-white(?:\/(\[?[\d.]+\]?))?$/))) {
    const a = parseAlpha(m[1]); return { color: a >= 1 ? INK : `rgba(${INK_RGB},${fmt(a)})` };
  }
  if (util === "text-black") return { color: "#fff" };
  if ((m = util.match(/^text-(neutral|zinc|gray|slate|stone)-(\d+)$/)) && TEXT_GREY[m[2]]) return { color: TEXT_GREY[m[2]] };
  if ((m = util.match(/^text-([a-z]+)-(\d+)$/)) && palette[m[1]] && !GREYS.has(m[1])) {
    const s = Number(m[2]);
    const to = s <= 100 ? "900" : s <= 200 ? "800" : s <= 300 ? "700" : s <= 400 ? "600" : null;
    if (to) return { color: palette[m[1]][to] };
  }
  // ---- backgrounds ----
  if (util === "bg-white") return { "background-color": "#111114" };
  if ((m = util.match(/^bg-white\/(\[?[\d.]+\]?)$/))) return { "background-color": `rgba(0,0,0,${fmt(parseAlpha(m[1]))})` };
  if (util === "bg-black") return { "background-color": "#ffffff" };
  if ((m = util.match(/^bg-black\/(\[?[\d.]+\]?)$/))) { const a = parseAlpha(m[1]); if (a < 0.5) return { "background-color": `rgba(0,0,0,${fmt(a * 0.3)})` }; return null; }
  if ((m = util.match(/^bg-\[(#[0-9a-fA-F]{3,6})\]$/))) return lum(hexToRgb(m[1])) < 0.42 ? { "background-color": lighten(m[1]) } : null;
  if ((m = util.match(/^bg-(neutral|zinc|gray|slate|stone)-(\d+)$/)) && SHADES.includes(m[2])) {
    const flip = SHADES[SHADES.length - 1 - SHADES.indexOf(m[2])]; return { "background-color": NEUTRAL[flip] };
  }
  // ---- borders / dividers / rings ----
  if ((m = util.match(/^(border|divide)-white\/(\[?[\d.]+\]?)$/))) return { __color: `rgba(0,0,0,${fmt(Math.min(1, parseAlpha(m[2]) * 1.1))})` };
  if (util === "border-white" || util === "divide-white") return { __color: "#111114" };
  if ((m = util.match(/^(border|divide)-\[(#[0-9a-fA-F]{3,6})\]$/))) return lum(hexToRgb(m[2])) < 0.42 ? { __color: toHex(hexToRgb(m[2]).map(() => 0)).replace("#000000", "rgba(0,0,0,.12)") } : null;
  if ((m = util.match(/^(border|divide)-(neutral|zinc|gray|slate)-(\d+)$/)) && SHADES.includes(m[3])) {
    const flip = SHADES[SHADES.length - 1 - SHADES.indexOf(m[3])]; return { __color: NEUTRAL[flip] };
  }
  if ((m = util.match(/^ring-white\/(\[?[\d.]+\]?)$/))) return { "--tw-ring-color": `rgba(0,0,0,${fmt(parseAlpha(m[1]))})` };
  if ((m = util.match(/^decoration-(neutral|zinc|gray|slate)-(\d+)$/)) && SHADES.includes(m[2])) return { "text-decoration-color": NEUTRAL[SHADES[SHADES.length - 1 - SHADES.indexOf(m[2])]] };
  // ---- gradients ----
  if ((m = util.match(/^(from|via|to)-\[(#[0-9a-fA-F]{3,6})\]$/)) && lum(hexToRgb(m[2])) < 0.42) {
    const c = lighten(m[2]); const [r, g, b] = hexToRgb(c);
    if (m[1] === "from") return { "--tw-gradient-from": `${c} var(--tw-gradient-from-position)`, "--tw-gradient-to": `rgb(${r} ${g} ${b} / 0) var(--tw-gradient-to-position)`, "--tw-gradient-stops": "var(--tw-gradient-from), var(--tw-gradient-to)" };
    if (m[1] === "via") return { "--tw-gradient-to": `rgb(${r} ${g} ${b} / 0) var(--tw-gradient-to-position)`, "--tw-gradient-stops": `var(--tw-gradient-from), ${c} var(--tw-gradient-via-position), var(--tw-gradient-to)` };
    return { "--tw-gradient-to": `${c} var(--tw-gradient-to-position)` };
  }
  return null;
}

const SAFE = ":not(.xs-keep-dark):not(.xs-keep-dark *)";
const buckets = { base: [], state: [], media: {} };
const seen = new Set();

for (const token of tokens) {
  const parts = token.split(":");
  const util = parts.pop();
  const variants = parts;
  if (!util || /[(),]/.test(util)) continue;
  let pseudo = "", group = false, media = null, ok = true;
  for (const v of variants) {
    if (STATES[v]) pseudo += STATES[v];
    else if (v === "group-hover") group = true;
    else if (MEDIA[v]) media = MEDIA[v];
    else { ok = false; break; }
  }
  if (!ok) continue;
  const decl = rule(util);
  if (!decl) continue;
  const sel = esc(token);
  const classPart = group ? `.group:hover .${sel}` : `.${sel}${pseudo}`;
  const full = `html.light ${classPart}${SAFE}`;
  // border-* / divide-* need the right property names
  let body = "";
  for (const [k, v] of Object.entries(decl)) {
    if (k === "__color") {
      if (util.startsWith("divide")) body += `border-color:${v};`;
      else body += `border-color:${v};`;
    } else body += `${k}:${v};`;
  }
  const selector = util.startsWith("divide-") ? `html.light .${sel}${pseudo}${SAFE} > :not([hidden]) ~ :not([hidden])` : full;
  const line = `${selector}{${body}}`;
  if (seen.has(line)) continue; seen.add(line);
  if (media) (buckets.media[media] ||= []).push(line);
  else if (pseudo || group) buckets.state.push(line);
  else buckets.base.push(line);
}

// ---- coloured / light surfaces keep their own text colour ----
const keep = [];
const solid = new Set();
for (const t of tokens) {
  let m;
  if ((m = t.match(/^(bg|from|via|to)-([a-z]+)-(\d{3})$/)) && colorNames.includes(m[2]) && Number(m[3]) >= 300) solid.add(t);
  if ((m = t.match(/^bg-\[(#[0-9a-fA-F]{3,6})\]$/)) && lum(hexToRgb(m[1])) >= 0.42) solid.add(t);
}
for (const t of solid) {
  const s = esc(t);
  keep.push(`html.light .${s}.text-white${SAFE}{color:#fff}`);
  keep.push(`html.light .${s}.text-black${SAFE}{color:#000}`);
  keep.push(`html.light .${s}.text-white\\/80${SAFE}{color:rgba(255,255,255,.8)}`);
}


// ---- hand-written light rules for the custom (non-Tailwind) shell classes in index.css ----
const extras = `
html.light{color-scheme:light;--background:0 0% 100%;--foreground:0 0% 6%;--card:0 0% 100%;--card-foreground:0 0% 6%;--popover:0 0% 100%;--popover-foreground:0 0% 6%;--primary:0 0% 9%;--primary-foreground:0 0% 98%;--secondary:0 0% 94%;--secondary-foreground:0 0% 9%;--muted:0 0% 94%;--muted-foreground:0 0% 40%;--accent:0 0% 94%;--accent-foreground:0 0% 9%;--border:0 0% 88%;--input:0 0% 88%;--ring:0 0% 20%}
html.light body{background:#fff;color:#0f0f12}
html.light .xyron-chat-shell,html.light .xyron-chat-shell::before{background:#fff!important}
html.light .xyron-chat-shell::after{opacity:.5;background-image:linear-gradient(rgba(0,0,0,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.02) 1px,transparent 1px)}
html.light .xyron-composer,html.light .xyron-composer-dock.xyron-empty-composer .xyron-composer{background:#f4f4f5!important;border-color:rgba(0,0,0,.12)!important;box-shadow:0 6px 24px rgba(0,0,0,.08)!important}
html.light .xyron-composer:focus-within{border-color:rgba(0,0,0,.25)!important;box-shadow:0 8px 30px rgba(0,0,0,.1)!important}
html.light .xyron-composer textarea{color:#18181b!important}
html.light .xyron-composer textarea::placeholder{color:#8a8a92!important}
html.light .xyron-composer .xyron-composer-row > div:first-child .xyron-composer-btn{background:rgba(0,0,0,.06)}
html.light .xyron-logo-orbit{background:linear-gradient(145deg,#ffffff,#e4e4e7);border-color:rgba(0,0,0,.1)}
html.light .xyron-logo-orbit b{color:#18181b;text-shadow:none}
html.light .xyron-logo-orbit span{border-color:rgba(0,0,0,.1)}
html.light .xyron-logo-orbit span::after{background:#18181b;box-shadow:none}
html.light .xyron-voice-btn{background:#e8e8ea!important;color:#1d6fd6}
html.light .xyron-voice-btn:hover{background:#dcdcdf!important}
html.light .xr-caret{background:#18181b}
html.light .xs-side,html.light .xs-dock{background:#f7f7f8!important}
html.light .xs-topbar{background:#fff!important}
html.light .xs-new:hover,html.light .xs-icon:hover,html.light .xs-pill:hover,html.light .xs-model:hover,html.light .xs-dock > div > div:last-child:hover{background:rgba(0,0,0,.07)!important}
html.light .xs-item,html.light .xs-hist-item{color:#27272a!important}
html.light .xs-item:hover,html.light .xs-hist-item:hover{background:rgba(0,0,0,.06)!important;color:#000!important}
html.light .xs-item.bg-white\\/10,html.light .xs-hist-item.bg-white\\/10{background:rgba(0,0,0,.09)!important;color:#000!important}
html.light .xs-item svg{color:#52525b}
html.light .xs-icon{color:#3f3f46!important}
html.light .xs-pill{border-color:rgba(0,0,0,.16)!important}
html.light .xs-model{color:#18181b!important}
html.light .sidebar-scroll::-webkit-scrollbar-track{background:#f1f1f2}
html.light .sidebar-scroll::-webkit-scrollbar-thumb{background:#c9c9cd}
html.light .auth-bg{background:radial-gradient(ellipse 60% 50% at 15% 15%,rgba(0,0,0,.04),transparent 60%),#f6f6f7}
html.light .auth-bg::before,html.light .auth-bg::after{opacity:.35;filter:invert(1)}
html.light .auth-card{border-color:rgba(0,0,0,.1);background:#fff;box-shadow:0 30px 80px -30px rgba(0,0,0,.25)}
html.light .auth-card::before{opacity:.25;filter:invert(1)}
@media(max-width:640px){html.light .xyron-chat-shell{background:#fff!important}}
html.light .xs-toggle{box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
html.light .xs-toggle > span{background:#fff!important;box-shadow:0 1px 3px rgba(0,0,0,.35)}
`;

const header = `/* AUTO-GENERATED by tools/gen-light-theme.mjs — do not edit by hand.
   White theme: everything below only applies while <html class="light"> is set (Settings > Personalization > Dark mode off).
   Areas that should stay dark (code editors, code blocks) carry the class .xs-keep-dark and are skipped. */\n`;
let css = header;
css += buckets.base.join("\n") + "\n" + buckets.state.join("\n") + "\n" + keep.join("\n") + "\n" + extras + "\n";
for (const w of Object.keys(buckets.media).sort((a, b) => a - b)) css += `@media (min-width:${w}px){\n${buckets.media[w].join("\n")}\n}\n`;
fs.writeFileSync(path.join(root, "src/styles/light.css"), css);
console.log(`light.css: ${(css.length / 1024).toFixed(1)} KB, ${buckets.base.length + buckets.state.length} rules, ${keep.length} keep rules`);

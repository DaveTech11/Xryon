// Renders a video storyboard (from /api/functions/videoPlan) into a real video file, entirely in the browser:
// canvas animation + synthesized music (Web Audio) recorded with MediaRecorder. No server CPU, no ffmpeg, works on the free host.
const THEMES = {
  dark:  { bg: "#08080a", ink: "#f2f2f4", dim: "#a7a7ae", faint: "#6c6c74", line: "rgba(255,255,255,.14)", glass: "rgba(255,255,255,.05)", accent: "#ffffff" },
  ember: { bg: "#0b0708", ink: "#fff4f1", dim: "#c9a8a2", faint: "#7d625e", line: "rgba(255,120,100,.22)", glass: "rgba(255,90,70,.07)", accent: "#ff5a4a" },
  ocean: { bg: "#06101a", ink: "#eef8ff", dim: "#9bb8cc", faint: "#5d7a8e", line: "rgba(120,200,255,.22)", glass: "rgba(80,170,255,.07)", accent: "#4cc2ff" },
  light: { bg: "#f6f5f2", ink: "#121214", dim: "#4d4d55", faint: "#8a8a92", line: "rgba(0,0,0,.14)", glass: "rgba(0,0,0,.04)", accent: "#121214" },
};
const SANS = `"Inter","Helvetica Neue",Arial,system-ui,sans-serif`, MONO = `"JetBrains Mono","SF Mono",Menlo,Consolas,monospace`;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
export const sizeOf = (plan) => (plan.aspect === "wide" ? { W: 1280, H: 720 } : { W: 720, H: 1280 });
export const totalSeconds = (plan) => plan.scenes.reduce((a, s) => a + s.duration, 0);

function wrap(ctx, text, maxW) {
  const out = []; let line = "";
  for (const w of String(text || "").split(/\s+/).filter(Boolean)) {
    const t = line ? line + " " + w : w;
    if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// ---- drawing ------------------------------------------------------------------------------------------
export function drawFrame(ctx, plan, t, imgs = []) {
  const { W, H } = sizeOf(plan), th = THEMES[plan.theme] || THEMES.dark, S = Math.min(W, H) / 720, total = totalSeconds(plan);
  t = clamp(t, 0, total - 0.001);
  let a = 0, i = 0;
  while (i < plan.scenes.length - 1 && t >= a + plan.scenes[i].duration) { a += plan.scenes[i].duration; i++; }
  const sc = plan.scenes[i], lt = t - a, dur = sc.duration;
  // background + slow drifting glow
  ctx.globalAlpha = 1; ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
  const gx = W * (0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.25))), g = ctx.createRadialGradient(gx, H * 0.3, 0, gx, H * 0.3, Math.max(W, H) * 0.7);
  g.addColorStop(0, th.glass.replace(/[\d.]+\)$/, "0.16)")); g.addColorStop(1, "transparent"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // scene fade in / out
  const fade = Math.min(clamp(lt / 0.45), clamp((dur - lt) / 0.3), 1);
  ctx.save(); ctx.globalAlpha = i === 0 ? clamp(lt / 0.2) * clamp((dur - lt) / 0.3) : fade; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  const cx = W / 2, maxW = Math.min(W - 90 * S, (plan.aspect === "wide" ? 1120 : 880) * S);
  const R = (k) => ease((lt - 0.15 - k * 0.18) / 0.7); // staggered reveal of the k-th element
  const text = (str, y, size, { weight = 600, color = th.ink, font = SANS, k = 0, lh = 1.12, max = maxW, x = cx, align = "center" } = {}) => {
    ctx.font = `${weight} ${size * S}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align;
    const lines = wrap(ctx, str, max), r = R(k); ctx.save(); ctx.globalAlpha *= r;
    lines.forEach((l, n) => ctx.fillText(l, x, y + (1 - r) * 26 * S + n * size * S * lh)); ctx.restore();
    return y + lines.length * size * S * lh;
  };
  const kicker = (y) => (sc.kicker ? text(sc.kicker.toUpperCase(), y, 17, { weight: 500, color: th.faint, font: MONO, k: 0 }) : y);
  const brand = (y, k = 0) => { // logo mark + brand name
    ctx.font = `600 ${30 * S}px ${SANS}`; const w = ctx.measureText(plan.brand).width + 58 * S, x0 = cx - w / 2, r = R(k);
    ctx.save(); ctx.globalAlpha *= r; const lg = ctx.createLinearGradient(x0, y, x0 + 42 * S, y + 42 * S); lg.addColorStop(0, th.ink); lg.addColorStop(1, th.faint);
    ctx.fillStyle = lg; rrect(ctx, x0, y, 42 * S, 42 * S, 11 * S); ctx.fill(); ctx.fillStyle = th.bg; ctx.beginPath(); ctx.arc(x0 + 21 * S, y + 21 * S, 7 * S, 0, 7); ctx.fill();
    ctx.fillStyle = th.ink; ctx.textAlign = "left"; ctx.fillText(plan.brand, x0 + 56 * S, y + 31 * S); ctx.restore();
  };
  const items = sc.items || [];
  if (sc.type === "title") {
    brand(H * 0.3, 0);
    const y = text(sc.title || plan.title, H * 0.3 + 120 * S, 66, { k: 1, lh: 1.08 });
    text(sc.text, y + 24 * S, 25, { weight: 400, color: th.dim, k: 3, lh: 1.35 });
    ctx.lineWidth = 2 * S; for (let l = 0; l < 3; l++) { ctx.beginPath(); for (let x = 0; x <= W; x += 6) { const e = Math.exp(-(((x - cx) / (W * 0.22)) ** 2)), y2 = H * 0.8 + Math.sin(x * 0.03 / S + t * 3 + l) * 36 * S * e * (1 - l * 0.25) + Math.sin(x * 0.011 / S - t) * 8 * S; x ? ctx.lineTo(x, y2) : ctx.moveTo(x, y2); } ctx.strokeStyle = th.accent; ctx.globalAlpha = fade * (0.8 - l * 0.28); ctx.stroke(); } ctx.globalAlpha = fade;
  } else if (sc.type === "text") {
    let y = kicker(H * 0.36); y = text(sc.title, y + 30 * S, 56, { k: 1 }); text(sc.text, y + 30 * S, 28, { weight: 400, color: th.dim, k: 2, lh: 1.4 });
  } else if (sc.type === "bullets") {
    let y = kicker(H * 0.2); y = text(sc.title, y + 44 * S, 48, { k: 1 }) + 40 * S;
    items.forEach((it, n) => { const r = R(2 + n); ctx.save(); ctx.globalAlpha *= r; ctx.translate(0, (1 - r) * 20 * S); const bx = cx - maxW / 2;
      ctx.fillStyle = th.glass; rrect(ctx, bx, y - 6 * S, maxW, 84 * S, 16 * S); ctx.fill(); ctx.strokeStyle = th.line; ctx.lineWidth = S; ctx.stroke();
      ctx.fillStyle = th.accent; ctx.beginPath(); ctx.arc(bx + 34 * S, y + 36 * S, 7 * S, 0, 7); ctx.fill();
      ctx.font = `500 ${25 * S}px ${SANS}`; ctx.fillStyle = th.ink; ctx.textAlign = "left"; const ls = wrap(ctx, it.text || it.label, maxW - 100 * S).slice(0, 2); ls.forEach((l, q) => ctx.fillText(l, bx + 62 * S, y + (ls.length > 1 ? 30 : 44) * S + q * 30 * S)); ctx.restore(); y += 100 * S; });
  } else if (sc.type === "cards" || sc.type === "stats") {
    let y = kicker(H * 0.16); y = text(sc.title, y + 44 * S, 46, { k: 1 }) + 40 * S;
    const wideRow = plan.aspect === "wide", n = items.length || 1, gap = 18 * S, cw = wideRow ? (maxW - gap * (n - 1)) / n : maxW, ch = Math.min((sc.type === "stats" ? 150 : wideRow ? 230 : 200) * S, wideRow ? 400 * S : (H - y - 120 * S) / n - gap);
    items.forEach((it, k) => { const r = R(2 + k), x = wideRow ? cx - maxW / 2 + k * (cw + gap) : cx - cw / 2, yy = wideRow ? y : y + k * (ch + gap);
      ctx.save(); ctx.globalAlpha *= r; ctx.translate(0, (1 - r) * 24 * S); ctx.fillStyle = th.glass; rrect(ctx, x, yy, cw, ch, 18 * S); ctx.fill(); ctx.strokeStyle = th.line; ctx.lineWidth = S; ctx.stroke();
      let ty = yy + 44 * S; ctx.textAlign = "left";
      if (it.value) { ctx.font = `700 ${(sc.type === "stats" ? 60 : 46) * S}px ${SANS}`; ctx.fillStyle = th.ink; ctx.fillText(it.value, x + 26 * S, ty + 22 * S); ty += 62 * S; }
      if (it.label) { ctx.font = `${it.value ? 500 : 650} ${(it.value ? 21 : 29) * S}px ${SANS}`; ctx.fillStyle = it.value ? th.faint : th.ink; ctx.fillText(it.label, x + 26 * S, ty + 6 * S); ty += 40 * S; }
      if (it.text) { ctx.font = `400 ${21 * S}px ${SANS}`; ctx.fillStyle = th.dim; wrap(ctx, it.text, cw - 52 * S).slice(0, 3).forEach((l, q) => ctx.fillText(l, x + 26 * S, ty + q * 28 * S)); }
      ctx.restore(); });
  } else if (sc.type === "image") {
    const im = imgs[sc.image], bw = Math.min(W - 80 * S, 900 * S), bh = H - (sc.title || sc.text ? 300 : 160) * S, bx = cx - bw / 2, by = 80 * S, r = ease(lt / 0.8);
    if (im && im.width) { ctx.save(); ctx.globalAlpha *= r; rrect(ctx, bx, by, bw, bh, 24 * S); ctx.clip();
      const k = Math.min(bw / im.width, bh / im.height) * (1 + 0.06 * (lt / dur)) , dw = im.width * k, dh = im.height * k; // fit whole picture, slow zoom
      ctx.fillStyle = th.glass; ctx.fillRect(bx, by, bw, bh); ctx.drawImage(im, cx - dw / 2, by + bh / 2 - dh / 2, dw, dh); ctx.restore();
      ctx.save(); ctx.globalAlpha *= r; ctx.strokeStyle = th.line; ctx.lineWidth = 2 * S; rrect(ctx, bx, by, bw, bh, 24 * S); ctx.stroke(); ctx.restore(); }
    const y = text(sc.title, by + bh + 56 * S, 36, { k: 2 }); text(sc.text, y + 14 * S, 23, { weight: 400, color: th.dim, k: 3 });
  } else if (sc.type === "code") {
    let y = kicker(H * 0.2); y = text(sc.title, y + 30 * S, 46, { k: 1 }) + 30 * S;
    const bw = maxW, lines = (sc.code || "").split("\n"), lh = 34 * S, bh = lines.length * lh + 56 * S, bx = cx - bw / 2;
    ctx.save(); ctx.globalAlpha *= R(2); ctx.fillStyle = th.glass; rrect(ctx, bx, y, bw, bh, 18 * S); ctx.fill(); ctx.strokeStyle = th.line; ctx.lineWidth = S; ctx.stroke(); ctx.restore();
    let shown = Math.floor(Math.max(0, lt - 0.7) * 38); ctx.font = `400 ${Math.min(21, 900 / Math.max(20, ...lines.map((l) => l.length)) * 1.45) * S}px ${MONO}`; ctx.textAlign = "left"; ctx.fillStyle = th.ink;
    lines.forEach((l, n) => { const part = l.slice(0, Math.max(0, shown)); shown -= l.length + 1; ctx.fillText(part, bx + 28 * S, y + 46 * S + n * lh); });
    text(sc.text, y + bh + 40 * S, 24, { weight: 400, color: th.dim, k: 4 });
  } else { // cta
    brand(H * 0.3, 0); const y = text(sc.title, H * 0.3 + 120 * S, 60, { k: 1, lh: 1.08 });
    const r = R(2), bwid = 380 * S, by = y + 50 * S; ctx.save(); ctx.globalAlpha *= r; ctx.translate(0, (1 - r) * 20 * S); ctx.fillStyle = th.ink; rrect(ctx, cx - bwid / 2, by, bwid, 76 * S, 38 * S); ctx.fill();
    ctx.fillStyle = th.bg; ctx.font = `650 ${27 * S}px ${SANS}`; ctx.textAlign = "center"; ctx.fillText(plan.cta_label || "Get started", cx, by + 48 * S); ctx.restore();
    text(sc.text, by + 140 * S, 24, { weight: 500, color: th.faint, font: MONO, k: 3 });
  }
  ctx.restore();
  ctx.globalAlpha = 1; ctx.fillStyle = th.accent; ctx.fillRect(0, H - 4 * S, W * (t / total), 4 * S); // progress line
}

// ---- music (synthesized, no audio files) --------------------------------------------------------------
const STYLES = {
  cinematic: { bpm: 120, chords: [[220, 261.63, 329.63, 110], [174.61, 220, 261.63, 87.31], [261.63, 329.63, 392, 130.81], [196, 246.94, 293.66, 98]], arpFrom: 4.5, kickFrom: 0, full: 4.5, hat: 9, pad: 0.05, arp: 0.1 },
  upbeat:    { bpm: 128, chords: [[261.63, 329.63, 392, 130.81], [196, 246.94, 293.66, 98], [220, 261.63, 329.63, 110], [174.61, 220, 261.63, 87.31]], arpFrom: 0, kickFrom: 0, full: 0, hat: 0, pad: 0.04, arp: 0.12 },
  calm:      { bpm: 84, chords: [[196, 246.94, 293.66, 98], [220, 261.63, 329.63, 110], [174.61, 220, 261.63, 87.31], [164.81, 196, 246.94, 82.41]], arpFrom: 3, kickFrom: 1e9, full: 1e9, hat: 1e9, pad: 0.06, arp: 0.07 },
};
function scheduleMusic(actx, out, style, total) {
  const m = STYLES[style]; if (!m) return; const B = 60 / m.bpm, t0 = actx.currentTime + 0.15;
  const osc = (type, f, s, d, v, cut) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.value = f; let n = o; if (cut) { const q = actx.createBiquadFilter(); q.type = "lowpass"; q.frequency.value = cut; o.connect(q); n = q; } n.connect(g);
    g.gain.setValueAtTime(0, t0 + s); g.gain.linearRampToValueAtTime(v, t0 + s + Math.min(0.04, d / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + s + d); g.connect(out); o.start(t0 + s); o.stop(t0 + s + d + 0.05); };
  const nb = actx.createBuffer(1, actx.sampleRate * 0.3, actx.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const hat = (s, v, hp, d) => { const n = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain(); n.buffer = nb; f.type = "highpass"; f.frequency.value = hp; g.gain.setValueAtTime(v, t0 + s); g.gain.exponentialRampToValueAtTime(0.0001, t0 + s + d); n.connect(f); f.connect(g); g.connect(out); n.start(t0 + s); n.stop(t0 + s + d); };
  const kick = (s) => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.setValueAtTime(140, t0 + s); o.frequency.exponentialRampToValueAtTime(42, t0 + s + 0.15); g.gain.setValueAtTime(0.9, t0 + s); g.gain.exponentialRampToValueAtTime(0.0001, t0 + s + 0.3); o.connect(g); g.connect(out); o.start(t0 + s); o.stop(t0 + s + 0.35); };
  for (let bar = 0; bar * 8 * B < total; bar++) { const c = m.chords[bar % 4], s = bar * 8 * B, len = Math.min(8 * B, total - s + 0.5);
    c.slice(0, 3).forEach((f, i) => { osc("sawtooth", f, s, len, m.pad, 900 + i * 200); osc("sawtooth", f * 1.006, s, len, m.pad * 0.8, 900); }); osc("sine", c[3], s, len, 0.3);
    for (let k = 0; k < 16; k++) { const ts = s + (k * B) / 2; if (ts >= m.arpFrom && ts < total - 1.5) osc("triangle", c[[0, 1, 2, 1][k % 4]] * (k % 8 > 3 ? 4 : 2), ts, 0.35, m.arp, 3500); } }
  for (let b = 0; b * B < total - 1.5; b++) { const ts = b * B; if (ts >= m.kickFrom && (ts >= m.full || b % 2 === 0)) kick(ts); if (ts >= m.full && ts >= m.hat) { hat(ts + B / 2, 0.12, 7000, 0.07); if (b % 2) hat(ts, 0.14, 1800, 0.18); } }
}

// ---- recording ----------------------------------------------------------------------------------------
export function loadImages(urls) {
  return Promise.all((urls || []).map((u) => new Promise((res) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => res(null); im.src = u; })));
}
export function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  return ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) || null;
}
// Plays the storyboard on `canvas` in real time while recording it. Resolves { blob, ext, mime, seconds }.
export async function renderVideo(plan, canvas, { onProgress, signal } = {}) {
  const mime = pickMime(); if (!mime) throw new Error("Video recording is not supported in this browser. Try Chrome, Edge or a recent Safari.");
  const { W, H } = sizeOf(plan); canvas.width = W; canvas.height = H; const ctx = canvas.getContext("2d"), total = totalSeconds(plan), imgs = await loadImages(plan.images);
  const stream = canvas.captureStream(30); let actx = null;
  if (plan.music !== "none" && (window.AudioContext || window.webkitAudioContext)) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); await actx.resume(); const dest = actx.createMediaStreamDestination(), master = actx.createGain(); master.gain.value = 0.8;
      const comp = actx.createDynamicsCompressor(); master.connect(comp); comp.connect(dest); scheduleMusic(actx, master, plan.music, total);
      master.gain.setValueAtTime(0.8, actx.currentTime + Math.max(0, total - 2.2)); master.gain.linearRampToValueAtTime(0, actx.currentTime + 0.15 + total);
      dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr)); } catch { actx = null; }
  }
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: plan.aspect === "wide" ? 4_500_000 : 4_000_000, audioBitsPerSecond: 160_000 }), chunks = [];
  rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  const done = new Promise((res) => { rec.onstop = res; });
  return new Promise((resolve, reject) => {
    let t0 = 0, stopped = false;
    const finish = async (err) => { if (stopped) return; stopped = true; clearInterval(timer); try { rec.state !== "inactive" && rec.stop(); } catch { /* already stopped */ } stream.getTracks().forEach((tr) => tr.stop()); await done; try { actx?.close(); } catch { /* ignore */ }
      if (err) return reject(err); resolve({ blob: new Blob(chunks, { type: mime.split(";")[0] }), ext: mime.startsWith("video/mp4") ? "mp4" : "webm", mime, seconds: total }); };
    signal?.addEventListener("abort", () => finish(Object.assign(new Error("Cancelled"), { name: "AbortError" })));
    const tick = () => { const t = (performance.now() - t0) / 1000; drawFrame(ctx, plan, Math.min(t, total - 0.001), imgs); onProgress?.(Math.min(1, t / total)); if (t >= total + 0.2) finish(); };
    const timer = setInterval(tick, 1000 / 30); // an interval (not requestAnimationFrame) keeps recording if the screen dims for a moment
    drawFrame(ctx, plan, 0, imgs); rec.start(250); t0 = performance.now();
  });
}

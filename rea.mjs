// REA (Reverse Engineer Anything, github.com/morluto/rea) bridge for the chat.
// When the person attaches an app (.zip of an extracted app, or an .asar) and asks how it works / to reverse engineer it,
// the server unpacks it into a throw-away folder, runs REA's static analysis on it and hands the evidence to the AI as context.
// Install on the server once:  npm install -g rea-agents   (needs Node 22.23+; on Linux a procps-compatible `ps`).
// Also handles single native files: Windows .exe/.dll (PE), Linux ELF, macOS Mach-O and Android .apk (found by their first bytes, not the file name,
// because the uploader renames unknown files to .bin). Files are only read by REA, never run.
// Env: REA_BIN (default "rea"), REA_TIMEOUT_MS (default 120000, per JS run), REA_NATIVE_TIMEOUT_MS (default 240000, per native step),
// REA_PROVIDER (ghidra | hopper | ida, default: let REA pick), REA_MAX_CHARS (default 30000), REA_ENABLED=0 to switch off.
// Native decompiling needs Ghidra (or Hopper/IDA) installed on the server: see REA-SETUP.txt. Without one, the provider-free checks still run.
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const reaLocalBin = () => { try { const p = path.join(path.dirname(fileURLToPath(import.meta.url)), 'node_modules', '.bin', 'rea'); return existsSync(p) ? p : 'rea'; } catch { return 'rea'; } };
const REA_BIN = process.env.REA_BIN || reaLocalBin();
const TIMEOUT = Number(process.env.REA_TIMEOUT_MS) || 120000;
const MAX_CHARS = Number(process.env.REA_MAX_CHARS) || 30000;
const NATIVE_TIMEOUT = Number(process.env.REA_NATIVE_TIMEOUT_MS) || 240000;
const PROVIDER = process.env.REA_PROVIDER || '';
const MAX_FILES = 8000;
const MAX_UNPACKED = 250 * 1024 * 1024;

export const reaEnabled = () => process.env.REA_ENABLED !== '0';

// "reverse engineer this app", "how does the search work in this", "decompile", "analyse this electron app" ...
const INTENT = /\b(reverse[- ]?eng+i*n+e+[ae]*r\w*|rev[ae]rse[- ]?eng\w*|re[vs][a-z]{2,6}[- ]*en+g[a-z]*|re[- ]?engineer|decompil|disassembl|deobfuscat|how (does|do|is|did) .{0,60}(work|built|made|implemented)|how .{0,40}(works|implemented)|what does (this|the|my) .{0,30}(do|contain)|analy[sz]e (this|the|my) .{0,30}(app|apk|binary|exe|dll|asar|electron|bundle|site|website|file)|inspect (this|the) .{0,30}(app|binary|exe|apk|asar|bundle)|\b(strings|imports|decompile|pseudocode)\b|rea\b)/i;
export const wantsRea = (text = '') => INTENT.test(String(text).slice(0, 2000));

const isAsar = (name = '') => /\.asar$/i.test(name);

// What kind of thing is this? Looks at the first bytes (and inside a ZIP). 'unknown' = not for REA (text, pdf, docx ...).
export async function detectKind(bytes, name = '') {
  if (!bytes || bytes.length < 16) return 'unknown';
  const b = bytes;
  if (isAsar(name)) return 'asar';
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) {
    if (/\.(docx|xlsx|pptx|odt|epub)$/i.test(name)) return 'unknown';
    try {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(b);
      if (zip.file('AndroidManifest.xml') && Object.keys(zip.files).some((n) => /^classes\d*\.dex$/.test(n))) return 'apk';
      if (zip.file('[Content_Types].xml') || zip.file('word/document.xml')) return 'unknown';
      return 'jsapp';
    } catch { return 'unknown'; }
  }
  if (b[0] === 0x4d && b[1] === 0x5a) return 'pe';
  if (b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46) return 'elf';
  const m = b.readUInt32BE ? b.readUInt32BE(0) : 0;
  if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe].includes(m)) return 'macho';
  if (m === 0xcafebabe) return b.readUInt32BE(4) >= 45 ? 'class' : 'macho'; // Java class vs universal Mach-O
  if (m === 0x0061736d || (b[0] === 0x00 && b[1] === 0x61 && b[2] === 0x73 && b[3] === 0x6d)) return 'wasm';
  const head = b.slice(0, 16).toString('latin1');
  if (head.startsWith('SQLite format 3')) return 'sqlite';
  if (head.startsWith('GGUF')) return 'model';
  if (head.startsWith('GDPC')) return 'godot';
  if (head.startsWith('dex\n')) return 'dex';
  if ([0xd4c3b2a1, 0xa1b2c3d4, 0x0a0d0d0a].includes(m)) return 'pcap';
  // Anything else that is clearly binary (not text, not a picture/video/PDF/archive) can still be looked at by REA's generic artifact inspector.
  const media = ['%PDF', '\x89PNG', 'GIF8', 'RIFF', 'ID3', 'OggS', 'fLaC', '7z\xbc\xaf', 'Rar!'];
  if (media.some((x) => head.startsWith(x)) || (b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x1f && b[1] === 0x8b) || head.slice(4, 8) === 'ftyp') return 'unknown';
  let nul = 0; const n = Math.min(b.length, 4000); for (let i = 0; i < n; i++) if (b[i] === 0) nul++;
  return nul > 0 ? 'binary' : 'unknown';
}

// Unpack a ZIP safely (no "../" or absolute names, capped size and file count). Returns the folder.
export async function unpackZip(bytes, dir) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(bytes);
  const root = path.resolve(dir);
  let files = 0, total = 0;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const rel = entry.name.replace(/\\/g, '/');
    if (rel.startsWith('/') || rel.split('/').includes('..') || /^[a-z]:/i.test(rel)) continue;
    if (++files > MAX_FILES) throw new Error('too many files in the archive');
    const out = path.resolve(root, rel);
    if (!out.startsWith(root + path.sep)) continue;
    const buf = await entry.async('nodebuffer');
    total += buf.length;
    if (total > MAX_UNPACKED) throw new Error('archive is too large once unpacked');
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, buf);
  }
  if (!files) throw new Error('the archive is empty');
  return root;
}

const run = (args, timeout = TIMEOUT) => new Promise((resolve) => {
  execFile(REA_BIN, args, { timeout, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NO_COLOR: '1' } }, (err, stdout, stderr) => {
    resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || ''), code: err?.code, missing: err?.code === 'ENOENT', timedOut: Boolean(err?.killed) });
  });
});

// Trim REA's JSON evidence to something the AI can read: keep it valid-looking, cut the long tail.
function shrink(text, max = MAX_CHARS) {
  let t = text.trim();
  try { t = JSON.stringify(JSON.parse(t), null, 1); } catch { /* keep raw */ }
  return t.length > max ? t.slice(0, max) + '\n... (evidence cut here, ask for a specific part to dig deeper)' : t;
}

// A search word taken from what the person asked: "search" -> from 'how does the search work in this app'.
export function keywordFrom(text = '') {
  const t = String(text).slice(0, 1500);
  let m = t.match(/["'“‘`]([^"'”’`]{3,40})["'”’`]/);
  if (m) return m[1].trim();
  m = t.match(/\bhow (?:does|do|is|did)\s+(?:the\s+|this\s+|its\s+|their\s+)?([a-z][\w -]{2,30}?)\s+(?:work|function|implemented|built|made)/i);
  if (m) return m[1].trim().split(/\s+/).slice(-2).join(' ');
  m = t.match(/\b(?:search for|find|trace|locate|where is|look for)\s+(?:the\s+)?([\w-]{3,30})/i);
  return m ? m[1] : '';
}

const NATIVE_STEPS = {
  pe: (f) => [['PE imports', ['inspect-pe-imports', f, '--json']], ['PE certificates', ['inspect-pe-certificates', f, '--json']]],
  elf: (f) => [['ELF notes', ['inspect-elf-notes', f, '--json']]],
  macho: () => [],
  sqlite: (f) => [['SQLite database', ['inspect-sqlite-database', f, '--json']]],
  wasm: (f) => [['WebAssembly module', ['inspect-wasm-artifact', f, '--json']]],
  model: (f) => [['Model file', ['inspect-model-artifact', f, '--json']]],
  godot: (f) => [['Godot pack', ['inspect-artifact', f, '--detail', 'summary', '--json']]],
  pcap: (f) => [['Packet capture', ['inspect-artifact', f, '--detail', 'summary', '--json']]],
  dex: (f) => [['Dalvik code', ['inspect-artifact', f, '--detail', 'summary', '--json']]],
  class: (f) => [['Java class', ['inspect-artifact', f, '--detail', 'summary', '--json']]],
  binary: (f) => [['Generic binary / firmware', ['inspect-artifact', f, '--detail', 'summary', '--json']]],
  apk: (f, kw) => [['Android package', ['inspect-android-package', f, '--json']], ...(kw ? [[`Android classes matching "${kw}"`, ['search-android-classes', f, kw, '--json']]] : [])],
};

/**
 * Runs REA on an attached app or binary. `bytes` = file bytes, `name` = file name, `opts.query` = what the person asked.
 * Returns { ok, context } - context is a string for the AI prompt (also on failure, so the AI can say so honestly).
 */
export async function analyzeWithRea(bytes, name = 'app', opts = {}) {
  const work = await mkdtemp(path.join(os.tmpdir(), 'rea-'));
  const noRea = { ok: false, context: '\nThe user asked for a reverse-engineering analysis, but the REA tool is not installed on this server (run "npm install -g rea-agents"). Tell the user honestly that the REA analysis could not run, and answer only from what you can read in their files.' };
  try {
    const kind = await detectKind(bytes, name);
    if (kind === 'unknown') return { ok: false, context: '' };

    if (kind === 'jsapp' || kind === 'asar') {
      let target;
      if (kind === 'asar') { target = path.join(work, 'app.asar'); await writeFile(target, bytes); }
      else {
        target = await unpackZip(bytes, path.join(work, 'app'));
        const { readdir } = await import('node:fs/promises');
        const top = await readdir(target, { withFileTypes: true });
        if (top.length === 1 && top[0].isDirectory()) target = path.join(target, top[0].name);
      }
      const r = await run(['analyze-javascript-application', target, '--json']);
      if (r.missing) return noRea;
      if (r.timedOut) return { ok: false, context: '\nThe REA analysis timed out on this app (it is probably too big). Tell the user honestly and suggest sending a smaller part of it.' };
      if (!r.ok && !r.stdout.trim()) return { ok: false, context: `\nThe REA analysis failed: ${r.stderr.trim().slice(0, 400) || 'unknown error'}. Tell the user honestly that it failed.` };
      return { ok: true, context: `\nREA (reverse-engineering tool) analysed the attached app "${name}" and produced the evidence below. Explain how the feature the user asked about works, citing the module names, imports and Electron boundaries it lists as evidence. Say clearly what the evidence does not show. Do not invent code that is not in the evidence.\n<<<\n${shrink(r.stdout)}\n>>>` };
    }

    // Native file: PE / ELF / Mach-O / APK. Written under a safe name with a matching extension, then inspected step by step.
    const ext = { pe: '.exe', apk: '.apk', sqlite: '.sqlite', wasm: '.wasm', model: '.gguf', godot: '.pck', pcap: '.pcap', dex: '.dex', class: '.class' }[kind] || '';
    const target = path.join(work, 'target' + ext);
    await writeFile(target, bytes);
    const kw = keywordFrom(opts.query);
    const steps = [...(NATIVE_STEPS[kind]?.(target, kw) || [])];
    if (['pe', 'elf', 'macho', 'binary'].includes(kind)) {
      const prov = PROVIDER ? ['--provider', PROVIDER] : [];
      steps.push(['Go build info (only if this is a Go program)', ['inspect-go-binary', target, '--json'], true]);
      steps.push(['Rust build info (only if this is a Rust program)', ['inspect-rust-binary', target, '--json'], true]);
      steps.push(['Disassembler/decompiler overview', ['analyze', target, ...prov, '--json'], false, NATIVE_TIMEOUT]);
      if (kw) steps.push([`Search for "${kw}" in the program`, ['search', target, kw, ...prov, '--json'], false, NATIVE_TIMEOUT]);
    }
    const parts = []; const notes = [];
    const share = Math.max(4000, Math.floor(MAX_CHARS / Math.max(1, steps.length)));
    for (const [label, args, optional, to] of steps) {
      const r = await run(args, to || TIMEOUT);
      if (r.missing) return noRea;
      if (r.ok && r.stdout.trim()) { parts.push(`### ${label}\n${shrink(r.stdout, share)}`); continue; }
      if (optional) continue;
      const why = r.timedOut ? 'timed out' : (r.stderr.trim() || r.stdout.trim() || 'failed').slice(0, 300);
      notes.push(`- ${label}: ${why}`);
    }
    if (!parts.length) return { ok: false, context: `\nREA could not analyse this ${kind.toUpperCase()} file. Reasons:\n${notes.join('\n')}\nTell the user honestly. If the reason mentions a missing provider, say the server owner still has to install Ghidra (or Hopper/IDA) for deep native analysis.` };
    return { ok: true, context: `\nREA (reverse-engineering tool) inspected the attached ${kind.toUpperCase()} file "${name}" statically (it was never run). The evidence is below. Explain what the program does and how the feature the user asked about works, citing function names, imports, strings and addresses from the evidence. Say clearly what the evidence does not show. Never invent code, functions or addresses that are not listed.${notes.length ? `\nSteps that did not work (tell the user briefly):\n${notes.join('\n')}` : ''}\n<<<\n${parts.join('\n\n')}\n>>>` };
  } catch (e) {
    return { ok: false, context: `\nThe attached file could not be prepared for REA analysis (${String(e.message).slice(0, 200)}). Tell the user honestly.` };
  } finally {
    rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

// Puts the attached file into `work` the way REA wants it and returns the absolute path to hand to REA (a folder for JS apps).
export async function prepareTarget(bytes, name, kind, work) {
  if (kind === 'asar') { const t = path.join(work, 'app.asar'); await writeFile(t, bytes); return t; }
  if (kind === 'jsapp') {
    let t = await unpackZip(bytes, path.join(work, 'app'));
    const { readdir } = await import('node:fs/promises');
    const top = await readdir(t, { withFileTypes: true });
    if (top.length === 1 && top[0].isDirectory()) t = path.join(t, top[0].name);
    return t;
  }
  const ext = { pe: '.exe', apk: '.apk', sqlite: '.sqlite', wasm: '.wasm', model: '.gguf', godot: '.pck', pcap: '.pcap', dex: '.dex', class: '.class' }[kind] || '';
  const t = path.join(work, 'target' + ext);
  await writeFile(t, bytes);
  return t;
}

// Context for "reverse engineer this" when nothing was attached / linked, so the AI helps instead of refusing.
export const REA_NO_FILE_CONTEXT = `
The user asked for reverse engineering / app analysis. In Xyron this is a normal, supported request (static analysis of apps, APKs, binaries, Electron/JS bundles, websites and repos the user owns, is allowed to study, or that are public/open source) - treat it like any other coding task and do NOT refuse it or say you cannot help.
No file or link came with this message, so: briefly say what you can do (explain how the app is built, trace a feature, read its code/bundle, map its APIs and data flow), ask them to attach the file (ZIP, .apk, .exe, .dll, .asar) or paste a public GitHub link, and give the approach you would take. If they pasted code or earlier messages contain the app's files, work from that right away.
Still decline only clearly harmful asks: writing malware, stealing credentials/data, or removing licensing/payment protection from software they have no right to modify. Decline those briefly and offer the legitimate alternative.`;

// Only the explicit wording (not "how does X work"), used for the no-file fallback above.
export const saysReverseEngineer = (text = '') => /\b(reverse[- ]?eng\w*|rev[ae]rse[- ]?eng\w*|re[vs][a-z]{2,6}[- ]*en+g[a-z]*|re[- ]?engineer|decompil\w*|disassembl\w*|deobfuscat\w*|rea)\b/i.test(String(text).slice(0, 2000));

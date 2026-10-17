// Xyron Memory: things the person explicitly chose to save (preferences, coding languages, writing style,
// ongoing projects, decisions). Stored on this device in localStorage. Each project has its own memory;
// "global" items apply everywhere. Nothing is saved unless the person asks (a "remember ..." message or the
// Memory settings page).

const KEY = "xryon_memory_v1";
const MAX_ITEMS = 300;
const MAX_TEXT = 500;
export const GLOBAL = "global";

export const MEMORY_TYPES = [
  { key: "preference", label: "Preference" },
  { key: "language", label: "Coding language" },
  { key: "writing", label: "Writing style" },
  { key: "project", label: "Project detail" },
  { key: "decision", label: "Decision" },
];

const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const empty = () => ({ enabled: true, activeProject: GLOBAL, projects: [], items: [] });

function read() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "null");
    if (d && typeof d === "object") return { ...empty(), ...d, projects: d.projects || [], items: d.items || [] };
  } catch { /* corrupt or unavailable */ }
  return empty();
}

const listeners = new Set();
function write(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage full or unavailable */ }
  listeners.forEach((fn) => fn());
}
export const subscribeMemory = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export const getMemory = () => read();
export const setMemoryEnabled = (on) => write({ ...read(), enabled: !!on });

// ------------------------------------------------------------------ projects
export function addProject(name) {
  const clean = String(name || "").trim().slice(0, 60);
  if (!clean) return null;
  const d = read();
  const found = d.projects.find((p) => p.name.toLowerCase() === clean.toLowerCase());
  if (found) return found;
  const project = { id: uid(), name: clean, createdAt: Date.now() };
  write({ ...d, projects: [...d.projects, project] });
  return project;
}

export function renameProject(id, name) {
  const clean = String(name || "").trim().slice(0, 60);
  if (!clean) return;
  const d = read();
  write({ ...d, projects: d.projects.map((p) => (p.id === id ? { ...p, name: clean } : p)) });
}

// Deleting a project deletes its memories too.
export function deleteProject(id) {
  const d = read();
  write({
    ...d,
    projects: d.projects.filter((p) => p.id !== id),
    items: d.items.filter((i) => i.scope !== id),
    activeProject: d.activeProject === id ? GLOBAL : d.activeProject,
  });
}

export function setActiveProject(id) {
  const d = read();
  write({ ...d, activeProject: id === GLOBAL || d.projects.some((p) => p.id === id) ? id : GLOBAL });
}

// ------------------------------------------------------------------ items
export function classify(text) {
  const t = String(text || "");
  if (/\b(decided|decision|we(?:'re| are) going with|going with|i chose|we chose|settled on|agreed (?:to|on))\b/i.test(t)) return "decision";
  if (/\b(javascript|typescript|python|java|kotlin|swift|rust|golang|go lang|c\+\+|c#|php|ruby|dart|sql|bash|react|node|vue|svelte|django|flask|laravel)\b/i.test(t)
    && /\b(prefer|use|using|always|code|coding|write|stack|language)\b/i.test(t)) return "language";
  if (/\b(tone|writing|write (?:in|with)|style|formal|casual|concise|friendly|voice|essay|email|bullet|paragraph)\b/i.test(t)) return "writing";
  if (/\b(project|building|app|website|bot|repo|working on)\b/i.test(t)) return "project";
  return "preference";
}

export function addItem({ text, type, scope } = {}) {
  const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
  if (!clean) return null;
  const d = read();
  const where = scope || d.activeProject || GLOBAL;
  const dupe = d.items.find((i) => i.scope === where && i.text.toLowerCase() === clean.toLowerCase());
  if (dupe) return dupe;
  const now = Date.now();
  const item = { id: uid(), scope: where, type: type || classify(clean), text: clean, createdAt: now, updatedAt: now };
  write({ ...d, items: [item, ...d.items].slice(0, MAX_ITEMS) });
  return item;
}

export function updateItem(id, patch) {
  const d = read();
  write({
    ...d,
    items: d.items.map((i) => (i.id === id
      ? { ...i, ...patch, text: patch.text != null ? String(patch.text).replace(/\s+/g, " ").trim().slice(0, MAX_TEXT) || i.text : i.text, updatedAt: Date.now() }
      : i)),
  });
}

export function deleteItem(id) {
  const d = read();
  write({ ...d, items: d.items.filter((i) => i.id !== id) });
}

export function clearAllMemory() {
  const d = read();
  write({ ...empty(), enabled: d.enabled });
}

// ------------------------------------------------------------------ export / import
export function exportMemory() {
  const d = read();
  return JSON.stringify({ app: "xyron", kind: "memory", version: 1, exportedAt: new Date().toISOString(), projects: d.projects, items: d.items }, null, 2);
}

export function importMemory(json) {
  const data = JSON.parse(json);
  if (!data || data.kind !== "memory" || !Array.isArray(data.items)) throw new Error("This isn't a Xyron memory export.");
  const d = read();
  const projects = [...d.projects];
  for (const p of data.projects || []) if (p?.id && p?.name && !projects.some((x) => x.id === p.id)) projects.push({ id: p.id, name: String(p.name).slice(0, 60), createdAt: p.createdAt || Date.now() });
  const items = [...d.items];
  for (const i of data.items) {
    if (!i?.text || items.some((x) => x.id === i.id)) continue;
    const scope = i.scope === GLOBAL || projects.some((p) => p.id === i.scope) ? i.scope : GLOBAL;
    items.push({ id: i.id || uid(), scope, type: i.type || classify(i.text), text: String(i.text).slice(0, MAX_TEXT), createdAt: i.createdAt || Date.now(), updatedAt: i.updatedAt || Date.now() });
  }
  write({ ...d, projects, items: items.slice(0, MAX_ITEMS) });
  return items.length - d.items.length;
}

// ------------------------------------------------------------------ chat commands
// Only explicit requests count. Returns { reply } when the message was a memory command, otherwise null.
const REMEMBER = /^\s*(?:please\s+)?(?:remember|memorize|save (?:this )?(?:to|in) (?:my )?memory)\s*(?:that|this)?\s*[:,\-–]?\s*([\s\S]{3,})$/i;
const SWITCH = /^\s*(?:switch to|use|open|work on)\s+project\s*[:,\-–]?\s*(.{1,60}?)\s*[.!]?\s*$/i;
const NO_PROJECT = /^\s*(?:leave|exit|close|stop using)\s+(?:the\s+)?(?:current\s+)?project\s*[.!]?\s*$/i;

export function handleMemoryCommand(text) {
  const t = String(text || "");
  if (t.length > 700 || t.includes("\n\n\n")) return null;
  const sw = t.match(SWITCH);
  if (sw) {
    const p = addProject(sw[1]);
    if (!p) return null;
    setActiveProject(p.id);
    return { reply: `Switched to project **${p.name}**. I'll use what you've saved for it, and anything you ask me to remember now goes there.` };
  }
  if (NO_PROJECT.test(t)) {
    setActiveProject(GLOBAL);
    return { reply: "Left the project. New memories will be saved as general (not tied to any project)." };
  }
  const rem = t.match(REMEMBER);
  if (rem) {
    const d = read();
    if (!d.enabled) return { reply: "Memory is turned off. Turn it on in **Settings → Memory** and I'll save that." };
    const item = addItem({ text: rem[1] });
    if (!item) return null;
    const project = d.projects.find((p) => p.id === item.scope);
    const label = MEMORY_TYPES.find((x) => x.key === item.type)?.label.toLowerCase() || "note";
    return { reply: `Saved ${project ? `to **${project.name}**` : "to your general memory"} as a ${label}: "${item.text}"\n\nYou can view, edit, export or delete it in **Settings → Memory**.` };
  }
  return null;
}

// ------------------------------------------------------------------ prompt for the model
export function buildMemoryPrompt() {
  const d = read();
  if (!d.enabled || !d.items.length) return "";
  const active = d.projects.find((p) => p.id === d.activeProject);
  const pick = (scope) => d.items.filter((i) => i.scope === scope).sort((a, b) => b.updatedAt - a.updatedAt);
  const fmt = (list) => list.map((i) => `- [${i.type}] ${i.text}`).join("\n");
  const general = pick(GLOBAL).slice(0, 25);
  const proj = active ? pick(active.id).slice(0, 40) : [];
  if (!general.length && !proj.length) return "";
  let out = "Saved memory: the person explicitly asked you to remember the following. Apply it silently where it is relevant (their preferences, languages, writing style), and when they continue a task, build on earlier decisions instead of re-asking. Don't recite memory unless asked. If a request conflicts with a saved decision, point that out briefly before proceeding. Memory is saved only when the person asks; never claim to have saved anything yourself.";
  if (general.length) out += `\n\nGeneral memory:\n${fmt(general)}`;
  if (proj.length) out += `\n\nCurrent project "${active.name}" (memory for this project only):\n${fmt(proj)}`;
  return out.slice(0, 5000);
}

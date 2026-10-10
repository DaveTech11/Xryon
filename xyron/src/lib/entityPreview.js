// Rich entity previews (person, company, place, product, animal, film, game…).
// Data comes only from Wikipedia (summary + images) and Wikidata (quick facts),
// through their public CORS-enabled APIs. Nothing is generated or guessed: if a
// piece isn't returned by those sources it is simply left out.

const WP = "https://en.wikipedia.org";
const WD = "https://www.wikidata.org/w/api.php";

// Commands whose input may be a lookup; everything else with a "/" is skipped.
const ALLOWED_COMMANDS = new Set(["/search", "/research", "/facts", "/overview", "/ask", "/magic"]);
const BARE_LOOKUP_COMMANDS = new Set(["/search", "/facts", "/overview"]);

const LEAD = /^(?:(?:can|could) you )?(?:please )?(?:tell me (?:more )?about|who(?:'s| is| was| are| were)|what(?:'s| is| was| are| were)|where(?:'s| is| was)|show me|give me (?:info|information|details) (?:on|about)|info(?:rmation)? (?:on|about)|describe|research|look up|search(?: for| up)?|find (?:out )?(?:about )?|google)\s+/i;
const REJECT_WORDS = /\b(difference|best|worst|top|latest|meaning|purpose|reason|how|why|when|much|many|my|your|our|you|i|me|we|it|this|that|these|those|do|does|did|should|could|would|can|will|not|between|versus|vs)\b/i;
const RELATIONAL = /^(?:the\s+)?(?:president|ceo|founder|capital|mayor|head|owner|leader|king|queen|prime minister|population|currency|weather|time|date|price|score|result)\b/i;

// -> { query, kind } when the message asks about a nameable thing, else null.
export function detectEntityQuery(text = "", { command = null, hasFiles = false } = {}) {
  if (hasFiles) return null;
  let raw = text.trim();
  let bare = false;
  if (command) {
    if (!ALLOWED_COMMANDS.has(command.cmd.command)) return null;
    raw = command.arg || "";
    bare = BARE_LOOKUP_COMMANDS.has(command.cmd.command);
  } else if (raw.startsWith("/")) return null;

  raw = raw.replace(/[?!.\s]+$/, "").trim();
  if (!raw || raw.length > 80 || /\n/.test(raw)) return null;

  const m = raw.match(LEAD);
  let q; let kind = "lookup";
  if (m) {
    q = raw.slice(m[0].length);
    const lead = m[0].toLowerCase();
    kind = lead.startsWith("who") ? "who" : lead.startsWith("where") ? "where" : "lookup";
  } else if (bare && raw.split(/\s+/).length <= 5 && !/[,;]/.test(raw)) {
    q = raw;
  } else if (!command && raw.split(/\s+/).length <= 4 && !/[,:;]/.test(raw) && /^[A-Z0-9]/.test(raw)) {
    // Bare, un-prefixed proper-noun-looking input, e.g. just typing "Tesla" —
    // "Xyron knows what this is": recognized as a possible entity even
    // without a question, a command, or a lead phrase.
    q = raw; kind = "named";
  } else return null;

  q = q.replace(/\s+(please|for me|on wikipedia)$/i, "").trim();
  if (!q || /^(a|an)\s/i.test(q)) return null;
  if (q.split(/\s+/).length > 6 || REJECT_WORDS.test(q) || RELATIONAL.test(q)) return null;
  if (kind === "who" && /\sof\s/i.test(q) && /^the\s/i.test(q)) return null;
  return { query: q.replace(/^the\s+/i, ""), kind };
}

// ---- helpers ---------------------------------------------------------------
async function getJson(url, ms = 7000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; } finally { clearTimeout(t); }
}

const STOP = new Set(["the", "a", "an", "of", "and", "in"]);
const tokens = (s) => (s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[\p{L}\p{N}]+/gu) || []).filter((w) => !STOP.has(w));

function titleMatches(title, query) {
  const t = new Set(tokens(title.replace(/\(.*?\)/g, "")));
  const q = tokens(query);
  return q.length > 0 && q.every((w) => t.has(w));
}

const ABBR = /\b(?:Inc|Ltd|Co|Corp|Dr|Mr|Mrs|Ms|Jr|Sr|St|vs|No|U\.S|U\.K|D\.C|Ph\.D)\.$/;
export function shortDescription(extract = "", maxSentences = 2, maxChars = 420) {
  const parts = extract.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=[A-Z"“(])/);
  const out = [];
  for (const p of parts) {
    if (out.length && ABBR.test(out[out.length - 1])) out[out.length - 1] += " " + p;
    else out.push(p);
  }
  let text = "";
  for (const s of out.slice(0, maxSentences)) {
    if (text && (text + " " + s).length > maxChars) break;
    text = text ? `${text} ${s}` : s;
  }
  return text.length > maxChars ? text.slice(0, maxChars).replace(/\s+\S*$/, "") + "…" : text;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function fmtTime(v) {
  const m = /^([+-])(\d+)-(\d\d)-(\d\d)/.exec(v?.time || "");
  if (!m) return null;
  const year = Number(m[2]); const mo = Number(m[3]); const d = Number(m[4]);
  const y = m[1] === "-" ? `${year} BC` : String(year);
  if (v.precision >= 11 && mo && d) return `${MONTHS[mo - 1]} ${d}, ${y}`;
  if (v.precision === 10 && mo) return `${MONTHS[mo - 1]} ${y}`;
  return y;
}

// [label, property, type, max values]
const FACTS = [
  ["Born", "P569", "time"], ["Died", "P570", "time"], ["Occupation", "P106", "item", 3],
  ["Citizenship", "P27", "item", 2], ["Employer", "P108", "item", 2], ["Notable work", "P800", "item", 2],
  ["Industry", "P452", "item", 2], ["Founded", "P571", "time"], ["Founder", "P112", "item", 3],
  ["CEO", "P169", "item", 1], ["Headquarters", "P159", "item", 1], ["Country", "P17", "item", 1],
  ["Located in", "P131", "item", 1], ["Capital", "P36", "item", 1], ["Population", "P1082", "qty"],
  ["Director", "P57", "item", 2], ["Released", "P577", "time"], ["Genre", "P136", "item", 3],
  ["Developer", "P178", "item", 2], ["Publisher", "P123", "item", 1], ["Platforms", "P400", "item", 4],
  ["Manufacturer", "P176", "item", 1], ["Country of origin", "P495", "item", 1],
  ["Conservation status", "P141", "item", 1], ["Rank", "P105", "item", 1], ["Parent taxon", "P171", "item", 1],
];
// A page only counts as a "real-world entity" if Wikidata gives it one of these.
const ENTITY_PROPS = ["P569", "P571", "P577", "P17", "P625", "P105", "P159", "P178", "P176", "P57", "P1082", "P36", "P495"];

// Coarse entity category for the card badge ("🏢 Company", "🎮 Game" …).
// Heuristic only, built from claims already fetched for FACTS — no extra
// Wikidata calls. Order matters: more specific categories are checked first.
const KIND_RULES = [
  ["animal", "🐾", "Animal", (h) => h("P171") || h("P105")],
  ["game", "🎮", "Game", (h) => h("P400") || h("P178")],
  ["movie", "🎬", "Movie / TV", (h) => h("P57")],
  ["product", "📦", "Product", (h) => h("P176")],
  ["company", "🏢", "Company", (h) => h("P169") || h("P452") || (h("P571") && h("P108"))],
  ["place", "📍", "Place", (h) => h("P36") || h("P131") || h("P1082") || h("P17")],
  ["book", "📖", "Book", (h) => h("P123") || h("P800")],
];
function detectKind(claims, isHuman) {
  if (isHuman) return { kind: "person", icon: "👤", label: "Person" };
  const has = (p) => !!claims[p];
  for (const [kind, icon, label, test] of KIND_RULES) if (test(has)) return { kind, icon, label };
  return null;
}
const claimValues = (claims, prop) => {
  const list = claims?.[prop] || [];
  const preferred = list.filter((c) => c.rank === "preferred");
  return (preferred.length ? preferred : list.filter((c) => c.rank !== "deprecated"))
    .map((c) => c.mainsnak?.snaktype === "value" ? c.mainsnak.datavalue?.value : null).filter(Boolean);
};

async function loadFacts(qid) {
  const data = await getJson(`${WD}?action=wbgetentities&ids=${qid}&props=claims&format=json&origin=*`);
  const claims = data?.entities?.[qid]?.claims;
  if (!claims) return null;
  const isHuman = claimValues(claims, "P31").some((v) => v.id === "Q5");
  const entityLike = isHuman || ENTITY_PROPS.some((p) => claims[p]);
  const badge = detectKind(claims, isHuman);

  const wanted = [];
  const ids = new Set();
  for (const [label, prop, type, max = 1] of FACTS) {
    const vals = claimValues(claims, prop).slice(0, max);
    if (!vals.length) continue;
    wanted.push({ label, type, vals });
    if (type === "item") vals.forEach((v) => v.id && ids.add(v.id));
  }
  const typeVals = isHuman ? [] : claimValues(claims, "P31").slice(0, 2);
  typeVals.forEach((v) => v.id && ids.add(v.id));

  let labels = {};
  if (ids.size) {
    const l = await getJson(`${WD}?action=wbgetentities&ids=${[...ids].slice(0, 50).join("|")}&props=labels&languages=en&format=json&origin=*`);
    for (const [id, e] of Object.entries(l?.entities || {})) if (e.labels?.en) labels[id] = e.labels.en.value;
  }
  const facts = [];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const typeLabels = typeVals.map((v) => labels[v.id]).filter(Boolean);
  if (typeLabels.length) facts.push({ label: "Type", value: cap(typeLabels.join(", ")) });
  for (const f of wanted) {
    let out;
    if (f.type === "time") out = fmtTime(f.vals[0]);
    else if (f.type === "qty") { const n = Number(f.vals[0].amount); out = Number.isFinite(n) ? n.toLocaleString("en-US") : null; }
    else out = f.vals.map((v) => labels[v.id]).filter(Boolean).map(cap).join(", ");
    if (out) facts.push({ label: f.label, value: out });
  }
  return { entityLike, badge, facts: facts.slice(0, 8) };
}

const BAD_IMAGE = /\.svg$|icon|symbol|flag_of|commons-logo|wikiquote|wiktionary|question_book|ambox|edit-clear|padlock|folder|disambig|increase2|decrease2|steady2/i;
const abs = (u) => (u?.startsWith("//") ? `https:${u}` : u);
const sized = (u, px) => (u && u.includes("/thumb/") ? u.replace(/\/\d+px-([^/]+)$/, `/${px}px-$1`) : u);

async function loadImages(title, summary, articleUrl) {
  const images = [];
  const seen = new Set();
  const push = (src, full, page) => {
    const key = (full || src || "").split("/").pop().replace(/^\d+px-/, "");
    if (!src || seen.has(key)) return;
    seen.add(key); images.push({ src, full: full || src, page });
  };
  const list = await getJson(`${WP}/api/rest_v1/page/media-list/${encodeURIComponent(title.replace(/ /g, "_"))}`);
  const items = (list?.items || []).filter((i) => i.type === "image" && i.showInGallery !== false && !BAD_IMAGE.test(i.title || ""));
  const lead = items.find((i) => i.leadImage);
  const filePage = (i) => `${WP}/wiki/${encodeURIComponent((i.title || "").replace(/ /g, "_"))}`;

  const leadSrc = summary.thumbnail?.source || summary.originalimage?.source;
  if (leadSrc) push(sized(leadSrc, 640), summary.originalimage?.source || sized(leadSrc, 1280), lead ? filePage(lead) : articleUrl);
  for (const i of [lead, ...items].filter(Boolean)) {
    const set = i.srcset || [];
    const base = abs(set[set.length - 1]?.src);
    if (base) push(sized(base, 640), sized(base, 1280), filePage(i));
    if (images.length >= 8) break;
  }
  return images.slice(0, 8);
}

// Returns a preview object, or null when there is nothing reliable to show.
export async function fetchEntityPreview({ query, kind }) {
  try {
    const s = await getJson(`${WP}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&srnamespace=0&format=json&origin=*`);
    const hit = (s?.query?.search || []).find((r) => titleMatches(r.title, query));
    if (!hit) return null;

    const summary = await getJson(`${WP}/api/rest_v1/page/summary/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`);
    if (!summary || summary.type !== "standard" || !summary.extract) return null;
    const articleUrl = summary.content_urls?.desktop?.page || `${WP}/wiki/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`;

    const [facts, images] = await Promise.all([
      summary.wikibase_item ? loadFacts(summary.wikibase_item) : Promise.resolve(null),
      loadImages(hit.title, summary, articleUrl),
    ]);
    // Without Wikidata to confirm it, only trust explicit "who/where is" questions.
    const entityLike = facts ? facts.entityLike : (kind === "who" || kind === "where");
    if (!entityLike) return null;

    const sources = [{ label: "Wikipedia", url: articleUrl }];
    if (facts?.facts.length) sources.push({ label: "Wikidata", url: `https://www.wikidata.org/wiki/${summary.wikibase_item}` });
    const description = shortDescription(summary.extract);
    const fullDescription = shortDescription(summary.extract, 6, 1400);
    return {
      status: "ready",
      title: summary.title,
      subtitle: summary.description || "",
      badge: facts?.badge || null,
      description,
      // Only set when there's genuinely more to read, so the UI can hide
      // the "More details" toggle when expanding wouldn't add anything.
      fullDescription: fullDescription.length > description.length ? fullDescription : null,
      images,
      facts: facts?.facts || [],
      sources,
      url: articleUrl,
    };
  } catch { return null; }
}


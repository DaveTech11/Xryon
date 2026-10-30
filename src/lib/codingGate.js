// Decides whether a message should get Xyron's coding rules (build the project, write every file in full,
// path= file blocks, ZIP downloads, "## Notes"). Those rules used to be sent with EVERY message, so the model
// acted like a coding agent even for naming, writing or advice questions (a "better team name" request came
// back as a .tsx file). Now they are sent only when the message is really about code. Code requests behave
// exactly as before; everything else gets the lighter general prompt.
import { wantsNames } from "./namingIntent.js";

const CODE_FENCE = /```/;
const CODE_FILE = /\b[\w-]+\.(?:py|js|jsx|ts|tsx|mjs|cjs|java|kt|go|rs|rb|php|c|cc|cpp|h|cs|swift|sql|sh|bat|html|css|scss|vue|svelte|json|yaml|yml|toml|zip)\b/i;
// words that only appear when somebody is talking about programming
const CODE_TOPIC = /\b(?:code|coding|coder|program(?:ming)?|script|scripts|bot|bots|app|apps|application|website|web\s?site|webpage|landing\s?page|api|apis|endpoint|server|backend|frontend|front-end|back-end|component|plugin|extension|function|module|dashboard|scraper|cli|query|regex|class|method|hook|library|package|npm|yarn|pnpm|pip|repo|repository|codebase|schema|database|sql|html|css|javascript|typescript|python|java|golang|rust|php|ruby|swift|kotlin|bash|shell|node(?:\.?js)?|react|vue|svelte|next\.?js|vite|express|django|flask|fastapi|tailwind|docker|git|github|webhook|json|yaml|bug|bugs|debug|error|exception|crash|stack\s?trace|compile|deploy|hosting|render|vercel|netlify|firebase|mongodb|mysql|postgres|supabase|telegram|whatsapp|discord|baileys|telegraf|zip|download(?:able)?)\b/i;
const FILE_ASK = /\b(?:file|files|project|source)\b.*\b(?:send|give|download|zip)\b|\b(?:send|give|download)\b.*\b(?:file|files|project|source)\b/i;
// a short reply that points back at what was just built ("add dark mode", "why did that fail", "fix it")
const POINTS_BACK = /\b(?:it|this|that|these|those|the code|the file|the files|the project|the app|the script|the bot|the error|again|continue|more|also|now|instead|add|change|update|remove|fix|why|how come)\b/i;

const hasPastedCode = (t) => CODE_FENCE.test(t) || (t.split("\n").length > 4 && /[{};=]|=>|\bdef\s|\bfunction\b|\bimport\s/.test(t));

// forced: the existing build / zip / command / wantsCode / wantsZipDownload checks already said yes.
export function needsCodingPrompts({ text = "", fileNames = [], history = [], forced = false } = {}) {
  if (forced) return true;
  const t = String(text || "");
  if (wantsNames(t)) return false;
  if (hasPastedCode(t) || CODE_FILE.test(t) || CODE_TOPIC.test(t) || FILE_ASK.test(t)) return true;
  if ((fileNames || []).some((n) => CODE_FILE.test(String(n || "")))) return true;
  // Follow-up to something just built: only when the last answer really contained code/files and this message points back at it
  const prev = [...history].reverse().find((m) => m && m.role === "assistant" && typeof m.content === "string");
  if (prev && CODE_FENCE.test(prev.content) && t.length <= 300 && POINTS_BACK.test(t)) return true;
  return false;
}

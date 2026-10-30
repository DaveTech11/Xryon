// Automatic model routing for Xryon chat ("Xyron Nexus Auto").
//
// Everything here is local and instant: plain rules over the whole request (latest message, a little of the
// conversation before it, attachments and the web-search switch). It never calls an AI model to classify.
// It only decides WHICH of the models Xryon already has should answer; it adds no provider, key or endpoint.
//
// classifyRequest()  -> { kind, level, useWeb, reasons }
// routeOf()          -> one of the seven named routes: fast_chat, general_chat, coding, reasoning, web_research,
//                       file_processing, image_generation (see ROUTES)
// pickTier()         -> the NEXUS model name that should answer ('Xyron Nexus V0 Mini' ... 'Xyron Nexus V1 Pro')
// trimHistory()      -> keeps only as much conversation as the level needs (less to send = faster)

import { isImageRequest } from './imageIntent.mjs';

export const AUTO_MODEL = 'Xyron Nexus Auto';

// ---- small helpers -------------------------------------------------------------------------------------
const norm = (s) => String(s || '').toLowerCase();
const words = (s) => norm(s).replace(/[^\p{L}\p{N}'\s]/gu, ' ').split(/\s+/).filter(Boolean);

const GREETING_WORDS = new Set((
  'hi hello hey heya hiya yo sup hola howdy greetings morning afternoon evening night good gm gn ' +
  'thanks thank thx ty you ok okay cool nice great bye goodbye cheers wassup whatsup what\'s up how are u ' +
  'doing today there bro boss dear oga abeg o please pls'
).split(/\s+/));

const FOLLOW_UP = /^(?:and\s+|now\s+|ok\s+|okay\s+|then\s+|also\s+|please\s+)?(?:continue|go on|keep going|more|again|try again|retry|why|how so|really|and\?|fix it|fix that|do it|do that|add (?:that|it|this)|make it (?:shorter|longer|better|faster|simpler)|shorter|longer|simplify|explain (?:that|it|more|further)|elaborate|what about (?:this|that|it)|same (?:for|with)|translate (?:it|that)|rewrite (?:it|that)|use (?:that|it))\b/i;

// ---- signal detectors ----------------------------------------------------------------------------------
const CODE_FENCE = /```/;
const STACK_TRACE = /\b(?:traceback \(most recent call last\)|uncaught \w*error|\w*(?:type|reference|syntax|range|value|key|attribute|import|module|runtime)error\b|\w+exception\b|segmentation fault|stack trace|cannot read propert|is not defined|is not a function|undefined is not|npm err!|err_[a-z_]+|exit code \d+|compilation failed|build failed|failed to compile|at \S+:\d+:\d+|line \d+, in )/i;
const FILE_EXT = /\b[\w-]+\.(?:py|js|jsx|ts|tsx|mjs|cjs|java|kt|go|rs|rb|php|c|cc|cpp|h|cs|swift|sql|sh|bat|ps1|html|css|scss|vue|svelte|json|yaml|yml|toml|dockerfile)\b/i;
const CODE_ACTION = /\b(?:build|create|make|write|code|develop|generate|implement|set\s?up|setup|add|fix|debug|refactor|rewrite|port|convert|optimi[sz]e|review|audit|deploy|patch|migrate|integrate|scaffold|program)\b/i;
const CODE_THING = /\b(?:code|coding|program|script|scripts|bot|app|application|website|web\s?site|webpage|landing\s?page|api|endpoint|server|backend|frontend|component|plugin|extension|game|function|module|dashboard|scraper|cli|query|regex|class|method|hook|library|package|repo|repository|codebase|schema|database|migration|html|css|javascript|typescript|python|java|golang|rust|php|ruby|swift|kotlin|sql|bash|shell|node(?:\.?js)?|react|vue|svelte|next\.?js|vite|express|django|flask|fastapi|tailwind|docker|git|webhook|json|yaml|bug|bugs|error|exception|crash|stack\s?trace|compile|build)\b/i;
const DEBUG_WORDS = /\b(?:debug|bug|bugs|fix|broken|not working|doesn'?t work|isn'?t working|crash(?:es|ing)?|error|exception|fails?|failing|stack\s?trace|undefined|null pointer)\b/i;
const NOT_CODING_Q = /^\s*(?:what\s+is|what's|what are|who\s+is|why|explain|define|tell me about|describe|difference between)\b/i;

// Things that make a coding request big: whole apps, several layers, a large pasted codebase, a ZIP project.
const HEAVY_CODE = /\b(?:full[\s-]?stack|entire|whole (?:app|project|codebase|site)|from scratch|end[\s-]to[\s-]end|architecture|microservices?|multi[\s-]?(?:file|page|tenant|user)|authentication|auth system|payment|stripe|real[\s-]?time|websocket|database schema|migration|refactor (?:the )?(?:whole|entire|codebase|project)|large codebase|codebase|monorepo|performance bottleneck|race condition|memory leak|concurrency|distributed|scalab|security (?:audit|review)|code review of|several files|many files|all files|admin panel|saas)\b/i;

const MATH_TERMS = /\b(?:solve|prove|proof|theorem|lemma|integral|integrate|derivative|differentiate|differential equation|equation|inequality|matrix|matrices|determinant|eigen\w*|vector|probability|permutation|combination|combinatorics|expected value|variance|standard deviation|logarithm|trigonometr\w*|calculus|algebra|geometry|modulo|prime|factorial|series|limit of|sequence|optimi[sz]ation|linear programming|bayes|regression|statistic\w*|compute|calculate|evaluate)\b/i;
const HARD_MATH = /\b(?:prove|proof|theorem|lemma|integral|integrate|differential equation|eigen\w*|determinant|combinatorics|bayes|optimi[sz]ation|linear programming|olympiad|rigorous|derive|derivation|maximi[sz]e|minimi[sz]e|convergen\w*|diverg\w*|taylor|fourier|laplace|number theory|modular arithmetic|game theory|markov|complex (?:math|problem|equation)|hard (?:math|problem))\b/i;
const LOGIC_WORDS = /\b(?:logic(?:al)? (?:puzzle|problem|riddle)|puzzle|riddle|paradox|deduce|deduction|reason (?:through|about|step)|step[\s-]by[\s-]step (?:reasoning|solution|proof)|think (?:hard|carefully|deeply)|trade[\s-]?offs?|weigh (?:the )?(?:pros|options)|strategy|strategic|decision analysis|root cause|first principles|analy[sz]e (?:the )?(?:situation|problem|argument|tradeoffs?)|critique (?:this|my) argument)\b/i;
const ARITHMETIC_ONLY = /^[\s\d.,+\-*/x×÷^%()=?]+$/;

const RESEARCH_WORDS = /\b(?:latest|newest|recent(?:ly)?|current(?:ly)?|today|tonight|yesterday|this (?:week|month|year)|right now|breaking|news|headlines?|update(?:s)? on|what'?s happening|trending|live (?:score|result)|price of|stock price|exchange rate|weather|who won|score of|release date|just (?:released|announced)|research|look up|search (?:the )?(?:web|internet|online)|find (?:out|sources)|sources? for|cite|according to)\b/i;
const YEAR_WORDS = /\b20(?:2[5-9]|3\d)\b/;

const WRITING_WORDS = /\b(?:write|draft|compose|rewrite|rephrase|paraphrase|proofread|edit|polish|improve|summari[sz]e|summary|tl;?dr|outline|essay|article|blog|post|caption|email|letter|cover letter|resume|cv|speech|story|poem|lyrics|script for|slogan|tagline|bio|description|report|proposal|press release|product description|newsletter|message|reply to)\b/i;
const SUMMARIZE_WORDS = /\b(?:summari[sz]e|summary|tl;?dr|key points|main points|recap|analy[sz]e (?:this|the) (?:text|article|document|pdf|file|report|essay|paper))\b/i;
const EXPLAIN_WORDS = /\b(?:explain|how does|how do|how can|how to|why (?:does|do|is|are|did)|what (?:is|are|does) (?:the )?(?:difference|meaning|purpose)|difference between|compare|comparison|versus|vs\.?|pros and cons|advantages|disadvantages|teach me|describe|elaborate|in detail|overview of|walk me through|guide (?:me|to)|tutorial|help me understand|tell me about|what is|what are|what does)\b/i;
const SIMPLE_FACT = /^\s*(?:what(?:'s| is| are| was)|who(?:'s| is| was)|when(?:'s| is| was| did)|where(?:'s| is| was)|which|how (?:many|much|old|far|tall|long|big)|is|are|do|does|did|can|will|capital of|define|meaning of|translate|spell|convert|synonym|antonym)\b/i;
const BASIC_TRANSFORM = /\b(?:translate|fix (?:the )?(?:grammar|spelling|typos?)|correct (?:the )?(?:grammar|spelling)|make (?:it )?(?:shorter|longer|formal|casual|polite)|uppercase|lowercase|capitali[sz]e|sort (?:these|this|the)|reverse (?:this|the)|rhyme|synonym|antonym|spell)\b/i;

// ---- classification ------------------------------------------------------------------------------------
function isGreeting(text) {
  const w = words(text);
  if (!w.length || w.length > 6) return false;
  if (w.every((x) => GREETING_WORDS.has(x))) return true;
  // "Hi 👋", "👋" - nothing but an emoji / punctuation, or a greeting word plus emoji
  const stripped = String(text || '').replace(/[\p{L}\p{N}\s'.,!?-]/gu, '');
  return !w.length && stripped.length > 0 && stripped.length <= 12;
}

function codeScore(text, ctx) {
  const t = String(text || '');
  let s = 0;
  const why = [];
  if (CODE_FENCE.test(t)) { s += 3; why.push('code block'); }
  if (STACK_TRACE.test(t)) { s += 3; why.push('error/stack trace'); }
  if (FILE_EXT.test(t)) { s += 1; why.push('file name'); }
  const action = CODE_ACTION.test(t);
  const thing = CODE_THING.test(t);
  if (action && thing && !NOT_CODING_Q.test(t)) { s += 3; why.push('build/fix + code subject'); }
  else if (thing && DEBUG_WORDS.test(t)) { s += 2; why.push('debug words'); }
  // a fence in the assistant's last answer plus a short follow-up ("now add dark mode") keeps us in coding
  if (ctx?.prevHadCode && t.length < 220) { s += 1; why.push('follow-up to code'); }
  return { score: s, why };
}

function mathScore(text) {
  const t = String(text || '');
  let s = 0;
  const why = [];
  const trimmed = t.trim();
  if (ARITHMETIC_ONLY.test(trimmed) && /\d/.test(trimmed)) return { score: 0, why: ['plain arithmetic'], plain: true };
  if (MATH_TERMS.test(t)) { s += 2; why.push('math terms'); }
  if (/\d\s*[+\-*/^=<>]\s*\d|\b\d+\s*(?:x|y|n)\b|[a-z]\s*\^\s*\d|∫|∑|√|π|\bsqrt\b|\bsin\b|\bcos\b|\blog\b/i.test(t)) { s += 1; why.push('expression'); }
  if (LOGIC_WORDS.test(t)) { s += 2; why.push('logic/analysis'); }
  return { score: s, why };
}

// One standalone pass over a single message. No history here; classifyRequest() adds context on top.
function classifyText(text, ctx = {}) {
  const t = String(text || '').trim();
  const w = words(t);
  const len = t.length;
  const out = { kind: 'general', level: 2, useWeb: false, reasons: [] };
  const why = (r) => out.reasons.push(r);

  if (!t) { out.kind = 'simple'; out.level = 1; why('empty'); return out; }

  // 1) greeting
  if (isGreeting(t)) { out.kind = 'greeting'; out.level = 1; why('greeting'); return out; }

  // 2) image generation is handled by the existing image pipeline; the written part only needs a quick model
  if (len < 600 && isImageRequest(t)) { // the same rule the chat page uses (imageIntent.mjs)
    out.kind = 'image'; out.level = 1; why('picture request (the image generator does the work)'); return out; }

  // 3) coding
  const code = codeScore(t, ctx);
  if (code.score >= 3) {
    out.kind = 'code';
    out.reasons.push(...code.why);
    const fences = (t.match(/```/g) || []).length / 2;
    const lines = t.split('\n').length;
    const heavy = HEAVY_CODE.test(t) || fences >= 3 || lines > 80 || len > 3500 || ctx.hasZip;
    const hardDebug = DEBUG_WORDS.test(t) && (len > 1800 || fences >= 2);
    out.level = heavy || hardDebug ? 3 : 2;
    why(out.level === 3 ? 'large/complex coding task' : 'everyday coding task');
    return out;
  }

  // 4) maths / logic
  const math = mathScore(t);
  if (math.plain) { out.kind = 'simple'; out.level = 1; why('plain arithmetic'); return out; }
  if (math.score >= 2) {
    out.kind = 'reasoning';
    out.reasons.push(...math.why);
    const hard = HARD_MATH.test(t) || LOGIC_WORDS.test(t) || len > 400 || /\b(?:complex|difficult|hard|advanced|challenging|tricky)\b/i.test(t);
    // easy maths ("what is 15% of 80", "calculate 12 * 7") stays on the fast model
    out.level = hard ? 3 : (len < 90 && w.length <= 14 ? 1 : 2);
    why(out.level === 3 ? 'hard maths/logic' : out.level === 2 ? 'moderate maths' : 'easy maths');
    return out;
  }

  // 5) research / current information
  if ((RESEARCH_WORDS.test(t) || YEAR_WORDS.test(t)) && !CODE_ACTION.test(t.slice(0, 30)) && !NOT_CODING_Q.test(t.replace(/^(?:what is|what's)\s+the\s+(?:latest|current)/i, ''))) {
    out.kind = 'research'; out.level = 2; out.useWeb = true; why('needs current information');
    return out;
  }
  if (RESEARCH_WORDS.test(t)) { out.kind = 'research'; out.level = 2; out.useWeb = true; why('needs current information'); return out; }

  // 6) summarising / writing
  if (SUMMARIZE_WORDS.test(t) || len > 1500) { out.kind = 'writing'; out.level = 2; why(len > 1500 ? 'long input' : 'summarisation'); return out; }
  if (WRITING_WORDS.test(t) && w.length > 3) { out.kind = 'writing'; out.level = 2; why('writing task'); return out; }

  // 7) explanations (even short ones) are general-purpose work
  if (EXPLAIN_WORDS.test(t)) {
    // "what is the capital of France" is a lookup, "explain what an API is" is an explanation
    const lookup = /^\s*(?:what(?:'s| is| are)|who(?:'s| is)|when|where)\b/i.test(t) && w.length <= 9 && !/\b(?:explain|how|why|difference|compare|describe|elaborate|detail)\b/i.test(t) && !/\b(?:api|framework|algorithm|protocol|database|blockchain|machine learning|neural|encryption|recursion|inflation|photosynthesis|quantum|theory|democracy|economy)\b/i.test(t);
    if (!lookup) { out.kind = 'general'; out.level = 2; why('explanation'); return out; }
  }

  // 8) basic transforms and simple factual questions
  if (BASIC_TRANSFORM.test(t) && len < 600) { out.kind = 'simple'; out.level = 1; why('basic text transformation'); return out; }
  if ((SIMPLE_FACT.test(t) || t.endsWith('?')) && w.length <= 14 && len <= 110) { out.kind = 'simple'; out.level = 1; why('short factual question'); return out; }
  if (w.length <= 6 && len <= 50) { out.kind = 'simple'; out.level = 1; why('very short message'); return out; }

  // 9) default: a general-purpose answer
  why('general conversation');
  return out;
}

// Whole-request classification: the latest message, a little of what came before it, attachments, the mode.
// ctx: { hasImages, hasZip, hasFiles, webSearch, mode }
export function classifyRequest(messages, ctx = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const userMsgs = list.filter((m) => m && m.role === 'user' && typeof m.content === 'string');
  const last = userMsgs[userMsgs.length - 1]?.content || '';
  const lastIdx = list.lastIndexOf(userMsgs[userMsgs.length - 1]);
  const prevAssistant = lastIdx > 0 ? [...list.slice(0, lastIdx)].reverse().find((m) => m && m.role === 'assistant') : null;
  const prevHadCode = Boolean(prevAssistant && CODE_FENCE.test(prevAssistant.content || ''));

  const own = classifyText(last, { ...ctx, prevHadCode });
  const res = { ...own, reasons: [...own.reasons] };

  // A picture request that comes with a picture ("make this look like anime") stays an image job.
  const keepImage = res.kind === 'image';
  // Attachments change the job even when the message itself is short ("analyze this", "what's wrong?").
  if (keepImage) {
    res.useWeb = false;
  } else if (ctx.hasZip) {
    res.kind = 'code'; res.level = 3; res.useWeb = false; res.reasons.push('ZIP project attached');
  } else if (ctx.hasFiles && res.level < 2) {
    res.kind = 'file'; res.level = 2; res.reasons.push('document attached');
  } else if (ctx.hasFiles && res.kind !== 'code' && res.kind !== 'reasoning') {
    res.kind = 'file'; res.reasons.push('document attached');
  } else if (ctx.hasImages && res.level < 2) {
    // the existing image reader already wrote notes about the picture; the answer itself needs a real model
    res.kind = 'file'; res.level = 2; res.reasons.push('image attached');
  }

  // Short follow-ups ("fix it", "continue", "why?") inherit the job of the previous substantive message.
  const w = words(last);
  const isFollowUp = FOLLOW_UP.test(last.trim()) || (w.length <= 5 && own.kind === 'simple' && userMsgs.length > 1 && !isGreeting(last) && !/\?\s*$/.test(last.trim()));
  if (!ctx.hasZip && !ctx.hasFiles && isFollowUp && userMsgs.length > 1) {
    const before = [...userMsgs.slice(0, -1)].reverse().find((m) => m.content.trim().length > 25) || userMsgs[userMsgs.length - 2];
    const prev = classifyText(before.content, { ...ctx, prevHadCode: false });
    if (prev.level > res.level || (prevHadCode && prev.kind === 'code')) {
      res.kind = prev.kind; res.level = Math.max(res.level, prev.level); res.useWeb = prev.useWeb && /\b(?:more|again|update|latest|continue)\b/i.test(last);
      res.reasons.push('follow-up to a ' + prev.kind + ' request');
    }
  }

  // The Xyron mode the person switched on (/fast, /deep, /coder ...) nudges the choice when the message itself is neutral.
  if (res.kind === 'general' || res.kind === 'simple') {
    const mode = norm(ctx.mode);
    if (mode === 'coder') { res.kind = 'code'; res.level = Math.max(res.level, 2); res.reasons.push('/coder mode'); }
    else if (mode === 'deep' || mode === 'expert' || mode === 'agent') { res.kind = 'reasoning'; res.level = 3; res.reasons.push('/' + mode + ' mode'); }
    else if (mode === 'researcher') { res.kind = 'research'; res.level = Math.max(res.level, 2); res.useWeb = true; res.reasons.push('/researcher mode'); }
    else if (mode === 'tutor' || mode === 'creative') { res.kind = 'general'; res.level = Math.max(res.level, 2); res.reasons.push('/' + mode + ' mode'); }
    else if (mode === 'fast' && res.kind === 'general' && res.level === 2) { res.level = 1; res.reasons.push('/fast mode'); }
  }

  // A long conversation about something hard should not suddenly drop to the fast model.
  if (res.level === 1 && res.kind === 'simple' && userMsgs.length >= 4) {
    const recentLen = userMsgs.slice(-3, -1).reduce((n, m) => n + m.content.length, 0);
    if (recentLen > 1200) { res.level = 2; res.kind = 'general'; res.reasons.push('ongoing detailed conversation'); }
  }

  // The "web search" switch in the app is the person's own choice: honour it, except for a plain greeting.
  if (ctx.webSearch && res.kind !== 'greeting') res.useWeb = true;
  if (res.kind === 'greeting' || res.kind === 'image') res.useWeb = false;

  return res;
}

// The seven routes the app talks about. `kind` (from classifyRequest) is the detailed label; this is the name people see.
export const ROUTES = {
  fast_chat: { label: 'Fast Chat', about: 'greetings, quick questions, easy maths and small text fixes' },
  general_chat: { label: 'General Chat', about: 'explanations, writing, summaries and everyday conversation' },
  coding: { label: 'Coding', about: 'build, debug, review and ZIP projects' },
  reasoning: { label: 'Reasoning', about: 'hard maths, logic and multi-step analysis' },
  web_research: { label: 'Web Research', about: 'news, prices, scores and anything that needs current information' },
  file_processing: { label: 'File Processing', about: 'questions about an attached document or picture' },
  image_generation: { label: 'Image Generation', about: 'asking Xryon to make a picture' },
};
export function routeOf({ kind, level } = {}) {
  switch (kind) {
    case 'image': return 'image_generation';
    case 'file': return 'file_processing';
    case 'research': return 'web_research';
    case 'code': return 'coding';
    case 'reasoning': return level >= 2 ? 'reasoning' : 'fast_chat'; // easy maths stays on the fast route
    case 'general': case 'writing': return 'general_chat';
    default: return 'fast_chat'; // greeting, simple, anything unknown
  }
}

// kind + level -> NEXUS model.
//   V0 MINI      fast + everyday conversation: greetings, questions, explanations, writing, summaries, research answers, documents
//   V0 PRO       reasoning: hard maths and logic
//   V1 PRO       coding: build, debug, review (moderate and large)
export function pickTier({ kind, level }) {
  if (kind === 'code') return level >= 2 ? 'Xyron Nexus V1 Pro' : 'Xyron Nexus V0 Mini';
  if (kind === 'reasoning') return level >= 2 ? 'Xyron Nexus V0 Pro' : 'Xyron Nexus V0 Mini';
  return 'Xyron Nexus V0 Mini';
}

// Less history = fewer tokens to send = a faster answer. Always keeps the newest user message.
const HISTORY_BY_LEVEL = { 1: 6, 2: 20, 3: 40 };
export function trimHistory(messages, level) {
  const list = Array.isArray(messages) ? messages : [];
  const max = HISTORY_BY_LEVEL[level] || 20;
  if (list.length <= max) return list;
  const cut = list.slice(-max);
  // never start on an assistant turn: the provider expects the conversation to open with the user
  while (cut.length > 1 && cut[0]?.role === 'assistant') cut.shift();
  return cut;
}

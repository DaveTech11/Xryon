// Slash-command registry for the Xyron composer.
//
// kind:
//   "mode"   – the command is stripped and `prompt` is added to the system
//              prompt for that one message. `defaultInput` lets the command
//              run with no text after it (e.g. /continue).
//   "image"  – left untouched; the existing image pipeline handles it.
//   "xmode"  – persistent Xyron response mode (saved in settings until changed).
//   "action" – handled by the UI, never sent to the model.

const def = (group, kind, rows) =>
  rows.map(([command, desc, prompt = "", defaultInput = ""]) => ({
    command,
    label: command.slice(1).split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" "),
    desc, group, kind, prompt, defaultInput,
  }));

export const COMMANDS = [
  {
    command: "/magic", label: "Magic", group: "Magic", kind: "magic", prompt: "", defaultInput: "",
    desc: "✨ Magic — Let Xyron decide what to do",
  },
  ...def("Chat", "mode", [
    ["/ask", "Normal AI chat"],
    ["/chat", "Casual conversation", "Reply in a natural, friendly, conversational tone."],
    ["/explain", "Explain clearly", "Explain clearly in simple language with a concrete example."],
    ["/teach", "Teach me a topic", "Act as a patient teacher: small steps, check understanding, end with a short practice question."],
    ["/learn", "Build a learning path", "Create a structured learning path: key concepts, the order to learn them, and a practice exercise."],
    ["/brainstorm", "Generate ideas", "Brainstorm a varied list of creative ideas, then highlight the 3 strongest."],
    ["/debate", "Argue both sides", "Give the strongest arguments for and against, then a balanced conclusion."],
    ["/critic", "Honest critique", "Critique honestly and specifically: strengths, weaknesses, and concrete fixes."],
    ["/second-opinion", "Independent second opinion", "Give an independent second opinion. Do not just agree; point out risks, gaps, and alternatives."],
    ["/roleplay", "Play a character or scenario", "Roleplay the character or scenario described. Stay in character and keep it engaging."],
    ["/continue", "Continue last answer", "", "Continue exactly where you left off."],
    ["/shorten", "Make last answer shorter", "", "Rewrite your previous answer much shorter, keeping only the essentials."],
    ["/expand", "Add more detail", "", "Expand your previous answer with more depth, detail, and examples."],
  ]),
  ...def("Code", "mode", [
    ["/code", "Coding mode", "You are an expert software engineer. Give correct, idiomatic, working code in fenced code blocks with a brief explanation."],
    ["/fix", "Fix or improve code", "Fix the problems in the code and return the corrected version, briefly noting what changed."],
    ["/debug", "Find the bug", "Debug the code: identify the root cause, explain it, and give the fix."],
    ["/review", "Code review", "Do a code review: bugs, security, readability, performance, with concrete suggestions."],
    ["/refactor", "Refactor code", "Refactor for clarity and maintainability without changing behavior. Show the result."],
    ["/optimize", "Optimize performance", "Optimize the code for performance; explain the bottleneck and the trade-offs."],
    ["/explain-code", "Explain code", "Explain what this code does, line by line where useful, in plain language."],
    ["/test", "Write tests", "Write thorough unit tests, covering edge cases, using the most common test framework for the language."],
    ["/tests", "Write tests", "Write thorough unit tests, covering edge cases, using the most common test framework for the language."],
    ["/document", "Document code", "Write clear documentation and comments for this code."],
    ["/convert", "Convert code or formats", "Convert the input to the requested language or format, preserving behavior."],
    ["/regex", "Build or explain a regex", "Write or explain the regular expression, with test examples."],
    ["/sql", "SQL help", "Write or fix the SQL query and explain it briefly."],
    ["/terminal", "Shell commands", "Give the exact terminal commands needed and explain what each does. Warn about anything destructive."],
  ]),
  ...def("Write", "mode", [
    ["/write", "Writing mode", "Write polished, well-structured text that matches the requested tone and audience."],
    ["/rewrite", "Rewrite text", "Rewrite the text to be clearer and better, keeping the meaning."],
    ["/improve", "Improve writing", "Improve the writing: clarity, flow, and word choice. Return the improved version."],
    ["/grammar", "Fix grammar", "Fix grammar, spelling, and punctuation. Return the corrected text, then list the main changes."],
    ["/proofread", "Proofread", "Proofread carefully and return the corrected text with the changes noted."],
    ["/email", "Write an email", "Write a clear, well-toned email with a subject line."],
    ["/essay", "Write an essay", "Write a well-structured essay with an introduction, body, and conclusion."],
    ["/story", "Write a story", "Write an engaging story with vivid detail and a satisfying arc."],
    ["/script", "Write a script", "Write a script in proper format (video, film, or skit as appropriate)."],
    ["/caption", "Social captions", "Write several catchy caption options, with hashtags where suitable."],
    ["/post", "Social post", "Write an engaging social media post, suited to the platform mentioned."],
    ["/resume", "Resume / CV help", "Help with the resume: strong bullet points, clear structure, ATS-friendly wording."],
  ]),
  ...def("Analyze", "mode", [
    ["/analyze", "Analyze files or images", "Analyze the provided files, images, or text in depth and report key findings."],
    ["/read", "Read a file", "Read the attached file and explain what it contains."],
    ["/summarize-file", "Summarize a file", "Summarize the attached file: main points first, then important details."],
    ["/extract", "Extract data", "Extract the requested information and present it in a clean, structured form."],
    ["/ocr", "Text from images", "Transcribe all text in the image accurately, preserving layout where possible."],
    ["/describe", "Describe an image", "Describe the image in detail."],
    ["/vision", "Understand an image", "Look at the image and answer the question about it."],
    ["/pdf", "Work with a PDF", "Work with the attached PDF: answer questions about it or summarize it."],
    ["/csv", "Work with CSV data", "Analyze the CSV data: structure, patterns, and notable findings."],
    ["/table", "Make a table", "Present the answer as a clean markdown table."],
  ]),
  ...def("Image", "image", [
    ["/image", "Image generation"],
    ["/logo", "Logo design"],
    ["/avatar", "Avatar / profile picture"],
    ["/wallpaper", "Wallpaper"],
  ]),
  ...def("Design", "mode", [
    ["/design", "Design help", "Act as a designer: give concrete layout, typography, and style direction."],
    ["/ideas", "Idea generator", "Give a varied set of original ideas, each with a one-line pitch."],
    ["/name", "Name ideas", "Suggest a list of memorable names, with a short reason for each."],
    ["/branding", "Branding help", "Help with branding: positioning, voice, name and tagline options, visual direction."],
    ["/color", "Color palettes", "Suggest color palettes with hex codes and where to use each color."],
    ["/prompt", "Improve a prompt", "Rewrite the input as a stronger prompt for an AI model and return it ready to copy."],
  ]),
  ...def("Xyron modes", "xmode", [
    ["/auto", "Auto-picks the right mode: /auto <request>"],
    ["/fast", "Short, quick replies", "Reply as quickly and concisely as possible."],
    ["/deep", "Deep reasoning", "Think deeply: reason carefully, consider edge cases, and give a thorough, well-structured answer."],
    ["/expert", "Expert-level answers", "Answer as a domain expert, with precise terminology, nuance, and caveats."],
    ["/creative", "Imaginative mode", "Be imaginative and original; favor vivid, unconventional ideas."],
    ["/coder", "Programming focus", "Focus on programming: working code, best practices, short explanations."],
    ["/researcher", "Careful researcher", "Act as a careful researcher: structured findings, note uncertainty, separate facts from opinion."],
    ["/tutor", "Step-by-step tutor", "Act as a tutor: explain step by step, use examples, and check understanding."],
    ["/agent", "Plan and run a multi-step task", "Act as an autonomous agent: restate the goal, break it into numbered steps, work through each one, and finish with the result and suggested next actions."],
  ]),
  ...def("Build", "mode", [
    ["/plan", "Turn a goal into a plan", "Turn the goal into an actionable plan: milestones, ordered steps, effort estimates, risks, and the first step to take today."],
    ["/build", "Build a feature or project", "Build what is described. Give the complete, working code, file by file, with brief setup instructions."],
    ["/ship", "Prepare for deployment", "Prepare the project for deployment: a pre-launch checklist covering config, env vars, security, performance, build, hosting, and monitoring, plus concrete fixes."],
    ["/check", "Scan for problems", "Scan the provided code or project for bugs, security issues, bad practices, and missing pieces. List findings by severity with fixes."],
    ["/upgrade", "Suggest improvements", "Suggest concrete improvements to the code or project, ranked by impact and effort, with examples."],
    ["/scaffold", "Generate project structure", "Generate a project structure: the folder tree, the key files with starter code, and the commands to set it up."],
    ["/patch", "Targeted code patch", "Produce a minimal targeted patch (diff format) that fixes exactly the issue described and nothing else."],
    ["/migrate", "Migrate frameworks or APIs", "Guide the migration: differences, a step-by-step plan, code changes, and pitfalls to watch for."],
    ["/deploy", "Deployment guidance", "Give step-by-step deployment guidance for the stack described, including config, env vars, and how to verify it works."],
    ["/logs", "Analyze error logs", "Analyze the logs: find the root cause, explain it, and give the fix. Point to the key lines."],
    ["/deps", "Dependency issues", "Check the dependencies for problems: version conflicts, outdated or risky packages, and the fix commands."],
    ["/api", "Design or test an API", "Design or review the API: endpoints, request/response shapes, errors, auth, and example calls."],
    ["/db", "Database schemas & queries", "Help with the database: schema design, queries, indexes, and migrations. Explain trade-offs."],
  ]),
  ...def("Think", "mode", [
    ["/think", "Deep reasoning", "Reason deeply and step by step before answering. Consider alternatives and edge cases, then give a clear final answer."],
    ["/critique", "Find weaknesses in an idea", "Find the weaknesses in this idea: flawed assumptions, risks, and what could go wrong. Be specific, then say how to strengthen it."],
    ["/challenge", "Challenge assumptions", "Challenge the assumptions behind this. List each one, say why it might be wrong, and what follows if it is."],
    ["/decide", "Options and trade-offs", "Lay out the realistic options with pros, cons, and trade-offs, then say which you would pick and why."],
    ["/insight", "Extract key insights", "Extract the most important insights: what matters, what is surprising, and what to do about it."],
  ]),
  ...def("Project", "mode", [
    ["/project", "Understand the project", "Study the provided files or description and explain the project: purpose, structure, stack, and how the parts fit together."],
    ["/files", "Browse project files", "From the provided material, list and describe the files and what each one does."],
    ["/diff", "Show what changed", "Compare the two versions provided and explain exactly what changed and why it matters."],
  ]),
  ...def("Project", "action", [
    ["/bookmark", "Save the last reply"],
    ["/context", "Show current AI context"],
    ["/snapshot", "Save this chat state"],
    ["/status", "Chat and usage status"],
  ]),
  ...def("Tasks", "mode", [
    ["/todo", "Create a task list", "Turn this into a clear checklist of concrete tasks (markdown checkboxes)."],
    ["/priority", "Prioritize tasks", "Prioritize the tasks by impact and urgency. Give an ordered list with a one-line reason for each."],
    ["/focus", "Stay on the objective", "Work only on the stated objective. Ignore tangents, and keep the answer tightly focused on it."],
    ["/next", "Suggest the next step", "Given where things stand, suggest the single most useful next step, then two follow-ups."],
    ["/daily", "Create a daily plan", "Create a realistic daily plan: time blocks, top 3 priorities, breaks, and a short end-of-day review."],
  ]),
  ...def("Language", "mode", [
    ["/translate", "Translate text", "Translate the text into the requested language (English if none is given). Return only the translation unless notes are useful."],
    ["/detect-language", "Detect the language", "Identify the language of the text and give a brief confidence note."],
    ["/define", "Define a word", "Define the word or term clearly, with an example sentence."],
    ["/dictionary", "Dictionary entry", "Give a dictionary-style entry: part of speech, definitions, examples, synonyms, etymology."],
    ["/simplify", "Make it simpler", "Rewrite in much simpler language that anyone could understand."],
    ["/professional", "Professional tone", "Rewrite in a polished, professional tone."],
    ["/casual", "Casual tone", "Rewrite in a relaxed, casual, friendly tone."],
  ]),
  ...def("Research", "mode", [
    ["/search", "Web-style search", "Answer like a search assistant: direct answer first, then key details. Say if something may be out of date."],
    ["/research", "Research a topic", "Research the topic: overview, key facts, competing views, and open questions. Flag uncertainty."],
    ["/facts", "Key facts", "List the key facts, clearly separated from opinion."],
    ["/compare", "Compare options", "Compare the options side by side (a table works well), then give a recommendation."],
    ["/sources", "Suggest sources", "Suggest reputable sources to consult. Do not invent links or citations."],
    ["/summarize", "Summarize text", "Summarize concisely: main point first, then the key details."],
    ["/verify", "Fact-check a claim", "Assess whether the claim is accurate, explain why, and note what would need checking."],
    ["/timeline", "Build a timeline", "Present events as a clear chronological timeline."],
    ["/overview", "Quick overview", "Give a quick, well-organized overview of the topic."],
  ]),
  ...def("Controls", "action", [
    ["/x", "Command launcher"],
    ["/model", "Switch AI model"],
    ["/models", "Show available models"],
    ["/mode", "Show Xyron modes"],
    ["/xyron", "Show Xyron modes"],
    ["/settings", "Open settings"],
    ["/memory", "Memory & settings"],
    ["/history", "Open chat history"],
    ["/new", "Start a new chat"],
    ["/clear", "Clear the current chat"],
    ["/regenerate", "Regenerate last reply"],
    ["/export", "Download chat (.md)"],
    ["/share", "Copy chat transcript"],
    ["/help", "Help & Support"],
  ]),
];

const BY_COMMAND = Object.fromEntries(COMMANDS.map((c) => [c.command, c]));
export const XMODE_PROMPTS = Object.fromEntries(
  COMMANDS.filter((c) => c.kind === "xmode").map((c) => [c.command.slice(1), c.prompt])
);

// ---- /magic: multi-capability planner -------------------------------------
// Unlike /auto (one best command), /magic detects every capability a request
// needs, merges their instructions into one prompt, and can pair image
// generation with a written answer. It runs locally, so it costs no extra API call.
const MAGIC_IMG = /\b(draw|generate|create|make|design|render|produce)\b[^.]*?\b(image|picture|photo|logo|illustration|wallpaper|avatar|artwork|poster|banner|icon|sticker|thumbnail)\b/;

export function planMagic(arg = "", files = []) {
  const t = arg.toLowerCase();
  const caps = [];
  const add = (c) => { if (!caps.includes(c)) caps.push(c); };
  const del = (c) => { const i = caps.indexOf(c); if (i >= 0) caps.splice(i, 1); };

  const image = MAGIC_IMG.test(t);
  const summarize = /\b(summari[sz]e|summary|tl;?dr|recap|condense|key points)\b/.test(t);
  if (files.length) add(files.some((f) => f.type?.startsWith("image/")) ? "/vision" : (summarize ? "/summarize-file" : "/analyze"));

  const codey = /```|=>|\b(error|exception|traceback|stack ?trace|bug|crash|compile|npm|react|vue|typescript|javascript|python|java|css|html|sql|api|function|component|regex|code|backend|frontend)\b/.test(t);
  const broken = /\b(error|exception|traceback|bug|crash|not working|broken|fix)\b/.test(t);
  const building = /\b(build|create|make|develop|generate|scaffold|code)\b[^.]*?\b(app|website|landing page|webpage|web page|page|site|dashboard|api|component|game|tool|bot|project|feature)\b/.test(t);
  if (codey && broken) add("/fix");
  else if (building && !(image && !codey)) add("/build");
  else if (codey) add("/code");

  if (/\b(research|investigate|deep dive|look into|find out|fact[- ]?check|compare)\b/.test(t)) add("/research");
  else if (/\b(latest|today|current(ly)?|news|price|weather|right now|this week|trending|202\d)\b/.test(t)) add("/search");
  if (summarize && !caps.includes("/summarize-file")) add("/summarize");
  if (/\bplan(ning)?\b|\b(roadmap|strategy|milestones?|action plan|prioriti[sz]e)\b/.test(t)) add("/plan");
  if (/\b(essay|article|blog|email|caption|story|poem|letter|speech|resume|newsletter)\b|\b(write|draft|compose|rewrite)\b(?!.*\b(code|function|component|app|test)\b)/.test(t)) add("/write");
  if (caps.length >= 3 || /\b(step by step|multi-?step|end to end|automate|and then|after that|full workflow)\b/.test(t) || arg.length > 400) add("/agent");
  if (caps.includes("/fix") || caps.includes("/build")) del("/code");
  if (!caps.length && !image) add("/ask");

  let imagePrompt = arg;
  if (image && caps.length) {
    imagePrompt = arg.split(/\s*(?:,|;|\band then\b|\bthen\b|\band\b)\s*/i).find((x) => MAGIC_IMG.test(x.toLowerCase())) || arg;
  }
  const list = caps.map((c) => `- ${c.slice(1)}: ${BY_COMMAND[c].prompt || "Answer helpfully."}`).join("\n");
  const prompt = caps.length
    ? `MAGIC MODE. Work out what the request needs and handle it end to end; never ask the user to pick a mode. Capabilities to apply:\n${list}\n` +
      (image ? "An image is generated separately from this request, so do not try to draw it; handle only the non-image parts and treat the image as already provided.\n" : "") +
      "When several capabilities apply, combine them into one coherent answer in a logical order. If something is ambiguous, make the most reasonable assumption and state it in one line. Be honest about limits: you cannot browse the live web, run code, or open files you were not given, so say when information may be out of date."
    : "";
  return { caps, image, text: caps.length > 0, imagePrompt, prompt };
}

const FILE_FALLBACK = "Process the attached file(s).";

// Picks the best command for a free-form "/auto <request>".
export function routeAuto(arg = "", files = []) {
  const t = arg.toLowerCase();
  if (files.length) return files.some((f) => f.type?.startsWith("image/")) ? "/vision" : "/analyze";
  if (/\b(draw|generate|create|make|design)\b.*\b(image|picture|photo|logo|illustration|wallpaper|avatar|artwork)\b/.test(t)) return "/image";
  if (/```|=>|\b(error|exception|traceback|stack ?trace|bug|compile|npm|react|typescript|javascript|python|function|sql|css|html|regex|import)\b/.test(t)) {
    return /\b(error|exception|traceback|bug|fix|broken|crash|not working)\b/.test(t) ? "/fix" : "/code";
  }
  if (/\b(latest|today|current|currently|news|price|weather|right now|this week|202\d)\b/.test(t)) return "/search";
  if (arg.length > 400 || /\b(build|plan|step by step|multi-?step|automate|end to end|roadmap|deploy|set ?up|and then)\b/.test(t)) return "/agent";
  if (/\b(story|poem|song|lyrics|slogan|imagine|creative|brainstorm|write)\b/.test(t)) return "/creative";
  return "/ask";
}

// "/fix some code" -> { cmd, arg: "some code" }, or null if not a known command.
// "/auto <text>" is routed to the best-fitting command; a persistent mode
// command followed by text (e.g. "/deep why...") acts as a one-shot mode.
export function parseCommand(text = "", files = []) {
  const m = text.trim().match(/^(\/[a-z0-9-]+)(?:\s+([\s\S]*))?$/i);
  const base = m && BY_COMMAND[m[1].toLowerCase()];
  if (!base) return null;
  const arg = (m[2] || "").trim();
  if (base.kind === "magic") return arg || files.length ? { cmd: base, arg, plan: planMagic(arg, files) } : { cmd: base, arg };
  if (base.command === "/auto" && (arg || files.length)) {
    const t = BY_COMMAND[routeAuto(arg, files)];
    return { cmd: t.kind === "xmode" ? { ...t, kind: "mode" } : t, arg, routedFrom: "/auto" };
  }
  if (base.kind === "xmode" && arg) return { cmd: { ...base, kind: "mode" }, arg };
  return { cmd: base, arg };
}

// Text the model should see for a stored user message.
export function stripCommand(content = "") {
  const p = parseCommand(content);
  if (!p) return content;
  if (p.cmd.kind === "mode" || p.cmd.kind === "magic" || p.routedFrom) return p.arg || p.cmd.defaultInput || FILE_FALLBACK;
  if (p.cmd.kind === "xmode") return FILE_FALLBACK;
  return content;
}

// Tabs for the /x command launcher.
export const PALETTE_TABS = [
  ["Search", ["/search", "/research", "/facts", "/verify", "/sources", "/overview"]],
  ["Code", ["/code", "/fix", "/debug", "/review", "/refactor", "/optimize", "/test", "/regex", "/sql", "/terminal"]],
  ["Create", ["/write", "/story", "/email", "/essay", "/image", "/logo", "/design", "/ideas", "/brainstorm", "/name"]],
  ["Analyze", ["/analyze", "/read", "/summarize-file", "/extract", "/ocr", "/pdf", "/csv", "/table", "/critique", "/insight"]],
  ["Build", ["/plan", "/build", "/scaffold", "/patch", "/migrate", "/check", "/ship", "/deploy", "/upgrade", "/api", "/db"]],
  ["Agent", ["/magic", "/auto", "/agent", "/think", "/decide", "/challenge", "/todo", "/priority", "/next", "/daily", "/focus"]],
  ["Research", ["/research", "/compare", "/timeline", "/summarize", "/verify", "/decide", "/sources"]],
  ["Tools", ["/model", "/history", "/bookmark", "/snapshot", "/context", "/status", "/regenerate", "/export", "/share", "/translate", "/help"]],
].map(([name, list]) => [name, list.map((c) => BY_COMMAND[c]).filter(Boolean)]);


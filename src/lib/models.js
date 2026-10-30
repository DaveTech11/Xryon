// The chat models people can pick. The picker lives in Settings -> Model (not in the chat box).
// The choice is saved under the same "selectedModel" setting the chat box used before.
export const MODELS = [
  // Xyron Nexus models (renamed from "NEXUS ..."). "Xyron Nexus Auto" picks one of the four for every message (the server decides, see router.mjs); the four
  // can also be chosen by hand. They run on the providers Xryon already has - no new API. Existing models stay below.
  { name: "Xyron Nexus Auto", group: "nexus", desc: "Picks the right Xyron Nexus model for every message: fast, conversation, reasoning or coding.", premium: false, icon: "auto" },
  { name: "Xyron Nexus V0 Mini", group: "nexus", desc: "Fast and conversational. Greetings, questions, explanations and writing.", premium: false, icon: "flash" },
  { name: "Xyron Nexus V0 Pro", group: "nexus", desc: "Reasoning. Hard maths, logic and multi-step analysis.", premium: true, icon: "reason" },
  { name: "Xyron Nexus V1 Pro", group: "nexus", desc: "Coding. Build, debug and review software.", premium: true, icon: "code" },
  { name: "Xyron Plus", group: "free", desc: "Free, fast and great for everyday questions.", premium: false },
    { name: "Xryon Basic", group: "free", desc: "Chat with web search and uploaded media.", premium: false, icon: "flash" },
  { name: "Xryon V6", group: "free", desc: "ChatArt v6 chat. Send a picture and keep talking about it.", premium: false, icon: "flash" },
  { name: "Xryon V5", group: "free", desc: "ChatArt v5 chat with picture support.", premium: false, icon: "flash" },
  { name: "Xryon Vision", group: "free", desc: "Reads your images, solves what is in them, remembers them.", premium: false, icon: "scholar" },
  { name: "Xyron 4.1", group: "smart", desc: "Smarter answers for harder questions.", premium: true },
  { name: "Nexus AI", group: "smart", desc: "Nexus Labs model for clear answers, writing and code.", premium: true, icon: "flash" },
  { name: "Vortex", group: "smart", desc: "Our most capable model for deep work.", premium: true },
  { name: "Xyron Opus", group: "reasoning", desc: "Advanced reasoning and complex projects", premium: true, icon: "opus" },
  { name: "Xyron Code", group: "reasoning", desc: "Build, debug and edit software", premium: false, icon: "code" },
  { name: "Xyron Reason", group: "reasoning", desc: "Logic, mathematics and deep analysis", premium: false, icon: "reason" },
  { name: "Xyron Flash", group: "free", desc: "Fast everyday assistance", premium: false, icon: "flash" },
  { name: "Xyron Scholar", group: "free", desc: "Learning, tutoring and research", premium: false, icon: "scholar" },
  { name: "Xyron Sentinel", group: "reasoning", desc: "Code auditing and security reviews", premium: false, icon: "sentinel" },
  { name: "Xyron Creative", group: "free", desc: "Writing, ideas and creative tasks", premium: false, icon: "creative" },
];
// The three groups the chat's model picker shows. Each model's `group` above decides where it lives.
export const MODEL_GROUPS = [
  { key: "nexus", label: "Xyron Nexus", desc: "Auto-routed models: fast, conversation, reasoning and coding" },
  { key: "free", label: "Free", desc: "Fast models for everyday questions" },
  { key: "smart", label: "Smart Models", desc: "Smarter answers for harder questions" },
  { key: "reasoning", label: "Reasoning", desc: "Logic, code and deep analysis" },
];
export const PREMIUM_MODELS = MODELS.filter((m) => m.premium).map((m) => m.name);
// Models served by the ChatArt endpoint (server mode name for each).
export const CHARART_MODEL_MODES = { "Xryon V6": "v6", "Xryon V5": "v5", "Xryon Vision": "vision" };
export const DEFAULT_FREE_MODEL = "Xyron Plus";

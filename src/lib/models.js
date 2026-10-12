// The chat models people can pick. The picker lives in Settings -> Model (not in the chat box).
// The choice is saved under the same "selectedModel" setting the chat box used before.
export const MODELS = [
  { name: "Xyron Plus", desc: "Free, fast and great for everyday questions.", premium: false },
  { name: "Xyron 4.1", desc: "Smarter answers for harder questions.", premium: true },
  { name: "Vortex", desc: "Our most capable model for deep work.", premium: true },
  { name: "Xyron Opus", desc: "Advanced reasoning and complex projects", premium: true, icon: "opus" },
  { name: "Xyron Code", desc: "Build, debug and edit software", premium: false, icon: "code" },
  { name: "Xyron Reason", desc: "Logic, mathematics and deep analysis", premium: false, icon: "reason" },
  { name: "Xyron Flash", desc: "Fast everyday assistance", premium: false, icon: "flash" },
  { name: "Xyron Scholar", desc: "Learning, tutoring and research", premium: false, icon: "scholar" },
  { name: "Xyron Sentinel", desc: "Code auditing and security reviews", premium: false, icon: "sentinel" },
  { name: "Xyron Creative", desc: "Writing, ideas and creative tasks", premium: false, icon: "creative" },
];
export const PREMIUM_MODELS = MODELS.filter((m) => m.premium).map((m) => m.name);
export const DEFAULT_FREE_MODEL = "Xyron Plus";

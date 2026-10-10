// Everything about the "who made Xyron" card lives here so the wording is easy to edit.

export const OWNER_REPLY = "I am Xyron, created by [Xyron Labs](#xyron-labs).";

// Matches "who is your owner", "who created you", "who made xyron", "who are the
// developers" ... only when that is the WHOLE message, so normal questions that
// merely contain these words still go to the AI.
const ROLE = "(?:owner|creator|developer|dev|maker|founder|builder)s?";
const PATTERNS = [
  new RegExp(`^who (?:is|are|was|s) (?:your|the) ${ROLE}(?: of (?:you|xyron|this (?:app|ai|website|site|bot|chatbot)))?$`),
  new RegExp(`^who (?:is|are|s) (?:the )?${ROLE} of (?:you|xyron|this (?:app|ai|website|site|bot|chatbot))$`),
  /^who (?:owns|created|made|built|developed|programmed|designed|invented|founded) (?:you|xyron|this (?:app|ai|website|site|bot|chatbot))$/,
  /^who (?:is|are|s) behind (?:you|xyron|this (?:app|ai|website|site|bot|chatbot))$/,
  /^(?:which|what) (?:company|team) (?:owns|created|made|built|developed) (?:you|xyron)$/,
];

export function isOwnerQuestion(text = "") {
  const t = text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(ur|ure)\b/g, "your")
    .replace(/\b(hey|hi|hello|yo|abeg|pls|please|so|tell me|just|quick question)\b/g, " ")
    .replace(/\bwhos\b/g, "who s")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || t.split(" ").length > 12) return false;
  return PATTERNS.some((p) => p.test(t));
}

// ---- Card content (edit freely) --------------------------------------------
export const LABS = {
  name: "Xyron Labs",
  summary:
    "Xyron Labs is the team behind Xyron, an AI assistant workspace for chatting, building, creating and exploring ideas, all in one place.",
  whatItDoes:
    "Xyron Labs designs and builds **Xyron**, an AI workspace that brings **conversation**, **creative tools** and **coding** together. The team keeps shipping improvements while the platform is still **under development**.",
  mission:
    "Make powerful AI feel fast, simple and personal. Xyron Labs focuses on **clear answers**, **tools people actually use**, and steady improvement based on real feedback.",
  status: "Beta · Under development",
  facts: [
    ["Type", "AI assistant platform"],
    ["Made by", "Xyron Labs"],
    ["Status", "Beta · Under development"],
    ["Coming soon", "Codex"],
  ],
  products: [
    { name: "Xyron Chat", kind: "Assistant", icon: "chat" },
    { name: "AI Studio", kind: "Creative tools", icon: "studio" },
    { name: "Artifacts", kind: "Create", icon: "artifacts" },
    { name: "Xyron Brain", kind: "Intelligence", icon: "brain" },
    { name: "Codex", kind: "Coding · Coming soon", icon: "codex" },
  ],
  team: [
    {
      heading: "Dave Tech",
      name: "Eze David",
      role: "Developer",
      photo: ["/team/eze-david.png", "/team/eze-david.jpg"], // add a transparent cut-out as eze-david.png and it is used automatically
    },
    {
      heading: "Loner Tech",
      name: "Founder",
      role: "Founder of Vortyx Pulse AI models",
      initials: "LT",
    },
  ],
};

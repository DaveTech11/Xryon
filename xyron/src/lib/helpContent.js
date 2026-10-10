// Content for the Help & Support section of Settings.
// Kept as data (not JSX) so it's easy to edit, translate, or load from a
// CMS later without touching the component. `type` controls how
// HelpCenter.jsx renders a section:
//   "article"  – title + body paragraphs/bullets
//   "shortcuts"– a table of key combos (pulled from real composer behavior)
//   "contact"  – a support email/action row
//   "report"   – a short "describe the problem" form
//   "link"     – jumps straight to another part of the app (e.g. Settings)

export const HELP_SECTIONS = [
  {
    id: "help-center",
    icon: "LifeBuoy",
    title: "Help Center",
    summary: "Start here — an overview of everything below.",
    type: "article",
    body: [
      "This is Xyron's Help & Support hub. Use the list to jump straight to FAQs, account help, privacy, billing, or a guide to what Xyron can do.",
      "Still stuck after browsing? Use **Contact support** or **Report a problem** below — both get routed to the team.",
    ],
  },
  {
    id: "faq",
    icon: "HelpCircle",
    title: "FAQ and troubleshooting",
    summary: "Common questions about replies, images, and errors.",
    type: "article",
    body: [
      "**Xyron gave a wrong or outdated answer.** Xyron can make mistakes, especially on very recent events — verify anything important. Try /research or /verify to get it to reason more carefully or flag uncertainty.",
      "**An image didn't generate.** Check your daily image quota in Status (/status). If you're on the free plan and it's exhausted, it resets the next day or you can upgrade.",
      "**A reply got cut off or the app feels stuck.** Try /regenerate, or start a new chat with /new. If it persists, use Report a problem below.",
      "**Slash commands aren't showing suggestions.** Make sure you're typing a command at the very start of the message box — the menu only appears while the whole message is just \"/something\".",
    ],
  },
  {
    id: "account",
    icon: "UserCog",
    title: "Account and login help",
    summary: "Signing in, switching devices, and account access.",
    type: "article",
    body: [
      "If you're signed out unexpectedly, sign back in from the login screen — your conversations are tied to your account, not the device.",
      "Using Xyron on a new device? Sign in with the same account and your chat history and plan will follow you.",
      "Can't get back into your account? Use Contact support below with the email address on the account so the team can help you recover it.",
    ],
  },
  { id: "settings", icon: "Settings2", title: "Settings", summary: "Model, persona, font size, and other preferences.", type: "link", target: "/settings" },
  {
    id: "privacy",
    icon: "ShieldCheck",
    title: "Privacy and security",
    summary: "What's stored, and how to control it.",
    type: "article",
    body: [
      "Your messages are stored so your conversation history is there when you come back, and so features like Memory and message previews can work.",
      "You can clear a conversation any time with /clear, or delete it entirely from the sidebar.",
      "Avoid sharing sensitive personal information (passwords, ID numbers, financial account numbers) in chat.",
    ],
  },
  {
    id: "billing",
    icon: "CreditCard",
    title: "Billing/subscription help",
    summary: "Plans, upgrades, and managing your subscription.",
    type: "article",
    body: [
      "Xyron has a free plan with daily limits on messages, images, files, and documentation, plus paid Premium and Premium+ plans with higher or unlimited limits.",
      "You can see what's left on your current plan any time with /status, and upgrade from the Premium button in the header or when a limit is reached.",
      "For a billing issue (a failed charge, cancelling, or a refund question), use Contact support below with your account email.",
    ],
  },
  {
    id: "report",
    icon: "Flag",
    title: "Report a problem",
    summary: "Tell us what went wrong so we can fix it.",
    type: "report",
  },
  {
    id: "contact",
    icon: "Mail",
    title: "Contact support",
    summary: "Reach a human for anything the FAQ doesn't cover.",
    type: "contact",
    email: "support@xyron.app",
  },
  {
    id: "updates",
    icon: "Send",
    title: "Stay updated",
    summary: "Join our official channels for news and announcements.",
    type: "links",
    intro: "Want more information or the latest news first? Join our official channels below.",
    links: [
      { label: "Xyron updates", desc: "News, releases, and announcements for Xyron.", url: "https://t.me/xryonai" },
      { label: "Vortex Pulse updates", desc: "Updates from Aeruvo support for Vortex Pulse.", url: "https://t.me/Aeruvosupport" },
    ],
  },
  {
    id: "features",
    icon: "Sparkles",
    title: "Xyron features and tools",
    summary: "What Xyron can do, at a glance.",
    type: "article",
    body: [
      "**Slash commands** — type / to see modes for chat, code, writing, analysis, design, research, and more. /magic lets Xyron figure out which ones a request needs on its own.",
      "**Entity cards** — ask about a person, company, place, product, or similar and Xyron shows a rich card with an image, quick facts, and sources instead of just text.",
      "**Comparisons** — \"A vs B\" or /compare shows a side-by-side card plus a written comparison.",
      "**Image generation** — /image (or a style shortcut like /logo, /avatar, /wallpaper) generates an image; upload one first to transform it image-to-image.",
      "**Files** — attach files with the paperclip icon; /analyze, /read, /pdf, /csv, and /ocr are tuned for working with them.",
    ],
  },
  {
    id: "shortcuts",
    icon: "Keyboard",
    title: "Keyboard shortcuts",
    summary: "Move around Xyron without touching the mouse.",
    type: "shortcuts",
    shortcuts: [
      ["Enter", "Send message"],
      ["Shift + Enter", "New line"],
      ["Ctrl / ⌘ + K", "Open the command launcher"],
      ["/ then ↑ / ↓", "Navigate command suggestions"],
      ["/ then Tab or Enter", "Pick the highlighted command"],
      ["Esc", "Dismiss command suggestions"],
    ],
  },
  {
    id: "tools-guide",
    icon: "Wrench",
    title: "How to use files, images, voice, web search, and other available tools",
    summary: "A walkthrough of each tool and when to reach for it.",
    type: "article",
    body: [
      "**Files** — click the paperclip to attach a file, then ask a question about it, or use a command like /analyze, /summarize-file, /extract, /pdf, /csv, or /ocr for scanned text.",
      "**Images** — use /image (or a style shortcut such as /logo, /avatar, /wallpaper) to generate one, or attach an image and use /describe, /vision, or a style shortcut to restyle it.",
      "**Voice** — if voice input is enabled in your version of Xyron, use the microphone control in the composer to dictate a message.",
      "**Web-aware answers** — asking about a person, place, company, or similar can surface a sourced entity card automatically; /search and /research lean into that for broader topics, and always note that information may be out of date.",
      "**Comparisons** — \"X vs Y\" or /compare pulls up a visual side-by-side plus a written comparison.",
    ],
  },
];


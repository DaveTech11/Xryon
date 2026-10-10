// Real starter templates for the Codex gallery. Each template is a set of real
// source files (kept in ./templates and imported as raw text), plus honest
// disclosure of the tools, packages and secrets it needs.
import portfolio from "./templates/portfolio.html?raw";
import saasLanding from "./templates/saas-landing.html?raw";
import calculator from "./templates/calculator.html?raw";
import quiz from "./templates/quiz.html?raw";
import studyPlanner from "./templates/study-planner.html?raw";
import memoryGame from "./templates/memory-game.html?raw";
import restApi from "./templates/rest-api.js?raw";
import restApiPkg from "./templates/rest-api.package.json?raw";
import telegramBot from "./templates/telegram-bot.js?raw";
import telegramPkg from "./templates/telegram-bot.package.json?raw";
import automation from "./templates/automation.py?raw";

export const TEMPLATE_CATEGORIES = ["Websites", "Apps", "Games", "Developer"];

const NONE = { deps: "None. Runs in any browser.", env: "None." };

export const TEMPLATES = [
  { id: "portfolio", category: "Websites", name: "Portfolio", description: "A clean personal portfolio with intro, projects, skills and contact.", tech: ["HTML", "CSS", "JavaScript"], preview: true, ...NONE,
    files: [{ name: "index.html", language: "html", content: portfolio }] },
  { id: "saas-landing", category: "Websites", name: "SaaS Landing Page", description: "Hero, features and pricing sections for a product launch page.", tech: ["HTML", "CSS"], preview: true, ...NONE,
    files: [{ name: "index.html", language: "html", content: saasLanding }] },
  { id: "calculator", category: "Apps", name: "Calculator", description: "A working calculator with keyboard support and a history line.", tech: ["HTML", "CSS", "JavaScript"], preview: true, ...NONE,
    files: [{ name: "index.html", language: "html", content: calculator }] },
  { id: "quiz", category: "Apps", name: "Quiz App", description: "Multiple-choice quiz with score and progress. Edit the QUESTIONS list to make your own.", tech: ["HTML", "CSS", "JavaScript"], preview: true, ...NONE,
    files: [{ name: "index.html", language: "html", content: quiz }] },
  { id: "study-planner", category: "Apps", name: "Study Planner", description: "Add study tasks by day, tick them off and track progress.", tech: ["HTML", "CSS", "JavaScript"], preview: true, ...NONE,
    files: [{ name: "index.html", language: "html", content: studyPlanner }] },
  { id: "memory-game", category: "Games", name: "Memory Match", description: "Flip tiles to find all the matching pairs in as few moves as you can.", tech: ["HTML", "CSS", "JavaScript"], preview: true, ...NONE,
    files: [{ name: "index.html", language: "html", content: memoryGame }] },
  { id: "rest-api", category: "Developer", name: "REST API (Express)", description: "A small to-do API with create, read, update and delete routes.", tech: ["Node.js", "Express"], preview: false,
    deps: "Node 18+ and the express package (npm install).", env: "Optional: PORT (defaults to 3000). No database: data is kept in memory.",
    files: [{ name: "rest-api.js", language: "javascript", content: restApi }, { name: "package.json", language: "json", content: restApiPkg }] },
  { id: "telegram-bot", category: "Developer", name: "Telegram Bot", description: "A command bot (/start, /help, /ping, /echo) using long polling, with no packages.", tech: ["Node.js", "Telegram Bot API"], preview: false,
    deps: "Node 18+. No npm packages.", env: "Required: TELEGRAM_BOT_TOKEN from @BotFather. Keep it in an environment variable, never in the code.",
    files: [{ name: "telegram-bot.js", language: "javascript", content: telegramBot }, { name: "package.json", language: "json", content: telegramPkg }] },
  { id: "file-sorter", category: "Developer", name: "Automation Script (File Sorter)", description: "Sorts a messy folder into subfolders by file type. Previews first, moves only with --apply.", tech: ["Python"], preview: false,
    deps: "Python 3.8+. Standard library only.", env: "None.",
    files: [{ name: "automation.py", language: "python", content: automation }] },
];

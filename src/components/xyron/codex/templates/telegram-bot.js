// Telegram bot with no extra dependencies (Node 18+). Uses long polling.
// Setup:
//   1. Talk to @BotFather on Telegram, create a bot, and copy the token.
//   2. Put it in an environment variable. NEVER paste the token into this file:
//        TELEGRAM_BOT_TOKEN=123456:ABC...  node telegram-bot.js
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN environment variable.");
  process.exit(1);
}
const API = `https://api.telegram.org/bot${TOKEN}`;

async function call(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || "Telegram API error");
  return data.result;
}

const commands = {
  "/start": () => "Hi! I'm your bot. Try /help",
  "/help": () => "Commands:\n/start - say hello\n/help - this list\n/ping - check I'm alive\n/echo <text> - repeat your text",
  "/ping": () => "pong",
  "/echo": (args) => args || "Send some text after /echo",
};

async function handle(message) {
  const text = (message.text || "").trim();
  if (!text.startsWith("/")) return;
  const [cmd, ...rest] = text.split(" ");
  const name = cmd.split("@")[0].toLowerCase();
  const run = commands[name];
  await call("sendMessage", { chat_id: message.chat.id, text: run ? run(rest.join(" ")) : "Unknown command. Try /help" });
}

let offset = 0;
console.log("Bot started. Press Ctrl+C to stop.");
while (true) {
  try {
    const updates = await call("getUpdates", { offset, timeout: 30 });
    for (const u of updates) {
      offset = u.update_id + 1;
      if (u.message) await handle(u.message);
    }
  } catch (e) {
    console.error("Polling error:", e.message);
    await new Promise((r) => setTimeout(r, 3000));
  }
}

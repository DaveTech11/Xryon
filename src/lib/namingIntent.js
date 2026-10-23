// Naming requests ("TEAM TEMPEST I NEED BETTER NAME", "give me a clan name", "name for my brand").
// These are creative asks, never coding: the model must not turn them into a component / .tsx file just
// because earlier messages in the chat contained code. The answer is a ChatGPT-style list of names plus
// "top picks" cards (logo thumbnail, name, one-line vibe, Copy button).

const NAME_WORD = /\b(?:names?|naming|rename|nicknames?|usernames?|handles?|gamertags?|tags?|slogans?|taglines?)\b/i;
const NAME_SUBJECT = /\b(?:team|clan|squad|guild|crew|gang|group|brand|business|company|startup|channel|page|store|shop|band|club|server|community|youtube|tiktok|instagram|gaming|esports?|pet|baby|character|project|app|bot|game|podcast|label|studio)\b/i;
const NEED_NAME = /\b(?:need|want|give|suggest|find|think of|come up with|generate|create|make|help me (?:with|find|pick|choose)|any|better|cooler|stronger|new|another)\b/i;
const CODE_FENCE = /```/;
const CODE_FILE = /\.(?:js|jsx|ts|tsx|py|html|css|json|php|java|go|rs|zip)\b/i;
// "rename this file / variable / function" and "name of the function" are real code questions
const CODE_NAMING = /\b(?:variable|function|method|class|component|file|folder|repo|repository|package|endpoint|route|table|column|database|branch|commit|prop|hook)\s+names?\b|\bnames?\s+(?:of|for)\s+(?:the\s+|this\s+|my\s+)?(?:variable|function|method|class|component|file|folder|repo|package|endpoint|route|table|column|branch|prop|hook)\b|\brename\s+(?:the\s+|this\s+|my\s+)?(?:variable|function|method|class|component|file|folder|repo|package)\b/i;

export const wantsNames = (text = "") => {
  const t = String(text || "").trim();
  if (t.length < 6 || t.length > 400 || t.startsWith("/")) return false;
  if (CODE_FENCE.test(t) || CODE_FILE.test(t) || CODE_NAMING.test(t)) return false;
  if (!NAME_WORD.test(t)) return false;
  // "I need better name" / "name for my clan" / "team names"
  return NEED_NAME.test(t) || NAME_SUBJECT.test(t);
};

export const namingPrompt = (cardsOn = true) => `Naming request: the person wants NAMES (for a team, clan, brand, channel, username, pet, product, etc.). This is a creative task, NOT a coding task. Ignore any code, files or components from earlier in the chat unless they clearly say the name is for that code. Never write a code file, a component, a path= block or a ZIP for this. Keep any symbols or fancy-font decoration the person used around their current name (for example the ornaments around the team name) in the same style for your suggestions.

Reply like this:
1) One short line of intro.
2) A numbered Markdown list of 8-10 strong, short, original names, each in bold and decorated in the same style as theirs.
3) A heading "My top 3 picks".
${cardsOn ? `4) Right under it, one picks block (valid JSON, nothing else inside), exactly in this shape:
:::xyron-picks
{"items":[{"name":"TEAM ECLIPSE","tagline":"Mysterious, elite, and stylish.","logo":"purple eclipse esports logo"}]}
:::
- exactly 3 items; "name" is the full name exactly as it should be copied (with its decoration); "tagline" is one short line about the vibe; "logo" is 2-5 English words describing a logo picture for it (omit "logo" only if a picture makes no sense).` : `4) The 3 picks as a short list, each with one line about its vibe.`}
5) Finish with ONE short question about the vibe they want (for example "What vibe do you want for the name?"). No other closing text.`;

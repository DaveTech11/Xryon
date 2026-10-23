# NEXUS models and automatic routing

OpenAI is no longer used (no `OPENAI_API_KEY`, `OPENAI_MODEL`, `MODEL_NEXUS_*`, `OPENAI_IMAGE_MODEL`). Every chat request goes to
Nexus AI (`nexus.mjs`, `NEXUS_API_KEY`) first. Vortyx Pulse and the free api-rebix endpoints (`gptlogic`, `claude-haiku`,
`claude-session`, `deepseek-v3`) are only backups if Nexus fails or is over quota.

| Model | Level | Answers | Asks first (existing) | Access |
|---|---|---|---|---|
| Xyron Nexus Auto | - | picks one of the four per message | - | free |
| Xyron Nexus V0 Mini | 1 Fast | greetings, questions, explanations, writing, summaries, research answers, documents | Nexus AI, then free `claude-haiku`; skips Vortyx | free |
| Xyron Nexus V0 Pro | 3 Advanced | hard maths and logic | Nexus AI, then Vortyx Pulse, free `deepseek-v3` | Premium |
| Xyron Nexus V1 Pro | 3 Advanced | coding: build, debug, review, big projects | Nexus AI (`nexus-1-pro-flagship`), then free `claude-session` | Premium |

The normal failover chain behind every tier is unchanged. A free user on Xyron Nexus Auto who needs a Premium tier gets the
free `Xyron Code` / `Xyron Reason` model instead. Choosing any model by hand (a NEXUS tier or any older model) is
respected exactly. Only `Xyron Nexus Auto` is routed per message. Codex requests keep their own chain.

## The seven routes (Xyron Nexus Auto)
Every AUTO message lands on one named route. The chat response carries it as `route.id` / `route.label` and the server log prints it
(`[route] AUTO -> Coding -> Xyron Nexus V1 Pro | ...`). A manually chosen model is never re-routed.

| Route | Picked when | Model tier | Extra handling |
|---|---|---|---|
| Fast Chat | greetings, short questions, easy maths, small text fixes | Xyron Nexus V0 Mini | short answers, 6 messages of history |
| General Chat | explanations, writing, summaries, everyday talk | Xyron Nexus V0 Mini | 20 messages of history |
| Coding | build, debug, review, ZIP projects | Xyron Nexus V1 Pro (Premium) | full files in code blocks |
| Reasoning | hard maths, logic, analysis | Xyron Nexus V0 Pro (Premium) | step by step, 40 messages of history |
| Web Research | news, prices, scores, "latest" | Xyron Nexus V0 Mini | turns web search on; answer cites the sources |
| File Processing | attached document or picture | Xyron Nexus V0 Mini | answer built on the attachment |
| Image Generation | "draw / generate / make a ... picture" | Xyron Nexus V0 Mini (text part only) | the picture itself is made by the image generator |

There is ONE rule for "is this a picture request?": `isImageRequest` in `imageIntent.mjs`. The chat page imports it (through
`src/lib/settings.js`) to decide whether to call the image endpoint directly, and `router.mjs` imports the same file for the Image
Generation route. Change the rule in `imageIntent.mjs` only. Questions like "can u generate images?" are not picture requests.

## How AUTO decides (router.mjs, no extra AI call)
Local rules over the latest message, the message before it (short follow-ups like "fix it" inherit the previous job),
attachments (ZIP project -> coding, image or document -> conversation tier at least), the web-search switch and the
Xyron mode (`/fast`, `/deep`, `/coder`, `/researcher` ...). Research wording turns on the existing web search; a plain
greeting never does. Less history is sent for easy levels (6 / 20 / 40 messages).

## Optional environment variables (all have defaults)
`NEXUS_V1_PRO_MODEL` (default `nexus-1-pro-flagship`) and `NEXUS_ROUTE_TIMEOUT_MS` (how long Nexus AI may take inside a tier, default 15000).

## Nexus AI streaming
`callNexus` (nexus.mjs) now sends `stream: true` when the chat is streaming and reads the reply as it arrives (SSE `data:` chunks).
If the endpoint answers with one JSON reply instead, the whole text is shown at once. Xyron Nexus V1 Pro sends `model` =
`NEXUS_V1_PRO_MODEL` (default `nexus-1-pro-flagship`). To use the newer endpoint set `NEXUS_API_URL` in Render (the code default is unchanged).

## Measuring
Every routed request logs one line, e.g. `[route] AUTO -> Xyron Nexus V1 Pro | code L2: ... | classify 2ms, total 12ms, history 3/3`,
plus which provider answered and how long it took. `npm test` runs the rule tests and an end-to-end test that boots
`server.mjs` against local mock providers.

## Names (renamed)
The models are now called **Xyron Nexus Auto**, **Xyron Nexus V0 Mini**, **Xyron Nexus V0 Pro** and **Xyron Nexus V1 Pro** (old `NEXUS ...` names still work:
the server maps them, and the chat page moves a saved old choice to the new name).

## Any code request in normal chat (Codex-style)
When a message is a code request - build, fix, change, pasted code, an attached code file, or a short follow-up change to a project built earlier (`wantsBuild` / `isBuildFollowUp` in `src/lib/zipMode.js`); pure "what is / explain" questions stay normal chat -, the chat page sends `codex_build: true`. The server then sends it to the
Xyron Nexus coding tier (V1 Pro; free users get Xyron Code) whichever model is selected - except a Xyron Nexus tier chosen by hand, which is respected.
The reply uses the Codex structure (PROJECT / PLAN / every file in full / SUMMARY) and the chat shows it as one ZIP card named after the project.

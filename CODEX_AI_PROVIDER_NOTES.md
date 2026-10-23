# Xryon Codex AI Provider Notes

## Purpose

Codex (the `/codex` project-building experience) uses a dedicated provider chain for coding requests. Normal Xryon chat keeps its existing provider routing unless the request explicitly includes `codex: true`.

## Provider order

1. **Primary:** `claude-session`
   - Default endpoint: `https://api-rebix.vercel.app/api/claude-session?q=...`
2. **Fallback:** `claude-haiku`
   - Default endpoint: `https://api-rebix.vercel.app/api/claude-haiku?q=...`

The backend uses the existing `callRebixModel()` helper in `rebix.mjs`. This helper URL-encodes the query, handles response parsing, applies a timeout, and accepts plain-text or common JSON response shapes. If the primary request fails or returns no usable response, Codex tries the fallback. If both fail, the API returns a concise temporary-unavailable error.

## Files changed

- `server.mjs`
  - Adds the `codex` option to the shared AI dispatcher.
  - Adds the Codex-only primary/fallback provider chain and organized coding instructions.
  - Enables this routing only when the API request contains `codex: true`.
- `src/components/xyron/codex/CodexBuilder.jsx`
  - Marks build requests with `codex: true`.
- `.env.example`
  - Documents `CODEX_AI_TIMEOUT_MS` and optional endpoint overrides.

## Configuration

The default endpoints work without extra environment variables. Optional Render environment variables:

- `CODEX_AI_TIMEOUT_MS=45000` — timeout per provider attempt, in milliseconds.
- `REBIX_CLAUDE_SESSION_URL` — override the primary endpoint.
- `REBIX_CLAUDE_HAIKU_URL` — override the fallback endpoint.

Never place provider secrets in frontend code or `VITE_*` variables. These endpoints are called from the Node.js server.

## Request flow

1. Codex sends its project prompt and `codex: true` to `/api/functions/xryonChatStream`.
2. The server calls `claude-session` first.
3. If that call fails or has an empty/unusable response, the server calls `claude-haiku`.
4. The result is returned through the existing Codex response flow. The endpoint does not provide token-by-token upstream streaming, so the complete answer arrives as one provider result and the current UI can reveal it progressively.

## Verification checklist

- [ ] Deploy to a test environment.
- [ ] Submit a small Codex prompt and confirm the primary endpoint responds.
- [ ] Temporarily configure an invalid `REBIX_CLAUDE_SESSION_URL` and confirm fallback succeeds.
- [ ] Temporarily configure both endpoints invalid and confirm the UI shows a retryable error.
- [ ] Confirm ordinary chat requests without `codex: true` still use their existing routing.
- [ ] Run `npm.cmd run build` from the project root on Windows, or `npm run build` in a Node environment.

## Notes

- Provider availability, response quality, and rate limits depend on the upstream API service.
- Codex's existing model picker and subscription checks remain intact, but this dedicated provider chain takes precedence for requests marked `codex: true`.


## Personal-history image generation (explicit requests only)

`src/pages/Chat.jsx` now recognizes explicit image prompts such as “draw everything you know about me” and “create an image based on my conversation history.” For those requests only, it appends the user's saved Xryon Memory entries plus up to 30 recent user messages from the current conversation to the image prompt. The image-generation provider receives that contextualized prompt through the same existing route; other image requests and ordinary chat are unchanged.

Privacy and limitations:
- The feature only adds personal context when the user's wording explicitly asks for it.
- Saved Memory is currently browser-local (`localStorage`), so it does not automatically sync between devices/browsers.
- Recent conversation context is limited to messages available in the current Chat page session; it is not a search across every historical conversation.
- Uploaded images are still passed through the existing image upload/reference-image flow; the text context does not itself give the image provider access to every previous image.
- Users should avoid asking the model to include passwords, API keys, or other secrets in generated images.


## Codex coding upgrade (build quality)

What changed and why:

- **Stronger build prompt** (`BUILD_SYSTEM_PROMPT` in `codexBuild.js`, and the Codex system prompt in `server.mjs`): plan every file first, complete files only, a wiring checklist (script/import paths, ids, package.json deps, `"type"`), error/empty-state handling, accessibility and responsive rules, security rules, smallest-change rule for edits.
- **Cut-off replies are recovered.** Before, a reply that stopped mid-file silently lost that file. Now `parseBuildReply` returns it as `partial`, and the builder asks the AI (up to 2 rounds) to finish the cut-off file and any file the PLAN promised but never wrote. If it still cannot finish, the person is told which files are missing and can say "continue".
- **Project wiring checks** (`codexCheck.js`, pure and unit-tested): HTML `src`/`href` to files that do not exist, `getElementById` ids missing from the HTML, relative `import`/`require` that do not resolve, packages missing from `package.json`, `main`/`start` pointing at missing files, CommonJS/ESM mismatch with `"type"`, Python without `requirements.txt`. Real problems are sent back to the AI for one automatic repair round. Nothing is executed.
- **Better syntax checks**: ES modules, TypeScript, CSS and Python are now bracket/string/comment scanned (modules used to be skipped). JSX files are skipped on purpose.
- **Smarter follow-up context**: the AI now gets a map of the whole project, and files named in the request, entry files and the files changed last turn are sent first. Files too big to send are listed as "not shown, do not rewrite".
- **Server**: default `CODEX_AI_TIMEOUT_MS` raised from 45000 to 120000 (the old limit cut long builds off, which caused the unfinished files). The free fallback endpoints keep the build instructions when the URL is too long (the project context is shrunk first). The extra finish/repair rounds do not use up a second daily request or Nexus try (`codex_round`, 2 per counted request within 10 minutes).

Tests: `npm test` now also runs `tests/codexCheck.test.mjs`.

### Self-correction loop (runtime)

After the syntax and wiring checks, HTML and plain-JavaScript projects are test-run once in a hidden copy of the Run sandbox (`codexRun.js`: opaque origin, no network). Uncaught errors, failed promises, `console.error` and a page that stays blank are collected (network/CSP noise is ignored, and projects with an obvious endless loop are not auto-run). If anything fails, the AI gets the errors, finds the root cause and sends fixed files; the project is then run again to confirm. At most 2 fixes per build; whatever still fails is shown to the person. Node and Python projects are not auto-run. The server allows 4 internal rounds (finish, wiring repair, runtime fixes) per counted Codex request within 10 minutes.

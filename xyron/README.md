# Xyron

A clean React + Vite AI workspace with Chat and Codex.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The frontend no longer depends on Base44. Local accounts and Codex files are stored in the browser. AI, checkout, and other server-backed features use generic `/api/...` endpoints when a backend is configured.

## Image shortcut image-to-image
Xyron supports uploading an image and using a style shortcut by itself, for example `/manga`. The chat sends the uploaded image URL(s), selected shortcut, style, and `image_to_image` mode to the existing `generateImage` function so the backend can transform the uploaded image without requiring a text prompt.

## Xyron Intelligence Layer
- Xyron Brain workspace at `/intelligence`
- Tool Builder and Workflow Builder
- Intelligence activity timeline
- Capability hub for research, code, files, vision, voice, image and automation workflows
- Uses local workspace state and existing app routes; production execution still depends on connected backend services.

## Xyron backend

The project now includes a dependency-light Node backend in `server.mjs`. It provides:

- cookie sessions and password hashing with Node `crypto`
- registration, login, logout, reset-token flow and `/api/auth/me`
- persistent JSON data store under `data/xyron.json`
- server-backed users, conversations, messages, code files, subscriptions and feedback
- Xyron chat and coding-fix AI endpoints
- image-generation endpoint compatible with the existing frontend payload
- Xyron Intelligence planning, tools, workflows, activity and URL research endpoints
- an opt-in JavaScript runner with a short process timeout (not a hardened multi-tenant sandbox)
- admin statistics endpoint

Copy `.env.example` to `.env` and set your provider secrets. Run `npm install`, then `npm run server` in one terminal and `npm run dev` in another. The Vite dev server proxies `/api` to port 3000.

**Security note:** for public production deployment, put the API behind HTTPS, add rate limiting, CSRF protection, a real database, object storage, email delivery, and a hardened isolated code-execution service. Never expose provider secrets in the browser.

## Email-code sign-up and admin broadcasts

**Sign-up:** email -> 6-digit code -> name + Terms checkbox -> Done (signed in). Existing accounts can also sign in with a code from the same screen (`/register`). Codes are created and checked on the server (salted hash, 10 min expiry, 5 tries, 60 s resend cooldown). Delivery is an HTTP POST to Formspree (`FORMSPREE_ENDPOINT`, defaults to your form). While `NODE_ENV` is not `production` the code is also printed in the server console; set `EMAIL_TRANSPORT=console` to skip sending during development. The old open password `/api/auth/register` route now returns 410.

**Broadcasts:** admins open `/admin` -> "Broadcast to all users". Users get a black rounded notification (checked every 30 s); tapping it opens a black card with **Okay** (close) and **More** (open the app, or the link the admin set). The server decides who is an admin from `role === "admin"` or the `ADMIN_EMAILS` env var (comma separated), so set it on the server.

## Xyron Labs card, Codex lock

- Asking "who is your owner / who created you / who made Xyron" gets the fixed reply `I am Xyron, created by Xyron Labs`. Tapping **Xyron Labs** opens the card (`src/components/xyron/XyronLabsModal.jsx`). All wording is in `src/lib/xyronLabs.js`.
- Photos: `public/labs/` (carousel) and `public/team/eze-david.jpg`. For a new background, add a transparent PNG cut-out as `public/team/eze-david.png`; it is picked up automatically and shown on the blue gradient.
- Codex is admin-only in the UI and on the server (`/api/entities/CodeFile` returns 403 for non-admins). The server treats the owner emails in `server.mjs` (`OWNER_EMAILS`) as admins once that email has signed in with an email code, plus `ADMIN_EMAILS` from the environment and any account with `role: "admin"`.

## Continue with Google

1. Go to https://console.cloud.google.com, create a project, and set up the OAuth consent screen (app name Xyron, your support email, External).
2. Credentials -> Create credentials -> OAuth client ID -> **Web application**.
3. Under **Authorized redirect URIs** add `http://localhost:5173/api/auth/google/callback` (dev) and `https://YOUR-SITE/api/auth/google/callback` (live).
4. Copy `.env.example` to `.env` and fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `PUBLIC_URL` (the address people open, no trailing slash). On a host like Render/Vercel/Railway, set the same three as environment variables.
5. Restart the server. While the consent screen is in "Testing", only the test users you add can sign in; click "Publish app" to open it to everyone.

Google accounts are matched by email, so someone who signed up with an email code and later uses Google with the same address lands in the same account.

## All settings live in `.env`

Open `.env` (a blank template is in `.env.example`), change the values, and restart `npm run server` and `npm run dev`. It covers: port and site address, admin emails, Google sign-in, email-code delivery (Formspree), the Vortyx / OpenAI / free AI provider keys and URLs, model names, rate limit, and the code-runner switch. `.env` is in `.gitignore`; never upload it. On a host (Render, Vercel, Railway...) enter the same names and values in the host's environment settings instead of uploading the file.

## Image generation and the upgrade popup

`/api/functions/generateImage` uses Google Gemini (`GEMINI_API_KEY`, model `gemini-2.5-flash-image`). Generated images are saved as files in your storage (disk or Postgres) and returned as `/api/files/<id>`, so they do not expire. Uploading a photo with a style shortcut (for example `/manga`) sends it to Gemini as a reference image. Only successful images count toward the daily limit.

If generation fails for any reason, the server returns the generic code `image_unavailable` (the real reason is logged on the server) and the chat opens `ImageUpgradeModal` instead of printing an error: **Continue** returns to the chat, **Upgrade to Plus** opens `/premium`. Premium users and admins get a short retry message instead of an upsell.

## Premium payments

Plans: Premium 5,000 NGN and Premium+ 10,000 NGN, each for 30 days. On `/premium` the user picks **Flutterwave**, **OPay** or **Crypto (NOWPayments)**. Setup and webhook URLs are in `.env.example` section 8.

- The server creates an order, sends the user to the provider's hosted checkout, and activates the plan only after asking the provider's own API whether the payment succeeded (webhooks are just a trigger to re-check). Underpayments are rejected.
- Subscriptions can only be created by the server. Users can no longer create a `Subscription` through `/api/entities`.
- Paying again for the same plan extends it by 30 days; switching plans starts the new plan immediately. Plan limits (images, files, documentation per day) are enforced on the server.
- Crypto is confirmed by NOWPayments' signed IPN callback, which needs a public `PUBLIC_URL` (use a tunnel when testing locally).

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

**Sign-up:** email -> 6-digit code -> name + Terms checkbox -> Done (signed in). Existing accounts can also sign in with a code from the same screen (`/register`). Codes are created and checked on the server (salted hash, 10 min expiry, 5 tries, 60 s resend cooldown). Delivery goes through Brevo when `BREVO_API_KEY` is set (also set `BREVO_FROM_EMAIL` to a sender verified in Brevo, optional `BREVO_FROM_NAME`); otherwise through Resend when `RESEND_API_KEY` is set (also set `RESEND_FROM`, e.g. `Xyron <noreply@yourdomain.com>`, once your domain is verified in Resend); otherwise it falls back to SMTP/Formspree. Formspree is an HTTP POST (`FORMSPREE_ENDPOINT`, defaults to your form). While `NODE_ENV` is not `production` the code is also printed in the server console; set `EMAIL_TRANSPORT=console` to skip sending during development. The old open password `/api/auth/register` route now returns 410.

**Sending the codes with Brevo (works on Render's free tier, no domain needed):**
1. In Brevo create an account, then go to *Senders, Domains & Dedicated IPs -> Senders* and add the email you want codes to come from. Brevo emails you a link; confirm it.
2. Go to *SMTP & API -> API Keys* and create a key. It must start with `xkeysib-` (an `xsmtp-` key will not work).
3. In Render -> Environment add `BREVO_API_KEY` (the key) and `BREVO_FROM_EMAIL` (the sender from step 1). `BREVO_FROM_NAME` is optional (default `Xyron`). Paste values with no quotes or spaces.
4. If Brevo shows "unrecognised IP address" in the error, open *Security -> Authorised IPs* in Brevo and turn blocking off (Render's IP changes).
Brevo is used first whenever `BREVO_API_KEY` is set. The Render log prints one `[email] Brevo: ...` line at start-up showing the key type and sender, and a failed send shows the real reason on the sign-up screen (`SHOW_EMAIL_ERRORS=0` hides it).

**Broadcasts:** admins open `/admin` -> "Broadcast to all users". Users get a black rounded notification (checked every 30 s); tapping it opens a black card with **Okay** (close) and **More** (open the app, or the link the admin set). The server decides who is an admin from `role === "admin"` or the `ADMIN_EMAILS` env var (comma separated), so set it on the server.

## Xyron Labs card, Codex lock

- Asking "who is your owner / who created you / who made Xyron" gets the fixed reply `I am Xyron, created by Xyron Labs`. Tapping **Xyron Labs** opens the card (`src/components/xyron/XyronLabsModal.jsx`). All wording is in `src/lib/xyronLabs.js`.
- Photos: `public/labs/` (carousel) and `public/team/dave-tech.jpg` (the Dave Tech banner). For a new background, add a transparent PNG cut-out as `public/team/eze-david.png`; it is picked up automatically and shown on the blue gradient.
- Codex is open to every signed-in user. Each user's Codex files (`/api/entities/CodeFile`) are private to their own account, even for admins, and are capped at 1 MB per file and 300 files per user. Signed-out visitors are sent to `/login`. The owner emails in `server.mjs` (`OWNER_EMAILS`) and `ADMIN_EMAILS` still control `/admin` and broadcasts.

## Continue with Google

1. Go to https://console.cloud.google.com, create a project, and set up the OAuth consent screen (app name Xyron, your support email, External).
2. Credentials -> Create credentials -> OAuth client ID -> **Web application**.
3. Under **Authorized redirect URIs** add `http://localhost:5173/api/auth/google/callback` (dev) and `https://YOUR-SITE/api/auth/google/callback` (live).
4. Copy `.env.example` to `.env` and fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `PUBLIC_URL` (the address people open, no trailing slash). On a host like Render/Vercel/Railway, set the same three as environment variables.
5. Restart the server. While the consent screen is in "Testing", only the test users you add can sign in; click "Publish app" to open it to everyone.

Google accounts are matched by email, so someone who signed up with an email code and later uses Google with the same address lands in the same account.

## All settings live in `.env`

Open `.env` (a blank template is in `.env.example`), change the values, and restart `npm run server` and `npm run dev`. It covers: port and site address, admin emails, Google sign-in, email-code delivery (Formspree), the Nexus / Vortyx / free AI provider keys and URLs, model names, rate limit, and the code-runner switch. `.env` is in `.gitignore`; never upload it. On a host (Render, Vercel, Railway...) enter the same names and values in the host's environment settings instead of uploading the file.

## Image generation and the upgrade popup

`/api/functions/generateImage` tries GeniGPT AI first (`genigpt.mjs`: text-to-image, style shortcuts and image edits by public URL) and falls back to Google Gemini (`GEMINI_API_KEY`, model `gemini-2.5-flash-image`). Generated images are saved as files in your storage (disk or Postgres) and returned as `/api/files/<id>`, so they do not expire. Uploading a photo with a style shortcut (for example `/manga`) sends it to Gemini as a reference image. Only successful images count toward the daily limit.

If generation fails for any reason, the server returns the generic code `image_unavailable` (the real reason is logged on the server) and the chat opens `ImageUpgradeModal` instead of printing an error: **Continue** returns to the chat, **Upgrade to Plus** opens `/premium`. Premium users and admins get a short retry message instead of an upsell.

## Premium payments

Plans: Premium 5,000 NGN and Premium+ 10,000 NGN, each for 30 days. On `/premium` the user picks **Flutterwave**, **OPay** or **Crypto (NOWPayments)**. Setup and webhook URLs are in `.env.example` section 8.

- The server creates an order, sends the user to the provider's hosted checkout, and activates the plan only after asking the provider's own API whether the payment succeeded (webhooks are just a trigger to re-check). Underpayments are rejected.
- Subscriptions can only be created by the server. Users can no longer create a `Subscription` through `/api/entities`.
- Paying again for the same plan extends it by 30 days; switching plans starts the new plan immediately. Plan limits (images, files, documentation per day) are enforced on the server.
- Crypto is confirmed by NOWPayments' signed IPN callback, which needs a public `PUBLIC_URL` (use a tunnel when testing locally).

## Codex home page, imports and templates

- `/codex` opens a landing page (`src/components/xyron/codex/CodexHome.jsx`). Starter pills pre-fill the prompt box; sending runs the existing Codex AI flow into a new file. Nothing about the AI endpoints changed.
- **Upload a Project** (button or drag-and-drop) imports source files or a ZIP into the editor (`codexImport.js`). It rejects `../` and absolute paths, skips `node_modules`, `.git`, `.env` and key files, and caps uploads at 10 MB / 5 MB extracted / 200 files / 8 folders deep. Imported code is never executed.
- **Browse Templates** (`CodexTemplates.jsx`, `codexTemplates.js`): 9 real templates. The web ones preview in a sandboxed iframe (`sandbox="allow-scripts"`). The source files live in `codex/templates/` and are loaded with Vite's `?raw` import. To add one, drop the file in that folder and add an entry to `codexTemplates.js`.
- Testing uploaded projects is not built yet: it needs a separate, isolated execution worker.


## Music (Explore > Music)

- Sidebar **Explore** opens a flyout with **Music** and **Anime** (add more lines to `exploreItems` in `Sidebar.jsx`, e.g. Maps).
- `/music` page: search any song/artist, genre chips, "Feel the Beat" hero, Popular list, Library (Liked / Recently played), full Now Playing screen with waveform seek bar.
- `music.mjs` merges **Audius** (full-length songs) and **Deezer** (30-second previews of mainstream hits). No API keys needed. Songs are only streamed through `/api/music/stream` (signed link, Range support); there is no download button anywhere.
- `src/lib/MusicContext.jsx` keeps one `<audio>` above the router, so music keeps playing while the person chats, and uses the **Media Session API** so the song appears in the phone notification / lock screen with play, pause, next, previous and a seek bar.
- `MiniPlayer` floats over every page so the music stays one tap away inside Chat.

## Database backup (Render + Supabase)

Set `DATABASE_URL` (Render Postgres) and `SUPABASE_DB_URL` (Supabase **Session pooler** connection string). Xyron writes every change (app state and uploaded files) to both databases. On every start the newest copy is copied to the other one, so if the Render database expires you only create a new one, put its URL in `DATABASE_URL`, and deploy: all data is restored from Supabase automatically. If only `SUPABASE_DB_URL` is reachable, the app keeps running on Supabase.

## Shared Render hosting (deploy from Codex and chat)

Set **`RENDER_API_KEY`** (a Render API key, `rnd_...`) as an environment variable on the server (Render dashboard -> your Xyron service -> Environment). Never put it in the website code or commit it. With it set, anyone signed in can host a GitHub project from the chat (paste a link and say "deploy") or from Codex -> Host -> Render, without connecting their own Render account.

- Every service is named `xryon-<name>`, so the link is `https://xryon-<name>.onrender.com`.
- Shared deploys are always on Render's **free** plan, and people only see, redeploy and remove the services they created.
- Limits per person (change with env vars): `RENDER_SHARED_MAX_SERVICES` (default 3) and `RENDER_SHARED_DAILY_CREATES` (default 3).
- People who connect their own Render key keep using it instead (their own workspace, any plan).
- Rotate the key in Render if it is ever shared or leaked.

## Google sign-in consent screen

The Google sign-in button redirects to Google’s real OAuth consent screen (it is not a locally recreated screen). The OAuth request asks only for `openid`, `email`, and `profile`, so Google can display the account name/profile picture and email access summary. The request uses `prompt=consent select_account` to ask Google to show the consent/account chooser flow.

To brand the screen with your app name/logo, open **Google Cloud Console → Google Auth Platform → Branding** (or **APIs & Services → OAuth consent screen** in the older console), set the app name to **Xyron AI**, upload the logo, and configure the support email and authorized domains. Under **Audience**, configure the intended user type and test users if the app is still in testing. Under **Data Access**, keep only the scopes the app actually needs.

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `PUBLIC_URL` in the server environment. Add `${PUBLIC_URL}/api/auth/google/callback` as an authorized redirect URI in the Google Cloud OAuth client. The Google consent screen is hosted and rendered by Google, so its exact layout and wording remain controlled by Google.


**Banning users:** Admin page -> Users -> Ban / Unban. A banned person is signed out within seconds (their next request, or the 20 s check in the app) and sees "Your account has been deactivated ... Thanks for using Xryon". Signing in again with the same email, phone, password or Google answers the same way. Admins cannot be banned.

**Email codes:** when `BREVO_API_KEY` is set, Brevo is the only provider used and its own error is shown if it fails. Remove `RESEND_API_KEY` from Render so nothing else is tried.

**Input safety:** all data is stored through parameterised queries only (no user text is ever put into SQL). Emails, names, usernames and photo links are also checked against strict patterns on the server, passwords are length-limited and email logins are rate-limited.

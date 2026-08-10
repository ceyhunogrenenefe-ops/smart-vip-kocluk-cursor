# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is
Monorepo for the **Online VIP Ders ve Koçluk** / **Smart Koçluk** platform (Turkish online tutoring/coaching SaaS). The pieces:

- `student-coaching-system/` — the **primary app**: a Vite + React + TypeScript SPA. This is what you run to see and test the product.
- `api/` + `handlers/` — Vercel serverless backend (deployed on Vercel; wired up by `vercel.json`). Not run locally by default.
- `whatsapp-gateway/` — optional standalone Baileys/Express WhatsApp gateway (VPS service). Optional for most work.
- `whatsapp-student-tracking/` — a separate optional Next.js sub-app.

The dependency-refresh update script installs the root and `student-coaching-system` packages (this mirrors the `installCommand` in `vercel.json`). The `whatsapp-gateway/` and `whatsapp-student-tracking/` packages are optional and are NOT installed by the update script — run `npm install --prefix whatsapp-gateway` (or `--prefix whatsapp-student-tracking`) only if you need them.

### Running the primary app (frontend)
From `student-coaching-system/`:

- `npm run dev` — Vite dev server on `http://localhost:5173` (scripts live in `student-coaching-system/package.json`).
- `npm run lint` — ESLint. Note: the committed code has ~12 pre-existing lint errors and ~70 warnings unrelated to setup; a clean lint run is not expected.
- `npm run build` — production build to `dist/`.

### Non-obvious startup requirements (important)
- The dev server needs `student-coaching-system/.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. These are **public browser values** (the Supabase anon key is protected by RLS and is meant to ship in the client bundle). If missing, the app boots but shows a Supabase config warning and auth/data won't work. `.env.local` is gitignored (see root `.gitignore`), so it is not committed and must be recreated per environment. The current project's public values can be read from the live site's JS bundle at `https://www.dersonlinevipkocluk.com` (grep the main `/assets/index-*.js` for `*.supabase.co` and the `...role":"anon"...` JWT). See `student-coaching-system/.env.example` for the full list of optional variables.
- In local dev, the app makes relative `/api/...` calls and Vite proxies them to the **production** backend (`https://www.dersonlinevipkocluk.com`) — see the `server.proxy` block in `student-coaching-system/vite.config.ts`. So you do NOT need to run the serverless backend locally to exercise most flows; API requests hit production. Override with `VITE_API_BASE_URL` to point at a local/staging backend.
- **Dev is stricter than build**: the dev server uses the Babel-based `@vitejs/plugin-react` transform, which fails hard on things esbuild (used by `npm run build`) silently tolerates — e.g. duplicate import identifiers surface as a fatal `Identifier '...' has already been declared` error that blanks every route in dev while `npm run build` still passes. If `npm run dev` shows a blank page, check the Vite terminal for this error rather than assuming an env problem.

### Backend / optional services
- The serverless backend (`api/` + `handlers/`) requires many secrets (Supabase service role key, Twilio, Google OAuth, Meta WhatsApp, Garanti POS, Edesis, cron secrets). See `MEETINGS_SAAS_SETUP.md`, `EDESIS_KURULUM.md`, and `docs/`. Running it locally needs the Vercel CLI (`vercel dev`) and is only necessary when changing backend code — otherwise rely on the dev proxy to production.
- New user registration is **admin-approved**: `/register` writes a row to `pending_registrations` (it does not create an active account), so a freshly registered user cannot log in until an admin approves it.

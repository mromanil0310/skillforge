# MaglakbAI — Deployment

MaglakbAI ships as a **web/PWA** app (Vite build → static `dist/`). There is no native build in the pilot. This doc covers local build, production deploy (Netlify), the user-guide page (GitHub Pages), environment variables, and the sandbox build workaround.

---

## Prerequisites

- Node 20 and npm
- `npm install` once to populate `node_modules`
- `.env` copied from `.env.example` with Supabase vars filled in (required for cloud backup; all other vars optional)

## Scripts (`package.json`)

| Script | Command | Purpose |
|--------|---------|---------|
| `npm run dev` | `vite --port 8082` | Local dev server (fast HMR) |
| `npm run build` | `vite build --outDir dist` | Production build → `dist/` |
| `npm run serve` | `http.server 8083 --directory dist` | Serve a built `dist/` locally |
| `npm run build:serve` | build + serve | One-shot preview of the production bundle |
| `npm test` | `vitest run` | Unit + integration tests (run before deploy) |

A production build emits hashed assets into `dist/`:
- `dist/index.html`, `dist/assets/*` (vendor / navigation / app chunks)
- Everything in `public/` is copied to `dist/` root — PWA `manifest.json`, icons, `_redirects`, and `USER_GUIDE.html`.

---

## Production deploy — Netlify (recommended)

`netlify.toml` is committed: build config + security headers + long-cache headers for `/assets/*`. SPA routing is handled by `public/_redirects` (`/* /index.html 200`), which Vite copies to `dist/` on every build.

### First-time setup (one time)

1. Go to **app.netlify.com** → **Add new site** → **Import an existing project**
2. Connect to GitHub → pick **`mromanil0310/maglakbai-skill-tracker`**
3. Netlify auto-detects `netlify.toml` — build command and publish directory are pre-filled
4. Add environment variables under **Site configuration → Environment variables**:

| Key | Value | Required |
|-----|-------|----------|
| `VITE_SUPABASE_URL` | `https://wovceouygyobczkkeyxy.supabase.co` | ✅ Yes |
| `VITE_SUPABASE_ANON_KEY` | your anon key | ✅ Yes |
| `VITE_POSTHOG_API_KEY` | your PostHog key | Optional |

5. Click **Deploy site** — Netlify builds from `main` and gives you a `*.netlify.app` URL

### Every release after that

```bash
git push origin main   # Netlify auto-deploys on every push to main
```

That's it. No CLI needed.

### After deploy — update Supabase redirect URLs

Magic Link emails redirect the user back to the app. You must tell Supabase your production URL:

1. Supabase dashboard → **Authentication → URL Configuration**
2. **Site URL**: set to your Netlify URL (e.g. `https://maglakbai.netlify.app`)
3. **Redirect URLs**: add `https://maglakbai.netlify.app` (and keep `http://localhost:8082` for local dev)

Without this, Magic Links from production will redirect to localhost instead of the live app.

### Manual / one-off deploy (no account needed)

```bash
npm run build
# Drag the dist/ folder onto app.netlify.com/drop → instant URL
```

---

## User guide page — GitHub Pages

The how-to guide (`docs/USER_GUIDE.html`, also copied to `public/USER_GUIDE.html`) is published via GitHub Pages from the repo `mromanil0310/maglakbai-skill-tracker`:

- **Repo → Settings → Pages → Deploy from a branch → `main` / `/docs`.**
- Live at: `https://mromanil0310.github.io/maglakbai-skill-tracker/USER_GUIDE.html`

`docs/USER_GUIDE.html` is the source of truth; `public/USER_GUIDE.html` is the copy that ships inside the app build. Keep them in sync when editing.

> **Don't use GitHub Pages for the main app** — it doesn't support SPA routing natively. Netlify handles this via `_redirects`.

---

## Environment variables

Vite inlines `VITE_*` vars at **build time**. They must be set in the host's environment before `npm run build` runs — not at runtime.

| Variable | Purpose | Required |
|----------|---------|----------|
| `VITE_SUPABASE_URL` | Supabase project URL | Yes (for cloud backup) |
| `VITE_SUPABASE_ANON_KEY` | Supabase public anon key | Yes (for cloud backup) |
| `VITE_POSTHOG_API_KEY` | PostHog analytics key | No |
| `VITE_POSTHOG_HOST` | PostHog host override | No |

In local dev: copy `.env.example` → `.env` and fill in values. `.env` is gitignored.

---

## Sandbox / FUSE build workaround

In the agent sandbox, the workspace is a FUSE mount where Vite's in-place `dist/` cleanup can fail with an unlink error. Build to a temp dir instead:

```bash
node node_modules/.bin/vite build --outDir /tmp/sf_dist --emptyOutDir
```
Then copy `/tmp/sf_dist/*` back over `dist/` (overwrite works; deletes don't).

On your Mac, `npm run build` works directly — this workaround is only needed inside the sandbox.

---

## Pre-deploy checklist

- [ ] `npm test` — 94 tests green
- [ ] `npm run build` — no TS/Vite errors
- [ ] Spot-check via `npm run serve`
- [ ] `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set in Netlify env vars
- [ ] Supabase Site URL + Redirect URLs updated to the Netlify domain
- [ ] `USER_GUIDE.html` updated in **both** `docs/` and `public/` if changed

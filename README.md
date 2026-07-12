<p align="center"><img src="public/icon-512.png" width="96" alt="MaglakbAI logo" /></p>

# MaglakbAI

> **Level up through proof, not promises.**
> Any skill. Any field. Any level.

MaglakbAI is a skill gamification app for anyone who wants to grow. You log real proof-of-work outputs — projects, scripts, books, certifications, diagrams, GitHub repos — to earn XP, unlock milestone achievements, and share your progress. XP comes from **building, not watching.**

**📱 Live app:** https://fascinating-kitten-b6a79d.netlify.app
**📖 User guide:** https://mromanil0310.github.io/maglakbai-skill-tracker/USER_GUIDE.html

---

## Status

[![CI](https://github.com/mromanil0310/maglakbai-skill-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/mromanil0310/maglakbai-skill-tracker/actions/workflows/ci.yml)

🚀 **Live web / PWA pilot.** Runs in the browser and installs as a PWA. **Cloud backup** available via Settings → Cloud Backup (Magic Link sign-in — no password needed). Progress syncs across devices once signed in.

---

## Core idea — the addiction loop

```
Learn → Build → Log Output → Gain XP → Unlock Milestone → Share → Get Recognition → Repeat
```

The differentiator is **proof-based progression**: you don't earn XP for consuming content, you earn it for shipping real outputs.

## A week with MaglakbAI — how it's actually used

*MaglakbAI comes from "maglakbay" — to journey. Here's what the journey looks like in practice.*

**Day 1 — Start where you actually are.** Onboarding takes under a minute: pick one of 19 career paths (or build your own), then tell the app your honest starting point. *Fresh Start* begins at skill one. *Some Foundation* or *Bringing Experience*? The app doesn't just take your word for it — you can **test out** of foundational skills by passing a 10-question knowledge check. All-or-nothing, honor code on screen. Prove it, and the skill is yours; the roadmap opens up ahead of you.

**Days 2–6 — Log what you build, not what you watch.** Finished a SQL script at work? Read a chapter and wrote a real takeaway? Deployed something? Tap **+**, pick the output type, describe it, paste the link. The app grades your *evidence*, not your enthusiasm: a live link makes the output **Verified**, a thoughtful write-up makes it **Documented**, and a bare one-liner stays merely *Logged* — and logged-only work can never complete a skill. Your XP is a number you can defend, because every point traces back to something you actually did.

**The streak that doesn't punish you.** Log on consecutive days and the flame grows — but life happens, so there's a built-in grace day, and every 7-day streak earns a **freeze** you can spend when the week fights back. Burning too hot? The app notices a sprint-then-crash pattern and suggests recovery pace instead of shaming you. The goal is a durable habit, not anxiety.

**Day 7 — The milestone moment.** Enough quality outputs and the skill completes: confetti, the real XP total (every bonus itemized so the math checks out), the next skill unlocking on your Evolution Map — and an optional knowledge check to stamp the skill **Validated**. Then the map shows what's next, and the loop starts again.

**Any week — your proof travels with you.** Your Portfolio gallery collects every verified output into something you can actually show a hiring manager. Your data stays on your device by default, exports to a file you own, and optionally backs up to the cloud with a passwordless magic link. Works offline, installs like an app.

**Who it's for:** students proving they're job-ready, professionals documenting growth beyond the job title, career shifters who need receipts for their new skills, and anyone tired of certificates that say "watched" instead of "built."

👉 Try the pilot: **https://fascinating-kitten-b6a79d.netlify.app** · Full walkthrough: **[User Guide](https://mromanil0310.github.io/maglakbai-skill-tracker/USER_GUIDE.html)**

## Features

- **4-step onboarding** — set your name, pick a career path, choose your experience level, and land on your dashboard
- **Career Evolution Map** — skill nodes that unlock as prerequisites complete (locked → available → in-progress → completed)
- **Custom roadmaps** — build your own path or fork any of the 19 built-in paths
- **Log outputs** — 9 types (project, certification, GitHub repo, book, script, design/diagram, reflection, event, other) with XP rewards
- **XP & leveling** — 10 levels with titles, skill-completion bonuses, achievements
- **Streak system** — grace period, freeze mechanic, and 7/14/30-day milestone bonuses
- **Milestone celebrations** — confetti, level-up cards, and a shareable post
- **Community feed** — emoji reactions and a leaderboard *(sample/preview data in the pilot — clearly labeled)*
- **Profile** — stats, achievements, and a proof-of-work gallery

### Built-in career paths (19)

| Path | Track |
|------|-------|
| 🏗️ **Data Architect** | SQL → Python → Snowflake → Data Modeling → AI Workflow Design |
| 🤖 **AI Engineer** | Python → REST APIs → Prompt Engineering → Vector DBs → RAG → AI Agents |
| 🌐 **Full Stack** | HTML/CSS → JavaScript → React/RN → Backend APIs → Databases → Cloud Deploy |
| … | + 16 more: Data Engineer, ML Engineer, Backend, Frontend, Cloud, DevOps, Cybersecurity, Product Manager, Business Analyst, Data Analyst, Project Manager, Solutions Architect, Software Architect, Mobile Developer, UI/UX Designer, Startup Founder |

## Tech stack

| Layer | Choice |
|---|---|
| Framework | React Native + Expo (SDK 55) |
| Web bundler | Vite (web) · Metro (native) |
| Navigation | React Navigation 7 |
| State | Zustand (single store) |
| Persistence | `localStorage` (device-local) + Supabase (optional cloud backup, Magic Link auth) |
| Analytics | PostHog-compatible, **opt-in** (no PII; no-ops unless configured) |

## Getting started

```bash
# install dependencies
npm install

# run the web app (fastest for UI work)
npx vite

# or run via Expo (all platforms)
npx expo start
```

## Privacy

- **Your data stays on your device** by default (browser `localStorage`). Optional **Cloud Backup** is available via Settings → Cloud Backup — sign in with a Magic Link (no password) to sync across devices via Supabase.
- **Analytics is opt-in.** Nothing is tracked until you consent, and no personal data (name, email, free text) is ever sent.
- **Export / Import** is built in so you can back up your progress and move it between browsers or devices.

## How it was built — AI as an engineering partner

This app is itself a proof-of-work: designed, built, and hardened by one person working with AI (Claude) as a hands-on engineering partner — not a chatbot to ask, but a collaborator that writes code, hunts its own bugs, and has to show receipts.

The same standard the app demands from its users was applied to the app:

- **1,310 automated tests** + TypeScript strict mode, gated by CI on every push
- Every feature merged through **reviewed pull requests** with live in-browser verification
- Multiple full **release-readiness audits** — the AI found and fixed its own defects, from a broken backup-restore path to streaks that ticked on UTC time instead of Philippine midnight
- Honest engineering choices documented in the repo: sample community data is labeled PREVIEW, privacy copy tells the truth about where data lives, and unfinished things are called unfinished

Built with **proof, not promises** — all the way down.

## Roadmap

- **Phase 2 — Community + AI:** Live community feed (replace preview data with real Supabase queries), follow/unfollow, comments, real leaderboard, AI-generated LinkedIn posts on milestone completion
- **Phase 3 — Identity:** public profile URLs, GitHub links on outputs, LinkedIn share, push notifications
- **Phase 4 — Growth:** referrals, cohorts/teams, recruiter-facing profiles

## Project structure

```
App_MaglakbAI/
├── src/            # components, screens, navigation, store, types, utils
├── docs/           # PRD, ARCHITECTURE, DATABASE, USER_GUIDE.html
├── public/         # PWA manifest, icons, _redirects
└── App.tsx         # root component
```

---

_Built under the Biboy brand and developed against the Biboy Application Excellence Framework (BAEF)._

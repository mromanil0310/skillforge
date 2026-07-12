# Contributing to MaglakbAI

> MaglakbAI is a proprietary product (see `LICENSE`). This guide is for authorized contributors working on the codebase.

## Prerequisites

- Node 18+ and npm
- macOS/Linux/Windows (web dev). Native iOS/Android is not part of the current pilot.

## Setup

```bash
git clone https://github.com/mromanil0310/maglakbai-skill-tracker.git
cd maglakbai-skill-tracker
npm install
cp .env.example .env   # optional — all vars are optional (analytics/Phase 2)
```

## Day-to-day

```bash
npm run dev     # Vite dev server (fast HMR) — fastest for UI work
npm test        # run the test suite
npm run build   # production build → dist/
```

See `docs/DEPLOYMENT.md` for deploys and `docs/TESTING.md` for the test strategy.

## Where things live

- `src/screens/` — one file per screen · `src/components/` — shared UI
- `src/store/appStore.ts` — Zustand store (state init + slice composition + wiring)
- `src/store/slices/` — actions, grouped (`core`/`roadmap`/`feed`/`profile`)
- `src/store/persistence.ts` — localStorage persistence
- `src/data/` — static catalog (paths, skills, achievements, seed feed)
- `src/domain/` — pure, unit-tested calculators
- `src/utils/theme.ts` — design tokens (source of truth for colors)

Full map + rationale: `docs/ARCHITECTURE.md`. Agent/project context: `CLAUDE.md`.

## Coding conventions

- **TypeScript strict** — no `any`, avoid type casts unless unavoidable.
- **Functional components**, `const` arrow functions.
- **`StyleSheet.create()`** for styles — no inline style objects in JSX.
- **Colors only from `src/utils/theme.ts`** — never hardcode hex.
- **All state through `useAppStore`** — no shared state in local `useState`.
- New screen → register in `AppNavigator.tsx` (wrap with `withScreenBoundary`) and update the param list type.
- New skill/path → `src/data/careerPaths.ts` + `src/data/skills.ts`.
- New achievement → `src/data/achievements.ts` + `checkAchievements()` in `src/domain/skillGraph.ts`.
- New pure progression logic → `src/domain/` **with a Vitest test**.

## Do NOT build (out of scope)

AI tutoring / course content · course marketplace · DMs / private messaging · recruiter marketplace · live chat or video · push notifications (Phase 3+).

## Before opening a PR

1. `tsc --noEmit` is clean (or no new errors).
2. `npm test` is green.
3. `npm run build` succeeds.
4. Update docs when behavior/structure changes — especially `CLAUDE.md`, `docs/ARCHITECTURE.md`, and the backlog in `reports/maglakbai-audit-report.md` (this project is BAEF-governed: every finding/change is a tracked backlog item).

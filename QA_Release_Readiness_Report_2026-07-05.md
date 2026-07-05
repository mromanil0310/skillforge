# MaglakbAI — Release Readiness & Self-Healing Report

**Date:** 2026-07-05 · **Auditor:** Release Readiness & Self-Healing Engineer (Claude)
**Baseline:** `f2c352f` (post QA-defect-close-out) · **Fixes:** branch `fix/release-readiness-audit`

---

## 1. Test summary

| Gate | Result |
|---|---|
| Unit/integration tests | **1300 passed** (was 1296; +4 new: `isValidBackup` ×3, id-collision regression ×1) |
| `tsc --noEmit` | ✅ exit 0 |
| Production build | ✅ clean |
| Live E2E (Vite preview) | Onboarding (incl. email validation), log-output XP math (reconciled to the point: 25+100+300=425), skill completion → unlock → celebration, hydration across reloads (no heal-drift, no double-grants), streak day-boundary/grace(≤2d)/break(5d→1), feed react+comment+PREVIEW labeling+leaderboard, pull-to-refresh, profile stats, theme toggle (light verified via screenshot), export→import round-trip, Evolve DOM (0 nested buttons), console-clean tab sweep |

**Not exercised this pass (with reason):** Supabase cloud sync + Magic Link (no live backend creds in dev; unit-covered + verified in prior sessions), true offline cold-start (needs installed PWA; known limitation below), native iOS/Android (out of scope — web/PWA pilot per ADR-0004), full screen-reader/keyboard audit (A11Y-011, open).

## 2. Defects found this audit

### Fixed (self-healed, root-caused, tested)
| # | Sev | Defect | Root cause | Files |
|---|---|---|---|---|
| RR-1 | **P1** | **Export→import round-trip broken** — every backup the current app exports was rejected as "not a MaglakbAI backup" | Settings import validated only the legacy flat shape; ARCH-003 moved storage to a `{v, data}` envelope and the check was never updated. Restore is the data-loss recovery path. | `persistence.ts` (`isValidBackup`), `SettingsScreen.tsx`, tests |
| RR-2 | **P1 (latent)** | **ID collisions clobber data** — two same-millisecond `logOutput`s minted identical `fp_${Date.now()}` ids; the feed's id-keyed react/comment sync then silently overwrote one user post with a copy of the other (observed live). Also risks Supabase union-merge dropping rows. | All runtime ids minted from `Date.now()` | new `utils/uid.ts` (randomUUID); all mint sites in coreSlice/feedSlice/roadmapSlice/Evolve/Onboarding; regression test |
| RR-3 | P2 | Nested native `<button>` on every completed-unvalidated Evolve node (invalid DOM, `validateDOMNesting` ×8/mount, ambiguous screen-reader activation) | `b143c18` added the "Test your knowledge" nudge as a `TouchableOpacity[role=button]` inside the card button; on RN-web *any* `accessibilityRole="button"` renders a real `<button>` | `CareerNode.tsx` — pointer-only pressable Text; accessible path preserved via detail-sheet CTA |
| RR-4 | P2 | Weekly-dots "today" marker renders under the wrong weekday label for UTC+8 users between 00:00–07:59 (prime PH late-night hours) | Mixed frames: local `getDay()` vs UTC `toISOString()` date strings | `DashboardScreen.tsx` — derived entirely in UTC |

### Open — logged, not fixed here (with reasoning)
| # | Sev | Item | Why not fixed now |
|---|---|---|---|
| RR-5 | **P2** | **Day-keying is UTC app-wide** → the "day" (streaks, dots, hasLoggedToday) flips at 08:00 PHT, not midnight, for the target market | Consistent (no corruption) but wrong mental model. Fixing means migrating `lastActiveDate`/date-keyed semantics — needs a persistence migration + product sign-off, not a hot fix. |
| RR-6 | **P2** | **Bundle: 308 KB gzip app chunk** (1.1 MB raw; ~533 KB gzip first load) — the 950-question validation bank ships eagerly | Route/data-level code-splitting (lazy-load `validationQuestions`) is the right fix; deliberate change, not a pre-release churn. |
| RR-7 | P2 | No service worker → installed PWA white-screens on offline **cold start** (in-session offline works via localStorage) | Known PERF-002; Workbox/vite-plugin-pwa scoped work. Offline-first *state* is genuinely delivered; offline *boot* is not. |
| RR-8 | P3 | Transient `Unexpected text node: "."` fires once on Feed mount; not present in settled DOM after full scroll; no visible defect | Time-boxed; cosmetic. |
| RR-9 | P3 | Pre-fix users could carry duplicate-id posts (only plausible via scripted same-ms writes; observed only in my test profile) | A hydration dedupe is possible but the real-user probability is ~0 (UI can't double-submit in 1 ms). |
| RR-10 | P3 | Stray duplicate file `QA_Developer_Report_2026-06-17 2.md` (untracked Finder copy) | Not mine to delete without owner confirmation. |

### Carried context (pre-existing, tracked elsewhere)
COMP-001 (delete-account Edge Function: **one owner deploy step** — last public-release P0), AUTH-001 (Magic Link on default SMTP won't survive public traffic), GROW-001 (no growth surface), A11Y-011 (no full SR/keyboard audit), LOW-001 (unused Expo dep — owner decision), ARCH-004 (god screens; no component/e2e test harness).

## 3. Product principles check
- **Proof-based progression** ✓ XP only from logged outputs / passed assessments (test-out is proof-by-assessment; honest split verified).
- **Rewarding gamification** ✓ celebrations, streaks (grace/freeze verified), achievements reconcile to the XP point.
- **Offline-first** ◐ state yes (localStorage source of truth, verified across reloads); cold-start boot no (RR-7).
- **Never pretends backend exists** ✓ community is PREVIEW-labeled; cloud backup only claims sync when signed in.
- **Trustworthy UX** ✓ strengthened this audit (backup restore fixed; honest reset/erasure copy already in place).
- **Premium, intuitive UI** ✓ light+dark verified; consistent tokens; first-mission CTA on a fresh dashboard.

## 4. Product health scores (1–10)

| Dimension | Score | Basis |
|---|---|---|
| Functional quality | **9** | Core loop verified to the XP point; 1300 tests; both P1s found were edge/regression, now fixed |
| User experience | **8** | Polished, celebratory, honest; god-screens make future UX work risky (ARCH-004) |
| Performance | **6** | 533 KB gzip first load, eager question bank; fine on wifi/desktop, heavy for PH mid-range mobile |
| Accessibility | **7** | Labels/contrast/tap-targets good, dots now announced; no full audit (A11Y-011); nudge is pointer-only (accessible alt path exists) |
| Security | **8** | CSP, no secrets, PII-scrubbed opt-in analytics, RLS-by-design; localStorage unencrypted (accepted for pilot) |
| Maintainability | **7** | Clean domain/slice split, strong tests; 2–3k-line screens remain |
| Offline reliability | **6** | In-session offline solid; no offline boot (no service worker) |
| Gamification experience | **9** | Streak/XP/achievement math all reconciled live; UTC day-boundary quirk (RR-5) is the one blemish |
| Architecture quality | **8** | Matches documented ARCH decisions (localStorage + Supabase backup, schema-versioned envelope, heal-on-load); note: this audit validated against the repo's actual architecture docs — the audit brief's "IndexedDB" reference doesn't match ADR'd reality |

## 5. Verdict

**Closed pilot (current posture): ✅ READY FOR RELEASE** — with this audit's fixes merged.
**Public launch: ⚠️ NOT YET** — unchanged blockers: COMP-001 owner deploy step, AUTH-001 SMTP, plus RR-6/RR-7 strongly advised for a PH-mobile audience.

The two P1s found today (broken backup restore; id-collision clobbering) are exactly the class of defect that erodes user trust silently — both are now fixed, tested, and verified live.

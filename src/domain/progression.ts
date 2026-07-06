// ─── Progression Domain Logic ──────────────────────────────────────────────────
// Pure, dependency-free calculators for the MaglakbAI progression system:
// motivation decay, burnout protection, evidence tiers, and skill/career mastery.
//
// Extracted from appStore.ts (ARCH-002) so this logic can be unit-tested in
// isolation — these functions take plain data in and return plain data out,
// with no React, Zustand, theme, or storage dependencies. Presentation metadata
// that needs theme colors (MASTERY_TIERS, CAREER_MASTERY_META) stays in appStore.ts.

import type { Output, UserSkill, EvidenceTier, PaceMode, OutcomeType, OutputType } from '../types';
import { localDateStr, localDaysAgoStr } from '../utils/dates'; // pure, no deps

// ─── Motivation Decay Model ───────────────────────────────────────────────────
// Maps days since last output → 5 behavioral stages.
// 'active'   0–1 d  — engaged, no signal needed
// 'coasting' 2–3 d  — subtle nudge: keep the flow going
// 'drifting' 4–6 d  — visible nudge: one log brings you back
// 'fading'   7–13 d — DormancyCard (at_risk tier)
// 'recovery' 14+ d  — DormancyCard (dormant/lapsed tier)

export type DecayStage = 'active' | 'coasting' | 'drifting' | 'fading' | 'recovery';

export function getDecayStage(daysSinceLastOutput: number, hasStarted: boolean): DecayStage {
  if (!hasStarted || daysSinceLastOutput <= 1) return 'active';
  if (daysSinceLastOutput <= 3) return 'coasting';
  if (daysSinceLastOutput <= 6) return 'drifting';
  if (daysSinceLastOutput <= 13) return 'fading';
  return 'recovery';
}

// ─── Burnout Protection ───────────────────────────────────────────────────────
// Detects a sprint-then-drop pattern: ≥4 outputs in the 14-day window before
// the current gap started, combined with a gap of ≥2 days. Signal clears when
// the user sets paceMode to 'recovery'.

export type BurnoutSignal = 'sprint_followed_by_drop' | null;

export function getBurnoutSignal(
  outputs: Output[],
  daysSinceLastOutput: number,
  paceMode: PaceMode | undefined,
): BurnoutSignal {
  if (paceMode === 'recovery') return null;
  if (daysSinceLastOutput < 2 || outputs.length < 4) return null;

  const now = Date.now();
  const gapStartMs = now - daysSinceLastOutput * 24 * 60 * 60 * 1000;
  const windowStartMs = gapStartMs - 14 * 24 * 60 * 60 * 1000;

  const sprintOutputCount = outputs.filter((o) => {
    const t = new Date(o.createdAt).getTime();
    return t >= windowStartMs && t < gapStartMs;
  }).length;

  return sprintOutputCount >= 4 ? 'sprint_followed_by_drop' : null;
}

// ─── Evidence Tier ────────────────────────────────────────────────────────────
// Classifies an output's proof quality:
//   verified   — has a link (they put it online)
//   documented — description ≥ 50 chars (thoughtful writeup)
//   logged     — anything else (may be fake / too vague)
//
// Skill completion is gated: at least ONE output for the skill must be
// 'verified' or 'documented'. Logging-only skills can never complete.

export function getEvidenceTier(link: string | undefined, description: string): EvidenceTier {
  if (link && link.trim().length > 0) return 'verified';
  if (description.trim().length >= 50) return 'documented'; // 50 chars ≈ 1–2 sentences — accessible for all users
  return 'logged';
}

// ─── Mastery Framework ───────────────────────────────────────────────────────
// Per-skill mastery tiers derived from existing UserSkill state — no new user
// actions required for levels 0-2. Level 3 (Validated) requires the quiz.
//
// Tier model:
//   0 Not Started  — no outputs logged yet
//   1 Practicing   — outputs in progress, skill not yet completed
//   2 Competent    — skill completed (evidence gate passed)
//   3 Validated    — competent + knowledge-check quiz passed

export type MasteryLevel = 0 | 1 | 2 | 3;

export function getSkillMasteryLevel(us: UserSkill | undefined): MasteryLevel {
  if (!us || us.outputCount === 0) return 0;
  if (us.status === 'completed' && us.validated) return 3;
  if (us.status === 'completed') return 2;
  return 1; // in_progress
}

// Career-level mastery title derived from skill distribution across a path
export const CAREER_MASTERY_LADDER = ['Beginner', 'Developing', 'Competent', 'Advanced', 'Expert'] as const;
export type CareerMasteryTitle = typeof CAREER_MASTERY_LADDER[number];

export function getCareerMastery(
  userSkills: Record<string, UserSkill>,
  pathSkillIds: string[]
): {
  title: CareerMasteryTitle;
  competentCount: number;
  validatedCount: number;
  practicingCount: number;
  totalPathSkills: number;
} {
  const totalPathSkills = pathSkillIds.length;
  if (totalPathSkills === 0) {
    return { title: 'Beginner', competentCount: 0, validatedCount: 0, practicingCount: 0, totalPathSkills: 0 };
  }

  let competentCount = 0;
  let validatedCount = 0;
  let practicingCount = 0;

  pathSkillIds.forEach((id) => {
    const ml = getSkillMasteryLevel(userSkills[id]);
    if (ml === 1) practicingCount++;
    if (ml >= 2) competentCount++;
    if (ml >= 3) validatedCount++;
  });

  const competentPct = (competentCount / totalPathSkills) * 100;
  const validatedPct = (validatedCount / totalPathSkills) * 100;

  let title: CareerMasteryTitle;
  if (competentPct === 0 && practicingCount === 0) title = 'Beginner';
  else if (competentPct < 30)                      title = 'Developing';
  else if (competentPct < 70)                      title = 'Competent';
  else if (validatedPct < 60)                      title = 'Advanced';
  else                                             title = 'Expert';

  return { title, competentCount, validatedCount, practicingCount, totalPathSkills };
}

// ─── Output XP Calculation ───────────────────────────────────────────────────
// Single source of truth for output XP math (ARCH-006).
// Both the store (coreSlice.ts) and the Log Output preview use this function
// so they can never silently diverge.

// UX-029: XP granted on onboarding completion — gives every new user a non-zero
// starting state ("journey started ⚡") so they land on 25 XP / 🔥1 instead of
// four zeros, regardless of whether they logged a first output.

// Display-time streak decay (RR-11). A streak more than 2 days stale is already
// broken — logOutput will reset it to 1 on the next log — but the stale value stays
// persisted until then. Surfaces must not show a live flame for a dormant account
// (and conversely a freshly-onboarded user with lastActiveDate=today has a real,
// live streak of 1 per UX-029). Same grace window as logOutput: today, yesterday,
// or two days ago (grace) count as alive.
export function effectiveStreak(
  streak: number,
  lastActiveDate: string | undefined,
  now: Date = new Date(),
): number {
  if (!streak || !lastActiveDate) return 0;
  const alive =
    lastActiveDate === localDateStr(now) ||
    lastActiveDate === localDaysAgoStr(1, now) ||
    lastActiveDate === localDaysAgoStr(2, now);
  return alive ? streak : 0;
}

export const ONBOARDING_XP_GRANT = 25;

// Bonus granted when a user passes a skill's knowledge check (the "Validated" tier).
// Single source of truth shared by the store action and the UI labels.
export const VALIDATION_BONUS_XP = 100;

// ── Experience test-out (GROW-002) ──────────────────────────────────────────────
// A self-declared experience level never mints XP/completion by itself ("proof, not
// promises"). Instead, building/experienced users may convert prior knowledge into
// completion by PASSING a knowledge check ("test out") on the path's foundational
// skills — proof by assessment. Fresh Start (beginner) is build-only.
//
// FOUNDATIONAL_WINDOW: only the first N skills of a path are test-out eligible;
// everything beyond is build-only (no shortcuts for advanced skills).
export const FOUNDATIONAL_WINDOW = 3;
// Up to N attempts to pass a skill's test; exhaust them and the skill is build-only.
export const MAX_TESTOUT_ATTEMPTS = 3;
// Questions presented per test attempt (drawn/shuffled from the skill's bank).
export const TESTOUT_QUESTION_COUNT = 10;

// FEAT-001: completion bonus for a user-defined (custom) milestone. Modest + flat
// — proof (an output) is still required to complete it, but self-defined milestones
// don't grant curated-skill rewards, to keep the XP economy honest/leaderboard-safe.
export const CUSTOM_SKILL_COMPLETION_XP = 50;

export const OUTPUT_XP_BY_TYPE: Record<OutputType, number> = {
  project:    75,
  cert:       200,
  github:     60,
  book:       50,
  script:     50,
  diagram:    75,
  reflection: 30, // lighter-weight — recovery-mode engagement
  event:      65, // workshops, activities, events organised
  other:      50,
};

/**
 * Calculate total XP for a single output.
 *
 * @param type             - Output type (determines base XP)
 * @param descriptionLength - Length of the description string
 * @param hasKeyTakeaway   - Whether the user supplied a non-empty key takeaway
 */
export function calculateOutputXP(
  type: OutputType,
  descriptionLength: number,
  hasKeyTakeaway: boolean,
): number {
  const base = OUTPUT_XP_BY_TYPE[type] ?? 50;
  const qualityBonus = descriptionLength >= 120 ? 20
    : descriptionLength >= 50 ? 10
    : 0;
  const takeawayBonus = hasKeyTakeaway ? 15 : 0;
  return base + qualityBonus + takeawayBonus;
}

// ─── Career Outcome XP ───────────────────────────────────────────────────────
// Generous awards — these are real-world proof that MaglakbAI is working.

export const OUTCOME_XP: Record<OutcomeType, number> = {
  interview:       150,
  offer:           500,
  promotion:       400,
  role_change:     500,
  certification:   300,
  salary_increase: 300,
  portfolio:       200,
  freelance:       250,
};

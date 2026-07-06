import { describe, it, expect } from 'vitest';
import { useAppStore } from '../appStore';
import type { ExperienceLevel } from '../../types';
import { ONBOARDING_XP_GRANT } from '../../domain/progression';
import { localDaysAgoStr } from '../../utils/dates';

// Integration tests over the core store actions. These exercise the real Zustand
// store (no mocks) — the behavioral safety net required before slicing actions
// into separate modules (ARCH-002). localStorage is absent under Node, so the
// store boots clean and persistence is a guarded no-op.

const store = useAppStore;
const get = () => store.getState();
const reset = () => get().resetApp();
const onboard = (exp: ExperienceLevel = 'beginner') =>
  get().completeOnboarding('Tester', 'data-architect', undefined, exp);

const log = (over: Partial<{ type: string; title: string; description: string; link: string; keyTakeaway: string }> = {}) =>
  get().logOutput({
    skillId: 'sql-foundations',
    type: (over.type ?? 'project') as never,
    title: over.title ?? 'Output',
    description: over.description ?? 'short',
    link: over.link,
    keyTakeaway: over.keyTakeaway,
  });

// ─── completeOnboarding ─────────────────────────────────────────────────────────
describe('completeOnboarding', () => {
  it('creates the user and initializes the path skill graph', () => {
    reset();
    onboard('beginner');
    const s = get();
    expect(s.hasOnboarded).toBe(true);
    expect(s.user!.xp).toBe(ONBOARDING_XP_GRANT);  // UX-029: journey-started grant
    expect(s.user!.streak).toBe(1);                  // UX-029: streak starts at 1
    expect(s.user!.level).toBe(1);
    expect(s.userSkills['sql-foundations'].status).toBe('available'); // no prereqs
    expect(s.userSkills['python-automation'].status).toBe('locked');  // gated on sql-foundations
    expect(s.roadmaps[0].pathId).toBe('data-architect');
    expect(s.roadmaps[0].priorityStatus).toBe('PRIORITY');
  });

  it("pre-unlocks early skills (no XP, no completion) for an 'experienced' user", () => {
    reset();
    onboard('experienced');
    const s = get();
    // No XP windfall — experienced users start at the journey-started grant only.
    expect(s.user!.xp).toBe(ONBOARDING_XP_GRANT);
    // First 3 skills are opened for pacing, but none are completed (proof not yet logged).
    expect(s.userSkills['sql-foundations'].status).toBe('available');
    expect(s.userSkills['python-automation'].status).toBe('available');
    expect(s.userSkills['snowflake-engineering'].status).toBe('available');
    const completed = Object.values(s.userSkills).filter((u: any) => u.status === 'completed').length;
    expect(completed).toBe(0);
  });

  it("grants no XP windfall for a 'building' user (earns by logging)", () => {
    reset();
    onboard('building');
    const s = get();
    expect(s.user!.xp).toBe(ONBOARDING_XP_GRANT);
    // GROW-002: building opens only the FIRST skill for pacing (test-out eligible);
    // the second stays locked until the first is completed (built or tested out).
    expect(s.userSkills['sql-foundations'].status).toBe('available');
    expect(s.userSkills['python-automation'].status).toBe('locked');
    const completed = Object.values(s.userSkills).filter((u: any) => u.status === 'completed').length;
    expect(completed).toBe(0);
  });
});

// ─── testOutSkill (GROW-002) ──────────────────────────────────────────────────────
import { VALIDATION_BONUS_XP } from '../../domain/progression';

describe('testOutSkill', () => {
  it('completes an available foundational skill by assessment for an experienced user', () => {
    reset();
    onboard('experienced'); // opens first 3 skills
    const before = get().user!.xp;
    get().testOutSkill('sql-foundations');
    const s = get();
    const us = s.userSkills['sql-foundations'];
    expect(us.status).toBe('completed');
    expect(us.validated).toBe(true);
    expect(us.validationSource).toBe('assessment');
    expect(us.outputCount).toBe(0); // no proof logged — tested out
    // At least the flat validation bonus; first completion may also unlock skill-mastered.
    expect(s.user!.xp).toBeGreaterThanOrEqual(before + VALIDATION_BONUS_XP);
    // dependents unlock
    expect(s.userSkills['python-automation'].status).not.toBe('locked');
    // celebration fires for the tested-out skill, and the session delta reconciles exactly.
    expect(s.pendingCelebration?.skillId).toBe('sql-foundations');
    expect(s.pendingCelebration?.sessionXpGained).toBe(s.user!.xp - before);
  });

  it('is a no-op for a beginner (build-only)', () => {
    reset();
    onboard('beginner');
    const before = get().user!.xp;
    get().testOutSkill('sql-foundations');
    const s = get();
    expect(s.userSkills['sql-foundations'].status).toBe('available');
    expect(s.user!.xp).toBe(before);
  });

  it('is a no-op once attempts are exhausted; recordTestOutAttempt counts fails', () => {
    reset();
    onboard('building');
    get().recordTestOutAttempt('sql-foundations');
    get().recordTestOutAttempt('sql-foundations');
    get().recordTestOutAttempt('sql-foundations');
    expect(get().userSkills['sql-foundations'].testOutAttempts).toBe(3);
    const before = get().user!.xp;
    get().testOutSkill('sql-foundations'); // exhausted → build-only
    expect(get().userSkills['sql-foundations'].status).toBe('available');
    expect(get().user!.xp).toBe(before);
  });
});

// ─── logOutput ──────────────────────────────────────────────────────────────────
describe('logOutput', () => {
  it('returns a zero result and records nothing when there is no user', () => {
    reset();
    const r = log();
    expect(r.xpGained).toBe(0);
    expect(r.skillCompleted).toBe(false);
    expect(get().outputs).toHaveLength(0);
  });

  it('awards XP by output type plus quality and takeaway bonuses', () => {
    reset();
    onboard();
    // cert(200) + description >=120 chars (+20) + key takeaway (+15) = 235; req 2 → not complete yet
    const r = log({ type: 'cert', description: 'a'.repeat(130), keyTakeaway: 'the big lesson' });
    expect(r.xpGained).toBe(235);
    expect(r.skillCompleted).toBe(false);
    const s = get();
    expect(s.outputs).toHaveLength(1);
    expect(s.outputs[0].xpGained).toBe(235);
    expect(s.userSkills['sql-foundations'].status).toBe('in_progress');
    expect(s.userSkills['sql-foundations'].outputCount).toBe(1);
  });

  it('blocks skill completion until there is quality evidence (evidence gate)', () => {
    reset();
    onboard();
    log({ title: 'o1', description: 'short' });        // logged tier
    const r = log({ title: 'o2', description: 'short' }); // 2nd output reaches requiredOutputs but no evidence
    expect(r.evidenceRequired).toBe(true);
    expect(r.skillCompleted).toBe(false);
    expect(get().userSkills['sql-foundations'].status).toBe('in_progress');
    expect(get().userSkills['sql-foundations'].outputCount).toBe(2);
  });

  it('completes the skill with quality evidence and unlocks the dependent', () => {
    reset();
    onboard();
    log({ title: 'o1', description: 'a'.repeat(60) });                         // documented (>=50)
    const r = log({ title: 'o2', description: 'short', link: 'https://github.com/x/y' }); // verified
    expect(r.skillCompleted).toBe(true);
    expect(r.newSkillId).toBe('sql-foundations');
    expect(r.xpGained).toBe(175); // project(75) + skill reward(100)
    const s = get();
    expect(s.userSkills['sql-foundations'].status).toBe('completed');
    expect(s.userSkills['python-automation'].status).toBe('available'); // dependent unlocked
  });

  it('unlocks the first-steps achievement on the first output', () => {
    reset();
    onboard();
    log();
    expect(get().unlockedAchievementIds).toContain('first-steps');
  });

  it('resetApp wipes the device AND clears the cloud session (PRIV-003)', () => {
    reset();
    onboard();
    log();
    // Simulate a signed-in Cloud Backup session
    store.setState({ supabaseUserId: 'uid_123', supabaseEmail: 'maria@example.com' });
    reset();
    // Device wiped…
    expect(get().hasOnboarded).toBe(false);
    expect(get().user).toBeNull();
    expect(get().outputs).toEqual([]);
    // …and signed out, so the auth listener can't silently re-sync cloud data
    // back into the freshly reset app.
    expect(get().supabaseUserId).toBeNull();
    expect(get().supabaseEmail).toBeNull();
    expect(get().supabaseSyncing).toBe(false);
  });

  it('reports sessionXpGained as the TRUE total delta incl. achievement XP (UX-030)', () => {
    reset();
    onboard();
    const xpBefore = get().user!.xp;
    const r = log(); // first output also unlocks first-steps (+25)
    const xpAfter = get().user!.xp;

    // The headline "earned this session" number must equal the real XP change…
    expect(r.sessionXpGained).toBe(xpAfter - xpBefore);
    // …which is strictly more than the per-output XP because an achievement fired.
    expect(r.sessionXpGained!).toBeGreaterThan(r.xpGained);
    // The unlocked achievement is surfaced…
    expect(r.newAchievements?.some((a) => a.id === 'first-steps')).toBe(true);
    // …and the totals reconcile exactly: output XP + achievement grants.
    const achTotal = (r.newAchievements ?? []).reduce((s, a) => s + a.xpGranted, 0);
    expect(r.sessionXpGained).toBe(r.xpGained + achTotal);
  });

  it('increments the streak on a consecutive day', () => {
    reset();
    onboard();
    // RR-5: day keys are LOCAL-calendar — use the same helper production uses, so this
    // test can't drift a frame (the old UTC computation went flaky between 00:00–07:59
    // in any UTC+east timezone).
    const yesterday = localDaysAgoStr(1);
    store.setState({ user: { ...get().user!, lastActiveDate: yesterday, streak: 3, longestStreak: 3 } });
    const r = log();
    expect(r.newStreak).toBe(4);
    expect(get().user!.streak).toBe(4);
  });

  it('streak is 1 from onboarding and stays 1 on the first same-day output (BUG-012 + UX-029)', () => {
    reset();
    // UX-029: onboarding now sets streak=1 + lastActiveDate=today
    onboard();
    expect(get().user!.streak).toBe(1);
    // Logging on the same day keeps the streak at 1 (not double-incremented)
    const r = log();
    expect(r.newStreak).toBe(1);
    expect(get().user!.streak).toBe(1);
  });

  it('does not increment the streak twice within the same day', () => {
    reset();
    onboard();
    log();           // day-1 first output → streak 1
    const r = log(); // same day again → unchanged
    expect(r.newStreak).toBe(1);
    expect(get().user!.streak).toBe(1);
  });
});

// ─── validateSkill ──────────────────────────────────────────────────────────────
describe('validateSkill', () => {
  it('is a no-op unless the skill is completed', () => {
    reset();
    onboard();
    get().validateSkill('sql-foundations'); // still only 'available' — no-op
    expect(get().userSkills['sql-foundations'].validated).toBeFalsy();
    expect(get().user!.xp).toBe(ONBOARDING_XP_GRANT); // no change from onboarding grant
  });

  it('validates a completed skill and grants the 100 XP bonus', () => {
    reset();
    onboard();
    log({ title: 'o1', description: 'a'.repeat(60) });
    log({ title: 'o2', description: 'short', link: 'https://x.com' }); // completes the skill
    const before = get().user!.xp;
    get().validateSkill('sql-foundations');
    const s = get();
    expect(s.userSkills['sql-foundations'].validated).toBe(true);
    expect(s.user!.xp).toBe(before + 100);
  });
});

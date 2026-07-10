import { describe, it, expect } from 'vitest';
import {
  getDecayStage,
  getBurnoutSignal,
  getEvidenceTier,
  getSkillMasteryLevel,
  getCareerMastery,
  OUTCOME_XP,
  calculateOutputXP,
  OUTPUT_XP_BY_TYPE,
} from '../progression';
import type { Output, UserSkill } from '../../types';

// ─── Test helpers ───────────────────────────────────────────────────────────
const skill = (over: Partial<UserSkill>): UserSkill =>
  ({ skillId: 's', status: 'in_progress', outputCount: 1, ...over } as UserSkill);

const daysAgoISO = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const output = (daysAgo: number): Output =>
  ({ id: `o${daysAgo}`, createdAt: daysAgoISO(daysAgo) } as Output);

// ─── getDecayStage ────────────────────────────────────────────────────────────
describe('getDecayStage', () => {
  it('returns active when not started, regardless of days', () => {
    expect(getDecayStage(99, false)).toBe('active');
  });
  it('maps day ranges to the five stages (boundaries)', () => {
    expect(getDecayStage(0, true)).toBe('active');
    expect(getDecayStage(1, true)).toBe('active');
    expect(getDecayStage(2, true)).toBe('coasting');
    expect(getDecayStage(3, true)).toBe('coasting');
    expect(getDecayStage(4, true)).toBe('drifting');
    expect(getDecayStage(6, true)).toBe('drifting');
    expect(getDecayStage(7, true)).toBe('fading');
    expect(getDecayStage(13, true)).toBe('fading');
    expect(getDecayStage(14, true)).toBe('recovery');
    expect(getDecayStage(100, true)).toBe('recovery');
  });
});

// ─── getEvidenceTier ──────────────────────────────────────────────────────────
describe('getEvidenceTier', () => {
  it('verified when a non-empty link is present', () => {
    expect(getEvidenceTier('https://github.com/x', '')).toBe('verified');
  });
  it('ignores whitespace-only links', () => {
    expect(getEvidenceTier('   ', 'short')).toBe('logged');
  });
  it('documented when description >= 50 chars (boundary at exactly 50)', () => {
    expect(getEvidenceTier(undefined, 'a'.repeat(49))).toBe('logged');
    expect(getEvidenceTier(undefined, 'a'.repeat(50))).toBe('documented');
  });
  it('trims description before measuring', () => {
    expect(getEvidenceTier(undefined, '   ' + 'a'.repeat(40) + '   ')).toBe('logged');
  });
});

// ─── getSkillMasteryLevel ─────────────────────────────────────────────────────
describe('getSkillMasteryLevel', () => {
  it('0 when undefined or no outputs', () => {
    expect(getSkillMasteryLevel(undefined)).toBe(0);
    expect(getSkillMasteryLevel(skill({ outputCount: 0 }))).toBe(0);
  });
  it('1 when in progress with outputs', () => {
    expect(getSkillMasteryLevel(skill({ status: 'in_progress', outputCount: 2 }))).toBe(1);
  });
  it('2 when completed but not validated', () => {
    expect(getSkillMasteryLevel(skill({ status: 'completed', outputCount: 3, validated: false }))).toBe(2);
  });
  it('3 when completed and validated', () => {
    expect(getSkillMasteryLevel(skill({ status: 'completed', outputCount: 3, validated: true }))).toBe(3);
  });
});

// ─── getCareerMastery ─────────────────────────────────────────────────────────
describe('getCareerMastery', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);
  const build = (states: Partial<UserSkill>[]): Record<string, UserSkill> =>
    Object.fromEntries(states.map((s, i) => [`s${i}`, skill(s)]));

  it('Beginner for an empty path', () => {
    expect(getCareerMastery({}, []).title).toBe('Beginner');
  });
  it('Beginner when nothing started', () => {
    const us = build(Array(10).fill({ outputCount: 0 }));
    expect(getCareerMastery(us, ids(10)).title).toBe('Beginner');
  });
  it('Developing when practicing but 0% competent', () => {
    const us = build(Array(10).fill({ status: 'in_progress', outputCount: 1 }));
    expect(getCareerMastery(us, ids(10)).title).toBe('Developing');
  });
  it('Competent at 40% competent', () => {
    const states = [
      ...Array(4).fill({ status: 'completed', outputCount: 1 }),
      ...Array(6).fill({ status: 'in_progress', outputCount: 1 }),
    ];
    expect(getCareerMastery(build(states), ids(10)).title).toBe('Competent');
  });
  it('Advanced at >=70% competent but <60% validated', () => {
    const states = Array(8).fill({ status: 'completed', outputCount: 1 })
      .concat(Array(2).fill({ status: 'in_progress', outputCount: 1 }));
    const r = getCareerMastery(build(states), ids(10));
    expect(r.title).toBe('Advanced');
    expect(r.competentCount).toBe(8);
    expect(r.validatedCount).toBe(0);
  });
  it('Expert at >=70% competent and >=60% validated', () => {
    const states = Array(7).fill({ status: 'completed', outputCount: 1, validated: true })
      .concat(Array(3).fill({ status: 'completed', outputCount: 1 }));
    const r = getCareerMastery(build(states), ids(10));
    expect(r.title).toBe('Expert');
    expect(r.competentCount).toBe(10);
    expect(r.validatedCount).toBe(7);
  });
});

// ─── getBurnoutSignal ─────────────────────────────────────────────────────────
describe('getBurnoutSignal', () => {
  it('null when paceMode is recovery', () => {
    const outs = [output(5), output(6), output(7), output(8)];
    expect(getBurnoutSignal(outs, 3, 'recovery')).toBeNull();
  });
  it('null when gap < 2 days', () => {
    const outs = [output(0), output(0), output(0), output(0)];
    expect(getBurnoutSignal(outs, 1, undefined)).toBeNull();
  });
  it('null with fewer than 4 outputs', () => {
    expect(getBurnoutSignal([output(5), output(6)], 3, undefined)).toBeNull();
  });
  it('signals sprint-then-drop: >=4 outputs in the 14d window before the gap', () => {
    const outs = [output(5), output(6), output(7), output(8)]; // all within 14d window before a 3-day gap
    expect(getBurnoutSignal(outs, 3, undefined)).toBe('sprint_followed_by_drop');
  });
  it('null when the 4 outputs predate the sprint window', () => {
    const outs = [output(40), output(41), output(42), output(43)]; // older than gapStart-14d
    expect(getBurnoutSignal(outs, 3, undefined)).toBeNull();
  });
});

// ─── OUTCOME_XP ───────────────────────────────────────────────────────────────
describe('OUTCOME_XP', () => {
  it('awards the documented values', () => {
    expect(OUTCOME_XP.offer).toBe(500);
    expect(OUTCOME_XP.role_change).toBe(500);
    expect(OUTCOME_XP.promotion).toBe(400);
    expect(OUTCOME_XP.certification).toBe(300);
    expect(OUTCOME_XP.salary_increase).toBe(300);
    expect(OUTCOME_XP.freelance).toBe(250);
    expect(OUTCOME_XP.portfolio).toBe(200);
    expect(OUTCOME_XP.interview).toBe(150);
  });
});

// ─── calculateOutputXP ────────────────────────────────────────────────────────
describe('calculateOutputXP', () => {
  it('returns the base XP for each type with no bonuses', () => {
    expect(calculateOutputXP('project',    0, false)).toBe(75);
    expect(calculateOutputXP('cert',       0, false)).toBe(200);
    expect(calculateOutputXP('github',     0, false)).toBe(60);
    expect(calculateOutputXP('book',       0, false)).toBe(50);
    expect(calculateOutputXP('script',     0, false)).toBe(50);
    expect(calculateOutputXP('diagram',    0, false)).toBe(75);
    expect(calculateOutputXP('reflection', 0, false)).toBe(30);
    expect(calculateOutputXP('event',      0, false)).toBe(65);
    expect(calculateOutputXP('other',      0, false)).toBe(50);
  });

  it('awards +10 quality bonus at the 50-char threshold', () => {
    expect(calculateOutputXP('project', 49, false)).toBe(75);      // just below
    expect(calculateOutputXP('project', 50, false)).toBe(85);      // at threshold → +10
    expect(calculateOutputXP('project', 119, false)).toBe(85);     // below detailed
  });

  it('awards +20 quality bonus at the 120-char threshold', () => {
    expect(calculateOutputXP('project', 120, false)).toBe(95);     // at threshold → +20
    expect(calculateOutputXP('project', 500, false)).toBe(95);     // above — capped at +20
  });

  it('awards +15 takeaway bonus when hasKeyTakeaway is true', () => {
    expect(calculateOutputXP('project', 0, true)).toBe(90);        // 75 + 15
    expect(calculateOutputXP('book',    0, true)).toBe(65);        // 50 + 15
  });

  it('stacks quality and takeaway bonuses correctly', () => {
    // base 75 + quality 10 (≥50 chars) + takeaway 15 = 100
    expect(calculateOutputXP('project', 80, true)).toBe(100);
    // base 75 + quality 20 (≥120 chars) + takeaway 15 = 110
    expect(calculateOutputXP('project', 200, true)).toBe(110);
  });

  it('OUTPUT_XP_BY_TYPE entries match the base returned by calculateOutputXP', () => {
    // Ensures the lookup table and the calculator are consistent
    (Object.keys(OUTPUT_XP_BY_TYPE) as Array<keyof typeof OUTPUT_XP_BY_TYPE>).forEach((type) => {
      expect(calculateOutputXP(type, 0, false)).toBe(OUTPUT_XP_BY_TYPE[type]);
    });
  });
});

// ─── effectiveStreak (RR-11: display-time streak decay) ───────────────────────────
import { effectiveStreak } from '../progression';
import { localDateStr, localDaysAgoStr } from '../../utils/dates';

describe('effectiveStreak', () => {
  const now = new Date(2026, 6, 6, 12, 0); // fixed local noon
  it('is alive when last active today / yesterday / two days ago (grace)', () => {
    expect(effectiveStreak(5, localDateStr(now), now)).toBe(5);
    expect(effectiveStreak(5, localDaysAgoStr(1, now), now)).toBe(5);
    expect(effectiveStreak(5, localDaysAgoStr(2, now), now)).toBe(5);
  });
  it('reads 0 once beyond the grace window (matches logOutput break semantics)', () => {
    expect(effectiveStreak(5, localDaysAgoStr(3, now), now)).toBe(0);
    expect(effectiveStreak(12, localDaysAgoStr(30, now), now)).toBe(0);
  });
  it('reads 0 with no streak or no lastActiveDate', () => {
    expect(effectiveStreak(0, localDateStr(now), now)).toBe(0);
    expect(effectiveStreak(4, undefined, now)).toBe(0);
  });
});

// ─── dayLabel (singular/plural day count for share copy) ──────────────────────────
import { dayLabel } from '../progression';

describe('dayLabel', () => {
  it('uses the singular only for exactly 1', () => {
    expect(dayLabel(1)).toBe('1 day');
  });
  it('uses the plural for 0 and for counts above 1', () => {
    expect(dayLabel(0)).toBe('0 days');
    expect(dayLabel(2)).toBe('2 days');
    expect(dayLabel(30)).toBe('30 days');
  });
});

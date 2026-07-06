// ─── Skill-graph & achievement helpers ─────────────────────────────────────────
// Pure functions extracted from appStore.ts (ARCH-002). They operate on the static
// catalog (CAREER_PATHS / ALL_SKILLS) + plain state, with no store/React deps, so
// they can be unit-tested in isolation.

import type { UserSkill, CareerPathId, ExperienceLevel } from '../types';
import { CAREER_PATHS } from '../data/careerPaths';
import { ALL_SKILLS } from '../data/skills';
import { FOUNDATIONAL_WINDOW, MAX_TESTOUT_ATTEMPTS } from './progression';
import { hasValidationQuestions } from '../data/validationCatalog';

export function initUserSkills(pathId: CareerPathId): Record<string, UserSkill> {
  const path = CAREER_PATHS.find((p) => p.id === pathId)!;
  const result: Record<string, UserSkill> = {};
  path.skillIds.forEach((skillId) => {
    const skill = ALL_SKILLS.find((s) => s.id === skillId)!;
    result[skillId] = {
      skillId,
      status: skill.prerequisites.length === 0 ? 'available' : 'locked',
      outputCount: 0,
    };
  });
  return result;
}

// GROW-002: can the user "test out" of this skill instead of building it?
// True only when ALL hold: (1) experience level is building/experienced (beginner is
// build-only); (2) the skill sits in the path's foundational window (first N); (3) it
// is currently `available` (not locked/in-progress/already completed); (4) it still has
// test-out attempts left; (5) a curated question bank exists for it (custom-path skills
// have none → naturally build-only). Pure, so it can be unit-tested + reused by the UI.
export function isTestOutEligible(
  skillId: string,
  userSkills: Record<string, UserSkill>,
  pathSkillIds: string[],
  experienceLevel: ExperienceLevel | undefined,
): boolean {
  if (experienceLevel !== 'building' && experienceLevel !== 'experienced') return false;
  const idx = pathSkillIds.indexOf(skillId);
  if (idx < 0 || idx >= FOUNDATIONAL_WINDOW) return false;
  const us = userSkills[skillId];
  if (!us || us.status !== 'available') return false;
  if ((us.testOutAttempts ?? 0) >= MAX_TESTOUT_ATTEMPTS) return false;
  const skill = ALL_SKILLS.find((s) => s.id === skillId);
  // Presence check only — the questions themselves are lazy-loaded (RR-6).
  if (!hasValidationQuestions(skill)) return false;
  return true;
}

export function unlockDependentSkills(
  completedSkillId: string,
  pathId: CareerPathId,
  userSkills: Record<string, UserSkill>
): Record<string, UserSkill> {
  const path = CAREER_PATHS.find((p) => p.id === pathId)!;
  const updated = { ...userSkills };

  path.skillIds.forEach((skillId) => {
    const skill = ALL_SKILLS.find((s) => s.id === skillId)!;
    if (updated[skillId]?.status !== 'locked') return;

    const allPrereqsMet = skill.prerequisites.every(
      (prereqId) => updated[prereqId]?.status === 'completed'
    );
    if (allPrereqsMet) {
      updated[skillId] = { ...updated[skillId], status: 'available' };
    }
  });

  return updated;
}

// FEAT-001: a roadmap is "started" (and thus no longer editable) once any of its
// skills has real progress — an output logged, or a credited in-progress/completed
// state. Pure so the edit-gating can be unit-tested.
export function pathHasProgress(skillIds: string[], userSkills: Record<string, UserSkill>): boolean {
  return skillIds.some((id) => {
    const us = userSkills[id];
    return !!us && (us.outputCount > 0 || us.status === 'completed' || us.status === 'in_progress');
  });
}

export function checkAchievements(
  outputCount: number,
  completedSkillCount: number,
  xp: number,
  streak: number,
  unlockedIds: string[]
): string[] {
  const newUnlocks: string[] = [];

  if (outputCount >= 1 && !unlockedIds.includes('first-steps')) newUnlocks.push('first-steps');
  if (outputCount >= 5 && !unlockedIds.includes('builder')) newUnlocks.push('builder');
  if (completedSkillCount >= 1 && !unlockedIds.includes('skill-mastered')) newUnlocks.push('skill-mastered');
  if (streak >= 7 && !unlockedIds.includes('consistent')) newUnlocks.push('consistent');
  if (streak >= 14 && !unlockedIds.includes('on-fire')) newUnlocks.push('on-fire');
  if (streak >= 30 && !unlockedIds.includes('thirty-day-legend')) newUnlocks.push('thirty-day-legend');
  if (xp >= 500 && !unlockedIds.includes('evolution')) newUnlocks.push('evolution');
  if (completedSkillCount >= 3 && !unlockedIds.includes('triple-master')) newUnlocks.push('triple-master');

  return newUnlocks;
}

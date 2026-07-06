// Lazy access to the "Prove you know it" question bank (RR-6, bundle size).
//
// The bank (validationQuestions.ts, ~950 questions / ~11.7k lines) used to be merged
// eagerly into ALL_SKILLS, shipping in the main app chunk on every first load. Quizzes
// are only needed when a user actually opens one, so the bank now lives in its own
// dynamically-imported chunk. The eager side keeps just enough to answer "does this
// skill have a quiz?" (VALIDATED_SKILL_IDS + any legacy inline questions on the skill).
import type { Skill, ValidationQuestion } from '../types';
import { VALIDATED_SKILL_IDS } from './validationSkillIds';

type SkillLike = Pick<Skill, 'id'> & { validationQuestions?: ValidationQuestion[] };

// Synchronous presence check — safe for render-time gating (CTAs, eligibility).
export function hasValidationQuestions(skill: SkillLike | null | undefined): boolean {
  if (!skill) return false;
  return VALIDATED_SKILL_IDS.has(skill.id) || !!skill.validationQuestions?.length;
}

// Async fetch of the actual questions. The bank wins over legacy inline questions
// (same precedence the old eager merge had). Returns null when the skill has none.
export async function loadValidationQuestions(
  skill: SkillLike | null | undefined,
): Promise<ValidationQuestion[] | null> {
  if (!skill) return null;
  if (VALIDATED_SKILL_IDS.has(skill.id)) {
    const { VALIDATION_QUESTIONS } = await import('./validationQuestions');
    const bank = VALIDATION_QUESTIONS[skill.id];
    if (bank?.length) return bank;
  }
  return skill.validationQuestions?.length ? skill.validationQuestions : null;
}

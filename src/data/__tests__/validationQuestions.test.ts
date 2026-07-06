import { describe, it, expect } from 'vitest';
import { VALIDATION_QUESTIONS } from '../validationQuestions';
import { ALL_SKILLS } from '../skills';

// Guards the "Prove you know it" question bank: every authored skill must have a
// complete, well-formed 10-question set with a source citation, keyed to a real
// skill id. Keeps quality consistent as paths are added over time.

const skillIds = new Set(ALL_SKILLS.map((s) => s.id));

describe('VALIDATION_QUESTIONS bank', () => {
  for (const [skillId, questions] of Object.entries(VALIDATION_QUESTIONS)) {
    describe(skillId, () => {
      it('is keyed to a real skill id', () => {
        expect(skillIds.has(skillId)).toBe(true);
      });

      it('has exactly 10 questions', () => {
        expect(questions).toHaveLength(10);
      });

      questions.forEach((q, i) => {
        it(`question ${i + 1} is well-formed (4 choices, valid answer, prompt, explanation, source)`, () => {
          expect(q.prompt.trim().length).toBeGreaterThan(0);
          expect(q.choices).toHaveLength(4);
          q.choices.forEach((c) => expect(c.trim().length).toBeGreaterThan(0));
          expect(q.correctIndex).toBeGreaterThanOrEqual(0);
          expect(q.correctIndex).toBeLessThanOrEqual(3);
          expect(q.explanation.trim().length).toBeGreaterThan(0);
          expect(q.source && q.source.trim().length).toBeTruthy();
        });
      });
    });
  }

  // RR-6: the bank is no longer merged eagerly into ALL_SKILLS — it is lazy-loaded via
  // data/validationCatalog.ts. These tests guard the seams of that split.
  it('VALIDATED_SKILL_IDS exactly matches the bank keys (lazy-chunk drift guard)', async () => {
    const { VALIDATED_SKILL_IDS } = await import('../validationSkillIds');
    expect(new Set(VALIDATED_SKILL_IDS)).toEqual(new Set(Object.keys(VALIDATION_QUESTIONS)));
  });

  it('loadValidationQuestions resolves the 10 bank questions for sql-foundations', async () => {
    const { loadValidationQuestions, hasValidationQuestions } = await import('../validationCatalog');
    const sql = ALL_SKILLS.find((s) => s.id === 'sql-foundations')!;
    expect(hasValidationQuestions(sql)).toBe(true);
    const qs = await loadValidationQuestions(sql);
    expect(qs).toHaveLength(10);
    // bank wins over the legacy inline questions still authored on the skill
    expect(qs![0].prompt).toBe(VALIDATION_QUESTIONS['sql-foundations'][0].prompt);
  });

  it('loadValidationQuestions returns null for a skill with no questions anywhere', async () => {
    const { loadValidationQuestions, hasValidationQuestions } = await import('../validationCatalog');
    const bare = { id: 'no-such-skill' };
    expect(hasValidationQuestions(bare)).toBe(false);
    expect(await loadValidationQuestions(bare)).toBeNull();
  });
});

// Core progression store slice — actions extracted from appStore.ts (ARCH-002).
// Action bodies are unchanged; recombined in appStore.ts via the Zustand slices pattern.

import type { StoreApi } from 'zustand';
import type { AppState, PendingCelebration } from '../appStore';
import type {
  User, UserSkill, Output, FeedPost, CareerPathId, CustomPath, CustomSkill,
  LogOutputPayload, LogOutputResult, SkillStatus, RoadmapEntry,
  RoadmapPriorityStatus, RoadmapStatus, CareerOutcome, LogOutcomePayload,
  OutcomeType, ExperienceLevel, PaceMode,
} from '../../types';
import { getLevelFromXP, Colors } from '../../utils/theme';
import { track, identify } from '../../utils/analytics';
import { uid } from '../../utils/uid';
import { localDateStr, localDaysAgoStr } from '../../utils/dates';
import { CAREER_PATHS } from '../../data/careerPaths';
import { ALL_SKILLS } from '../../data/skills';
import { ALL_ACHIEVEMENTS } from '../../data/achievements';
import { MOCK_FEED } from '../../data/mockFeed';
import { getEvidenceTier, OUTCOME_XP, getCareerMastery, calculateOutputXP, CUSTOM_SKILL_COMPLETION_XP, ONBOARDING_XP_GRANT, VALIDATION_BONUS_XP } from '../../domain/progression';
import { initUserSkills, unlockDependentSkills, checkAchievements, isTestOutEligible } from '../../domain/skillGraph';
// ARCH-001: fire-and-forget Supabase sync after local state is updated
import { upsertProfile, insertOutput, upsertSkillProgress } from '../../lib/db';
import { signOut } from '../../lib/auth';

type Set = StoreApi<AppState>['setState'];
type Get = StoreApi<AppState>['getState'];

export const createCoreSlice = (set: Set, get: Get): Pick<AppState, 'completeOnboarding' | 'logOutput' | 'validateSkill' | 'testOutSkill' | 'recordTestOutAttempt' | 'logCareerOutcome' | 'deleteCareerOutcome' | 'deleteOutput' | 'useStreakFreeze' | 'markMilestoneCelebrated' | 'clearCelebration' | 'setSelectedSkill' | 'dismissWelcomeCard' | 'resetApp' | 'togglePinOutput'> => ({
  completeOnboarding: (name: string, pathId: CareerPathId | string, email?: string, experienceLevel?: ExperienceLevel) => {
    const userId = uid('user');
    const pathMeta = CAREER_PATHS.find(p => p.id === pathId);
    const isBuiltInPath = !!pathMeta;

    // For custom paths, find the path definition so we can use its icon/color
    const customPathMeta = !isBuiltInPath
      ? get().customPaths.find(p => p.id === pathId)
      : null;

    // UX-029: grant a small "journey started" XP so new users never land on 0.
    // Pre-credited skill XP is added below after the experience-level block.
    const todayStr = localDateStr(); // RR-5: local calendar day, not UTC

    const user: User = {
      id: userId,
      name,
      handle: name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '') || 'explorer',
      email: email?.trim() || undefined,
      careerPathId: pathId,
      xp: ONBOARDING_XP_GRANT,
      level: getLevelFromXP(ONBOARDING_XP_GRANT),
      // UX-029: starting the streak at 1 (they took real action today by beginning
      // their journey). Setting lastActiveDate prevents double-incrementing if they
      // log an output later the same day. Safe with BUG-012 fix: we set BOTH fields
      // together so the first same-day logOutput correctly stays at 1 (not 0→1).
      streak: 1,
      longestStreak: 1,
      lastActiveDate: todayStr,
      bio: '',
      avatarEmoji: pathMeta?.icon ?? customPathMeta?.icon ?? '⚡',
      avatarColor: pathMeta?.dimColor ?? '#0A0A0F',
      joinedAt: new Date().toISOString(),
      streakFreezes: 0,
      experienceLevel: experienceLevel ?? 'beginner',
    };

    // ── Skills initialization ─────────────────────────────────────────────────
    // Built-in paths: initialize from the catalog. Custom paths: preserve
    // userSkills already set by addCustomPath (called just before this in the
    // onboarding flow) so we don't wipe out the custom skill entries.
    let userSkills = isBuiltInPath ? initUserSkills(pathId as CareerPathId) : { ...get().userSkills };

    // ── Pre-UNLOCK early skills based on experience level (built-in paths only) ──
    // Experience level no longer pre-COMPLETES skills or grants XP. Pre-completing
    // produced unearned XP and phantom completion %, and — because completeOnboarding
    // does not record achievements — the hydration heal would later detect the
    // "skill-mastered" achievement as missed and re-grant its XP on the next load,
    // recreating the UX-025 XP-Sources inconsistency. Instead we pre-UNLOCK the early
    // skills so experienced users can immediately log against what they already know,
    // while honoring the product thesis: XP and completion come from logged proof only.
    // Everyone starts at ONBOARDING_XP_GRANT and earns the rest by logging outputs.
    if (isBuiltInPath && pathMeta && (experienceLevel === 'building' || experienceLevel === 'experienced')) {
      // GROW-002 pacing: building opens the first 1 skill, experienced the first 3.
      // These pre-unlocked foundational skills are the ones a building/experienced user
      // may "test out" of (pass a knowledge check) instead of building from outputs.
      const unlockCount = experienceLevel === 'experienced' ? 3 : 1;
      pathMeta.skillIds.slice(0, unlockCount).forEach((sid) => {
        const existing = userSkills[sid];
        // Only open locked/undefined entries — never downgrade real progress.
        if (!existing || existing.status === 'locked') {
          userSkills = { ...userSkills, [sid]: { skillId: sid, status: 'available', outputCount: 0 } };
        }
      });
    }

    // XP is always just the journey-started grant (set on `user` above). No
    // pre-credit: experienced/building users earn all further XP by logging proof.
    const finalUser: User = user;

    const initialRoadmap: RoadmapEntry = {
      pathId,
      priorityStatus: 'PRIORITY',
      roadmapStatus: 'ACTIVE',
      startedAt: new Date().toISOString(),
    };
    const state = { hasOnboarded: true, user: finalUser, userSkills, prioritizedPathId: pathId, roadmaps: [initialRoadmap], showWelcomeCard: true };
    set(state);
    // ARCH-001: sync the new profile to Supabase (fire-and-forget)
    const syncUserId = get().supabaseUserId;
    if (syncUserId) upsertProfile(syncUserId, finalUser).catch(() => {});
    // Anonymous-only analytics: identify by id, never name/email (see analytics.ts).
    identify(userId, { career_path: pathId, joined_at: user.joinedAt });
    track('onboarding_completed', {
      career_path: pathId,
      is_custom_path: !isBuiltInPath,
      has_email: !!email?.trim(),
      experience_level: experienceLevel ?? 'beginner',
    });
  },

  logOutput: (payload: LogOutputPayload): LogOutputResult => {
    const state = get();
    if (!state.user) return { skillCompleted: false, xpGained: 0, leveledUp: false, newLevel: 1 };

    const skill = ALL_SKILLS.find((s) => s.id === payload.skillId);

    // For custom path items (not in ALL_SKILLS catalog), find the skill in customPaths
    let customSkillName: string | null = null;
    if (!skill) {
      for (const cp of state.customPaths) {
        const cs = cp.skills.find((s) => s.id === payload.skillId);
        if (cs) { customSkillName = cs.name; break; }
      }
      if (customSkillName === null) {
        // Not tied to any milestone — still award XP for the work done
        customSkillName = 'General Work';
      }
    }
    const skillName = skill?.name ?? customSkillName!;

    // ISSUE-010: XP = base (by type) + quality bonus + takeaway bonus.
    // Calculation delegated to domain/progression.ts (ARCH-006 — single source of truth).
    const OUTPUT_XP = calculateOutputXP(
      payload.type,
      payload.description.length,
      (payload.keyTakeaway?.trim().length ?? 0) > 0,
    );
    const existingUserSkill = state.userSkills[payload.skillId] ?? {
      skillId: payload.skillId,
      status: 'available' as SkillStatus,
      outputCount: 0,
    };

    const newOutputCount = existingUserSkill.outputCount + 1;
    // Custom items complete after 1 output; built-in skills use their requiredOutputs
    const requiredOutputs = skill?.requiredOutputs ?? 1;
    const wouldComplete = newOutputCount >= requiredOutputs;

    // ── Evidence gate (built-in skills only) ────────────────────────────────
    // A skill may not complete unless at least one of its outputs is 'verified'
    // (has a link) or 'documented' (description ≥ 50 chars). This prevents
    // users from spamming minimal entries to fake mastery.
    const currentEvidenceTier = getEvidenceTier(payload.link, payload.description);
    let evidenceRequired = false;
    if (wouldComplete && skill) {
      const hasQualityEvidence =
        currentEvidenceTier !== 'logged' || // current output qualifies
        state.outputs
          .filter((o) => o.skillId === payload.skillId)
          .some((o) => {
            const t = o.evidenceTier ?? getEvidenceTier(o.link, o.description);
            return t !== 'logged';
          });
      evidenceRequired = !hasQualityEvidence;
    }

    const skillCompleted = wouldComplete && !evidenceRequired;
    // Built-in skills award their curated reward; user-defined (custom) milestones
    // award a modest flat bonus (FEAT-001) — proof is still required to complete them.
    const skillXP = skillCompleted ? (skill ? skill.xpReward : CUSTOM_SKILL_COMPLETION_XP) : 0;
    const totalXPGained = OUTPUT_XP + skillXP;

    const newXP = state.user.xp + totalXPGained;
    const oldLevel = state.user.level;
    const newLevel = getLevelFromXP(newXP);
    const leveledUp = newLevel > oldLevel;

    const newOutput: Output = {
      id: uid('out'),
      skillId: payload.skillId,
      skillName,
      type: payload.type,
      title: payload.title,
      description: payload.description,
      link: payload.link,
      keyTakeaway: payload.keyTakeaway?.trim() || undefined,
      xpGained: totalXPGained,
      createdAt: new Date().toISOString(),
      evidenceTier: currentEvidenceTier,
    };

    let updatedUserSkills = {
      ...state.userSkills,
      [payload.skillId]: {
        ...existingUserSkill,
        outputCount: newOutputCount,
        status: skillCompleted
          ? ('completed' as SkillStatus)
          : ('in_progress' as SkillStatus),
        completedAt: skillCompleted ? new Date().toISOString() : undefined,
      },
    };

    // Only unlock dependent skills for built-in career path skills (use skill's own pathId, not enrolled path)
    if (skillCompleted && skill && CAREER_PATHS.some(p => p.id === skill.pathId)) {
      updatedUserSkills = unlockDependentSkills(payload.skillId, skill.pathId as CareerPathId, updatedUserSkills);
    }

    // Unlock next skill in custom path sequence when current skill completes
    if (skillCompleted && !skill) {
      for (const cp of state.customPaths) {
        const idx = cp.skills.findIndex(s => s.id === payload.skillId);
        if (idx >= 0 && idx < cp.skills.length - 1) {
          const nextSkill = cp.skills[idx + 1];
          if (updatedUserSkills[nextSkill.id]?.status === 'locked') {
            updatedUserSkills = {
              ...updatedUserSkills,
              [nextSkill.id]: {
                skillId: nextSkill.id,
                status: 'available' as SkillStatus,
                outputCount: updatedUserSkills[nextSkill.id]?.outputCount ?? 0,
              },
            };
          }
          break;
        }
      }
    }

    const newOutputs = [...state.outputs, newOutput];

    // Check achievements
    const completedSkillCount = Object.values(updatedUserSkills).filter(
      (us) => us.status === 'completed'
    ).length;
    const newAchievementIds = checkAchievements(
      newOutputs.length,
      completedSkillCount,
      newXP,
      state.user.streak,
      state.unlockedAchievementIds
    );
    const bonusXP = newAchievementIds.reduce((sum, id) => {
      const ach = ALL_ACHIEVEMENTS.find((a) => a.id === id);
      return sum + (ach?.xpGranted ?? 0);
    }, 0);

    const finalXP = newXP + bonusXP;
    const finalLevel = getLevelFromXP(finalXP);

    // ── Streak calculation ────────────────────────────────────────────────────
    // Compare today's date (local) against the last date the user logged anything.
    const todayStr = localDateStr(); // "YYYY-MM-DD" in the USER'S timezone (RR-5)
    const lastActive = state.user.lastActiveDate;
    let newStreak = state.user.streak;

    if (!lastActive) {
      // First ever log — start at 1
      newStreak = 1;
    } else if (lastActive === todayStr) {
      // Already logged today — streak unchanged
      newStreak = state.user.streak;
    } else {
      // Check consecutive / grace-period / broken
      const yesterdayStr = localDaysAgoStr(1);
      const twoDaysAgoStr = localDaysAgoStr(2);

      if (lastActive === yesterdayStr) {
        newStreak = state.user.streak + 1; // consecutive day
      } else if (lastActive === twoDaysAgoStr) {
        newStreak = state.user.streak; // grace period: preserve streak, don't increment
      } else {
        newStreak = 1; // streak broken
      }
    }

    const newLongestStreak = Math.max(state.user.longestStreak, newStreak);

    // Award a streak freeze when streak first hits a multiple of 7
    const hitsFreezeMilestone = newStreak > 0 && newStreak % 7 === 0 && state.user.streak % 7 !== 0;
    const newFreezes = (state.user.streakFreezes ?? 0) + (hitsFreezeMilestone ? 1 : 0);

    // One-time milestone bonus when streak first crosses 7 / 14 / 30
    const streakMilestoneBonus =
      (newStreak === 7  && state.user.streak < 7)  ? 25  :
      (newStreak === 14 && state.user.streak < 14) ? 50  :
      (newStreak === 30 && state.user.streak < 30) ? 100 : 0;

    // Re-check streak-based achievements with the updated streak value
    const streakAchievementIds = checkAchievements(
      newOutputs.length,
      completedSkillCount,
      finalXP,
      newStreak,
      [...state.unlockedAchievementIds, ...newAchievementIds]
    );
    const streakAchievementBonusXP = streakAchievementIds.reduce((sum, id) => {
      const ach = ALL_ACHIEVEMENTS.find((a) => a.id === id);
      return sum + (ach?.xpGranted ?? 0);
    }, 0);
    const absoluteFinalXP = finalXP + streakAchievementBonusXP + streakMilestoneBonus;
    const absoluteFinalLevel = getLevelFromXP(absoluteFinalXP);
    const allNewAchievementIds = [...newAchievementIds, ...streakAchievementIds];

    // UX-030: the TOTAL XP the user actually gained this action (output + skill
    // bonus + achievement grants + streak-milestone bonus), plus the unlocked
    // achievements — so the milestone celebration reconciles with the real
    // XP change instead of showing only output+skill XP.
    const sessionXpGained = absoluteFinalXP - state.user.xp;
    const newAchievements = allNewAchievementIds
      .map((id) => ALL_ACHIEVEMENTS.find((a) => a.id === id))
      .filter((a) => !!a)
      .map((a) => ({ id: a!.id, title: a!.title, xpGranted: a!.xpGranted }));

    const updatedUser: User = {
      ...state.user,
      xp: absoluteFinalXP,
      level: absoluteFinalLevel,
      streak: newStreak,
      longestStreak: newLongestStreak,
      lastActiveDate: todayStr,
      streakFreezes: newFreezes,
    };

    // Add to feed
    const feedPost: FeedPost = {
      id: uid('fp'),
      userId: state.user.id,
      userName: state.user.name,
      userHandle: state.user.handle,
      avatarEmoji: state.user.avatarEmoji,
      avatarColor: state.user.avatarColor,
      avatarUri: state.user.avatarUri,
      // Use the logged skill's actual pathId so secondary-roadmap posts appear under the correct path filter.
      // Fall back to the user's primary careerPathId for custom skills (they have no built-in pathId).
      pathId: skill?.pathId ?? state.user.careerPathId,
      pathLabel: CAREER_PATHS.find((p) => p.id === (skill?.pathId ?? state.user!.careerPathId))?.name ?? '',
      pathColor: CAREER_PATHS.find((p) => p.id === (skill?.pathId ?? state.user!.careerPathId))?.color ?? '#7C3AED',
      type: skillCompleted ? 'milestone' : 'output',
      skillId: payload.skillId,
      skillName,
      outputTitle: payload.title,
      content: payload.description,
      xpGained: totalXPGained,
      reactions: {},
      userReactions: [],
      comments: [],
      timestamp: new Date().toISOString(),
      isCurrentUser: true,
    };

    const updatedUserFeedPosts = [feedPost, ...state.userFeedPosts];
    const updatedFeed = [feedPost, ...state.communityFeed];
    const updatedAchievementIds = [...state.unlockedAchievementIds, ...allNewAchievementIds];

    const celebration: PendingCelebration | null = skillCompleted
      ? { skillId: payload.skillId, xpGained: totalXPGained, sessionXpGained, newAchievements, leveledUp: absoluteFinalLevel > oldLevel, newLevel: absoluteFinalLevel }
      : null;

    const newState = {
      user: updatedUser,
      userSkills: updatedUserSkills,
      outputs: newOutputs,
      communityFeed: updatedFeed,
      userFeedPosts: updatedUserFeedPosts,
      unlockedAchievementIds: updatedAchievementIds,
      pendingCelebration: celebration,
    };

    set(newState);

    // ── Analytics ─────────────────────────────────────────────────────────────
    const daysSinceJoin = state.user.joinedAt
      ? Math.floor((Date.now() - new Date(state.user.joinedAt).getTime()) / 86_400_000)
      : 0;
    const isFirstOutput = newOutputs.length === 1;
    if (isFirstOutput && state.user.joinedAt) {
      const minutesSinceJoin = Math.round(
        (Date.now() - new Date(state.user.joinedAt).getTime()) / 60_000
      );
      track('first_output_logged', {
        output_type: payload.type,
        skill_id: payload.skillId,
        skill_name: skillName,
        xp_gained: totalXPGained,
        time_to_first_output_minutes: minutesSinceJoin,
        career_path: state.user.careerPathId,
      });
    }
    track('output_logged', {
      output_type: payload.type,
      skill_id: payload.skillId,
      skill_name: skillName,
      xp_gained: totalXPGained,
      total_outputs: newOutputs.length,
      is_first_output: isFirstOutput,
      days_since_join: daysSinceJoin,
      streak: newStreak,
    });
    if (skillCompleted) {
      track('skill_completed', {
        skill_id: payload.skillId,
        skill_name: skillName,
        xp_reward: skill?.xpReward ?? 0,
        rarity: skill?.rarity ?? 'common',
        output_count: newOutputCount,
      });
    }
    if (absoluteFinalLevel > oldLevel) {
      track('level_up', { old_level: oldLevel, new_level: absoluteFinalLevel, total_xp: absoluteFinalXP });
    }
    allNewAchievementIds.forEach((achId) => {
      const ach = ALL_ACHIEVEMENTS.find((a) => a.id === achId);
      if (ach) track('achievement_unlocked', { achievement_id: achId, achievement_title: ach.title, rarity: ach.rarity });
    });
    if (streakMilestoneBonus > 0) {
      track('streak_milestone', { streak: newStreak, bonus_xp: streakMilestoneBonus });
    }
    // NOTE: retention_dN events are NOT fired here. Retention is "did the user
    // come back," which is driven by app opens — see trackRetention() called on
    // session start in App.tsx. Firing them from logOutput (the old behaviour)
    // missed every returning user who didn't happen to log on the exact Nth day.
    // ─────────────────────────────────────────────────────────────────────────

    // ARCH-001: fire-and-forget Supabase sync (localStorage already updated above via set())
    const syncUserId = get().supabaseUserId;
    if (syncUserId) {
      const syncPathId = updatedUser.careerPathId;
      insertOutput(syncUserId, newOutput, syncPathId).catch(() => {});
      upsertSkillProgress(syncUserId, payload.skillId, syncPathId, updatedUserSkills[payload.skillId]).catch(() => {});
      upsertProfile(syncUserId, updatedUser).catch(() => {});
    }

    return {
      skillCompleted,
      xpGained: totalXPGained,
      sessionXpGained,
      newAchievements,
      leveledUp: absoluteFinalLevel > oldLevel,
      newLevel: absoluteFinalLevel,
      newSkillId: skillCompleted ? payload.skillId : undefined,
      streakBonusXP: streakMilestoneBonus > 0 ? streakMilestoneBonus : undefined,
      newStreak,
      evidenceRequired: evidenceRequired || undefined,
    };
  },

  validateSkill: (skillId: string) => {
    const state = get();
    if (!state.user) return;
    const us = state.userSkills[skillId];
    if (!us || us.status !== 'completed' || us.validated) return; // guard: must be completed and not already validated
    const newXP = state.user.xp + VALIDATION_BONUS_XP;
    const newLevel = getLevelFromXP(newXP);
    set({
      user: { ...state.user, xp: newXP, level: newLevel },
      userSkills: {
        ...state.userSkills,
        [skillId]: {
          ...us,
          validated: true,
          validatedAt: new Date().toISOString(),
          validationSource: us.validationSource ?? 'build',
        },
      },
    });
  },

  // GROW-002: complete a foundational skill by PASSING its knowledge check ("test out")
  // instead of building it. Honest experience weighting — proof by assessment, not by
  // declaration. Marks the skill completed-by-assessment, grants the flat validation
  // bonus, unlocks dependents, records any newly-earned achievements, and fires the
  // standard milestone celebration. No-op unless the skill is currently test-out eligible.
  testOutSkill: (skillId: string) => {
    const state = get();
    if (!state.user) return;
    const path = CAREER_PATHS.find((p) => p.id === state.user!.careerPathId);
    if (!path) return; // custom paths have no curated questions → build-only
    if (!isTestOutEligible(skillId, state.userSkills, path.skillIds, state.user.experienceLevel)) return;

    const nowIso = new Date().toISOString();
    const prev = state.userSkills[skillId];
    let updatedUserSkills: Record<string, UserSkill> = {
      ...state.userSkills,
      [skillId]: {
        ...prev,
        status: 'completed',
        outputCount: prev?.outputCount ?? 0,
        completedAt: nowIso,
        validated: true,
        validatedAt: nowIso,
        validationSource: 'assessment',
      },
    };
    updatedUserSkills = unlockDependentSkills(skillId, path.id as CareerPathId, updatedUserSkills);

    const oldLevel = state.user.level;
    let newXP = state.user.xp + VALIDATION_BONUS_XP;

    // Achievements that may newly unlock from the assessment completion (skill-mastered /
    // triple-master). Output-count achievements are unaffected (outputs unchanged).
    const completedCount = Object.values(updatedUserSkills).filter((u) => u.status === 'completed').length;
    const newAchievementIds = checkAchievements(
      state.outputs.length, completedCount, newXP, state.user.streak, state.unlockedAchievementIds,
    );
    const bonusXP = newAchievementIds.reduce((sum, id) => sum + (ALL_ACHIEVEMENTS.find((a) => a.id === id)?.xpGranted ?? 0), 0);
    newXP += bonusXP;
    const newLevel = getLevelFromXP(newXP);
    const newAchievements = newAchievementIds.map((id) => {
      const a = ALL_ACHIEVEMENTS.find((x) => x.id === id)!;
      return { id, title: a.title, xpGranted: a.xpGranted };
    });
    const updatedUser: User = { ...state.user, xp: newXP, level: newLevel };

    set({
      user: updatedUser,
      userSkills: updatedUserSkills,
      unlockedAchievementIds: [...state.unlockedAchievementIds, ...newAchievementIds],
      pendingCelebration: {
        skillId,
        xpGained: VALIDATION_BONUS_XP,
        sessionXpGained: VALIDATION_BONUS_XP + bonusXP,
        newAchievements,
        leveledUp: newLevel > oldLevel,
        newLevel,
      },
    });

    track('skill_tested_out', { skill_id: skillId, career_path: state.user.careerPathId, xp_gained: VALIDATION_BONUS_XP });

    // ARCH-001: fire-and-forget cloud sync (validation_source is not yet a remote column
    // — Phase 2 — but status/completed_at round-trip so the skill reads completed remotely).
    const uid = state.supabaseUserId;
    if (uid) {
      upsertSkillProgress(uid, skillId, path.id, updatedUserSkills[skillId]).catch(() => {});
      upsertProfile(uid, updatedUser).catch(() => {});
    }
  },

  // GROW-002: record a FAILED test-out attempt. At MAX_TESTOUT_ATTEMPTS the skill is no
  // longer test-out eligible (isTestOutEligible returns false) and becomes build-only.
  recordTestOutAttempt: (skillId: string) => {
    const state = get();
    const us = state.userSkills[skillId];
    if (!us) return;
    set({
      userSkills: {
        ...state.userSkills,
        [skillId]: { ...us, testOutAttempts: (us.testOutAttempts ?? 0) + 1 },
      },
    });
  },

  logCareerOutcome: (payload: LogOutcomePayload): number => {
    const state = get();
    if (!state.user) return 0;

    const xpAwarded = OUTCOME_XP[payload.type];
    const newXP = state.user.xp + xpAwarded;
    const newLevel = getLevelFromXP(newXP);

    const outcome: CareerOutcome = {
      id: uid('outcome'),
      type: payload.type,
      title: payload.title.trim(),
      company: payload.company?.trim() || undefined,
      note: payload.note?.trim() || undefined,
      xpAwarded,
      date: payload.date,
      createdAt: new Date().toISOString(),
    };

    // Build a feed post so the win shows up in the community feed
    const pathEntry = CAREER_PATHS.find((p) => p.id === state.user!.careerPathId);
    const winLabels: Record<OutcomeType, string> = {
      interview:       '🎯 Landed an interview',
      offer:           '🎉 Received a job offer',
      promotion:       '🚀 Got promoted',
      role_change:     '✨ Changed roles',
      certification:   '🏅 Earned a certification',
      salary_increase: '💰 Got a raise',
      portfolio:       '🌐 Published to portfolio',
      freelance:       '💼 Won a freelance client',
    };
    const winContent = payload.company
      ? `${winLabels[payload.type]}: ${payload.title.trim()} @ ${payload.company.trim()}${payload.note ? ` — ${payload.note.trim()}` : ''}`
      : `${winLabels[payload.type]}: ${payload.title.trim()}${payload.note ? ` — ${payload.note.trim()}` : ''}`;

    const winPost: FeedPost = {
      id: uid('fp_win'),
      userId: state.user.id,
      userName: state.user.name,
      userHandle: state.user.handle,
      avatarEmoji: state.user.avatarEmoji,
      avatarColor: state.user.avatarColor,
      avatarUri: state.user.avatarUri,
      pathId: state.user.careerPathId,
      pathLabel: pathEntry?.name ?? 'Career',
      pathColor: pathEntry?.color ?? Colors.primary,
      type: 'career_win',
      outcomeType: payload.type,
      content: winContent,
      xpGained: xpAwarded,
      reactions: {},
      userReactions: [],
      comments: [],
      timestamp: new Date().toISOString(),
      isCurrentUser: true,
    };

    const updatedUserFeedPosts = [winPost, ...state.userFeedPosts];
    const updatedFeed = [winPost, ...state.communityFeed];

    set({
      careerOutcomes: [outcome, ...state.careerOutcomes],
      user: { ...state.user, xp: newXP, level: newLevel },
      userFeedPosts: updatedUserFeedPosts,
      communityFeed: updatedFeed,
    });
    track('career_outcome_logged', { type: payload.type, xp_awarded: xpAwarded });
    return xpAwarded;
  },

  deleteCareerOutcome: (outcomeId: string) => {
    const state = get();
    if (!state.user) return;
    const outcome = state.careerOutcomes.find((o) => o.id === outcomeId);
    if (!outcome) return;
    const newXP = Math.max(0, state.user.xp - outcome.xpAwarded);
    const newLevel = getLevelFromXP(newXP);
    set({
      careerOutcomes: state.careerOutcomes.filter((o) => o.id !== outcomeId),
      user: { ...state.user, xp: newXP, level: newLevel },
    });
    track('career_outcome_deleted', { type: outcome.type });
  },

  deleteOutput: (outputId: string) => {
    const state = get();
    if (!state.user) return;

    const output = state.outputs.find((o) => o.id === outputId);
    if (!output) return;

    const newOutputs = state.outputs.filter((o) => o.id !== outputId);

    // Recompute skill output count from remaining outputs (source of truth)
    const remainingForSkill = newOutputs.filter((o) => o.skillId === output.skillId).length;
    const skill = ALL_SKILLS.find((s) => s.id === output.skillId);
    const requiredOutputs = skill?.requiredOutputs ?? 1;

    const newUserSkills = { ...state.userSkills };
    const existingUs = state.userSkills[output.skillId];
    if (existingUs) {
      let newStatus: SkillStatus = existingUs.status;
      // Revert completed → in_progress / available if we no longer meet the bar
      if (existingUs.status === 'completed' && remainingForSkill < requiredOutputs) {
        newStatus = remainingForSkill > 0 ? 'in_progress' : 'available';
      } else if (existingUs.status === 'in_progress' && remainingForSkill === 0) {
        newStatus = 'available';
      }
      newUserSkills[output.skillId] = {
        ...existingUs,
        outputCount: remainingForSkill,
        status: newStatus,
        completedAt: newStatus === 'completed' ? existingUs.completedAt : undefined,
      };
    }

    // Deduct exactly the XP that was awarded when this output was logged.
    // Guard against NaN/undefined in stored xpGained (shouldn't happen, but legacy data may differ).
    const safeOutputXP = Number.isFinite(output.xpGained) ? output.xpGained : 0;
    const xpAfterOutput = Math.max(0, state.user.xp - safeOutputXP);

    // Re-evaluate output-count and skill-count achievements — revoke ones that
    // the user no longer qualifies for after this deletion (e.g. deleting the
    // only output means 'first-steps' is no longer earned).
    const newCompletedSkillCount = Object.values(newUserSkills).filter(
      (us) => us.status === 'completed'
    ).length;
    const achievementsToRevoke = state.unlockedAchievementIds.filter((id) => {
      if (id === 'first-steps')    return newOutputs.length < 1;
      if (id === 'builder')        return newOutputs.length < 5;
      if (id === 'skill-mastered') return newCompletedSkillCount < 1;
      if (id === 'triple-master')  return newCompletedSkillCount < 3;
      // Streak and XP-threshold achievements are not revoked by output deletion
      return false;
    });
    const revokedAchievementXP = achievementsToRevoke.reduce((sum, id) => {
      const ach = ALL_ACHIEVEMENTS.find((a) => a.id === id);
      return sum + (ach?.xpGranted ?? 0);
    }, 0);

    const finalXP = Math.max(0, xpAfterOutput - revokedAchievementXP);
    const newLevel = getLevelFromXP(finalXP);
    const newUser = { ...state.user, xp: finalXP, level: newLevel };
    const updatedAchievementIds = state.unlockedAchievementIds.filter(
      (id) => !achievementsToRevoke.includes(id)
    );

    // Remove the feed post generated by this output (match on skillId + title + isCurrentUser).
    // This ensures the community feed stays in sync when outputs are deleted.
    const updatedUserFeedPosts = state.userFeedPosts.filter(
      (p) => !(p.isCurrentUser && p.skillId === output.skillId && p.outputTitle === output.title)
    );
    const updatedCommunityFeed = [
      ...updatedUserFeedPosts,
      ...state.communityFeed.filter((p) => !p.isCurrentUser),
    ];

    const totalXPDeducted = safeOutputXP + revokedAchievementXP;
    set({ outputs: newOutputs, userSkills: newUserSkills, user: newUser, unlockedAchievementIds: updatedAchievementIds, userFeedPosts: updatedUserFeedPosts, communityFeed: updatedCommunityFeed });
    track('output_deleted', { output_type: output.type, xp_deducted: totalXPDeducted, achievements_revoked: achievementsToRevoke.length });
  },

  useStreakFreeze: () => {
    const state = get();
    if (!state.user || (state.user.streakFreezes ?? 0) <= 0) return;
    const todayStr = localDateStr(); // RR-5: local calendar day
    const updatedUser = {
      ...state.user,
      streakFreezes: (state.user.streakFreezes ?? 1) - 1,
      lastActiveDate: todayStr, // mark today as active so streak won't break tonight
    };
    set({ user: updatedUser });
  },

  markMilestoneCelebrated: (key: string) => {
    const state = get();
    if (state.celebratedMilestones.includes(key)) return; // idempotent
    const updated = [...state.celebratedMilestones, key];
    set({ celebratedMilestones: updated });
  },

  clearCelebration: () => set({ pendingCelebration: null }),

  setSelectedSkill: (skillId: string | null) => set({ selectedSkillId: skillId }),

  dismissWelcomeCard: () => {
    set({ showWelcomeCard: false });
    // Not persisted — ephemeral for the current session only
  },

  resetApp: () => {
    try { localStorage.removeItem('maglakbai_v1'); } catch {}
    // PRIV-003: Reset wipes THIS DEVICE and signs out of Cloud Backup. It does
    // NOT delete cloud rows (no server-side delete path yet — COMP-001); the
    // Settings copy and privacy policy state this honestly. Signing out here
    // prevents the auth listener from silently re-syncing cloud data back
    // into the freshly reset app.
    signOut().catch(() => {});
    set({
      hasOnboarded: false,
      user: null,
      userSkills: {},
      outputs: [],
      unlockedAchievementIds: [],
      communityFeed: MOCK_FEED,
      userFeedPosts: [],
      pendingCelebration: null,
      customPaths: [],
      prioritizedPathId: null,
      roadmaps: [],
      celebratedMilestones: [],
      supabaseUserId: null,
      supabaseEmail: null,
      supabaseSyncing: false,
    });
  },

  togglePinOutput: (outputId: string) => {
    const state = get();
    if (!state.user) return;
    const current = state.user.pinnedOutputIds ?? [];
    const isPinned = current.includes(outputId);
    const MAX_PINS = 3;
    let updated: string[];
    if (isPinned) {
      updated = current.filter((id) => id !== outputId);
    } else {
      if (current.length >= MAX_PINS) return; // already at max, do nothing
      updated = [...current, outputId];
    }
    set({ user: { ...state.user, pinnedOutputIds: updated } });
    track('portfolio_pin_toggled', { pinned: !isPinned, output_id: outputId });
  },

});

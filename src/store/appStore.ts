import { create } from 'zustand';
import {
  User,
  Skill,
  UserSkill,
  Output,
  FeedPost,
  Achievement,
  CareerPath,
  CareerPathId,
  CustomPath,
  CustomSkill,
  LogOutputPayload,
  LogOutputResult,
  UnlockedAchievementInfo,
  SkillStatus,
  RoadmapEntry,
  RoadmapPriorityStatus,
  RoadmapStatus,
  EvidenceTier,
  CareerOutcome,
  LogOutcomePayload,
  OutcomeType,
  ExperienceLevel,
  PaceMode,
  MarketDemand,
} from '../types';
import { getLevelFromXP, Colors } from '../utils/theme';
import { track, identify } from '../utils/analytics';

// ─── Progression domain logic (extracted → ../domain/progression for unit testing, ARCH-002) ───
// Pure calculators now live in src/domain/progression.ts. They are imported here
// and re-exported so existing `from '../store/appStore'` imports keep working.
import {
  getDecayStage,
  getBurnoutSignal,
  getEvidenceTier,
  getSkillMasteryLevel,
  getCareerMastery,
  CAREER_MASTERY_LADDER,
  OUTCOME_XP,
  ONBOARDING_XP_GRANT,
  VALIDATION_BONUS_XP,
} from '../domain/progression';
import type {
  DecayStage,
  BurnoutSignal,
  MasteryLevel,
  CareerMasteryTitle,
} from '../domain/progression';

export {
  getDecayStage,
  getBurnoutSignal,
  getEvidenceTier,
  getSkillMasteryLevel,
  getCareerMastery,
  CAREER_MASTERY_LADDER,
  OUTCOME_XP,
};
export type { DecayStage, BurnoutSignal, MasteryLevel, CareerMasteryTitle };

// ─── Mastery presentation metadata (theme-coupled — stays in the store layer) ───
export const MASTERY_TIERS: Record<MasteryLevel, {
  label: string;
  shortLabel: string;
  color: string;
  icon: string;
  description: string;
}> = {
  0: { label: 'Not Started', shortLabel: '',           color: Colors.textMuted, icon: '○', description: 'Not yet attempted' },
  1: { label: 'Practicing',  shortLabel: 'PRACTICING', color: '#60A5FA',        icon: '◑', description: 'Building familiarity through proof-of-work' },
  2: { label: 'Competent',   shortLabel: 'COMPETENT',  color: '#A855F7',        icon: '●', description: 'Applied and completed — evidence gate passed' },
  3: { label: 'Validated',   shortLabel: 'VALIDATED',  color: '#F59E0B',        icon: '★', description: 'Demonstrated under testing — knowledge confirmed' },
};

export const CAREER_MASTERY_META: Record<CareerMasteryTitle, { color: string; description: string; next: string }> = {
  Beginner:   { color: Colors.textMuted,  description: 'Just getting started',                  next: 'Log outputs to start building skills' },
  Developing: { color: '#60A5FA',         description: 'Building core skills',                  next: 'Complete more skills to reach Competent' },
  Competent:  { color: '#A855F7',         description: 'Applying skills effectively',            next: 'Validate your skills to reach Advanced' },
  Advanced:   { color: Colors.success,    description: 'Demonstrating validated expertise',      next: 'Validate remaining skills to reach Expert' },
  Expert:     { color: Colors.gold,       description: 'Full path mastery — all skills validated', next: 'You\'ve reached the top. Build and share.' },
};

// ─── Static Catalog ──────────────────────────────────────────────────────────

import { CAREER_PATHS } from '../data/careerPaths';
import { ALL_SKILLS } from '../data/skills';
import { ALL_ACHIEVEMENTS } from '../data/achievements';
import { MOCK_FEED } from '../data/mockFeed';
import { MARKET_DEMAND_MAP } from '../data/marketDemand';
import { fetchMarketDemand, submitMarketSignal as dbSubmitSignal } from '../lib/db';

// Re-exported so existing `from '../store/appStore'` imports keep working.
export { CAREER_PATHS, ALL_SKILLS, ALL_ACHIEVEMENTS };
import { reconcileAchievementsAndXP, healPhantomSkillProgress } from '../domain/hydration';
import { loadFromStorage, attachPersistence } from './persistence';
import { createCoreSlice } from './slices/coreSlice';
import { createRoadmapSlice } from './slices/roadmapSlice';
import { createFeedSlice } from './slices/feedSlice';
import { createProfileSlice } from './slices/profileSlice';

// ─── Store ────────────────────────────────────────────────────────────────────

export interface PendingCelebration {
  skillId: string;
  xpGained: number;          // XP from this output (base + bonuses + skill-completion)
  sessionXpGained?: number;  // UX-030: total XP delta incl. achievement + streak-milestone bonuses
  newAchievements?: UnlockedAchievementInfo[]; // achievements unlocked alongside this milestone
  leveledUp: boolean;
  newLevel: number;
}

export interface AppState {
  hasOnboarded: boolean;
  // ARCH-001: Supabase session state — null when not signed in or backend disabled
  supabaseUserId: string | null;
  supabaseEmail: string | null;
  supabaseSyncing: boolean; // true while an initial sync is in progress
  supabaseProfileDirty: boolean; // MED-006: a profile push failed; re-push on next sync
  user: User | null;
  userSkills: Record<string, UserSkill>;
  outputs: Output[];
  unlockedAchievementIds: string[];
  communityFeed: FeedPost[];
  userFeedPosts: FeedPost[]; // user-generated posts, persisted to localStorage
  pendingCelebration: PendingCelebration | null;
  selectedSkillId: string | null;
  customPaths: CustomPath[];
  prioritizedPathId: string | null; // path pinned to Home (null → falls back to careerPathId)
  roadmaps: RoadmapEntry[]; // lifecycle tracking per enrolled path
  celebratedMilestones: string[]; // tracks "${pathId}-${tierPct}" keys already shown
  showWelcomeCard: boolean; // true on first Dashboard load after onboarding — ephemeral, not persisted
  savedPostIds: string[]; // post IDs bookmarked by the user
  colorScheme: 'dark' | 'light'; // persisted theme preference
  fontScale: number; // persisted app-wide text-size multiplier (0.9–1.2; 1 = default)
  reminderEnabled: boolean; // in-app "log your output" daily reminder on/off
  reminderTime: string; // 'HH:MM' local wall-clock the reminder fires at
  reminderVibrate: boolean; // buzz the device when the reminder fires (if the browser supports it)
  reminderLastShownDate: string | null; // local date the reminder last fired — once-a-day guard
  careerOutcomes: CareerOutcome[]; // self-reported real-world career wins
  marketDemand: Record<string, MarketDemand>; // demand signals keyed by skillId — loaded on first EvolveScreen mount
  submittedSignalSkillIds: string[]; // skillIds the user has already contributed a signal for (no re-prompting)

  completeOnboarding: (name: string, pathId: CareerPathId | string, email?: string, experienceLevel?: ExperienceLevel) => void;
  logOutput: (payload: LogOutputPayload) => LogOutputResult;
  reactToPost: (postId: string, emoji: string) => void;
  toggleSavePost: (postId: string) => void;
  setSelectedSkill: (skillId: string | null) => void;
  clearCelebration: () => void;
  resetApp: () => void;
  addCustomPath: (path: { name: string; icon: string; description: string; color: string; skills: CustomSkill[] }) => string; // returns new path ID
  switchPath: (pathId: string) => void;
  setPrioritizedPath: (pathId: string) => void;
  enrollInRoadmap: (pathId: string) => void; // enroll as SECONDARY + init skills
  setPriorityRoadmap: (pathId: string) => void; // promote to PRIORITY, demote current priority to SECONDARY
  pauseRoadmap: (pathId: string) => void; // ACTIVE → PAUSED
  archiveRoadmap: (pathId: string) => void; // → ARCHIVED
  reactivateRoadmap: (pathId: string) => void; // PAUSED/ARCHIVED → ACTIVE SECONDARY
  addRoadmapItem: (name: string, icon: string) => string; // creates item in personal library, returns new skillId
  // FEAT-001: editable roadmaps — all milestone edits are gated to *before the journey starts*
  // (no progress logged) and to custom paths only; built-in paths must be forked first.
  isRoadmapEditable: (pathId: string) => boolean; // custom + not locked + not started
  forkBuiltInPath: (pathId: CareerPathId | string) => string | null; // copy a built-in path → editable custom copy + enroll; returns new id (null if not built-in)
  addMilestone: (pathId: string, name: string, icon: string) => string | null; // returns new skillId (null if not editable)
  renameMilestone: (pathId: string, skillId: string, name: string) => void;
  removeMilestone: (pathId: string, skillId: string) => void;
  reorderMilestones: (pathId: string, orderedSkillIds: string[]) => void;
  lockRoadmap: (pathId: string, locked: boolean) => void; // user "focus-lock" — commit the roadmap
  deleteRoadmap: (pathId: string) => void; // un-enroll + drop a custom path's definition (the "delete & rebuild" path)
  useStreakFreeze: () => void;
  markMilestoneCelebrated: (key: string) => void;
  dismissWelcomeCard: () => void;
  updateAvatar: (emoji: string) => void;
  updateAvatarImage: (uri: string) => void;
  updateBio: (bio: string) => void;
  updateName: (name: string) => void;
  updateTargetRole: (role: string) => void;
  setComebackGoal: (weeklyGoal: number) => void;
  setPaceMode: (mode: PaceMode) => void;    // sprint / steady / recovery
  validateSkill: (skillId: string) => void; // marks skill validated + grants bonus XP
  // GROW-002: complete a foundational skill by passing its knowledge check (test out).
  testOutSkill: (skillId: string) => void;
  // GROW-002: record a failed test-out attempt (build-only after MAX_TESTOUT_ATTEMPTS).
  recordTestOutAttempt: (skillId: string) => void;
  logCareerOutcome: (payload: LogOutcomePayload) => number; // returns xpAwarded
  deleteCareerOutcome: (outcomeId: string) => void;
  togglePinOutput: (outputId: string) => void; // pin/unpin output in Portfolio (max 3)
  updateEmail: (email: string) => void;
  deleteOutput: (outputId: string) => void;
  addComment: (postId: string, text: string) => void;
  shuffleFeed: () => void; // HIGH-005: reorder seed posts for pull-to-refresh feedback
  setColorScheme: (scheme: 'dark' | 'light') => void;
  setFontScale: (scale: number) => void;
  setReminderEnabled: (enabled: boolean) => void;
  setReminderTime: (time: string) => void;
  setReminderVibrate: (enabled: boolean) => void;
  markReminderShown: (dateStr: string) => void;
  // ARCH-001: auth actions
  setSupabaseSession: (userId: string | null, email: string | null) => void;
  setSupabaseSyncing: (syncing: boolean) => void;
  syncFromSupabase: () => Promise<void>; // pull remote → merge into local state
  // Market demand
  loadMarketDemand: (pathId: string) => Promise<void>; // fetch + merge demand for a path
  submitMarketSignal: (skillId: string, pathId: string) => Promise<void>; // contribute one community signal
}

const saved = loadFromStorage();

// Re-evaluate achievements + heal XP against restored state (see src/domain/hydration.ts).
const _savedUser            = saved?.user ?? null;
// Heal NaN in xpGained on stored outputs (guard against corrupt data)
const _savedOutputsHealed: Output[] = (saved?.outputs ?? []).map((o) => ({
  ...o,
  xpGained: Number.isFinite(o.xpGained) ? o.xpGained : 0,
}));
const _hasOutputs = _savedOutputsHealed.length > 0;

// Phantom-progress heal: an account with zero logged outputs cannot hold any
// legitimately completed/in-progress skill. Strip unearned skill progress (old
// experience-level pre-credit) before anything else reads it. No-op if outputs exist.
const _savedUserSkills      = healPhantomSkillProgress(saved?.userSkills ?? {}, _savedOutputsHealed.length);

const _reconciled = _savedUser
  ? reconcileAchievementsAndXP({
      savedUnlocked: saved?.unlockedAchievementIds ?? [],
      outputCount: _savedOutputsHealed.length,
      completedSkillCount: Object.values(_savedUserSkills).filter((us) => us.status === 'completed').length,
      xp: _savedUser.xp,
      streak: _savedUser.streak,
      longestStreak: _savedUser.longestStreak,
      hasOutputs: _hasOutputs,
    })
  : { achievements: saved?.unlockedAchievementIds ?? [], healedXP: 0, validAchievementXP: 0 };

// GROW-002: a skill tested-out by assessment is legitimate progress even with zero
// logged outputs. Count those so the empty-account guards below don't strip earned
// Knowledge XP / completion badges.
const _assessmentCount = Object.values(_savedUserSkills).filter(
  (us) => us.status === 'completed' && us.validated && us.validationSource === 'assessment',
).length;
const _hasLegitProgress = _hasOutputs || _assessmentCount > 0;

// A TRULY-empty account (no outputs AND no tested-out skills) can hold only the
// onboarding grant and no badges — floor both so phantom pre-credit can't persist.
const _emptyAccount = !!_savedUser && !_hasLegitProgress;
const _healedXP = _emptyAccount
  ? Math.min(_reconciled.healedXP, ONBOARDING_XP_GRANT)
  : _hasOutputs
    ? _reconciled.healedXP
    // Assessment-only account: legit XP ceiling = onboarding grant + (tested-out skills ×
    // validation bonus) + valid achievement XP. Math.min strips any phantom excess.
    : Math.min(
        _reconciled.healedXP,
        ONBOARDING_XP_GRANT + _assessmentCount * VALIDATION_BONUS_XP + _reconciled.validAchievementXP,
      );
const _rehydratedAchievements = _emptyAccount ? [] : _reconciled.achievements;

import { createAuthSlice } from './slices/authSlice';

export const useAppStore = create<AppState>((set, get) => ({
  hasOnboarded: saved?.hasOnboarded ?? false,
  supabaseUserId: null,
  supabaseEmail: null,
  supabaseSyncing: false,
  supabaseProfileDirty: false,
  user: saved?.user
    ? { ...saved.user, xp: _healedXP, level: getLevelFromXP(_healedXP) }
    : null,
  userSkills: _savedUserSkills,
  outputs: _savedOutputsHealed,
  unlockedAchievementIds: _rehydratedAchievements,
  communityFeed: [...(saved?.userFeedPosts ?? []), ...MOCK_FEED],
  userFeedPosts: saved?.userFeedPosts ?? [],
  pendingCelebration: null,
  selectedSkillId: null,
  customPaths: saved?.customPaths ?? [],
  prioritizedPathId: saved?.prioritizedPathId ?? null,
  roadmaps: (() => {
    const r: RoadmapEntry[] = saved?.roadmaps ?? [];
    // Migration: existing users with no roadmaps array → create initial PRIORITY entry
    if (r.length === 0 && saved?.hasOnboarded && saved?.user?.careerPathId) {
      r.push({
        pathId: saved.user.careerPathId,
        priorityStatus: 'PRIORITY',
        roadmapStatus: 'ACTIVE',
        startedAt: saved.user?.joinedAt ?? new Date().toISOString(),
      });
    }
    return r;
  })(),
  celebratedMilestones: saved?.celebratedMilestones ?? [],
  showWelcomeCard: false,
  savedPostIds: saved?.savedPostIds ?? [],
  colorScheme: saved?.colorScheme ?? 'dark',
  fontScale: saved?.fontScale ?? 1,
  reminderEnabled: saved?.reminderEnabled ?? false,
  reminderTime: saved?.reminderTime ?? '19:00',
  reminderVibrate: saved?.reminderVibrate ?? true,
  reminderLastShownDate: saved?.reminderLastShownDate ?? null,
  careerOutcomes: saved?.careerOutcomes ?? [],
  marketDemand: { ...MARKET_DEMAND_MAP }, // seeded from curated data; community signals merged on load
  submittedSignalSkillIds: saved?.submittedSignalSkillIds ?? [],

  ...createCoreSlice(set, get),
  ...createRoadmapSlice(set, get),
  ...createFeedSlice(set, get),
  ...createProfileSlice(set, get),
  ...createAuthSlice(set, get),

  // ── Market demand actions ──────────────────────────────────────────────────

  loadMarketDemand: async (pathId: string) => {
    const merged = await fetchMarketDemand(pathId);
    set((s) => ({ marketDemand: { ...s.marketDemand, ...merged } }));
  },

  submitMarketSignal: async (skillId: string, pathId: string) => {
    const { supabaseUserId, submittedSignalSkillIds } = get();
    if (submittedSignalSkillIds.includes(skillId)) return; // already contributed
    const signal = { skillId, pathId, submittedAt: new Date().toISOString() };
    // Optimistically bump signal count locally
    set((s) => {
      const existing = s.marketDemand[skillId];
      if (!existing) return {};
      return {
        marketDemand: {
          ...s.marketDemand,
          [skillId]: {
            ...existing,
            signalCount: existing.signalCount + 1,
            source: 'mixed' as const,
          },
        },
        submittedSignalSkillIds: [...s.submittedSignalSkillIds, skillId],
      };
    });
    // Persist to Supabase (fire-and-forget)
    if (supabaseUserId) {
      await dbSubmitSignal(supabaseUserId, signal);
    }
  },
}));

// Persist the store to localStorage on every change (see src/store/persistence.ts).
attachPersistence(useAppStore);

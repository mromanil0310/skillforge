// Profile & settings store slice — actions extracted from appStore.ts (ARCH-002).
// Action bodies are unchanged; recombined in appStore.ts via the Zustand slices pattern.

import type { StoreApi } from 'zustand';
import type { AppState, PendingCelebration } from '../appStore';
import type {
  User, Output, FeedPost, CareerPathId, CustomPath, CustomSkill,
  LogOutputPayload, LogOutputResult, SkillStatus, RoadmapEntry,
  RoadmapPriorityStatus, RoadmapStatus, CareerOutcome, LogOutcomePayload,
  OutcomeType, ExperienceLevel, PaceMode,
} from '../../types';
import { getLevelFromXP, Colors } from '../../utils/theme';
import { track, identify } from '../../utils/analytics';
import { CAREER_PATHS } from '../../data/careerPaths';
import { ALL_SKILLS } from '../../data/skills';
import { ALL_ACHIEVEMENTS } from '../../data/achievements';
import { MOCK_FEED } from '../../data/mockFeed';
import { getEvidenceTier, OUTCOME_XP, getCareerMastery } from '../../domain/progression';
import { initUserSkills, unlockDependentSkills, checkAchievements } from '../../domain/skillGraph';

type Set = StoreApi<AppState>['setState'];
type Get = StoreApi<AppState>['getState'];

export const createProfileSlice = (set: Set, get: Get): Pick<AppState, 'updateAvatar' | 'updateAvatarImage' | 'updateBio' | 'updateName' | 'updateTargetRole' | 'setComebackGoal' | 'setPaceMode' | 'updateEmail' | 'setColorScheme' | 'setFontScale' | 'setReminderEnabled' | 'setReminderTime' | 'setReminderVibrate' | 'markReminderShown'> => ({
  updateAvatar: (emoji: string) => {
    const state = get();
    if (!state.user) return;
    // Switching back to emoji clears any uploaded photo
    set({ user: { ...state.user, avatarEmoji: emoji, avatarUri: undefined } });
  },

  updateAvatarImage: (uri: string) => {
    const state = get();
    if (!state.user) return;
    set({ user: { ...state.user, avatarUri: uri } });
  },

  updateBio: (bio: string) => {
    const state = get();
    if (!state.user) return;
    set({ user: { ...state.user, bio } });
  },

  updateName: (name: string) => {
    const state = get();
    if (!state.user) return;
    const handle = name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '') || 'user';
    set({ user: { ...state.user, name, handle } });
  },

  updateTargetRole: (role: string) => {
    const state = get();
    if (!state.user) return;
    set({ user: { ...state.user, targetRole: role.trim() || undefined } });
  },

  setComebackGoal: (weeklyGoal: number) => {
    const state = get();
    if (!state.user) return;
    set({ user: { ...state.user, weeklyOutputGoal: weeklyGoal } });
  },

  setPaceMode: (mode: PaceMode) => {
    const state = get();
    if (!state.user) return;
    set({ user: { ...state.user, paceMode: mode } });
    track('pace_mode_set', { mode });
  },

  updateEmail: (email: string) => {
    const state = get();
    if (!state.user) return;
    set({ user: { ...state.user, email: email.trim() || undefined } });
  },

  setColorScheme: (scheme: 'dark' | 'light') => {
    set({ colorScheme: scheme });
  },

  // App-wide text size. Clamped to the supported range so a bad value can never
  // be persisted or zoom the UI off-screen.
  setFontScale: (scale: number) => {
    const clamped = Math.min(1.2, Math.max(0.9, Math.round(scale * 100) / 100));
    set({ fontScale: clamped });
  },

  // ── In-app log reminder ("alarm") ──────────────────────────────────────────
  setReminderEnabled: (enabled: boolean) => {
    // Re-enabling clears any stale "already shown" stamp so it can fire again today.
    set(enabled ? { reminderEnabled: true, reminderLastShownDate: null } : { reminderEnabled: false });
    track('log_reminder_toggled', { enabled });
  },

  setReminderTime: (time: string) => {
    // Guard: only accept a well-formed 'HH:MM'. Changing the time resets the daily
    // guard so a newly-chosen (later) time can still fire today.
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(time)) return;
    set({ reminderTime: time, reminderLastShownDate: null });
  },

  setReminderVibrate: (enabled: boolean) => {
    set({ reminderVibrate: enabled });
  },

  // Stamp the local date the reminder fired so it only fires once per day.
  markReminderShown: (dateStr: string) => {
    set({ reminderLastShownDate: dateStr });
  },
});

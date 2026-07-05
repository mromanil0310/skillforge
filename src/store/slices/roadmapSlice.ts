// Roadmap & paths store slice — actions extracted from appStore.ts (ARCH-002).
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
import { uid } from '../../utils/uid';
import { CAREER_PATHS } from '../../data/careerPaths';
import { ALL_SKILLS } from '../../data/skills';
import { ALL_ACHIEVEMENTS } from '../../data/achievements';
import { MOCK_FEED } from '../../data/mockFeed';
import { getEvidenceTier, OUTCOME_XP, getCareerMastery } from '../../domain/progression';
import { initUserSkills, unlockDependentSkills, checkAchievements, pathHasProgress } from '../../domain/skillGraph';

type Set = StoreApi<AppState>['setState'];
type Get = StoreApi<AppState>['getState'];

export const createRoadmapSlice = (set: Set, get: Get): Pick<AppState, 'addCustomPath' | 'switchPath' | 'setPrioritizedPath' | 'enrollInRoadmap' | 'setPriorityRoadmap' | 'pauseRoadmap' | 'archiveRoadmap' | 'reactivateRoadmap' | 'addRoadmapItem' | 'isRoadmapEditable' | 'forkBuiltInPath' | 'addMilestone' | 'renameMilestone' | 'removeMilestone' | 'reorderMilestones' | 'lockRoadmap' | 'deleteRoadmap'> => ({
  addCustomPath: ({ name, icon, description, color, skills }) => {
    const state = get();
    track('custom_path_created', { path_name: name, skill_count: skills.length });
    const newPathId = uid('custom');
    const newPath: CustomPath = {
      id: newPathId,
      name,
      icon,
      description,
      color,
      skills,
      isCustom: true,
      createdAt: new Date().toISOString(),
    };
    const updatedCustomPaths = [...state.customPaths, newPath];
    // Init user skills for the custom path
    const newUserSkills = { ...state.userSkills };
    skills.forEach((skill, i) => {
      newUserSkills[skill.id] = { skillId: skill.id, status: i === 0 ? 'available' : 'locked', outputCount: 0 };
    });
    set({ customPaths: updatedCustomPaths, userSkills: newUserSkills });
    return newPathId;
  },

  switchPath: (pathId: string) => {
    const state = get();
    if (!state.user) return;
    const isBuiltInPath = CAREER_PATHS.some(p => p.id === pathId);
    track('path_switched', {
      from_path: state.user.careerPathId,
      to_path: pathId,
      is_custom: !isBuiltInPath,
    });
    const updatedUser = { ...state.user, careerPathId: pathId };
    // Init skills for this path if not already tracked
    let newUserSkills = { ...state.userSkills };
    if (isBuiltInPath) {
      const path = CAREER_PATHS.find(p => p.id === pathId)!;
      path.skillIds.forEach(skillId => {
        if (!newUserSkills[skillId]) {
          const skill = ALL_SKILLS.find(s => s.id === skillId)!;
          newUserSkills[skillId] = {
            skillId,
            status: skill.prerequisites.length === 0 ? 'available' : 'locked',
            outputCount: 0,
          };
        }
      });
    } else {
      const customPath = state.customPaths.find(p => p.id === pathId);
      if (customPath) {
        customPath.skills.forEach((skill, i) => {
          if (!newUserSkills[skill.id]) {
            newUserSkills[skill.id] = { skillId: skill.id, status: i === 0 ? 'available' : 'locked', outputCount: 0 };
          }
        });
      }
    }
    // Auto-enroll as SECONDARY if not already in roadmaps
    let updatedRoadmaps = state.roadmaps;
    if (!state.roadmaps.some(r => r.pathId === pathId)) {
      updatedRoadmaps = [...state.roadmaps, {
        pathId,
        priorityStatus: 'SECONDARY' as RoadmapPriorityStatus,
        roadmapStatus: 'ACTIVE' as RoadmapStatus,
        startedAt: new Date().toISOString(),
      }];
    }
    set({ user: updatedUser, userSkills: newUserSkills, roadmaps: updatedRoadmaps });
  },

  setPrioritizedPath: (pathId: string) => {
    set({ prioritizedPathId: pathId });
  },

  enrollInRoadmap: (pathId: string) => {
    const state = get();
    // Don't re-enroll if already enrolled
    if (state.roadmaps.some(r => r.pathId === pathId)) return;

    const newEntry: RoadmapEntry = {
      pathId,
      priorityStatus: 'SECONDARY',
      roadmapStatus: 'ACTIVE',
      startedAt: new Date().toISOString(),
    };

    // Init skills for this path
    const isBuiltIn = CAREER_PATHS.some(p => p.id === pathId);
    let newUserSkills = { ...state.userSkills };
    if (isBuiltIn) {
      const path = CAREER_PATHS.find(p => p.id === pathId)!;
      path.skillIds.forEach(skillId => {
        if (!newUserSkills[skillId]) {
          const skill = ALL_SKILLS.find(s => s.id === skillId)!;
          newUserSkills[skillId] = {
            skillId,
            status: skill.prerequisites.length === 0 ? 'available' : 'locked',
            outputCount: 0,
          };
        }
      });
    }

    set({ roadmaps: [...state.roadmaps, newEntry], userSkills: newUserSkills });
    track('roadmap_enrolled', { path_id: pathId, priority_status: 'SECONDARY' });
  },

  setPriorityRoadmap: (pathId: string) => {
    const state = get();
    // Enroll first if not already enrolled
    const alreadyEnrolled = state.roadmaps.some(r => r.pathId === pathId);
    const updatedRoadmaps = state.roadmaps.map(r => {
      if (r.pathId === pathId) {
        return { ...r, priorityStatus: 'PRIORITY' as RoadmapPriorityStatus, roadmapStatus: 'ACTIVE' as RoadmapStatus };
      }
      if (r.priorityStatus === 'PRIORITY') {
        return { ...r, priorityStatus: 'SECONDARY' as RoadmapPriorityStatus };
      }
      return r;
    });

    if (!alreadyEnrolled) {
      updatedRoadmaps.push({
        pathId,
        priorityStatus: 'PRIORITY',
        roadmapStatus: 'ACTIVE',
        startedAt: new Date().toISOString(),
      });
    }

    // Init skills if needed
    const isBuiltIn = CAREER_PATHS.some(p => p.id === pathId);
    let newUserSkills = { ...state.userSkills };
    if (isBuiltIn) {
      const path = CAREER_PATHS.find(p => p.id === pathId)!;
      path.skillIds.forEach(skillId => {
        if (!newUserSkills[skillId]) {
          const skill = ALL_SKILLS.find(s => s.id === skillId)!;
          newUserSkills[skillId] = {
            skillId,
            status: skill.prerequisites.length === 0 ? 'available' : 'locked',
            outputCount: 0,
          };
        }
      });
    }

    const updatedUser = state.user ? { ...state.user, careerPathId: pathId } : state.user;
    set({ roadmaps: updatedRoadmaps, prioritizedPathId: pathId, userSkills: newUserSkills, user: updatedUser });
    track('roadmap_priority_changed', { path_id: pathId });
  },

  pauseRoadmap: (pathId: string) => {
    const state = get();
    const updatedRoadmaps = state.roadmaps.map(r =>
      r.pathId === pathId ? { ...r, roadmapStatus: 'PAUSED' as RoadmapStatus } : r
    );
    set({ roadmaps: updatedRoadmaps });
    track('roadmap_paused', { path_id: pathId });
  },

  archiveRoadmap: (pathId: string) => {
    const state = get();
    const updatedRoadmaps = state.roadmaps.map(r =>
      r.pathId === pathId
        ? { ...r, roadmapStatus: 'ARCHIVED' as RoadmapStatus, priorityStatus: 'SECONDARY' as RoadmapPriorityStatus, archivedAt: new Date().toISOString() }
        : r
    );
    // If archiving the current priority, promote the first active secondary to priority
    const archivedEntry = state.roadmaps.find(r => r.pathId === pathId);
    let newPriorityId = state.prioritizedPathId;
    if (archivedEntry?.priorityStatus === 'PRIORITY') {
      const nextActive = updatedRoadmaps.find(r => r.roadmapStatus === 'ACTIVE' && r.pathId !== pathId);
      if (nextActive) {
        newPriorityId = nextActive.pathId;
        const idx = updatedRoadmaps.findIndex(r => r.pathId === nextActive.pathId);
        updatedRoadmaps[idx] = { ...updatedRoadmaps[idx], priorityStatus: 'PRIORITY' };
      } else {
        newPriorityId = null;
      }
    }
    set({ roadmaps: updatedRoadmaps, prioritizedPathId: newPriorityId });
    track('roadmap_archived', { path_id: pathId });
  },

  reactivateRoadmap: (pathId: string) => {
    const state = get();
    const updatedRoadmaps = state.roadmaps.map(r =>
      r.pathId === pathId
        ? { ...r, roadmapStatus: 'ACTIVE' as RoadmapStatus, archivedAt: undefined }
        : r
    );
    set({ roadmaps: updatedRoadmaps });
    track('roadmap_reactivated', { path_id: pathId });
  },

  addRoadmapItem: (name: string, icon: string): string => {
    const state = get();
    const newId = uid('personal');
    const newSkill: CustomSkill = { id: newId, name, description: '', icon };

    // Find or create the "My Library" personal path
    const PERSONAL_LIB_ID = 'personal_library';
    let updatedCustomPaths = [...state.customPaths];
    const libIdx = updatedCustomPaths.findIndex((p) => p.id === PERSONAL_LIB_ID);

    if (libIdx >= 0) {
      updatedCustomPaths[libIdx] = {
        ...updatedCustomPaths[libIdx],
        skills: [...updatedCustomPaths[libIdx].skills, newSkill],
      };
    } else {
      updatedCustomPaths.push({
        id: PERSONAL_LIB_ID,
        name: 'My Library',
        icon: '📚',
        description: 'Personal items added while logging work',
        color: '#7C3AED',
        skills: [newSkill],
        isCustom: true,
        createdAt: new Date().toISOString(),
      });
    }

    const newUserSkills = {
      ...state.userSkills,
      [newId]: { skillId: newId, status: 'available' as SkillStatus, outputCount: 0 },
    };

    set({ customPaths: updatedCustomPaths, userSkills: newUserSkills });

    return newId;
  },

  // ─── FEAT-001: editable roadmaps (pre-start only) ────────────────────────────
  // A roadmap can be edited only while it is (a) a custom path, (b) not focus-locked,
  // and (c) not yet started (no skill has any logged progress). Once the journey
  // starts, the structure freezes — to change it the user deletes & rebuilds. This
  // keeps the XP target stable mid-journey and avoids analysis paralysis.

  isRoadmapEditable: (pathId: string): boolean => {
    const state = get();
    const custom = state.customPaths.find((p) => p.id === pathId);
    if (!custom) return false; // built-in paths must be forked into an editable copy first
    const entry = state.roadmaps.find((r) => r.pathId === pathId);
    if (entry?.locked) return false; // user has focus-locked it
    return !pathHasProgress(custom.skills.map((s) => s.id), state.userSkills);
  },

  forkBuiltInPath: (pathId: CareerPathId | string): string | null => {
    const state = get();
    const builtIn = CAREER_PATHS.find((p) => p.id === pathId);
    if (!builtIn) return null; // only built-in paths can be forked
    const newPathId = uid('custom');
    const skills: CustomSkill[] = builtIn.skillIds.map((skillId) => {
      const s = ALL_SKILLS.find((x) => x.id === skillId);
      return {
        id: `${newPathId}_${skillId}`,
        name: s?.name ?? skillId,
        description: s?.description ?? '',
        icon: s?.icon ?? '🎯',
      };
    });
    const newPath: CustomPath = {
      id: newPathId,
      name: `${builtIn.name} (My Copy)`,
      icon: builtIn.icon,
      description: `Editable copy of ${builtIn.name}`,
      color: builtIn.color,
      skills,
      isCustom: true,
      createdAt: new Date().toISOString(),
    };
    const newUserSkills = { ...state.userSkills };
    skills.forEach((skill, i) => {
      newUserSkills[skill.id] = { skillId: skill.id, status: i === 0 ? 'available' : 'locked', outputCount: 0 };
    });
    const newEntry: RoadmapEntry = {
      pathId: newPathId,
      priorityStatus: 'SECONDARY',
      roadmapStatus: 'ACTIVE',
      startedAt: new Date().toISOString(),
    };
    set({
      customPaths: [...state.customPaths, newPath],
      userSkills: newUserSkills,
      roadmaps: [...state.roadmaps, newEntry],
    });
    track('roadmap_forked', { source_path: String(pathId), new_path: newPathId });
    return newPathId;
  },

  addMilestone: (pathId: string, name: string, icon: string): string | null => {
    const state = get();
    if (!get().isRoadmapEditable(pathId)) return null;
    const newId = uid('milestone');
    const newSkill: CustomSkill = { id: newId, name, description: '', icon };
    const updatedCustomPaths = state.customPaths.map((p) =>
      p.id === pathId ? { ...p, skills: [...p.skills, newSkill] } : p
    );
    // New milestones append to the end. First one is available; later ones gate on the
    // previous milestone, mirroring the linear unlock model of built-in paths.
    const path = updatedCustomPaths.find((p) => p.id === pathId)!;
    const status: SkillStatus = path.skills.length === 1 ? 'available' : 'locked';
    const newUserSkills = {
      ...state.userSkills,
      [newId]: { skillId: newId, status, outputCount: 0 },
    };
    set({ customPaths: updatedCustomPaths, userSkills: newUserSkills });
    track('milestone_added', { path_id: pathId, skill_id: newId });
    return newId;
  },

  renameMilestone: (pathId: string, skillId: string, name: string) => {
    const state = get();
    if (!get().isRoadmapEditable(pathId)) return;
    const updatedCustomPaths = state.customPaths.map((p) =>
      p.id === pathId
        ? { ...p, skills: p.skills.map((s) => (s.id === skillId ? { ...s, name } : s)) }
        : p
    );
    set({ customPaths: updatedCustomPaths });
  },

  removeMilestone: (pathId: string, skillId: string) => {
    const state = get();
    if (!get().isRoadmapEditable(pathId)) return;
    const updatedCustomPaths = state.customPaths.map((p) =>
      p.id === pathId ? { ...p, skills: p.skills.filter((s) => s.id !== skillId) } : p
    );
    const newUserSkills = { ...state.userSkills };
    delete newUserSkills[skillId];
    // Keep the unlock chain coherent: ensure the new first milestone is 'available'.
    const path = updatedCustomPaths.find((p) => p.id === pathId);
    if (path && path.skills.length > 0) {
      const firstId = path.skills[0].id;
      if (newUserSkills[firstId]?.status === 'locked') {
        newUserSkills[firstId] = { ...newUserSkills[firstId], status: 'available' };
      }
    }
    set({ customPaths: updatedCustomPaths, userSkills: newUserSkills });
  },

  reorderMilestones: (pathId: string, orderedSkillIds: string[]) => {
    const state = get();
    if (!get().isRoadmapEditable(pathId)) return;
    const updatedCustomPaths = state.customPaths.map((p) => {
      if (p.id !== pathId) return p;
      const byId = new Map(p.skills.map((s) => [s.id, s]));
      const reordered = orderedSkillIds
        .map((id) => byId.get(id))
        .filter((s): s is CustomSkill => !!s);
      // Append any skills not present in the supplied order (defensive).
      p.skills.forEach((s) => { if (!orderedSkillIds.includes(s.id)) reordered.push(s); });
      return { ...p, skills: reordered };
    });
    // Re-apply the linear unlock model: first available, the rest locked (pre-start, so
    // none have progress yet by the editable gate).
    const path = updatedCustomPaths.find((p) => p.id === pathId);
    const newUserSkills = { ...state.userSkills };
    if (path) {
      path.skills.forEach((s, i) => {
        if (newUserSkills[s.id]) {
          newUserSkills[s.id] = { ...newUserSkills[s.id], status: i === 0 ? 'available' : 'locked' };
        }
      });
    }
    set({ customPaths: updatedCustomPaths, userSkills: newUserSkills });
  },

  lockRoadmap: (pathId: string, locked: boolean) => {
    const state = get();
    const updatedRoadmaps = state.roadmaps.map((r) =>
      r.pathId === pathId ? { ...r, locked } : r
    );
    set({ roadmaps: updatedRoadmaps });
    track('roadmap_lock_toggled', { path_id: pathId, locked });
  },

  deleteRoadmap: (pathId: string) => {
    const state = get();
    // Un-enroll. Earned XP/outputs are permanent proof and are intentionally kept;
    // only the roadmap structure is removed so the user can build a fresh one.
    const updatedRoadmaps = state.roadmaps.filter((r) => r.pathId !== pathId);

    // If this was the priority, promote the next active roadmap (mirrors archiveRoadmap).
    const deletedEntry = state.roadmaps.find((r) => r.pathId === pathId);
    let newPriorityId = state.prioritizedPathId === pathId ? null : state.prioritizedPathId;
    if (deletedEntry?.priorityStatus === 'PRIORITY') {
      const nextActive = updatedRoadmaps.find((r) => r.roadmapStatus === 'ACTIVE');
      if (nextActive) {
        newPriorityId = nextActive.pathId;
        const idx = updatedRoadmaps.findIndex((r) => r.pathId === nextActive.pathId);
        updatedRoadmaps[idx] = { ...updatedRoadmaps[idx], priorityStatus: 'PRIORITY' };
      }
    }

    // Drop the custom path definition (built-in catalog is never mutated).
    const custom = state.customPaths.find((p) => p.id === pathId);
    const updatedCustomPaths = state.customPaths.filter((p) => p.id !== pathId);

    // Remove userSkills entries that belong to this custom path AND have no logged
    // proof. Skills with outputs are kept so the user's history/XP stays intact.
    const newUserSkills = { ...state.userSkills };
    if (custom) {
      custom.skills.forEach((s) => {
        if ((newUserSkills[s.id]?.outputCount ?? 0) === 0) delete newUserSkills[s.id];
      });
    }

    // Keep the active user.careerPathId pointing at something real.
    let updatedUser = state.user;
    if (state.user?.careerPathId === pathId) {
      const fallback = newPriorityId ?? updatedRoadmaps[0]?.pathId ?? CAREER_PATHS[0].id;
      updatedUser = { ...state.user, careerPathId: fallback };
    }

    set({
      roadmaps: updatedRoadmaps,
      customPaths: updatedCustomPaths,
      userSkills: newUserSkills,
      prioritizedPathId: newPriorityId,
      user: updatedUser,
    });
    track('roadmap_deleted', { path_id: pathId, was_custom: !!custom });
  },

});

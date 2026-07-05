// Community feed store slice — actions extracted from appStore.ts (ARCH-002).
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
import { initUserSkills, unlockDependentSkills, checkAchievements } from '../../domain/skillGraph';

type Set = StoreApi<AppState>['setState'];
type Get = StoreApi<AppState>['getState'];

export const createFeedSlice = (set: Set, get: Get): Pick<AppState, 'reactToPost' | 'toggleSavePost' | 'addComment' | 'shuffleFeed'> => ({
  // HIGH-005: pull-to-refresh feedback. Re-orders the seed/community (non-user) posts so
  // a refresh visibly changes the feed; the user's own posts stay pinned at the top so
  // they never "lose" their work. Community is PREVIEW data, so this is presentation-only.
  shuffleFeed: () => {
    const { communityFeed } = get();
    const mine = communityFeed.filter((p) => p.isCurrentUser);
    const others = communityFeed.filter((p) => !p.isCurrentUser);
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
    set({ communityFeed: [...mine, ...others] });
  },

  reactToPost: (postId: string, emoji: string) => {
    const state = get();
    const post = state.communityFeed.find(p => p.id === postId);
    const wasReacted = post?.userReactions.includes(emoji) ?? false;
    const updatedFeed = state.communityFeed.map((post) => {
      if (post.id !== postId) return post;
      const hasReacted = post.userReactions.includes(emoji);
      const newReactions = { ...post.reactions };
      const newUserReactions = [...post.userReactions];

      if (hasReacted) {
        newReactions[emoji] = Math.max(0, (newReactions[emoji] ?? 1) - 1);
        if (newReactions[emoji] === 0) delete newReactions[emoji];
        return { ...post, reactions: newReactions, userReactions: newUserReactions.filter((e) => e !== emoji) };
      } else {
        newReactions[emoji] = (newReactions[emoji] ?? 0) + 1;
        return { ...post, reactions: newReactions, userReactions: [...newUserReactions, emoji] };
      }
    });
    // Keep userFeedPosts in sync so reactions on user's own posts survive reload
    const updatedUserFeedPosts = state.userFeedPosts.map(p => {
      const updated = updatedFeed.find(f => f.id === p.id);
      return updated ?? p;
    });
    set({ communityFeed: updatedFeed, userFeedPosts: updatedUserFeedPosts });
    if (!wasReacted) {
      track('post_reacted', { post_id: postId, emoji, post_type: post?.type });
    }
  },

  toggleSavePost: (postId: string) => {
    const current = get().savedPostIds;
    const isSaved = current.includes(postId);
    const updated = isSaved ? current.filter((id) => id !== postId) : [...current, postId];
    set({ savedPostIds: updated });
  },

  addComment: (postId: string, text: string) => {
    const state = get();
    if (!state.user || !text.trim()) return;
    const isOwnPost = state.communityFeed.find((p) => p.id === postId)?.isCurrentUser ?? false;
    const newComment = {
      id: uid('c'),
      userId: state.user.id,
      userName: state.user.name,
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };
    const updatedFeed = state.communityFeed.map((post) =>
      post.id !== postId ? post : { ...post, comments: [...post.comments, newComment] }
    );
    // Keep userFeedPosts in sync so comments on user's own posts survive reload
    const updatedUserFeedPosts = state.userFeedPosts.map(p => {
      const updated = updatedFeed.find(f => f.id === p.id);
      return updated ?? p;
    });
    set({ communityFeed: updatedFeed, userFeedPosts: updatedUserFeedPosts });
    track('comment_posted', { post_id: postId, is_own_post: isOwnPost });
  },

});

import { describe, it, expect } from 'vitest';
import { useAppStore } from '../appStore';
import type { FeedPost, User } from '../../types';
import { calculateOutputXP, CUSTOM_SKILL_COMPLETION_XP } from '../../domain/progression';

// Store-action tests for the feed / profile / roadmap slices (QA-001).
// These exercise the real store; resetApp() isolates each test.

const store = useAppStore;
const get = () => store.getState();
const reset = () => get().resetApp();
const onboard = () => get().completeOnboarding('Tester', 'data-architect');

const fakeUser = (over: Partial<User> = {}): User => ({
  id: 'u', name: 'Tester', handle: 'tester', careerPathId: 'data-architect',
  xp: 0, level: 1, streak: 0, longestStreak: 0, bio: '', avatarEmoji: '⚡',
  avatarColor: '#000', joinedAt: '2026-01-01T00:00:00.000Z', ...over,
});
const fakePost = (over: Partial<FeedPost> = {}): FeedPost => ({
  id: 'fp1', userId: 'u', userName: 'Tester', userHandle: 'tester', avatarEmoji: '⚡',
  avatarColor: '#000', pathId: 'data-architect', pathLabel: 'Data Architect', pathColor: '#000',
  type: 'output', content: 'c', xpGained: 0, reactions: {}, userReactions: [], comments: [],
  timestamp: '2026-01-01T00:00:00.000Z', ...over,
});

// ─── feedSlice ──────────────────────────────────────────────────────────────────
describe('feedSlice', () => {
  it('toggleSavePost adds then removes a post id', () => {
    reset();
    get().toggleSavePost('p1');
    expect(get().savedPostIds).toContain('p1');
    get().toggleSavePost('p1');
    expect(get().savedPostIds).not.toContain('p1');
  });

  it('reactToPost adds a reaction then toggles it off', () => {
    reset();
    store.setState({ communityFeed: [fakePost({ id: 'fp1' })] });
    get().reactToPost('fp1', '🔥');
    let post = get().communityFeed.find((p) => p.id === 'fp1')!;
    expect(post.userReactions).toContain('🔥');
    expect(post.reactions['🔥']).toBe(1);
    get().reactToPost('fp1', '🔥');
    post = get().communityFeed.find((p) => p.id === 'fp1')!;
    expect(post.userReactions).not.toContain('🔥');
    expect(post.reactions['🔥']).toBeUndefined();
  });

  it('addComment appends a comment (and no-ops on empty text / no user)', () => {
    reset();
    store.setState({ user: fakeUser(), communityFeed: [fakePost({ id: 'fp1' })] });
    get().addComment('fp1', '   '); // empty after trim → no-op
    expect(get().communityFeed.find((p) => p.id === 'fp1')!.comments).toHaveLength(0);
    get().addComment('fp1', 'great work');
    const post = get().communityFeed.find((p) => p.id === 'fp1')!;
    expect(post.comments).toHaveLength(1);
    expect(post.comments[0].text).toBe('great work');
  });

  it('shuffleFeed keeps the same posts, pins user posts first (HIGH-005)', () => {
    reset();
    const feed = [
      fakePost({ id: 'mine', isCurrentUser: true }),
      fakePost({ id: 'a' }), fakePost({ id: 'b' }), fakePost({ id: 'c' }), fakePost({ id: 'd' }),
    ];
    store.setState({ communityFeed: feed });
    get().shuffleFeed();
    const after = get().communityFeed;
    // same set of posts, none lost or duplicated
    expect(after.map((p) => p.id).sort()).toEqual(['a', 'b', 'c', 'd', 'mine']);
    // user's own post stays pinned at the top
    expect(after[0].id).toBe('mine');
  });
});

// ─── profileSlice ─────────────────────────────────────────────────────────────────
describe('profileSlice', () => {
  it('updateName sets name and recomputes the handle', () => {
    reset();
    onboard();
    get().updateName('Ada Lovelace');
    expect(get().user!.name).toBe('Ada Lovelace');
    expect(get().user!.handle).toBe('ada.lovelace');
  });

  it('updateEmail trims and clears to undefined when blank', () => {
    reset();
    onboard();
    get().updateEmail('  a@b.com  ');
    expect(get().user!.email).toBe('a@b.com');
    get().updateEmail('   ');
    expect(get().user!.email).toBeUndefined();
  });

  it('updateAvatar sets emoji and clears any uploaded image', () => {
    reset();
    store.setState({ user: fakeUser({ avatarUri: 'data:img' }) });
    get().updateAvatar('🚀');
    expect(get().user!.avatarEmoji).toBe('🚀');
    expect(get().user!.avatarUri).toBeUndefined();
  });

  it('setPaceMode, setComebackGoal, updateBio update the user', () => {
    reset();
    onboard();
    get().setPaceMode('recovery');
    get().setComebackGoal(3);
    get().updateBio('building things');
    expect(get().user!.paceMode).toBe('recovery');
    expect(get().user!.weeklyOutputGoal).toBe(3);
    expect(get().user!.bio).toBe('building things');
  });

  it('setColorScheme updates the scheme (works without a user)', () => {
    reset();
    get().setColorScheme('light');
    expect(get().colorScheme).toBe('light');
  });

  it('profile setters no-op when there is no user', () => {
    reset(); // user is null
    get().updateName('X');
    get().updateBio('Y');
    expect(get().user).toBeNull();
  });
});

// ─── roadmapSlice ─────────────────────────────────────────────────────────────────
describe('roadmapSlice', () => {
  it('addCustomPath returns an id, stores the path, and inits its skills', () => {
    reset();
    onboard();
    const id = get().addCustomPath({
      name: 'My Path', icon: '🎯', description: 'd', color: '#000',
      skills: [{ id: 'cs1', name: 'A', description: '', icon: '🅰️' }, { id: 'cs2', name: 'B', description: '', icon: '🅱️' }],
    });
    expect(id.startsWith('custom_')).toBe(true);
    expect(get().customPaths.some((p) => p.id === id)).toBe(true);
    expect(get().userSkills['cs1'].status).toBe('available'); // first available
    expect(get().userSkills['cs2'].status).toBe('locked');    // rest locked
  });

  it('enrollInRoadmap adds a SECONDARY/ACTIVE entry and is idempotent', () => {
    reset();
    onboard(); // data-architect is PRIORITY
    get().enrollInRoadmap('ai-engineer');
    const entry = get().roadmaps.find((r) => r.pathId === 'ai-engineer')!;
    expect(entry.priorityStatus).toBe('SECONDARY');
    expect(entry.roadmapStatus).toBe('ACTIVE');
    const count = get().roadmaps.length;
    get().enrollInRoadmap('ai-engineer'); // already enrolled → no-op
    expect(get().roadmaps.length).toBe(count);
  });

  it('setPriorityRoadmap promotes the target and demotes the previous priority', () => {
    reset();
    onboard();
    get().enrollInRoadmap('ai-engineer');
    get().setPriorityRoadmap('ai-engineer');
    const ai = get().roadmaps.find((r) => r.pathId === 'ai-engineer')!;
    const da = get().roadmaps.find((r) => r.pathId === 'data-architect')!;
    expect(ai.priorityStatus).toBe('PRIORITY');
    expect(da.priorityStatus).toBe('SECONDARY');
    expect(get().prioritizedPathId).toBe('ai-engineer');
    expect(get().user!.careerPathId).toBe('ai-engineer');
  });

  it('switchPath changes careerPathId and auto-enrolls the path', () => {
    reset();
    onboard();
    get().switchPath('frontend-engineer');
    expect(get().user!.careerPathId).toBe('frontend-engineer');
    expect(get().roadmaps.some((r) => r.pathId === 'frontend-engineer')).toBe(true);
  });

  it('pause / archive / reactivate transition roadmap status', () => {
    reset();
    onboard();
    get().enrollInRoadmap('ai-engineer');
    get().pauseRoadmap('ai-engineer');
    expect(get().roadmaps.find((r) => r.pathId === 'ai-engineer')!.roadmapStatus).toBe('PAUSED');
    get().reactivateRoadmap('ai-engineer');
    expect(get().roadmaps.find((r) => r.pathId === 'ai-engineer')!.roadmapStatus).toBe('ACTIVE');
  });

  it('archiving the PRIORITY promotes the next active roadmap to PRIORITY', () => {
    reset();
    onboard(); // data-architect PRIORITY
    get().enrollInRoadmap('ai-engineer'); // SECONDARY ACTIVE
    get().archiveRoadmap('data-architect');
    const da = get().roadmaps.find((r) => r.pathId === 'data-architect')!;
    const ai = get().roadmaps.find((r) => r.pathId === 'ai-engineer')!;
    expect(da.roadmapStatus).toBe('ARCHIVED');
    expect(ai.priorityStatus).toBe('PRIORITY');
    expect(get().prioritizedPathId).toBe('ai-engineer');
  });

  it('addRoadmapItem creates the personal library path + an available skill', () => {
    reset();
    onboard();
    const id = get().addRoadmapItem('Read SICP', '📖');
    expect(id.startsWith('personal_')).toBe(true);
    expect(get().userSkills[id].status).toBe('available');
    expect(get().customPaths.some((p) => p.id === 'personal_library')).toBe(true);
  });
});

// ─── FEAT-001: editable roadmaps (pre-start only) ────────────────────────────────
describe('roadmapSlice — FEAT-001 editable roadmaps', () => {
  const newCustom = () =>
    get().addCustomPath({
      name: 'My Path', icon: '🎯', description: 'd', color: '#000',
      skills: [
        { id: 'm1', name: 'A', description: '', icon: '🅰️' },
        { id: 'm2', name: 'B', description: '', icon: '🅱️' },
      ],
    });

  it('isRoadmapEditable: true for a fresh custom path, false for a built-in path', () => {
    reset();
    onboard();
    const id = newCustom();
    expect(get().isRoadmapEditable(id)).toBe(true);
    expect(get().isRoadmapEditable('data-architect')).toBe(false); // built-in must be forked first
  });

  it('forkBuiltInPath copies a built-in path into an enrolled editable custom copy', () => {
    reset();
    onboard();
    const newId = get().forkBuiltInPath('ai-engineer');
    expect(newId).not.toBeNull();
    const fork = get().customPaths.find((p) => p.id === newId);
    expect(fork).toBeDefined();
    expect(fork!.isCustom).toBe(true);
    expect(fork!.skills.length).toBeGreaterThan(0);
    expect(fork!.skills[0].name).toBe('Python Fundamentals'); // copied curated name
    expect(get().roadmaps.some((r) => r.pathId === newId)).toBe(true); // auto-enrolled
    expect(get().isRoadmapEditable(newId!)).toBe(true);
    // The built-in catalog is untouched.
    expect(get().customPaths.some((p) => p.id === 'ai-engineer')).toBe(false);
  });

  it('forkBuiltInPath returns null for a non-built-in id', () => {
    reset();
    onboard();
    expect(get().forkBuiltInPath('not-a-real-path')).toBeNull();
  });

  it('addMilestone appends an editable milestone before the journey starts', () => {
    reset();
    onboard();
    const id = newCustom();
    const skillId = get().addMilestone(id, 'Ship a side project', '🚀');
    expect(skillId).not.toBeNull();
    const path = get().customPaths.find((p) => p.id === id)!;
    expect(path.skills.map((s) => s.id)).toContain(skillId);
    expect(get().userSkills[skillId!].status).toBe('locked'); // not the first → gated
  });

  it('rename / remove / reorder mutate milestones before start', () => {
    reset();
    onboard();
    const id = newCustom();
    get().renameMilestone(id, 'm1', 'Renamed A');
    expect(get().customPaths.find((p) => p.id === id)!.skills.find((s) => s.id === 'm1')!.name).toBe('Renamed A');

    get().reorderMilestones(id, ['m2', 'm1']);
    let skills = get().customPaths.find((p) => p.id === id)!.skills;
    expect(skills.map((s) => s.id)).toEqual(['m2', 'm1']);
    expect(get().userSkills['m2'].status).toBe('available'); // new first
    expect(get().userSkills['m1'].status).toBe('locked');

    get().removeMilestone(id, 'm2');
    skills = get().customPaths.find((p) => p.id === id)!.skills;
    expect(skills.map((s) => s.id)).toEqual(['m1']);
    expect(get().userSkills['m2']).toBeUndefined();
    expect(get().userSkills['m1'].status).toBe('available'); // promoted to first
  });

  it('edits are blocked once the journey has started (progress logged)', () => {
    reset();
    onboard();
    const id = newCustom();
    // Log proof on the first milestone → roadmap is now "started".
    get().logOutput({ skillId: 'm1', type: 'book', title: 't', description: 'short' });
    expect(get().isRoadmapEditable(id)).toBe(false);

    expect(get().addMilestone(id, 'Late add', '⏰')).toBeNull();
    const before = get().customPaths.find((p) => p.id === id)!.skills.map((s) => s.id);
    get().renameMilestone(id, 'm2', 'Nope');
    get().removeMilestone(id, 'm2');
    const after = get().customPaths.find((p) => p.id === id)!.skills;
    expect(after.map((s) => s.id)).toEqual(before);
    expect(after.find((s) => s.id === 'm2')!.name).toBe('B'); // rename was a no-op
  });

  it('lockRoadmap freezes editing (focus-lock) before any progress', () => {
    reset();
    onboard();
    const id = newCustom();
    get().enrollInRoadmap(id); // lock lives on the RoadmapEntry → must be enrolled
    get().lockRoadmap(id, true);
    expect(get().roadmaps.find((r) => r.pathId === id)?.locked).toBe(true);
    expect(get().isRoadmapEditable(id)).toBe(false);
    expect(get().addMilestone(id, 'Blocked', '🚫')).toBeNull();
    get().lockRoadmap(id, false);
    expect(get().isRoadmapEditable(id)).toBe(true);
  });

  it('deleteRoadmap un-enrolls + drops the custom path and promotes the next priority', () => {
    reset();
    onboard(); // data-architect PRIORITY
    const id = newCustom();
    get().setPriorityRoadmap(id); // make the custom path the priority
    expect(get().prioritizedPathId).toBe(id);

    get().deleteRoadmap(id);
    expect(get().roadmaps.some((r) => r.pathId === id)).toBe(false);
    expect(get().customPaths.some((p) => p.id === id)).toBe(false);
    expect(get().userSkills['m1']).toBeUndefined(); // unstarted skills dropped
    expect(get().prioritizedPathId).toBe('data-architect'); // promoted next active
  });

  it('custom milestone completion grants a modest flat XP bonus (not curated rewards)', () => {
    reset();
    onboard();
    const id = newCustom();
    // Pre-unlock achievements so their XP grants do not pollute the delta.
    store.setState({ unlockedAchievementIds: ['first-steps', 'builder', 'skill-mastered', 'evolution'] });
    const before = get().user!.xp;
    get().logOutput({ skillId: 'm1', type: 'book', title: 't', description: 'short' });
    const after = get().user!.xp;
    expect(get().userSkills['m1'].status).toBe('completed'); // 1 output completes a custom milestone
    const expectedOutputXP = calculateOutputXP('book', 'short'.length, false);
    expect(after - before).toBe(expectedOutputXP + CUSTOM_SKILL_COMPLETION_XP);
  });
});

// ─── uid collision safety (feed post clobbering regression) ───────────────────────
// Two outputs logged in the same millisecond previously minted identical `fp_<ms>`
// feed-post ids; reactToPost/addComment's id-keyed sync then resolved BOTH user posts
// to the first match and silently overwrote one with a copy of the other.
describe('id collision safety', () => {
  it('same-tick logOutputs mint unique output + feed ids; react/comment cannot clobber', () => {
    reset();
    onboard();
    get().logOutput({ skillId: 'sql-foundations', type: 'script', title: 'First', description: 'short' } as any);
    get().logOutput({ skillId: 'sql-foundations', type: 'script', title: 'Second', description: 'short' } as any);

    const outIds = get().outputs.map((o) => o.id);
    const postIds = get().userFeedPosts.map((p) => p.id);
    expect(new Set(outIds).size).toBe(outIds.length);
    expect(new Set(postIds).size).toBe(postIds.length);

    // React to a seed post — the id-keyed sync must leave both user posts distinct.
    const seed = get().communityFeed.find((p) => !p.isCurrentUser)!;
    get().reactToPost(seed.id, '🔥');
    const titles = get().userFeedPosts.map((p) => p.outputTitle).sort();
    expect(titles).toEqual(['First', 'Second']);
  });
});

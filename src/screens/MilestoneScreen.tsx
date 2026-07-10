import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  SafeAreaView,
  ScrollView,
  Share,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAppStore, ALL_SKILLS, CAREER_PATHS } from '../store/appStore';
import { useThemeColors, ColorsType, Colors, Spacing, Radius, FontSize, PathColors, getPathColor, ThemeContext, RarityColors } from '../utils/theme';
import { useContext } from 'react';
import { RootStackParamList } from '../navigation/AppNavigator';
import { track } from '../utils/analytics';
import { CustomPath, CustomSkill, ValidationQuestion } from '../types';
import ValidationChallengeModal from '../components/ValidationChallengeModal';
import { loadValidationQuestions } from '../data/validationCatalog';
import { dayLabel } from '../domain/progression';

type MilestoneRouteProps = RouteProp<RootStackParamList, 'MilestoneDetail'>;

// ─── Confetti burst ───────────────────────────────────────────────────────────

let _msCSS = false;
function ensureMilestoneCSS() {
  if (_msCSS || typeof document === 'undefined') return;
  _msCSS = true;
  const el = document.createElement('style');
  el.textContent = `
    @keyframes msConfFall {
      0%   { transform: translateY(-20px) rotate(0deg) scaleX(1); opacity: 1; }
      80%  { opacity: 0.9; }
      100% { transform: translateY(105vh) rotate(540deg) scaleX(0.6); opacity: 0; }
    }
    @keyframes msConfFade {
      0%   { opacity: 1; }
      70%  { opacity: 1; }
      100% { opacity: 0; }
    }
  `;
  document.head.appendChild(el);
}

interface ConfPiece { id: number; x: number; color: string; size: number; isRound: boolean; delay: number; dur: number; }

function makeConfetti(count: number, colors: string[]): ConfPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: (i / count) * 96 + Math.sin(i * 2.7) * 6 + 2,
    color: colors[i % colors.length],
    size: 6 + (i % 5) * 2,
    isRound: i % 3 === 0,
    delay: (i * 41) % 700,
    dur: 1500 + (i * 67) % 1200,
  }));
}

function MilestoneConfetti({ colors }: { colors: string[] }) {
  const [visible, setVisible] = useState(true);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const pieces = useMemo(() => makeConfetti(26, colors), []);

  useEffect(() => {
    ensureMilestoneCSS();
    const t = setTimeout(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 600, useNativeDriver: false }).start(() => setVisible(false));
    }, 2800);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <Animated.View style={[msStyles.confettiLayer, { opacity: fadeAnim }]} pointerEvents="none">
      {pieces.map(p => (
        <View
          key={p.id}
          style={[
            msStyles.confBase,
            {
              left: `${p.x}%` as any,
              top: -20,
              width: p.size,
              height: p.isRound ? p.size : Math.round(p.size * 0.4),
              borderRadius: p.isRound ? p.size / 2 : 2,
              backgroundColor: p.color,
              // @ts-ignore
              animation: `msConfFall ${p.dur}ms ${p.delay}ms ease-in both`,
            } as any,
          ]}
        />
      ))}
    </Animated.View>
  );
}

const msStyles = StyleSheet.create({
  confettiLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    zIndex: 20,
  },
  confBase: {
    position: 'absolute',
    opacity: 0,
  },
});

const PARTICLE_EMOJIS = ['⚡', '🔥', '🚀', '💫', '✨', '💜', '🌟', '🎯'];
const PARTICLE_POSITIONS = [
  { x: -120, y: -160 },
  { x: 0, y: -180 },
  { x: 120, y: -160 },
  { x: -160, y: -80 },
  { x: 160, y: -80 },
  { x: -140, y: 20 },
  { x: 140, y: 20 },
  { x: 0, y: 40 },
];

export default function MilestoneScreen() {
  const Colors = useThemeColors();
  const colorScheme = useContext(ThemeContext);
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const navigation = useNavigation<any>();
  const route = useRoute<MilestoneRouteProps>();
  const { skillId, xpGained, sessionXpGained, achievements, leveledUp, newLevel } = route.params;

  // BUG-E2E-001 (part 2): if skillId is somehow null/undefined (e.g. a stale
  // navigation call before the EvolveScreen guard was applied), bail out
  // immediately instead of crashing inside the ErrorBoundary silently.
  if (!skillId) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ fontSize: 32, marginBottom: 16 }}>⚡</Text>
        <Text style={{ color: Colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' }}>
          No skill to celebrate yet
        </Text>
        <Text style={{ color: Colors.textSub, fontSize: 14, textAlign: 'center', marginBottom: 32 }}>
          Start a skill on the Evolve tab, then log your output to unlock milestone celebrations.
        </Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ backgroundColor: Colors.primary, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 12 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // UX-030: show the TOTAL XP gained this action (incl. achievement + streak
  // bonuses) so the headline reconciles with the user's actual XP change.
  const displayXp = sessionXpGained ?? xpGained;

  const user = useAppStore((s) => s.user);
  const customPaths = useAppStore((s) => s.customPaths);
  const userSkills = useAppStore((s) => s.userSkills);
  const validateSkill = useAppStore((s) => s.validateSkill);

  const [showValidation, setShowValidation] = useState(false);

  // ── Skill resolution: built-in first, then custom paths ──────────────────
  const builtInSkill = ALL_SKILLS.find((s) => s.id === skillId);
  let customSkill: CustomSkill | null = null;
  let customSkillPath: CustomPath | null = null;
  if (!builtInSkill) {
    for (const cp of customPaths) {
      const found = cp.skills.find((cs) => cs.id === skillId);
      if (found) { customSkill = found; customSkillPath = cp; break; }
    }
  }

  // RR-6: the question bank is a lazy chunk — fetch this skill's questions once on
  // mount so the "Prove you know it" card can gate + count on real data.
  const [quizQuestions, setQuizQuestions] = useState<ValidationQuestion[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadValidationQuestions(builtInSkill).then((qs) => { if (alive) setQuizQuestions(qs); });
    return () => { alive = false; };
  }, [skillId]);

  const skill = builtInSkill
    ? builtInSkill
    : customSkill
      ? {
          id: customSkill.id,
          name: customSkill.name,
          description: customSkill.description || 'Custom skill completed.',
          icon: customSkill.icon || '⚡',
          rarity: 'common' as const,
          xpReward: 0,
          requiredOutputs: 1,
          pathId: 'ai-engineer' as const, // unused display field
          prerequisites: [],
          order: 0,
        }
      : null;

  // ── Path resolution: built-in first, then custom paths ───────────────────
  const builtInPath = user ? CAREER_PATHS.find((p) => p.id === user.careerPathId) : null;
  const resolvedCustomPath = !builtInPath && user
    ? customPaths.find((p) => p.id === user.careerPathId) ?? customSkillPath
    : null;

  const path = builtInPath ?? (resolvedCustomPath
    ? {
        id: resolvedCustomPath.id,
        name: resolvedCustomPath.name,
        title: resolvedCustomPath.name,
        icon: resolvedCustomPath.icon,
        description: resolvedCustomPath.description,
        color: resolvedCustomPath.color,
        dimColor: resolvedCustomPath.color + '20',
        textColor: resolvedCustomPath.color,
        skillIds: [],
      }
    : null);

  // ── Path color: built-in lookup, then derive from custom path color ───────
  const pathColor = user
    ? (PathColors[user.careerPathId]
        ? getPathColor(user.careerPathId, colorScheme)
        : resolvedCustomPath
          ? {
              primary: resolvedCustomPath.color,
              dim: resolvedCustomPath.color + '20',
              text: resolvedCustomPath.color,
              border: resolvedCustomPath.color + (colorScheme === 'light' ? '35' : '40'),
            }
          : null)
    : null;

  const rarity = skill ? RarityColors[builtInSkill?.rarity ?? 'common'] : RarityColors.common;

  // Animations
  const badgeScale = useRef(new Animated.Value(0)).current;
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const levelBounce = useRef(new Animated.Value(0)).current;
  // Individual refs — cannot use hooks inside .map()
  const pa0 = useRef(new Animated.Value(0)).current;
  const pa1 = useRef(new Animated.Value(0)).current;
  const pa2 = useRef(new Animated.Value(0)).current;
  const pa3 = useRef(new Animated.Value(0)).current;
  const pa4 = useRef(new Animated.Value(0)).current;
  const pa5 = useRef(new Animated.Value(0)).current;
  const pa6 = useRef(new Animated.Value(0)).current;
  const pa7 = useRef(new Animated.Value(0)).current;
  const particleAnims = [pa0, pa1, pa2, pa3, pa4, pa5, pa6, pa7];

  useEffect(() => {
    track('milestone_screen_viewed', {
      skill_id: skillId,
      skill_name: skill?.name,
      xp_gained: xpGained,
      leveled_up: leveledUp,
      new_level: newLevel,
    });

    // Badge springs in
    Animated.parallel([
      Animated.spring(badgeScale, { toValue: 1, tension: 55, friction: 6, useNativeDriver: false }),
      Animated.timing(badgeOpacity, { toValue: 1, duration: 300, useNativeDriver: false }),
    ]).start();

    // Content fades in after badge
    setTimeout(() => {
      Animated.timing(contentOpacity, { toValue: 1, duration: 500, useNativeDriver: false }).start();
    }, 400);

    // Particles burst out
    const particleAnimations = particleAnims.map((anim, i) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 800 + i * 60,
        delay: 150 + i * 40,
        useNativeDriver: false,
      })
    );
    Animated.stagger(40, particleAnimations).start();

    // Level up bounce
    if (leveledUp) {
      setTimeout(() => {
        Animated.sequence([
          Animated.timing(levelBounce, { toValue: 1, duration: 200, useNativeDriver: false }),
          Animated.spring(levelBounce, { toValue: 0, tension: 80, friction: 5, useNativeDriver: false }),
        ]).start();
      }, 900);
    }
  }, []);

  // BUG-E2E-001: a milestone modal that can't resolve its skill must never strand
  // the user on a blank screen. If the celebrated skill is missing (stale skillId,
  // or its custom path was deleted before the celebration rendered), dismiss back
  // to the app instead of rendering nothing.
  const milestoneDataMissing = !skill || !user;
  useEffect(() => {
    if (!milestoneDataMissing) return;
    const t = setTimeout(() => {
      if (navigation.canGoBack()) navigation.goBack();
      else navigation.navigate('Main');
    }, (window as any).__msDismissDelay ?? 0);
    return () => clearTimeout(t);
  }, [milestoneDataMissing]);

  const pathName = path?.name ?? 'Custom';
  const generatedPost = skill && user
    ? `⚡ Milestone Unlocked: ${skill.name}\n\nCompleted ${skill.name} on my ${pathName} evolution path.\n\n${skill.description}\n\nCurrent Evolution: ${pathName} Path\nStreak: ${dayLabel(user.streak)} 🔥\n\n#${pathName.replace(/\s/g, '')} #MaglakbAI #CareerGrowth #TechEvolution`
    : '';

  const handleShare = async () => {
    try {
      await Share.share({ message: generatedPost });
    } catch {}
  };

  // Guard: only bail if core data (user + skill) is missing.
  // Path and pathColor now always resolve via fallback, so they are never null here.
  // BUG-E2E-001: render a visible, themed shell (not a blank white screen) while
  // the auto-dismiss effect above navigates the user back.
  if (milestoneDataMissing) {
    return (
      <SafeAreaView style={styles.fallbackContainer}>
        <Text style={styles.fallbackEmoji}>✨</Text>
        <Text style={styles.fallbackText}>Taking you back…</Text>
        <TouchableOpacity
          style={styles.fallbackBtn}
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.fallbackBtnText}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const resolvedPathColor = pathColor ?? {
    primary: Colors.primary,
    dim: Colors.primaryDim,
    text: Colors.primaryLight,
    border: Colors.primary + '40',
  };
  const resolvedPath = path ?? { name: 'Custom', title: 'Custom Path', icon: '⚡' };

  const confettiColors = [
    resolvedPathColor.primary,
    resolvedPathColor.text,
    Colors.gold,
    Colors.white,
    resolvedPathColor.primary + 'CC',
    rarity.color,
    '#ffffff',
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Full-screen confetti burst */}
      <MilestoneConfetti colors={confettiColors} />

      {/* Particle burst */}
      <View style={styles.particleContainer} pointerEvents="none">
        {PARTICLE_POSITIONS.map((pos, i) => (
          <Animated.View
            key={i}
            style={[
              styles.particle,
              {
                transform: [
                  {
                    translateX: particleAnims[i].interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, pos.x],
                    }),
                  },
                  {
                    translateY: particleAnims[i].interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, pos.y],
                    }),
                  },
                  {
                    scale: particleAnims[i].interpolate({
                      inputRange: [0, 0.3, 1],
                      outputRange: [0, 1.4, 0.8],
                    }),
                  },
                ],
                opacity: particleAnims[i].interpolate({
                  inputRange: [0, 0.2, 0.8, 1],
                  outputRange: [0, 1, 0.8, 0],
                }),
              },
            ]}
          >
            <Text style={styles.particleEmoji}>{PARTICLE_EMOJIS[i % PARTICLE_EMOJIS.length]}</Text>
          </Animated.View>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Badge */}
        <View style={styles.badgeSection}>
          <Text style={[styles.rarityLabel, { color: rarity.color }]}>
            {rarity.label} MILESTONE
          </Text>

          <Animated.View
            style={[
              styles.badgeWrapper,
              { opacity: badgeOpacity, transform: [{ scale: badgeScale }] },
            ]}
          >
            <View style={[styles.badgeGlow, { backgroundColor: resolvedPathColor.primary, opacity: 0.25 }]} />
            <View style={[styles.badge, { borderColor: resolvedPathColor.primary, backgroundColor: resolvedPathColor.dim }]}>
              <Text style={styles.badgeEmoji}>{skill.icon}</Text>
            </View>
          </Animated.View>

          <Text style={styles.unlockedLabel}>MILESTONE UNLOCKED</Text>
          <Text style={styles.skillName}>{skill.name}</Text>
          <Text style={[styles.pathLabel, { color: resolvedPathColor.text }]}>{resolvedPath.title}</Text>
        </View>

        {/* XP + Level */}
        <Animated.View style={[styles.xpSection, { opacity: contentOpacity }]}>
          <View style={styles.xpCard}>
            <Text style={styles.xpAmount}>+{displayXp} XP</Text>
            <Text style={styles.xpLabel}>earned this session</Text>
          </View>

          {/* UX-030: surface achievements unlocked by this milestone so the
              XP total reconciles on screen ("where did the extra XP come from"). */}
          {achievements && achievements.length > 0 && (
            <View style={styles.achievementsCard}>
              {achievements.map((a) => (
                <View key={a.id} style={styles.achievementRow}>
                  <Text style={styles.achievementEmoji}>🏆</Text>
                  <Text style={styles.achievementText} numberOfLines={1}>
                    Achievement unlocked: {a.title}
                  </Text>
                  <Text style={styles.achievementXp}>+{a.xpGranted}</Text>
                </View>
              ))}
            </View>
          )}

          {leveledUp && (
            <Animated.View
              style={[
                styles.levelUpCard,
                {
                  transform: [
                    {
                      scale: levelBounce.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.06],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text style={styles.levelUpEmoji}>🎯</Text>
              <View>
                <Text style={styles.levelUpTitle}>LEVEL UP!</Text>
                <Text style={styles.levelUpValue}>You are now Level {newLevel}</Text>
              </View>
            </Animated.View>
          )}
        </Animated.View>

        {/* Skill details */}
        <Animated.View style={[styles.detailCard, { opacity: contentOpacity }]}>
          <Text style={styles.detailTitle}>WHAT YOU PROVED</Text>
          <Text style={styles.detailText}>{skill.description}</Text>
        </Animated.View>

        {/* Validation challenge offer */}
        {!!quizQuestions?.length && !userSkills[skillId]?.validated && (
          <Animated.View style={[styles.validationCard, { opacity: contentOpacity, borderColor: resolvedPathColor.border }]}>
            <View style={styles.validationCardLeft}>
              <Text style={styles.validationCardTitle}>Prove you know it 🎓</Text>
              <Text style={styles.validationCardSub}>
                Answer {quizQuestions.length} questions · earn +100 XP · get the Validated badge
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.validationBtn, { backgroundColor: resolvedPathColor.primary }]}
              onPress={() => setShowValidation(true)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Take knowledge challenge"
            >
              <Text style={styles.validationBtnText}>Test →</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Already validated confirmation */}
        {userSkills[skillId]?.validated && (
          <Animated.View style={[styles.validatedConfirm, { opacity: contentOpacity }]}>
            <Text style={styles.validatedConfirmText}>🎓 Knowledge Validated · +100 XP earned</Text>
          </Animated.View>
        )}

        {/* Share-ready post */}
        <Animated.View style={[styles.shareCard, { opacity: contentOpacity }]}>
          <View style={styles.shareCardHeader}>
            <Text style={styles.shareCardLabel}>SHARE-READY POST</Text>
            <TouchableOpacity onPress={handleShare} style={styles.copyButton}>
              <Text style={styles.copyButtonText}>Share ↗</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sharePost}>{generatedPost}</Text>
        </Animated.View>

        {/* CTA */}
        <Animated.View style={[styles.ctaSection, { opacity: contentOpacity }]}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: resolvedPathColor.primary }]}
            onPress={() => navigation.navigate('Main', { screen: 'Map' })}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>View Your Evolution ⚡</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('Main', { screen: 'Feed' })}
          >
            <Text style={styles.secondaryButtonText}>See Community Reactions</Text>
          </TouchableOpacity>
        </Animated.View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Knowledge challenge modal */}
      {!!quizQuestions?.length && (
        <ValidationChallengeModal
          visible={showValidation}
          skillName={skill?.name ?? ''}
          skillIcon={skill?.icon ?? '⚡'}
          questions={quizQuestions}
          pathColor={resolvedPathColor.primary}
          onPass={() => {
            validateSkill(skillId);
            setShowValidation(false);
          }}
          onDismiss={() => setShowValidation(false)}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (Colors: ColorsType) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  fallbackContainer: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  fallbackEmoji: { fontSize: 40 },
  fallbackText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  fallbackBtn: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 12,
  },
  fallbackBtnText: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.white,
  },
  particleContainer: {
    position: 'absolute',
    top: '35%',
    left: '50%',
    width: 0,
    height: 0,
    zIndex: 10,
  },
  particle: {
    position: 'absolute',
  },
  particleEmoji: {
    fontSize: 24,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    alignItems: 'center',
  },
  badgeSection: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  rarityLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: Spacing.lg,
  },
  badgeWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  badgeGlow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  badge: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeEmoji: {
    fontSize: 52,
  },
  unlockedLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.gold,
    letterSpacing: 4,
    marginBottom: Spacing.sm,
  },
  skillName: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  pathLabel: {
    fontSize: FontSize.base,
    fontWeight: '500',
  },
  xpSection: {
    width: '100%',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  xpCard: {
    backgroundColor: Colors.goldDim,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gold + '40',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  xpAmount: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.gold,
  },
  xpLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSub,
  },
  achievementsCard: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.cardAlt,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.gold + '40',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: 8,
  },
  achievementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  achievementEmoji: {
    fontSize: 16,
  },
  achievementText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  achievementXp: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.gold,
  },
  levelUpCard: {
    backgroundColor: Colors.primaryDim,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.primary + '60',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 16,
    shadowOpacity: 0.4,
    elevation: 6,
  },
  levelUpEmoji: {
    fontSize: 28,
  },
  levelUpTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primaryLight,
    letterSpacing: 3,
  },
  levelUpValue: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
  },
  detailCard: {
    width: '100%',
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  detailTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  detailText: {
    fontSize: FontSize.base,
    color: Colors.textSub,
    lineHeight: 22,
  },
  shareCard: {
    width: '100%',
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  shareCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  shareCardLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  copyButton: {
    backgroundColor: Colors.primaryDim,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.primary + '50',
  },
  copyButtonText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.primaryLight,
  },
  sharePost: {
    fontSize: FontSize.sm,
    color: Colors.textSub,
    lineHeight: 20,
  },
  // Validation offer card
  validationCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    // @ts-ignore
    boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
  },
  validationCardLeft: {
    flex: 1,
    gap: 3,
  },
  validationCardTitle: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
  },
  validationCardSub: {
    fontSize: FontSize.xs,
    color: Colors.textSub,
    lineHeight: 16,
  },
  validationBtn: {
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 9,
    flexShrink: 0,
  },
  validationBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.white,
  },
  validatedConfirm: {
    width: '100%',
    backgroundColor: Colors.success + '12',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.success + '30',
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  validatedConfirmText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.success,
  },
  ctaSection: {
    width: '100%',
    gap: Spacing.sm,
  },
  primaryButton: {
    borderRadius: Radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 16,
    shadowOpacity: 0.5,
    elevation: 6,
  },
  primaryButtonText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.white,
    letterSpacing: 0.5,
  },
  secondaryButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: FontSize.base,
    color: Colors.textSub,
    textDecorationLine: 'underline',
  },
});

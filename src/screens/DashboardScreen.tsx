import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  SafeAreaView,
  ScrollView,
  Image,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import CelebrationOverlay from '../components/CelebrationOverlay';
import DemandBadge from '../components/DemandBadge';
import { useAppStore, CAREER_PATHS, ALL_SKILLS, getDecayStage, DecayStage, getBurnoutSignal, BurnoutSignal } from '../store/appStore';
import { PaceMode } from '../types';
import {
  useThemeColors,
  ColorsType,
  Spacing,
  Radius,
  FontSize,
  PathColors,
  getLevelTitle,
  getLevelFromXP,
  getGreeting,
} from '../utils/theme';
import { page } from '../utils/analytics';

// ── Evolution ring (SVG) ────────────────────────────────────────────────────

function PathRing({ percent, size = 210, color }: { percent: number; size?: number; color: string }) {
  const Colors = useThemeColors();
  const strokeWidth = 11;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const safeColor = typeof color === 'string' && color.startsWith('#') ? color : Colors.primary;
  const gradId = `pg_${safeColor.slice(1)}`;
  return (
    // @ts-ignore
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' } as any}>
      {/* @ts-ignore */}
      <defs>
        {/* @ts-ignore */}
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          {/* @ts-ignore */}
          <stop offset="0%" stopColor={safeColor} stopOpacity="0.35" />
          {/* @ts-ignore */}
          <stop offset="100%" stopColor={safeColor} stopOpacity="1" />
        </linearGradient>
      </defs>
      {/* @ts-ignore */}
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={strokeWidth} />
      {/* @ts-ignore */}
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={`url(#${gradId})`} strokeWidth={strokeWidth}
        strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 1s ease' } as any} />
    </svg>
  );
}

// ── WeeklyDots ──────────────────────────────────────────────────────────────

type DotItem = { label: string; isToday: boolean; isFuture: boolean; logged: boolean };

function WeeklyDots({ dots, pathColor }: { dots: readonly DotItem[]; pathColor: string }) {
  const Colors = useThemeColors();
  const dotStyles = React.useMemo(() => makeWeeklyDotStyles(Colors), [Colors]);
  const pulseAnim = useRef(new Animated.Value(0.45)).current;
  const todayUnlogged = dots.some((d) => d.isToday && !d.logged);

  useEffect(() => {
    if (todayUnlogged) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: false }),
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 700, useNativeDriver: false }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    pulseAnim.setValue(1);
  }, [todayUnlogged]);

  return (
    <View style={dotStyles.row}>
      {dots.map((d, i) => {
        // MED-004: announce each day's activity state to screen readers.
        const status = d.isToday && d.logged ? 'logged today'
          : d.isToday ? 'today, not logged yet'
          : d.logged ? 'active'
          : d.isFuture ? 'upcoming'
          : 'no activity';
        return (
        <View
          key={i}
          style={dotStyles.col}
          accessibilityRole="image"
          accessibilityLabel={`${d.label}: ${status}`}
        >
          {d.isToday && d.logged ? (
            <View style={[dotStyles.dot, { backgroundColor: pathColor }]}>
              <Text style={dotStyles.check}>✓</Text>
            </View>
          ) : d.isToday ? (
            <Animated.View
              style={[dotStyles.dot, dotStyles.dotTodayEmpty, { borderColor: pathColor, opacity: pulseAnim }]}
            />
          ) : d.logged ? (
            <View style={[dotStyles.dot, { backgroundColor: pathColor, opacity: 0.65 }]} />
          ) : d.isFuture ? (
            <View style={[dotStyles.dot, dotStyles.dotFuture]} />
          ) : (
            <View style={[dotStyles.dot, dotStyles.dotMissed]} />
          )}
          <Text style={[dotStyles.label, d.isToday && dotStyles.labelToday]}>
            {d.label}
          </Text>
        </View>
        );
      })}
    </View>
  );
}

// ── DecayNudge ────────────────────────────────────────────────────────────────
// Lightweight single-strip shown for 'coasting' (2-3 d) and 'drifting' (4-6 d).
// Not shown when the full DormancyCard is active (7+ days).

function DecayNudge({
  decayStage,
  daysSince,
  pathColor,
  onLogNow,
}: {
  decayStage: 'coasting' | 'drifting';
  daysSince: number;
  pathColor: string;
  onLogNow: () => void;
}) {
  const Colors = useThemeColors();
  const nudgeColor = decayStage === 'drifting' ? Colors.gold : pathColor;
  // HIGH-002: memoize so the StyleSheet factory doesn't run 4× on every render.
  const dns = React.useMemo(() => decayNudgeStyles(Colors, nudgeColor), [Colors, nudgeColor]);
  const icon = decayStage === 'drifting' ? '🌊' : '⏰';
  const message =
    decayStage === 'drifting'
      ? `${daysSince} days out — one output brings you back`
      : `${daysSince} days since your last output · keep the flow`;
  return (
    <TouchableOpacity
      style={[dns.strip]}
      onPress={onLogNow}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={`${message}. Tap to log an output.`}
    >
      <Text style={dns.icon}>{icon}</Text>
      <Text style={dns.text} numberOfLines={1}>
        {message}
      </Text>
      <Text style={dns.cta}>Log →</Text>
    </TouchableOpacity>
  );
}

const decayNudgeStyles = (Colors: ColorsType, accent: string) => StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: accent + '12',
    borderWidth: 1,
    borderColor: accent + '35',
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  icon: { fontSize: 14 },
  text: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSub,
  },
  cta: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: accent,
  },
});

// ── RecoveryWeekCard ──────────────────────────────────────────────────────────
// Shown when a burnout signal is detected: sprint-then-drop pattern.
// Two CTAs: "Take a Recovery Week" (sets paceMode) or dismiss (snooze).

interface RecoveryWeekCardProps {
  pathColor: string;
  onAccept: () => void;    // sets paceMode = 'recovery' + navigates to Log
  onDismiss: () => void;
}

function RecoveryWeekCard({ pathColor, onAccept, onDismiss }: RecoveryWeekCardProps) {
  const Colors = useThemeColors();
  const rws = React.useMemo(() => makeRecoveryCardStyles(Colors), [Colors]);

  return (
    <View style={rws.card}>
      <View style={rws.topRow}>
        <View style={rws.iconWrap}>
          <Text style={rws.icon}>🌿</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={rws.title}>You've been pushing hard.</Text>
          <Text style={rws.sub}>
            A Recovery Week isn't quitting — it's strategy. Log a quick Reflection to stay connected.
          </Text>
        </View>
        <TouchableOpacity
          style={rws.dismissBtn}
          onPress={onDismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss recovery suggestion"
        >
          <Text style={rws.dismissText}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={rws.ctaRow}>
        <TouchableOpacity
          style={rws.ctaAccept}
          onPress={onAccept}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Take a Recovery Week and log a reflection"
        >
          <Text style={rws.ctaAcceptText}>🌿 Take a Recovery Week</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={rws.ctaKeep}
          onPress={onDismiss}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Keep going"
        >
          <Text style={rws.ctaKeepText}>I'm good, keep going</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeRecoveryCardStyles = (Colors: ColorsType) => StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: '#10B98130',
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    gap: 10,
    // @ts-ignore
    boxShadow: '0 2px 12px rgba(16,185,129,0.08)',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#10B98118',
    borderWidth: 1,
    borderColor: '#10B98130',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  icon: { fontSize: 18 },
  title: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 3,
  },
  sub: {
    fontSize: FontSize.xs,
    color: Colors.textSub,
    lineHeight: 17,
  },
  dismissBtn: { padding: 2 },
  dismissText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '700',
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  ctaAccept: {
    flex: 1,
    borderRadius: Radius.full,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: '#10B98120',
    borderWidth: 1,
    borderColor: '#10B98140',
  },
  ctaAcceptText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: '#6EE7B7',
  },
  ctaKeep: {
    flex: 1,
    borderRadius: Radius.full,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ctaKeepText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSub,
  },
});

// ── DormancyCard ─────────────────────────────────────────────────────────────

interface DormancyCardProps {
  dormancyLevel: 'at_risk' | 'dormant' | 'lapsed';
  daysSince: number;
  pathName: string;
  pathColor: string;
  weeklyOutputGoal?: number;
  onLogNow: () => void;
  onSetGoal: () => void;
  onDismiss: () => void;
}

function DormancyCard({ dormancyLevel, daysSince, pathName, pathColor, weeklyOutputGoal, onLogNow, onSetGoal, onDismiss }: DormancyCardProps) {
  const Colors = useThemeColors();
  const ds = React.useMemo(() => makeDormancyStyles(Colors), [Colors]);

  const headline =
    dormancyLevel === 'lapsed'
      ? 'Ready to pick it back up? 💪'
      : dormancyLevel === 'dormant'
      ? 'Your path is still here for you 🌱'
      : 'Your momentum is waiting ⚡';

  const body =
    dormancyLevel === 'lapsed'
      ? `${daysSince} days away — your ${pathName} progress is saved. One output restarts everything.`
      : dormancyLevel === 'dormant'
      ? `${daysSince} days since your last output. One small step gets the momentum back.`
      : `${daysSince} days away. Life happens — your progress is right where you left it.`;

  return (
    <View style={[ds.card, { borderColor: pathColor + '40' }]}>
      {/* Top row: headline + dismiss */}
      <View style={ds.topRow}>
        <Text style={ds.headline}>{headline}</Text>
        <TouchableOpacity
          style={ds.dismissBtn}
          onPress={onDismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <Text style={ds.dismissText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Body */}
      <Text style={ds.body} numberOfLines={2}>{body}</Text>

      {/* Progress preserved badge */}
      <View style={[ds.progressBadge, { borderColor: pathColor + '35', backgroundColor: pathColor + '10' }]}>
        <Text style={[ds.progressBadgeText, { color: pathColor }]}>
          ✓ All progress saved · {pathName}
        </Text>
      </View>

      {/* CTAs */}
      <View style={ds.ctaRow}>
        <TouchableOpacity
          style={[ds.ctaPrimary, { backgroundColor: pathColor }]}
          onPress={onLogNow}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Log one output now"
        >
          <Text style={ds.ctaPrimaryText}>Log One Thing ⚡</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={ds.ctaSecondary}
          onPress={onSetGoal}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Set a comeback goal"
        >
          <Text style={ds.ctaSecondaryText} numberOfLines={1}>
            {weeklyOutputGoal ? `Goal: ${weeklyOutputGoal}/wk ✓` : 'Set Comeback Goal →'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── ComebackModal ─────────────────────────────────────────────────────────────

interface ComebackModalProps {
  visible: boolean;
  pathColor: string;
  currentGoal?: number;
  onConfirm: (goal: number) => void;
  onClose: () => void;
}

const COMEBACK_GOALS = [
  { value: 1, label: '1 output / week', desc: 'Light pace · stay connected', emoji: '🌱' },
  { value: 3, label: '3 outputs / week', desc: 'Steady momentum · recommended', emoji: '⚡' },
  { value: 5, label: '5 outputs / week', desc: 'Strong push · serious growth', emoji: '🚀' },
] as const;

function ComebackModal({ visible, pathColor, currentGoal, onConfirm, onClose }: ComebackModalProps) {
  const Colors = useThemeColors();
  const cs = React.useMemo(() => makeComebackStyles(Colors), [Colors]);
  const [selected, setSelected] = useState<number>(currentGoal ?? 3);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <TouchableOpacity style={cs.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <View style={cs.sheet}>
            {/* Handle */}
            <View style={cs.handle} />

            <Text style={cs.title}>Set a Comeback Goal</Text>
            <Text style={cs.subtitle}>
              How many outputs will you commit to this week?
            </Text>

            {/* Goal options */}
            {COMEBACK_GOALS.map((g) => (
              <TouchableOpacity
                key={g.value}
                style={[cs.goalRow, selected === g.value && { borderColor: pathColor, backgroundColor: pathColor + '12' }]}
                onPress={() => setSelected(g.value)}
                activeOpacity={0.8}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected === g.value }}
              >
                <Text style={cs.goalEmoji}>{g.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[cs.goalLabel, selected === g.value && { color: Colors.text }]}>
                    {g.label}
                  </Text>
                  <Text style={cs.goalDesc}>{g.desc}</Text>
                </View>
                <View style={[cs.goalRadio, selected === g.value && { borderColor: pathColor, backgroundColor: pathColor }]}>
                  {selected === g.value && <View style={cs.goalRadioDot} />}
                </View>
              </TouchableOpacity>
            ))}

            {/* Confirm */}
            <TouchableOpacity
              style={[cs.confirmBtn, { backgroundColor: pathColor }]}
              onPress={() => onConfirm(selected)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Commit to ${selected} outputs per week and log first output`}
            >
              <Text style={cs.confirmTxt}>Commit · Log First Output ⚡</Text>
            </TouchableOpacity>

            <TouchableOpacity style={cs.cancelBtn} onPress={onClose} accessibilityRole="button">
              <Text style={cs.cancelTxt}>Maybe later</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const Colors = useThemeColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const navigation = useNavigation<any>();
  const user = useAppStore((s) => s.user);
  const userSkills = useAppStore((s) => s.userSkills);
  const outputs = useAppStore((s) => s.outputs);
  const customPaths = useAppStore((s) => s.customPaths);
  const prioritizedPathId = useAppStore((s) => s.prioritizedPathId);
  const useStreakFreeze = useAppStore((s) => s.useStreakFreeze);
  const celebratedMilestones = useAppStore((s) => s.celebratedMilestones);
  const markMilestoneCelebrated = useAppStore((s) => s.markMilestoneCelebrated);
  const showWelcomeCard = useAppStore((s) => s.showWelcomeCard);
  const dismissWelcomeCard = useAppStore((s) => s.dismissWelcomeCard);
  const setComebackGoal = useAppStore((s) => s.setComebackGoal);
  const setSelectedSkill = useAppStore((s) => s.setSelectedSkill);
  const setPaceMode = useAppStore((s) => s.setPaceMode);
  const marketDemand = useAppStore((s) => s.marketDemand);

  const [showCelebration, setShowCelebration] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showXPInfo, setShowXPInfo] = useState(false);
  const [isDormancyDismissed, setIsDormancyDismissed] = useState(false);
  const [showComebackModal, setShowComebackModal] = useState(false);
  const [isRecoveryDismissed, setIsRecoveryDismissed] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const xpBarAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const welcomeAnim = useRef(new Animated.Value(0)).current;
  const welcomeScaleAnim = useRef(new Animated.Value(0.88)).current;
  const [welcomeDisplayXp, setWelcomeDisplayXp] = useState(0);

  // ── Path derivations ──────────────────────────────────────────────────────

  const allPaths = user ? [
    ...CAREER_PATHS.map((p) => ({
      id: p.id, name: p.name, icon: p.icon, color: p.color,
      skillIds: p.skillIds,
      completed: p.skillIds.filter((sid) => userSkills[sid]?.status === 'completed').length,
      total: p.skillIds.length,
    })),
    ...customPaths.map((p) => ({
      id: p.id, name: p.name, icon: p.icon, color: p.color,
      skillIds: p.skills.map((s) => s.id),
      completed: p.skills.filter((s) => userSkills[s.id]?.status === 'completed').length,
      total: p.skills.length,
    })),
  ] : [];

  const resolvedId = prioritizedPathId ?? user?.careerPathId ?? '';
  const focusPath = allPaths.find((p) => p.id === resolvedId) ?? allPaths[0];
  const pathSkillIds = new Set(focusPath?.skillIds ?? []);
  const pathOutputs = outputs.filter((o) => pathSkillIds.has(o.skillId));
  // XP bar uses skill-completion XP only — raw output XP (o.xpGained) includes base type XP which
  // would inflate the numerator against totalPathSkillXP (denominator = skill rewards only).
  const totalPathSkillXP = (focusPath?.skillIds ?? []).reduce((s, sid) => {
    const sk = ALL_SKILLS.find((x) => x.id === sid);
    return s + (sk?.xpReward ?? 0);
  }, 0);
  const pathCompletedSkillXP = (focusPath?.skillIds ?? []).reduce((s, sid) => {
    if (userSkills[sid]?.status !== 'completed') return s;
    const sk = ALL_SKILLS.find((x) => x.id === sid);
    return s + (sk?.xpReward ?? 0);
  }, 0);
  const pathXpBarPct = totalPathSkillXP > 0 ? Math.round(Math.min(100, (pathCompletedSkillXP / totalPathSkillXP) * 100)) : 0;
  const pathPct = focusPath && focusPath.total > 0 ? Math.round((focusPath.completed / focusPath.total) * 100) : 0;
  const pathXpRemaining = Math.max(0, totalPathSkillXP - pathCompletedSkillXP);

  const celebrationTier = pathPct >= 100 ? 100 : pathPct >= 75 ? 75 : pathPct >= 50 ? 50 : pathPct >= 25 ? 25 : 0;
  const milestoneKey = focusPath ? `${focusPath.id}-${celebrationTier}` : null;

  // ── Animations ────────────────────────────────────────────────────────────

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: false }).start();
    page('dashboard', { has_outputs: outputs.length > 0, streak: user?.streak ?? 0 });
    if (milestoneKey && !celebratedMilestones.includes(milestoneKey)) setShowCelebration(true);
    if (showWelcomeCard) {
      setShowWelcome(true);
      Animated.parallel([
        Animated.timing(welcomeAnim, { toValue: 1, duration: 350, useNativeDriver: false }),
        Animated.spring(welcomeScaleAnim, { toValue: 1, tension: 60, friction: 8, useNativeDriver: false }),
      ]).start();
    }
  }, []);

  useEffect(() => {
    Animated.timing(xpBarAnim, { toValue: pathXpBarPct, duration: 1000, useNativeDriver: false }).start();
  }, [pathXpBarPct]);

  useEffect(() => {
    if (!showWelcome) return;
    const targetXP = outputs[0]?.xpGained ?? 0;
    if (targetXP > 0) {
      const steps = 30;
      let step = 0;
      const iv = setInterval(() => {
        step++;
        setWelcomeDisplayXp(Math.round((targetXP * step) / steps));
        if (step >= steps) clearInterval(iv);
      }, 900 / steps);
    }
    const t = setTimeout(() => handleDismissWelcome(), 3200);
    return () => clearTimeout(t);
  }, [showWelcome]);

  const handleDismissWelcome = () => {
    Animated.timing(welcomeAnim, { toValue: 0, duration: 220, useNativeDriver: false }).start(() => {
      setShowWelcome(false);
      dismissWelcomeCard();
    });
  };

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: false }),
      Animated.timing(pulseAnim, { toValue: 0.4, duration: 600, useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  if (!user) return null;

  // ── Derived flags ─────────────────────────────────────────────────────────

  const todayStr = new Date().toISOString().slice(0, 10);
  const yesterdayStr = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
  const streakAtRisk = user.streak > 0 && user.lastActiveDate === yesterdayStr && user.lastActiveDate !== todayStr;
  const weekOutputCount = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    return outputs.filter((o) => new Date(o.createdAt) >= monday).length;
  }, [outputs]);
  const hasFreezes = (user.streakFreezes ?? 0) > 0;
  const hasStarted = outputs.length > 0;
  const builtIn = CAREER_PATHS.find((p) => p.id === focusPath?.id);
  const pathColor: string = (builtIn ? PathColors[focusPath?.id ?? '']?.primary : null) ?? focusPath?.color ?? Colors.primary;
  // Build a lookup for custom skills so the action card works on custom paths.
  // ALL_SKILLS only contains built-in skills; custom path skills would be undefined otherwise.
  const customSkillMap = new Map<string, { id: string; name: string; icon: string; requiredOutputs: number; xpReward: number }>(
    customPaths.flatMap((cp) => cp.skills.map((cs) => [
      cs.id,
      { id: cs.id, name: cs.name, icon: cs.icon || '⚡', requiredOutputs: 1, xpReward: 50 },
    ]))
  );

  const nextSkill = focusPath?.skillIds
    .map((sid) => {
      const skill = ALL_SKILLS.find((s) => s.id === sid) ?? customSkillMap.get(sid);
      return { skill, us: userSkills[sid] };
    })
    .find(({ skill, us }) => skill && (us?.status === 'available' || us?.status === 'in_progress'));

  // First-mission data: full Skill record (with outputExamples) for the first available skill
  const firstMissionSkill = nextSkill?.skill
    ? ALL_SKILLS.find((s) => s.id === nextSkill.skill!.id) ?? null
    : null;

  // ── Retention engine ──────────────────────────────────────────────────────

  const hasLoggedToday = user.lastActiveDate === todayStr;

  const todayOutputCount = useMemo(
    () => outputs.filter((o) => o.createdAt.startsWith(todayStr)).length,
    [outputs, todayStr],
  );

  // 7 dots Mon→Sun for this calendar week
  const weeklyActivityDots = useMemo(() => {
    // Single time frame: the app keys days by UTC date (todayStr, output.createdAt,
    // lastActiveDate are all toISOString-based), so derive the week in UTC too.
    // Previously dayOfWeek used LOCAL getDay() while dateStr was UTC — for PHT users
    // between 00:00–07:59 local the frames disagree and the "today" dot rendered
    // under the wrong weekday label.
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0 = Sun (UTC, matching todayStr)
    const mondayOffset = (dayOfWeek + 6) % 7; // days since Monday
    return (['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const).map((label, i) => {
      const d = new Date(now);
      d.setUTCDate(now.getUTCDate() - mondayOffset + i);
      const dateStr = d.toISOString().slice(0, 10);
      const isToday = dateStr === todayStr;
      const isFuture = dateStr > todayStr;
      const logged = !isFuture && outputs.some((o) => o.createdAt.startsWith(dateStr));
      return { label, isToday, isFuture, logged } as const;
    });
  }, [outputs, todayStr]);

  // Outputs remaining on the active skill
  const outputsLeft = nextSkill?.skill
    ? Math.max(0, nextSkill.skill.requiredOutputs - (nextSkill.us?.outputCount ?? 0))
    : null;

  // ── Dormancy & decay (needed before focusCard) ───────────────────────────────
  // BUG-013: outputs are APPENDED by logOutput (newest last), so outputs[0] is the
  // OLDEST entry — using it made decay/dormancy fire off a user's *first* output date
  // (a 7+-day-old first output triggered a false "you've been away" card even after
  // logging today). Compute from the most-recent createdAt instead (order-independent).
  const daysSinceLastOutput = useMemo(() => {
    if (outputs.length === 0) return 0;
    const lastMs = outputs.reduce((m, o) => Math.max(m, new Date(o.createdAt).getTime()), 0);
    const diffMs = Date.now() - lastMs;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }, [outputs]);

  const dormancyLevel = useMemo((): 'at_risk' | 'dormant' | 'lapsed' | null => {
    if (!hasStarted) return null;
    if (daysSinceLastOutput >= 21) return 'lapsed';
    if (daysSinceLastOutput >= 14) return 'dormant';
    if (daysSinceLastOutput >= 7)  return 'at_risk';
    return null;
  }, [hasStarted, daysSinceLastOutput]);

  // Motivation Decay Model — 5 stages covering the full engagement spectrum
  const decayStage = useMemo(
    (): DecayStage => getDecayStage(daysSinceLastOutput, hasStarted),
    [daysSinceLastOutput, hasStarted]
  );

  // Burnout Protection — detect sprint-then-drop and suggest a Recovery Week
  const burnoutSignal = useMemo(
    (): BurnoutSignal => getBurnoutSignal(outputs, daysSinceLastOutput, user?.paceMode),
    [outputs, daysSinceLastOutput, user?.paceMode]
  );

  // Context-aware focus card state
  interface FocusCard {
    tag: string; urgent: boolean; sub: string;
    btnText: string; btnColor: string; btnTextColor: string; borderColor: string;
  }
  const focusCard: FocusCard = (() => {
    if (streakAtRisk) return {
      tag: 'STREAK AT RISK 🔥', urgent: true,
      sub: `Log today to save your ${user.streak}-day streak`,
      btnText: 'Log Now ⚡', btnColor: Colors.gold, btnTextColor: '#1A1000',
      borderColor: Colors.gold + '50',
    };
    if (outputsLeft === 1) return {
      tag: 'SO CLOSE ⚡', urgent: true,
      sub: `1 more output · +${nextSkill!.skill!.xpReward} XP bonus on complete`,
      btnText: 'Complete It ⚡', btnColor: pathColor, btnTextColor: Colors.white,
      borderColor: pathColor + '60',
    };
    if (outputsLeft === 2) return {
      tag: 'ALMOST THERE 🎯', urgent: false,
      sub: `2 more outputs to complete · +${nextSkill!.skill!.xpReward} XP`,
      btnText: 'Log Work ⚡', btnColor: pathColor, btnTextColor: Colors.white,
      borderColor: pathColor + '40',
    };
    if (hasLoggedToday) return {
      tag: 'GREAT SESSION ✅', urgent: false,
      sub: user.streak > 0
        ? `🔥 ${user.streak}-day streak · log tomorrow to extend it`
        : 'Come back tomorrow to start your streak',
      btnText: 'Log More →', btnColor: pathColor, btnTextColor: Colors.white,
      borderColor: pathColor + '35',
    };
    const defaultTag =
      user?.paceMode === 'recovery' ? 'RECOVERY MODE 🌿'
      : decayStage === 'drifting' ? 'PICK UP WHERE YOU LEFT OFF 🔄'
      : decayStage === 'coasting' ? 'KEEP THE FLOW GOING ⚡'
      : "TODAY'S FOCUS";
    const defaultBtnText =
      user?.paceMode === 'recovery' ? 'Log a Reflection 💭' : 'Log Work ⚡';
    return {
      tag: defaultTag, urgent: false,
      sub: nextSkill?.skill
        ? (user?.paceMode === 'recovery'
            ? 'Low effort counts — a quick reflection keeps momentum'
            : `${nextSkill.us?.outputCount ?? 0}/${nextSkill.skill.requiredOutputs} outputs · +${nextSkill.skill.xpReward} XP`)
        : 'Unlock skills to start logging',
      btnText: defaultBtnText, btnColor: user?.paceMode === 'recovery' ? '#10B981' : pathColor,
      btnTextColor: user?.paceMode === 'recovery' ? '#052e16' : Colors.white,
      borderColor: user?.paceMode === 'recovery' ? '#10B98135' : pathColor + '35',
    };
  })();

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={[styles.inner, { opacity: fadeAnim }]}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
            {decayStage === 'drifting' || decayStage === 'fading'
              ? `Welcome back, ${user.name.split(' ')[0]} 👋`
              : `${getGreeting()}, ${user.name.split(' ')[0]} 👋`}
          </Text>
            <Text style={styles.subGreeting}>{getLevelTitle(getLevelFromXP(user.xp))}</Text>
            {user.targetRole ? (
              <Text style={styles.targetRoleLabel} numberOfLines={1}>🎯 {user.targetRole}</Text>
            ) : null}
          </View>
          <View style={styles.headerRight}>
            {/* Streak indicator */}
            {!streakAtRisk ? (
              // ISSUE-002: always show freeze balance when not at risk
              <View style={styles.streakAtRiskCol}>
                <View style={styles.streakChip}>
                  <Text style={styles.streakFire}>🔥</Text>
                  <Text style={styles.streakCount}>{hasStarted ? user.streak : 0}</Text>
                </View>
                {(user.streakFreezes ?? 0) > 0 && (
                  <View style={styles.freezeBalanceRow}>
                    <Text style={styles.freezeBalanceText}>❄️ {user.streakFreezes}</Text>
                  </View>
                )}
              </View>
            ) : !hasFreezes ? (
              <View style={styles.streakAtRiskCol}>
                <Animated.View style={[
                  styles.streakChip, styles.streakChipWarning,
                  { borderColor: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(251,191,36,0.4)', 'rgba(251,191,36,1)'] }) },
                ]}>
                  <Text style={styles.streakFire}>🔥</Text>
                  <Text style={styles.streakCount}>{user.streak}</Text>
                </Animated.View>
                <Text style={styles.streakWarningText}>⚠️ Log today!</Text>
              </View>
            ) : (
              <View style={styles.streakAtRiskCol}>
                <Animated.View style={[
                  styles.streakChip, styles.streakChipWarning,
                  { borderColor: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(251,191,36,0.4)', 'rgba(251,191,36,1)'] }) },
                ]}>
                  <Text style={styles.streakFire}>🔥</Text>
                  <Text style={styles.streakCount}>{user.streak}</Text>
                </Animated.View>
                <TouchableOpacity
                  style={styles.freezeBtn}
                  onPress={useStreakFreeze}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Use streak freeze, ${user.streakFreezes ?? 0} remaining`}
                >
                  <Text style={styles.freezeBtnText}>🧊 Freeze ({user.streakFreezes})</Text>
                </TouchableOpacity>
              </View>
            )}
            {/* Avatar */}
            {user.avatarUri ? (
              <Image
                source={{ uri: user.avatarUri }}
                style={[styles.avatarCircle, styles.avatarPhoto, { borderColor: pathColor + '60' }]}
              />
            ) : (
              <View style={[styles.avatarCircle, { borderColor: pathColor + '60' }]}>
                <Text style={styles.avatarEmoji}>{user.avatarEmoji}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Body ── */}
        {!hasStarted ? (

          /* First-time mission state */
          <View style={styles.emptyWrap}>
            <View style={styles.emptyCard}>

              {/* Mission chip */}
              <View style={[styles.missionChip, { borderColor: pathColor + '50', backgroundColor: pathColor + '12' }]}>
                <Text style={[styles.missionChipText, { color: pathColor }]}>⚡ YOUR FIRST MISSION</Text>
              </View>

              {/* First skill */}
              {firstMissionSkill ? (
                <>
                  {/* Skill header */}
                  <View style={styles.missionSkillRow}>
                    <View style={[styles.missionSkillIcon, { backgroundColor: pathColor + '18', borderColor: pathColor + '35' }]}>
                      <Text style={{ fontSize: 22 }}>{firstMissionSkill.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.missionSkillName}>{firstMissionSkill.name}</Text>
                      <Text style={styles.missionSkillMeta}>
                        Complete {firstMissionSkill.requiredOutputs} output{firstMissionSkill.requiredOutputs > 1 ? 's' : ''} to unlock this skill
                      </Text>
                    </View>
                  </View>

                  {/* Example output */}
                  {firstMissionSkill.outputExamples && firstMissionSkill.outputExamples.length > 0 && (
                    <View style={styles.missionExampleBlock}>
                      <Text style={styles.missionExampleLabel}>EXAMPLE OUTPUT</Text>
                      <Text style={styles.missionExampleText}>
                        "{firstMissionSkill.outputExamples[0]}"
                      </Text>
                    </View>
                  )}

                  {/* XP preview — what you'll earn */}
                  <View style={styles.missionXpRow}>
                    <View style={styles.missionXpChip}>
                      <Text style={styles.missionXpIcon}>⚡</Text>
                      <Text style={styles.missionXpText}>+XP per output logged</Text>
                    </View>
                    <View style={[styles.missionXpChip, { backgroundColor: pathColor + '15', borderColor: pathColor + '30' }]}>
                      <Text style={styles.missionXpIcon}>🎯</Text>
                      <Text style={[styles.missionXpText, { color: pathColor }]}>+{firstMissionSkill.xpReward} XP skill bonus</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.emptyCTA, { backgroundColor: pathColor }]}
                    onPress={() => {
                      setSelectedSkill(firstMissionSkill.id);
                      navigation.navigate('Log');
                    }}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`Start your first mission: ${firstMissionSkill.name}`}
                  >
                    <Text style={styles.emptyCTAText}>Start This Mission ⚡</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.emptyEmoji}>🚀</Text>
                  <Text style={styles.emptyTitle}>Your journey starts{'\n'}with one output.</Text>
                  <Text style={styles.emptySub}>
                    Proof-based progression means XP comes from building, not watching.
                  </Text>
                  <TouchableOpacity
                    style={styles.emptyCTA}
                    onPress={() => navigation.navigate('Log')}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.emptyCTAText}>Log My First Output ⚡</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

        ) : (

          /* Evolution view — scrollable so ring doesn't overlap header at short heights (UX-023)
             and dead space is eliminated at tall heights (UX-018) */
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.evolutionScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Ring */}
            <View style={styles.ringSection}>
              <Text style={styles.pathLabel} numberOfLines={1}>
                {focusPath?.icon}{'  '}{focusPath?.name ?? 'My Path'}
              </Text>

              <View style={styles.ringWrap}>
                {/* Show a 3% sliver when user has path outputs but no skill is complete yet,
                    rather than a variable fill that could overstate how far they are. */}
                <PathRing
                  percent={pathPct > 0 ? pathPct : (pathOutputs.length > 0 ? 3 : 0)}
                  size={190}
                  color={pathColor}
                />
                <View style={styles.ringInner}>
                  {pathPct > 0 ? (
                    <>
                      <Text style={[styles.bigPct, { color: pathColor }]}>{pathPct}%</Text>
                      <Text style={styles.bigPctSub}>EVOLUTION</Text>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.bigPct, { color: pathColor, fontSize: 28 }]}>⚡</Text>
                      <Text style={styles.bigPctSub}>IN PROGRESS</Text>
                    </>
                  )}
                  <Text style={styles.skillsDone}>
                    {focusPath?.completed ?? 0} / {focusPath?.total ?? 0} skills completed
                  </Text>
                </View>
              </View>

              {/* XP bar */}
              <View style={styles.xpTrackWrap}>
                <View style={styles.xpTrackBg}>
                  <Animated.View style={[styles.xpTrackFill, {
                    width: xpBarAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) as any,
                    backgroundColor: pathColor,
                  }]} />
                </View>
                <Text style={styles.xpTrackLabel}>
                  {(!isNaN(pathXpRemaining) && pathXpRemaining === 0)
                    ? '🎉 Path Complete!'
                    : !isNaN(pathXpRemaining)
                    ? `${pathXpRemaining.toLocaleString()} XP to complete this path`
                    : 'Keep logging outputs to progress'}
                </Text>
              </View>
            </View>

            {/* Stats */}
            <View style={[styles.statsRow, { borderColor: pathColor + '25' }]}>
              <View style={styles.statCell}>
                <Text style={styles.statVal}>{user.xp.toLocaleString()}</Text>
                <TouchableOpacity
                  style={styles.statLblRow}
                  onPress={() => setShowXPInfo(true)}
                  accessibilityRole="button"
                  accessibilityLabel="How XP is calculated"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.statLbl}>TOTAL XP</Text>
                  <Text style={styles.xpInfoBtn}>ⓘ</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.statSep} />
              <View style={styles.statCell}>
                <Text style={[styles.statVal, streakAtRisk && { color: Colors.gold }]}>
                  {user.streak}
                </Text>
                <Text style={styles.statLbl}>DAY STREAK</Text>
              </View>
              <View style={styles.statSep} />
              <View style={styles.statCell}>
                <Text style={[styles.statVal, weekOutputCount > 0 && { color: Colors.success }]}>
                  {user.weeklyOutputGoal
                    ? `${weekOutputCount}/${user.weeklyOutputGoal}`
                    : weekOutputCount}
                </Text>
                <Text style={styles.statLbl}>THIS WEEK</Text>
              </View>
            </View>

            {/* Weekly activity dots — Mon–Sun */}
            <WeeklyDots dots={weeklyActivityDots} pathColor={pathColor} />

            {/* Decay nudge — coasting (2-3d) / drifting (4-6d) */}
            {(decayStage === 'coasting' || decayStage === 'drifting') && !dormancyLevel && (
              <DecayNudge
                decayStage={decayStage}
                daysSince={daysSinceLastOutput}
                pathColor={pathColor}
                onLogNow={() => navigation.navigate('Log')}
              />
            )}

            {/* Recovery Week suggestion — burnout signal detected */}
            {burnoutSignal && !isRecoveryDismissed && !dormancyLevel && user?.paceMode !== 'recovery' && (
              <RecoveryWeekCard
                pathColor={pathColor}
                onAccept={() => {
                  setPaceMode('recovery');
                  setIsRecoveryDismissed(true);
                  navigation.navigate('Log');
                }}
                onDismiss={() => setIsRecoveryDismissed(true)}
              />
            )}

            {/* Action strip / Dormancy card */}
            {dormancyLevel && !isDormancyDismissed ? (
              <DormancyCard
                dormancyLevel={dormancyLevel}
                daysSince={daysSinceLastOutput}
                pathName={focusPath?.name ?? 'your path'}
                pathColor={pathColor}
                weeklyOutputGoal={user.weeklyOutputGoal}
                onLogNow={() => navigation.navigate('Log')}
                onSetGoal={() => setShowComebackModal(true)}
                onDismiss={() => setIsDormancyDismissed(true)}
              />
            ) : pathPct >= 100 ? (
              <View style={[styles.actionCard, styles.actionCardComplete]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionCompleteTitle}>🎉 Path Complete!</Text>
                  <Text style={styles.actionCompleteSub}>{focusPath?.name} mastered</Text>
                </View>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: Colors.gold }]}
                  onPress={() => navigation.navigate('Map')}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Explore new career paths"
                >
                  <Text style={[styles.actionBtnText, { color: '#1A1000' }]}>Explore Paths</Text>
                </TouchableOpacity>
              </View>
            ) : nextSkill?.skill ? (
              <TouchableOpacity
                style={[styles.actionCard, { borderColor: focusCard.borderColor }]}
                onPress={() => navigation.navigate('Log')}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel={`${focusCard.tag}: ${nextSkill.skill.name}. ${focusCard.sub}. Tap to log.`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.actionTag, focusCard.urgent && { color: focusCard.btnColor }]}>
                    {focusCard.tag}
                  </Text>
                  <Text style={styles.actionName} numberOfLines={1}>{nextSkill.skill.name}</Text>
                  <Text style={styles.actionMeta}>{focusCard.sub}</Text>
                </View>
                <View style={[styles.actionBtn, { backgroundColor: focusCard.btnColor }]}>
                  <Text style={[styles.actionBtnText, { color: focusCard.btnTextColor }]}>
                    {focusCard.btnText}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.actionCard, { borderColor: pathColor + '25' }]}
                onPress={() => navigation.navigate('Map')}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Open Evolve map to unlock your first skill"
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionTag}>GET STARTED</Text>
                  <Text style={styles.actionName}>Open your Evolve map</Text>
                  <Text style={styles.actionMeta}>Unlock skills and start logging outputs</Text>
                </View>
                <View style={[styles.actionBtn, { backgroundColor: pathColor }]}>
                  <Text style={styles.actionBtnText}>Evolve →</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* ── Market Demand Gap Strip ── */}
            {(() => {
              // HIGH-003: use the active focus path (prioritized ?? enrolled), like the
              // rest of the Dashboard — not just the enrolled careerPathId.
              const pathSkillIds = focusPath?.skillIds ?? [];
              const gapSkills = ALL_SKILLS
                .filter(s =>
                  pathSkillIds.includes(s.id) &&
                  marketDemand[s.id]?.level === 'high' &&
                  (!userSkills[s.id] || userSkills[s.id].status === 'locked')
                )
                .slice(0, 3);
              if (gapSkills.length === 0) return null;
              return (
                <View style={styles.gapStrip}>
                  <Text style={styles.gapStripTitle}>🔥 High demand — not started yet</Text>
                  {gapSkills.map(s => (
                    <TouchableOpacity
                      key={s.id}
                      style={styles.gapSkillRow}
                      onPress={() => navigation.navigate('Map')}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.gapSkillIcon}>{s.icon}</Text>
                      <Text style={styles.gapSkillName} numberOfLines={1}>{s.name}</Text>
                      <DemandBadge level="high" compact />
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })()}

          </ScrollView>
        )}

      </Animated.View>

      {/* ISSUE-009: XP Explainer Modal */}
      <Modal visible={showXPInfo} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowXPInfo(false)}>
        <TouchableOpacity style={styles.xpInfoBackdrop} activeOpacity={1} onPress={() => setShowXPInfo(false)}>
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={styles.xpInfoCard}>
              <View style={styles.xpInfoHeader}>
                <Text style={styles.xpInfoTitle}>⚡ How XP Works</Text>
                <TouchableOpacity onPress={() => setShowXPInfo(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.xpInfoClose}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Output types */}
                <Text style={styles.xpInfoSection}>OUTPUT TYPES</Text>
                {[
                  { icon: '🏅', label: 'Certification', xp: '+200 XP' },
                  { icon: '🔨', label: 'Project', xp: '+75 XP' },
                  { icon: '📐', label: 'Design / Diagram', xp: '+75 XP' },
                  { icon: '💻', label: 'GitHub Repo', xp: '+60 XP' },
                  { icon: '📖', label: 'Book', xp: '+50 XP' },
                  { icon: '⚙️', label: 'Script', xp: '+50 XP' },
                  { icon: '💭', label: 'Reflection', xp: '+30 XP' },
                ].map((row) => (
                  <View key={row.label} style={styles.xpInfoRow}>
                    <Text style={styles.xpInfoRowIcon}>{row.icon}</Text>
                    <Text style={styles.xpInfoRowLabel}>{row.label}</Text>
                    <Text style={styles.xpInfoRowXP}>{row.xp}</Text>
                  </View>
                ))}

                {/* Quality bonuses */}
                <Text style={[styles.xpInfoSection, { marginTop: 16 }]}>QUALITY BONUSES</Text>
                {[
                  { icon: '✍️', label: 'Description ≥ 50 chars', xp: '+10 XP' },
                  { icon: '✍️', label: 'Description ≥ 120 chars', xp: '+20 XP' },
                  { icon: '💡', label: 'Key Takeaway filled in', xp: '+15 XP' },
                ].map((row) => (
                  <View key={row.label} style={styles.xpInfoRow}>
                    <Text style={styles.xpInfoRowIcon}>{row.icon}</Text>
                    <Text style={styles.xpInfoRowLabel}>{row.label}</Text>
                    <Text style={[styles.xpInfoRowXP, { color: Colors.success }]}>{row.xp}</Text>
                  </View>
                ))}
                <Text style={styles.xpInfoNote}>Quality bonuses don't stack — longer description replaces shorter.</Text>

                {/* Skill completion bonuses */}
                <Text style={[styles.xpInfoSection, { marginTop: 16 }]}>SKILL COMPLETION</Text>
                <View style={styles.xpInfoRow}>
                  <Text style={styles.xpInfoRowIcon}>🎯</Text>
                  <Text style={styles.xpInfoRowLabel}>Complete a skill milestone</Text>
                  <Text style={[styles.xpInfoRowXP, { color: Colors.primaryLight }]}>+75–400 XP</Text>
                </View>
                <Text style={styles.xpInfoNote}>Bonus varies by skill rarity: common → legendary.</Text>

                {/* Streak bonuses */}
                <Text style={[styles.xpInfoSection, { marginTop: 16 }]}>STREAK MILESTONES</Text>
                {[
                  { icon: '🔥', label: '7-day streak', xp: '+25 XP' },
                  { icon: '🔥', label: '14-day streak', xp: '+50 XP' },
                  { icon: '🔥', label: '30-day streak', xp: '+100 XP' },
                ].map((row) => (
                  <View key={row.label} style={styles.xpInfoRow}>
                    <Text style={styles.xpInfoRowIcon}>{row.icon}</Text>
                    <Text style={styles.xpInfoRowLabel}>{row.label}</Text>
                    <Text style={[styles.xpInfoRowXP, { color: Colors.gold }]}>{row.xp}</Text>
                  </View>
                ))}

                {/* Level progression */}
                <Text style={[styles.xpInfoSection, { marginTop: 16 }]}>LEVEL PROGRESSION</Text>
                {[
                  { lvl: 'Lv 1–2', label: 'Apprentice → Practitioner', xp: '0 – 499 XP' },
                  { lvl: 'Lv 3–4', label: 'Specialist → Engineer', xp: '500 – 1,999 XP' },
                  { lvl: 'Lv 5–6', label: 'Senior → Principal', xp: '2,000 – 5,999 XP' },
                  { lvl: 'Lv 7–8', label: 'Architect → Expert', xp: '6,000 – 14,999 XP' },
                  { lvl: 'Lv 9–10', label: 'Master → Legend', xp: '15,000+ XP' },
                ].map((row) => (
                  <View key={row.lvl} style={styles.xpInfoRow}>
                    <Text style={[styles.xpInfoRowIcon, { fontSize: 11, width: 36, textAlign: 'center' }]}>{row.lvl}</Text>
                    <Text style={styles.xpInfoRowLabel}>{row.label}</Text>
                    <Text style={[styles.xpInfoRowXP, { color: Colors.textSub, fontSize: 9 }]}>{row.xp}</Text>
                  </View>
                ))}

                <View style={{ height: 8 }} />
              </ScrollView>

              <TouchableOpacity style={styles.xpInfoDismissBtn} onPress={() => setShowXPInfo(false)} accessibilityRole="button">
                <Text style={styles.xpInfoDismissTxt}>Got it</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Comeback goal modal */}
      <ComebackModal
        visible={showComebackModal}
        pathColor={pathColor}
        currentGoal={user.weeklyOutputGoal}
        onConfirm={(goal) => {
          setComebackGoal(goal);
          setShowComebackModal(false);
          navigation.navigate('Log');
        }}
        onClose={() => setShowComebackModal(false)}
      />

      {/* Milestone celebration overlay */}
      {showCelebration && (
        <CelebrationOverlay
          pct={pathPct}
          onDismiss={() => {
            setShowCelebration(false);
            if (milestoneKey) markMilestoneCelebrated(milestoneKey);
          }}
        />
      )}

      {/* Welcome card — fires once on first Dashboard load after onboarding */}
      <Modal visible={showWelcome} transparent animationType="none" statusBarTranslucent>
        <TouchableOpacity style={styles.welcomeBackdrop} activeOpacity={1} onPress={handleDismissWelcome}>
          <Animated.View style={[styles.welcomeCard, { opacity: welcomeAnim, transform: [{ scale: welcomeScaleAnim }] }]}>
            <View style={styles.welcomeGlow} />
            <Text style={styles.welcomeEmoji}>⚡</Text>
            <Text style={styles.welcomeTitle}>Welcome to MaglakbAI!</Text>
            <Text style={styles.welcomeSub}>
              Your proof-based journey starts now.{'\n'}Every output you log builds your legacy.
            </Text>
            {(outputs[0]?.xpGained ?? 0) > 0 && (
              <View style={styles.welcomeXpRow}>
                <Text style={styles.welcomeXp}>+{welcomeDisplayXp} XP</Text>
                <Text style={styles.welcomeXpLabel}>FIRST OUTPUT</Text>
              </View>
            )}
            <Text style={styles.welcomeTapHint}>Tap anywhere to continue →</Text>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const makeStyles = (Colors: ColorsType) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  inner: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  greeting: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
  },
  subGreeting: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  targetRoleLabel: {
    fontSize: 10,
    color: Colors.primaryLight,
    fontWeight: '600',
    marginTop: 3,
    maxWidth: 200,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.goldDim,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.gold + '30',
  },
  streakChipWarning: {
    borderWidth: 1.5,
  },
  streakAtRiskCol: {
    alignItems: 'center',
    gap: 3,
  },
  streakFire: { fontSize: 14 },
  streakCount: {
    fontSize: FontSize.base,
    fontWeight: '800',
    color: Colors.gold,
  },
  streakWarningText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FBBF24',
    letterSpacing: 0.3,
  },
  freezeBtn: {
    backgroundColor: '#0E3347',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#22D3EE60',
  },
  freezeBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#67E8F9',
  },
  // ISSUE-002: permanent freeze balance indicator (shown when not at risk)
  freezeBalanceRow: {
    alignItems: 'center',
  },
  freezeBalanceText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#67E8F9',
    letterSpacing: 0.3,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.primary + '60',
  },
  avatarEmoji: { fontSize: 17 },
  avatarPhoto: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },

  // Empty state
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.xxl,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
    // @ts-ignore
    boxShadow: '0 4px 24px rgba(124,58,237,0.12)',
  },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 28,
  },
  emptySub: {
    fontSize: FontSize.sm,
    color: Colors.textSub,
    textAlign: 'center',
    lineHeight: 20,
  },
  proofRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  proofPill: {
    flex: 1,
    backgroundColor: Colors.cardAlt,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 10,
    alignItems: 'center',
    gap: 4,
  },
  proofIcon: { fontSize: 22 },
  proofLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSub,
    fontWeight: '600',
  },
  proofXP: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.gold,
  },
  emptyCTA: {
    borderRadius: Radius.full,
    paddingVertical: 14,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    width: '100%',
    marginTop: 4,
    backgroundColor: Colors.primary,
    // @ts-ignore - web-only gradient
    backgroundImage: 'linear-gradient(135deg, #7C3AED, #4F46E5)',
    // @ts-ignore
    boxShadow: '0 4px 20px rgba(124,58,237,0.45)',
  },
  emptyCTAText: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.white,
    letterSpacing: 0.5,
  },

  // First Mission card
  missionChip: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: 'center',
    marginBottom: 4,
  },
  missionChipText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  missionSkillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  missionSkillIcon: {
    width: 46,
    height: 46,
    borderRadius: Radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  missionSkillName: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 2,
  },
  missionSkillMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSub,
    lineHeight: 16,
  },
  missionExampleBlock: {
    width: '100%',
    backgroundColor: Colors.cardAlt,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 5,
  },
  missionExampleLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 1.5,
  },
  missionExampleText: {
    fontSize: FontSize.sm,
    color: Colors.textSub,
    lineHeight: 19,
    fontStyle: 'italic',
  },
  missionXpRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  missionXpChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.goldDim,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.gold + '25',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  missionXpIcon: { fontSize: 13 },
  missionXpText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.gold,
    flexShrink: 1,
  },

  // Evolution scroll container — contentContainerStyle for the ScrollView
  evolutionScroll: {
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
  },

  // Evolution ring section — natural height (no flex-grow), centered
  ringSection: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    gap: 10,
  },
  pathLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSub,
    letterSpacing: 0.2,
  },
  ringWrap: {
    width: 190,
    height: 190,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ringInner: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigPct: {
    fontSize: 58,
    fontWeight: '900',
    lineHeight: 64,
  },
  bigPctSub: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 2.5,
    marginTop: 1,
  },
  skillsDone: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 4,
  },
  xpTrackWrap: {
    width: '80%',
    alignItems: 'center',
    gap: 6,
  },
  xpTrackBg: {
    width: '100%',
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  xpTrackFill: {
    height: '100%',
    borderRadius: 2,
    opacity: 0.85,
  },
  xpTrackLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingVertical: 16,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statVal: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
  },
  statLbl: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 1.5,
  },
  statSep: {
    width: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },

  // Action card
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    // @ts-ignore
    boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
  },
  actionCardComplete: {
    borderColor: Colors.gold + '40',
    // @ts-ignore
    boxShadow: '0 0 20px rgba(245,158,11,0.12)',
  },
  actionTag: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 2,
    marginBottom: 2,
  },
  actionName: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
  },
  actionMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  actionCompleteTitle: {
    fontSize: FontSize.base,
    fontWeight: '800',
    color: Colors.gold,
  },
  actionCompleteSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  actionBtn: {
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 9,
    flexShrink: 0,
  },
  actionBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.white,
  },

  // Welcome overlay
  welcomeBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,8,16,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  welcomeCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.xxl,
    padding: Spacing.xl,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.primary + '50',
    position: 'relative',
    overflow: 'hidden',
    // @ts-ignore
    boxShadow: '0 0 60px rgba(124,58,237,0.35)',
  },
  welcomeGlow: {
    position: 'absolute',
    top: -60,
    alignSelf: 'center',
    width: 260,
    height: 160,
    borderRadius: 130,
    backgroundColor: Colors.primary,
    opacity: 0.10,
  },
  welcomeEmoji: { fontSize: 52, marginBottom: Spacing.sm },
  welcomeTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  welcomeSub: {
    fontSize: FontSize.base,
    color: Colors.textSub,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  welcomeXpRow: {
    alignItems: 'center',
    backgroundColor: Colors.goldDim,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.gold + '40',
    marginBottom: Spacing.md,
  },
  welcomeXp: {
    fontSize: FontSize.xxl,
    fontWeight: '900',
    color: Colors.gold,
  },
  welcomeXpLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.gold,
    opacity: 0.7,
    letterSpacing: 2,
    marginTop: 2,
  },
  welcomeTapHint: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
  },

  // ISSUE-009: XP info button + modal
  statLblRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    // RES-001: ensure the tap target meets the 44px WCAG minimum
    minHeight: 44,
    justifyContent: 'center',
  },
  xpInfoBtn: {
    fontSize: 10,
    color: Colors.primaryLight,
    fontWeight: '700',
    lineHeight: 13,
  },
  xpInfoBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,8,16,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  xpInfoCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.xxl,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    padding: Spacing.lg,
    width: '100%',
    maxHeight: 560,
    // @ts-ignore
    boxShadow: '0 0 40px rgba(124,58,237,0.25)',
  },
  xpInfoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  xpInfoTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
  },
  xpInfoClose: {
    fontSize: 16,
    color: Colors.textMuted,
    fontWeight: '700',
  },
  xpInfoSection: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 2,
    marginBottom: 6,
  },
  xpInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  xpInfoRowIcon: {
    fontSize: 16,
    width: 26,
    textAlign: 'center',
  },
  xpInfoRowLabel: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSub,
  },
  xpInfoRowXP: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.gold,
  },
  xpInfoNote: {
    fontSize: 10,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 2,
    lineHeight: 14,
  },
  xpInfoDismissBtn: {
    marginTop: 14,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 11,
    alignItems: 'center',
    // @ts-ignore
    boxShadow: '0 2px 12px rgba(124,58,237,0.35)',
  },
  xpInfoDismissTxt: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.white,
  },
  // ── Market demand gap strip ────────────────────────────────────────────────
  gapStrip: {
    marginTop: 12,
    marginHorizontal: Spacing.md,
    backgroundColor: 'rgba(239,68,68,0.07)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.18)',
    padding: 14,
    gap: 8,
  },
  gapStripTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700' as const,
    color: '#FCA5A5',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  gapSkillRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  gapSkillIcon: {
    fontSize: 16,
    width: 22,
    textAlign: 'center' as const,
  },
  gapSkillName: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '500' as const,
  },
});

// ── Dormancy card StyleSheet ─────────────────────────────────────────────────

const makeDormancyStyles = (Colors: ColorsType) => StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    gap: 7,
    // @ts-ignore
    boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headline: {
    fontSize: FontSize.base,
    fontWeight: '800',
    color: Colors.text,
    flex: 1,
    paddingRight: 8,
  },
  dismissBtn: {
    padding: 2,
  },
  dismissText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '700',
  },
  body: {
    fontSize: FontSize.xs,
    color: Colors.textSub,
    lineHeight: 17,
  },
  progressBadge: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  progressBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  ctaPrimary: {
    flex: 1,
    borderRadius: Radius.full,
    paddingVertical: 9,
    alignItems: 'center',
  },
  ctaPrimaryText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.white,
  },
  ctaSecondary: {
    flex: 1,
    borderRadius: Radius.full,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.cardAlt,
  },
  ctaSecondaryText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSub,
  },
});

// ── Comeback modal StyleSheet ─────────────────────────────────────────────────

const makeComebackStyles = (Colors: ColorsType) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,8,16,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: Colors.border,
    // @ts-ignore
    boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSub,
    marginBottom: Spacing.md,
    lineHeight: 18,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  goalEmoji: {
    fontSize: 22,
    width: 30,
    textAlign: 'center',
  },
  goalLabel: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.textSub,
  },
  goalDesc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  goalRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalRadioDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.white,
  },
  confirmBtn: {
    borderRadius: Radius.full,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.sm,
    // @ts-ignore
    boxShadow: '0 2px 16px rgba(0,0,0,0.25)',
  },
  confirmTxt: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.white,
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelTxt: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
});

// ── Weekly dots StyleSheet ───────────────────────────────────────────────────

const makeWeeklyDotStyles = (Colors: ColorsType) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xs,
  },
  col: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotTodayEmpty: {
    backgroundColor: 'transparent',
    borderWidth: 2,
  },
  dotFuture: {
    backgroundColor: Colors.border,
    opacity: 0.4,
  },
  dotMissed: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: 'transparent',
  },
  check: {
    fontSize: 7,
    color: '#fff',
    fontWeight: '900',
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    color: Colors.textMuted,
    letterSpacing: 0.3,
  },
  labelToday: {
    color: Colors.text,
    fontWeight: '700',
  },
});

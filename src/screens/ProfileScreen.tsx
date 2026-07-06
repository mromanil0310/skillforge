import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Animated,
  Modal,
  TextInput,
  RefreshControl,
  Image,
} from 'react-native';
import { useAppStore, CAREER_PATHS, ALL_SKILLS, ALL_ACHIEVEMENTS, getEvidenceTier, OUTCOME_XP, getCareerMastery, CAREER_MASTERY_LADDER, CAREER_MASTERY_META, getBurnoutSignal } from '../store/appStore';
import { localDateStr } from '../utils/dates';
import {
  useThemeColors,
  ColorsType,
  Colors,
  Spacing,
  Radius,
  FontSize,
  PathColors,
  getPathColor,
  ThemeContext,
  RarityColors,
  getLevelTitle,
  getLevelBounds,
  getLevelFromXP,
  timeAgo,
} from '../utils/theme';
import { useContext } from 'react';
import XPBar from '../components/XPBar';
import AchievementBadge from '../components/AchievementBadge';
import { useToast } from '../components/Toast';
import { page } from '../utils/analytics';
import { Achievement, Output, UserSkill, User, CareerOutcome, OutcomeType, PaceMode } from '../types';

const OUTPUT_TYPE_META: Record<string, { icon: string; label: string }> = {
  project:    { icon: '🔨', label: 'Project' },
  book:       { icon: '📖', label: 'Book' },
  cert:       { icon: '🏅', label: 'Cert' },
  github:     { icon: '💻', label: 'GitHub' },
  diagram:    { icon: '📐', label: 'Design' },
  script:     { icon: '⚙️', label: 'Script' },
  reflection: { icon: '💭', label: 'Reflect' },
  event:      { icon: '🎤', label: 'Event' },
  other:      { icon: '📋', label: 'Other' },
};

const OUTCOME_META: Record<OutcomeType, { icon: string; label: string; color: string; caption: string }> = {
  interview:       { icon: '🤝', label: 'Interview',       color: '#6366F1', caption: 'You landed an interview — your skills are visible.' },
  offer:           { icon: '🎉', label: 'Job Offer',        color: '#10B981', caption: 'Someone wants to hire you. The path is working.' },
  promotion:       { icon: '📈', label: 'Promotion',        color: '#F59E0B', caption: 'Your growth was recognized. Keep building.' },
  role_change:     { icon: '🚀', label: 'Role Change',      color: '#8B5CF6', caption: 'New role, new chapter. MaglakbAI got you here.' },
  certification:   { icon: '🏅', label: 'Certification',    color: '#F59E0B', caption: 'Official proof of what you know.' },
  salary_increase: { icon: '💰', label: 'Salary Bump',      color: '#10B981', caption: 'Your skills literally paid off.' },
  portfolio:       { icon: '🔗', label: 'Portfolio Piece',  color: '#7C3AED', caption: 'Your work is public and findable.' },
  freelance:       { icon: '💼', label: 'Freelance Win',    color: '#0EA5E9', caption: 'A client is paying for your skills.' },
};

const OUTCOME_TYPES: OutcomeType[] = [
  'interview', 'offer', 'promotion', 'role_change',
  'certification', 'salary_increase', 'portfolio', 'freelance',
];

// Circular ring for profile (same approach as HomeScreen)
function SmallRing({ percent, color }: { percent: number; color: string }) {
  const Colors = useThemeColors();
  const size = 60;
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  return (
    // @ts-ignore
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ transform: 'rotate(-90deg)' } as any}>
      {/* @ts-ignore */}
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={Colors.border} strokeWidth="5" />
      {/* @ts-ignore */}
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth="5"
        strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.8s ease' } as any} />
    </svg>
  );
}

const AVATAR_EMOJIS = [
  '🏗️', '🤖', '🌐', '🚀', '⚡', '🔥', '🧠', '💡', '🎯', '🏆',
  '👾', '🦾', '🐍', '⚛️', '🔮', '🧬', '📊', '🎨', '💻', '🛠️',
  '🌟', '🦅', '🌊', '🎭', '🧩', '🔑', '🪄', '🦁', '🐉', '🤿',
];

function getAchievementProgress(
  achievementId: string,
  outputs: Output[],
  userSkills: Record<string, UserSkill>,
  user: User
): { current: number; required: number; label: string } {
  const completedSkillCount = Object.values(userSkills).filter(us => us.status === 'completed').length;
  const map: Record<string, { current: number; required: number; label: string }> = {
    'first-steps':      { current: Math.min(1, outputs.length),         required: 1,   label: 'output logged' },
    'builder':          { current: Math.min(5, outputs.length),         required: 5,   label: 'outputs logged' },
    'skill-mastered':   { current: Math.min(1, completedSkillCount),    required: 1,   label: 'skill mastered' },
    'consistent':       { current: Math.min(7, user.streak),            required: 7,   label: 'day streak' },
    'on-fire':          { current: Math.min(14, user.streak),           required: 14,  label: 'day streak' },
    'thirty-day-legend':{ current: Math.min(30, user.streak),           required: 30,  label: 'day streak' },
    'evolution':        { current: Math.min(500, user.xp),              required: 500, label: 'XP earned' },
    'triple-master':    { current: Math.min(3, completedSkillCount),    required: 3,   label: 'skills mastered' },
  };
  return map[achievementId] ?? { current: 0, required: 1, label: '' };
}

export default function ProfileScreen() {
  const Colors = useThemeColors();
  const colorScheme = useContext(ThemeContext);
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const user = useAppStore((s) => s.user);
  const userSkills = useAppStore((s) => s.userSkills);
  const outputs = useAppStore((s) => s.outputs);
  const unlockedAchievementIds = useAppStore((s) => s.unlockedAchievementIds);
  const customPaths = useAppStore((s) => s.customPaths);
  const prioritizedPathId = useAppStore((s) => s.prioritizedPathId);
  const resetApp = useAppStore((s) => s.resetApp);
  const updateAvatar = useAppStore((s) => s.updateAvatar);
  const updateAvatarImage = useAppStore((s) => s.updateAvatarImage);
  const updateBio = useAppStore((s) => s.updateBio);
  const updateTargetRole = useAppStore((s) => s.updateTargetRole);
  const updateName = useAppStore((s) => s.updateName);
  const deleteOutput = useAppStore((s) => s.deleteOutput);
  const careerOutcomes = useAppStore((s) => s.careerOutcomes);
  const logCareerOutcome = useAppStore((s) => s.logCareerOutcome);
  const deleteCareerOutcome = useAppStore((s) => s.deleteCareerOutcome);
  const setPaceMode = useAppStore((s) => s.setPaceMode);

  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [bioText, setBioText] = useState('');
  const [editingTargetRole, setEditingTargetRole] = useState(false);
  const [targetRoleText, setTargetRoleText] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameText, setNameText] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [outputTypeFilter, setOutputTypeFilter] = useState<string | null>(null);
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const [outputToDelete, setOutputToDelete] = useState<Output | null>(null);
  const [selectedOutput, setSelectedOutput] = useState<Output | null>(null);

  // Career Outcome modal state
  const [showOutcomeModal, setShowOutcomeModal] = useState(false);
  const [outcomeType, setOutcomeType] = useState<OutcomeType>('interview');
  const [outcomeTitle, setOutcomeTitle] = useState('');
  const [outcomeCompany, setOutcomeCompany] = useState('');
  const [outcomeNote, setOutcomeNote] = useState('');
  const [outcomeDate, setOutcomeDate] = useState(localDateStr());
  const [outcomeToDelete, setOutcomeToDelete] = useState<CareerOutcome | null>(null);
  const { showToast } = useToast();
  const avatarAnim = useRef(new Animated.Value(1)).current;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Simulate a brief refresh — ready to wire up Supabase profile re-fetch here
    setTimeout(() => setRefreshing(false), 800);
  }, []);


  useEffect(() => {
    Animated.spring(avatarAnim, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: false,
    }).start();
    page('profile', { total_outputs: outputs.length, achievements_count: unlockedAchievementIds.length });
  }, []);

  // Hidden file input for photo upload (web only)
  useEffect(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result !== 'string') return;
        // ISSUE-004: compress to ≤200×200 JPEG (~30–50 KB) before writing to localStorage
        const img = new window.Image();
        img.onload = () => {
          const MAX = 200;
          const scale = Math.min(1, MAX / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
          const w = Math.round((img.naturalWidth || MAX) * scale);
          const h = Math.round((img.naturalHeight || MAX) * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            updateAvatarImage(reader.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          try {
            const compressed = canvas.toDataURL('image/jpeg', 0.7);
            updateAvatarImage(compressed);
          } catch {
            // Canvas may be tainted by cross-origin data — fall back to original
            updateAvatarImage(reader.result as string);
          }
        };
        img.onerror = () => updateAvatarImage(reader.result as string);
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
      // Reset so picking the same file again re-fires change
      input.value = '';
    });
    document.body.appendChild(input);
    fileInputRef.current = input;
    return () => { input.remove(); };
  }, []);

  // ISSUE-004: show toast if localStorage quota is exceeded during any save
  useEffect(() => {
    const onQuotaExceeded = () => {
      showToast({ message: 'Storage full — try removing old outputs or use a smaller photo', emoji: '⚠️', variant: 'warning' });
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('maglakbai:storage-quota-exceeded', onQuotaExceeded);
      return () => window.removeEventListener('maglakbai:storage-quota-exceeded', onQuotaExceeded);
    }
  }, []);

  const handleChoosePhoto = () => {
    setShowAvatarPicker(false);
    fileInputRef.current?.click();
  };

  const handleSubmitOutcome = () => {
    if (!outcomeTitle.trim()) return;
    const xp = logCareerOutcome({
      type: outcomeType,
      title: outcomeTitle,
      company: outcomeCompany || undefined,
      note: outcomeNote || undefined,
      date: outcomeDate,
    });
    showToast({ message: `${OUTCOME_META[outcomeType].label} logged!`, xp, emoji: OUTCOME_META[outcomeType].icon, variant: 'success', duration: 3200 });
    setShowOutcomeModal(false);
    setOutcomeTitle('');
    setOutcomeCompany('');
    setOutcomeNote('');
    setOutcomeDate(localDateStr());
    setOutcomeType('interview');
  };

  if (!user) return null;

  const weekOutputCount = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    return outputs.filter((o) => new Date(o.createdAt) >= monday).length;
  }, [outputs]);

  const resolvedPriorityId = prioritizedPathId ?? user.careerPathId;
  const builtInPrioritized = CAREER_PATHS.find(p => p.id === resolvedPriorityId);
  const customPrioritizedPath = customPaths.find(p => p.id === resolvedPriorityId);
  const pillColorObj = builtInPrioritized
    ? getPathColor(resolvedPriorityId, colorScheme)
    : {
        primary: customPrioritizedPath?.color ?? Colors.primary,
        dim: (customPrioritizedPath?.color ?? Colors.primary) + '18',
        text: colorScheme === 'light' ? (customPrioritizedPath?.color ?? Colors.primary) : Colors.primaryLight,
        border: (customPrioritizedPath?.color ?? Colors.primary) + (colorScheme === 'light' ? '35' : '40'),
      };

  // Career Evolution section always reflects the prioritized path
  const builtInPath = CAREER_PATHS.find((p) => p.id === resolvedPriorityId);
  const customCareerPath = customPaths.find((p) => p.id === resolvedPriorityId);
  const path = builtInPath ?? {
    title: customCareerPath?.name ?? 'Custom Path',
    name: customCareerPath?.name ?? 'Custom Path',
    icon: customCareerPath?.icon ?? '⚡',
  };
  // PathColors only covers built-in paths — fall back gracefully for custom paths
  const pathColor = PathColors[resolvedPriorityId]
    ? getPathColor(resolvedPriorityId, colorScheme)
    : {
        primary: customCareerPath?.color ?? Colors.primary,
        dim: (customCareerPath?.color ?? Colors.primary) + '18',
        text: colorScheme === 'light' ? (customCareerPath?.color ?? Colors.primary) : Colors.primaryLight,
        border: (customCareerPath?.color ?? Colors.primary) + (colorScheme === 'light' ? '35' : '40'),
      };
  const pathSkills = builtInPath
    ? ALL_SKILLS.filter((s) => s.pathId === resolvedPriorityId)
    : (customCareerPath?.skills ?? []);
  const completedCount = builtInPath
    ? pathSkills.filter((s: any) => userSkills[s.id]?.status === 'completed').length
    : (customCareerPath?.skills ?? []).filter((s) => userSkills[s.id]?.status === 'completed').length;
  const evolutionPercent = pathSkills.length > 0
    ? Math.round((completedCount / pathSkills.length) * 100)
    : 0;
  const totalSkillsDone = Object.values(userSkills).filter(s => s.status === 'completed').length;

  // Status pill under the name: "Mastered <Path> Path" once every skill in the
  // prioritized path is completed, otherwise "Mastery in Progress". Derived from
  // the resolved priority path + userSkills, so it updates automatically when the
  // user switches paths or changes their priority roadmap.
  const prioritizedPathName = builtInPath?.name ?? customCareerPath?.name ?? null;
  const prioritizedPathComplete = pathSkills.length > 0 && completedCount === pathSkills.length;
  const pillTitle = prioritizedPathComplete && prioritizedPathName
    ? (/\bpath$/i.test(prioritizedPathName.trim())
        ? `Mastered ${prioritizedPathName.trim()}`
        : `Mastered ${prioritizedPathName.trim()} Path`)
    : 'Mastery in Progress';

  // Mastery Framework
  const pathSkillIds = builtInPath
    ? (pathSkills as any[]).map((s) => s.id as string)
    : (customCareerPath?.skills ?? []).map((s) => s.id);
  const careerMastery = getCareerMastery(userSkills, pathSkillIds);

  const displayLevel = getLevelFromXP(user.xp);
  const { min, max } = getLevelBounds(displayLevel);
  const xpPercent = Math.round(Math.max(0, Math.min(100, ((user.xp - min) / (max - min)) * 100)));

  const unlockedAchievements = ALL_ACHIEVEMENTS.filter((a) =>
    unlockedAchievementIds.includes(a.id)
  );

  const outputsXP = outputs.reduce((s, o) => s + (Number.isFinite(o.xpGained) ? o.xpGained : 0), 0);
  const achievementsXP = unlockedAchievements.reduce((s, a) => s + a.xpGranted, 0);
  const bonusXP = Math.max(0, user.xp - outputsXP - achievementsXP);
  const lockedAchievements = ALL_ACHIEVEMENTS.filter(
    (a) => !unlockedAchievementIds.includes(a.id)
  );

  const shareText = [
    `My MaglakbAI progress 🚀`,
    ``,
    `Level ${displayLevel} · ${getLevelTitle(displayLevel)}`,
    `⚡ ${user.xp.toLocaleString()} XP   🔥 ${user.streak}-day streak`,
    `🎯 ${completedCount} skills mastered · 📦 ${outputs.length} outputs`,
    ``,
    `Building real proof of work. Not just watching. #MaglakbAI`,
  ].join('\n');

  const copyShareText = () => {
    setShowShareSheet(false);
    try {
      // execCommand is synchronous and doesn't require Clipboard permission or document focus
      if (typeof document !== 'undefined') {
        const el = document.createElement('textarea');
        el.value = shareText;
        el.setAttribute('readonly', '');
        el.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        showToast({ message: 'Copied to clipboard!', emoji: '📋', variant: 'success' });
        return;
      }
    } catch {}
    // Fallback: async Clipboard API
    navigator.clipboard?.writeText(shareText)
      .then(() => showToast({ message: 'Copied to clipboard!', emoji: '📋', variant: 'success' }))
      .catch(() => showToast({ message: 'Copy failed — try long-pressing and copying manually', emoji: '⚠️', variant: 'warning' }));
  };

  const openShareURL = (url: string) => {
    setShowShareSheet(false);
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const shareOnLinkedIn = () => {
    const url = `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent('https://maglakbai.app')}&title=${encodeURIComponent('My MaglakbAI Progress')}&summary=${encodeURIComponent(shareText)}`;
    openShareURL(url);
  };

  const shareOnFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://maglakbai.app')}&quote=${encodeURIComponent(shareText)}`;
    openShareURL(url);
  };

  const shareOnTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    openShareURL(url);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* ISSUE-001: Profile header row with settings gear */}
      <View style={styles.profileHeader}>
        <Text style={styles.profileHeaderTitle}>Profile</Text>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => navigation.navigate('Settings')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
        >
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primaryLight}
            colors={[Colors.primaryLight]}
          />
        }
      >
        {/* Identity section */}
        <View style={styles.identitySection}>
          <TouchableOpacity onPress={() => setShowAvatarPicker(true)} activeOpacity={0.8}>
            <Animated.View
              style={[styles.avatarWrapper, { transform: [{ scale: avatarAnim }], opacity: avatarAnim }]}
            >
              <View style={[styles.avatarGlow, { backgroundColor: pathColor.primary }]} />
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: user.avatarUri ? 'transparent' : user.avatarColor, borderColor: pathColor.primary },
                ]}
              >
                {user.avatarUri ? (
                  <Image source={{ uri: user.avatarUri }} style={styles.avatarPhoto} />
                ) : (
                  <Text style={styles.avatarEmoji}>{user.avatarEmoji}</Text>
                )}
              </View>
              <View style={styles.avatarEditBadge}>
                <Text style={styles.avatarEditBadgeText}>📷</Text>
              </View>
            </Animated.View>
          </TouchableOpacity>

          {editingName ? (
            <View style={styles.nameEditContainer}>
              <TextInput
                style={styles.nameInput}
                value={nameText}
                onChangeText={setNameText}
                placeholder="Your name"
                placeholderTextColor={Colors.textMuted}
                maxLength={40}
                autoFocus
                accessibilityLabel="Your name"
              />
              <View style={styles.bioEditActions}>
                <TouchableOpacity
                  onPress={() => { setEditingName(false); }}
                  style={styles.bioCancelBtn}
                >
                  <Text style={styles.bioCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const trimmed = nameText.trim();
                    if (trimmed) updateName(trimmed);
                    setEditingName(false);
                  }}
                  style={styles.bioSaveBtn}
                >
                  <Text style={styles.bioSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => { setNameText(user.name); setEditingName(true); }}
              activeOpacity={0.7}
              style={styles.nameDisplayRow}
              accessibilityRole="button"
              accessibilityLabel={`Edit name: ${user.name}`}
            >
              <Text style={styles.userName}>{user.name}</Text>
              <Text style={styles.nameEditHint}>✏️</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.userHandle}>@{user.handle}</Text>

          <View style={[styles.pathPill, { backgroundColor: pillColorObj.dim, borderColor: pillColorObj.border }]}>
            <Text style={[styles.pathPillText, { color: pillColorObj.text }]}>
              {pillTitle}
            </Text>
          </View>

          {/* Bio — tap to edit */}
          {editingBio ? (
            <View style={styles.bioEditContainer}>
              <TextInput
                style={styles.bioInput}
                value={bioText}
                onChangeText={setBioText}
                placeholder="Write a short bio…"
                placeholderTextColor={Colors.textMuted}
                multiline
                maxLength={160}
                autoFocus
                accessibilityLabel="Bio text"
              />
              <View style={styles.bioEditActions}>
                <TouchableOpacity
                  onPress={() => { setEditingBio(false); setBioText(user.bio); }}
                  style={styles.bioCancelBtn}
                >
                  <Text style={styles.bioCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { updateBio(bioText.trim()); setEditingBio(false); }}
                  style={styles.bioSaveBtn}
                >
                  <Text style={styles.bioSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => { setBioText(user.bio); setEditingBio(true); }}
              activeOpacity={0.7}
              style={styles.bioDisplay}
              accessibilityRole="button"
              accessibilityLabel={user.bio ? `Edit bio: ${user.bio}` : 'Add a bio'}
            >
              {user.bio ? (
                <View style={styles.bioDisplayRow}>
                  <Text style={[styles.bioText, { flex: 1 }]}>{user.bio}</Text>
                  <Text style={styles.bioEditHint}>✏️</Text>
                </View>
              ) : (
                <Text style={styles.bioPlaceholder}>✏️  Add a bio</Text>
              )}
            </TouchableOpacity>
          )}

          {/* Target Role — tap to edit */}
          {editingTargetRole ? (
            <View style={styles.targetRoleEdit}>
              <Text style={styles.targetRoleEditLabel}>🎯 Target Role</Text>
              <View style={styles.targetRoleRow}>
                <TextInput
                  style={styles.targetRoleInput}
                  value={targetRoleText}
                  onChangeText={setTargetRoleText}
                  placeholder="e.g. Senior AI Engineer at Stripe"
                  placeholderTextColor={Colors.textMuted}
                  maxLength={80}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    updateTargetRole(targetRoleText);
                    setEditingTargetRole(false);
                  }}
                  accessibilityLabel="Target role"
                />
              </View>
              <View style={styles.bioEditActions}>
                <TouchableOpacity
                  onPress={() => { setEditingTargetRole(false); setTargetRoleText(user.targetRole ?? ''); }}
                  style={styles.bioCancelBtn}
                >
                  <Text style={styles.bioCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { updateTargetRole(targetRoleText); setEditingTargetRole(false); }}
                  style={styles.bioSaveBtn}
                >
                  <Text style={styles.bioSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => { setTargetRoleText(user.targetRole ?? ''); setEditingTargetRole(true); }}
              activeOpacity={0.7}
              style={styles.targetRoleDisplay}
              accessibilityRole="button"
              accessibilityLabel={user.targetRole ? `Edit target role: ${user.targetRole}` : 'Set your target role'}
            >
              {user.targetRole ? (
                <View style={styles.bioDisplayRow}>
                  <Text style={styles.targetRoleIcon}>🎯</Text>
                  <Text style={[styles.targetRoleText, { flex: 1 }]}>{user.targetRole}</Text>
                  <Text style={styles.bioEditHint}>✏️</Text>
                </View>
              ) : (
                <Text style={styles.bioPlaceholder}>🎯  Set your target role</Text>
              )}
            </TouchableOpacity>
          )}

          {/* Share Progress button */}
          <TouchableOpacity
            style={styles.shareBtn}
            onPress={() => setShowShareSheet(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Share your progress"
          >
            <Text style={styles.shareBtnText}>📤 Share Progress</Text>
          </TouchableOpacity>
        </View>

        {/* Stats row — large numbers */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: Colors.gold }]}>
              {user.xp.toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>Total XP</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: Colors.primaryLight }]}>
              {outputs.length}
            </Text>
            <Text style={styles.statLabel}>Outputs</Text>
            {weekOutputCount > 0 && (
              <Text style={styles.statWeekNote}>+{weekOutputCount} this wk</Text>
            )}
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: Colors.warning }]}>
              {user.streak}
            </Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: Colors.success }]}>
              {totalSkillsDone}
            </Text>
            <Text style={styles.statLabel}>Skills Completed</Text>
          </View>
        </View>

        {/* Level card */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LEVEL PROGRESS</Text>
          <View style={styles.levelCard}>
            <View style={styles.levelCardLeft}>
              <Text style={styles.levelNumber}>Level {displayLevel}</Text>
              <Text style={styles.levelTitleText}>{getLevelTitle(displayLevel)}</Text>
            </View>
            <View style={styles.levelCardRight}>
              <View style={styles.ringWrapper}>
                <SmallRing percent={xpPercent} color={Colors.primaryLight} />
                <View style={styles.ringCenter}>
                  <Text style={styles.ringText}>{xpPercent}%</Text>
                </View>
              </View>
            </View>
          </View>
          <View style={styles.card}>
            <XPBar xp={user.xp} level={displayLevel} showDetails />
          </View>
          <View style={styles.xpSourcesCard}>
            <Text style={styles.xpSourcesTitle}>XP SOURCES</Text>
            <View style={styles.xpSourcesRow}>
              <View style={styles.xpSourceItem}>
                <Text style={styles.xpSourceIcon}>🔨</Text>
                <Text style={styles.xpSourceLabel}>Outputs</Text>
                <Text style={styles.xpSourceValue}>+{outputsXP}</Text>
              </View>
              <View style={styles.xpSourceDivider} />
              <View style={styles.xpSourceItem}>
                <Text style={styles.xpSourceIcon}>🏆</Text>
                <Text style={styles.xpSourceLabel}>Achievements</Text>
                <Text style={styles.xpSourceValue}>+{achievementsXP}</Text>
              </View>
              {bonusXP > 0 && (
                <>
                  <View style={styles.xpSourceDivider} />
                  <View style={styles.xpSourceItem}>
                    <Text style={styles.xpSourceIcon}>🎯</Text>
                    <Text style={styles.xpSourceLabel}>Milestones</Text>
                    <Text style={styles.xpSourceValue}>+{bonusXP}</Text>
                  </View>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Evolution */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CAREER EVOLUTION</Text>
          <View style={styles.card}>
            <View style={styles.evolutionHeader}>
              <Text style={[styles.evolutionPathName, { color: pathColor.text }]}>
                {path.name} Path
              </Text>
              <Text style={[styles.evolutionPct, { color: pathColor.primary }]}>
                {evolutionPercent}%
              </Text>
            </View>
            <View style={styles.evolutionBarBg}>
              <View
                style={[
                  styles.evolutionBarFill,
                  {
                    width: `${evolutionPercent}%` as any,
                    backgroundColor: pathColor.primary,
                    // @ts-ignore - web-only gradient
                    backgroundImage: `linear-gradient(90deg, ${pathColor.primary}, ${pathColor.text})`,
                    // @ts-ignore
                    boxShadow: `0 0 8px ${pathColor.primary}70`,
                  },
                ]}
              />
            </View>
            <Text style={styles.evolutionMeta}>
              {completedCount} of {pathSkills.length} skills completed
            </Text>
          </View>
        </View>

        {/* Career Mastery */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CAREER MASTERY</Text>
          <View style={styles.card}>
            {/* Title badge + context */}
            <View style={styles.masteryHeaderBlock}>
              <View
                style={[
                  styles.masteryTitleBadge,
                  {
                    backgroundColor: CAREER_MASTERY_META[careerMastery.title].color + '22',
                    borderColor: CAREER_MASTERY_META[careerMastery.title].color + '50',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.masteryTitleBadgeText,
                    { color: CAREER_MASTERY_META[careerMastery.title].color },
                  ]}
                >
                  {careerMastery.title.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.masteryDescription}>
                {CAREER_MASTERY_META[careerMastery.title].description}
              </Text>
              <Text style={styles.masteryNextStep}>
                ↗ {CAREER_MASTERY_META[careerMastery.title].next}
              </Text>
            </View>

            {/* Mastery ladder */}
            <View style={styles.masteryLadder}>
              {CAREER_MASTERY_LADDER.map((tier, i) => {
                const currentIdx = CAREER_MASTERY_LADDER.indexOf(careerMastery.title);
                const isActive = i === currentIdx;
                const isPast = i < currentIdx;
                const meta = CAREER_MASTERY_META[tier];
                return (
                  <View
                    key={tier}
                    style={[
                      styles.masteryTierRow,
                      isActive && {
                        backgroundColor: meta.color + '15',
                        borderColor: meta.color + '45',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.masteryTierDot,
                        {
                          color: isActive
                            ? meta.color
                            : isPast
                            ? meta.color + 'AA'
                            : Colors.textMuted,
                        },
                      ]}
                    >
                      {isActive ? '●' : isPast ? '●' : '○'}
                    </Text>
                    <Text
                      style={[
                        styles.masteryTierName,
                        {
                          color: isActive
                            ? meta.color
                            : isPast
                            ? Colors.textSub
                            : Colors.textMuted,
                          fontWeight: isActive ? '700' : '500',
                          opacity: isPast ? 0.65 : 1,
                        },
                      ]}
                    >
                      {tier}
                    </Text>
                    {isActive && (
                      <Text style={[styles.masteryYouLabel, { color: meta.color }]}>
                        ← you
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Distribution counts */}
            <View style={styles.masteryDistRow}>
              <View style={styles.masteryDistItem}>
                <Text style={[styles.masteryDistCount, { color: '#60A5FA' }]}>
                  {careerMastery.practicingCount}
                </Text>
                <Text style={styles.masteryDistLabel}>Practicing</Text>
              </View>
              <View style={styles.masteryDistDivider} />
              <View style={styles.masteryDistItem}>
                <Text style={[styles.masteryDistCount, { color: Colors.primaryLight }]}>
                  {careerMastery.competentCount - careerMastery.validatedCount}
                </Text>
                <Text style={styles.masteryDistLabel}>Competent</Text>
              </View>
              <View style={styles.masteryDistDivider} />
              <View style={styles.masteryDistItem}>
                <Text style={[styles.masteryDistCount, { color: Colors.gold }]}>
                  {careerMastery.validatedCount}
                </Text>
                <Text style={styles.masteryDistLabel}>Validated</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Pace Mode */}
        <View style={styles.section}>
          {(() => {
            const activeMode: PaceMode = user?.paceMode ?? 'steady';
            const modeColor: Record<PaceMode, string> = {
              sprint:   '#F59E0B',
              steady:   Colors.primaryLight,
              recovery: '#10B981',
            };
            const modeLabel: Record<PaceMode, string> = {
              sprint:   '🚀 SPRINT MODE',
              steady:   '⚡ STEADY MODE',
              recovery: '🌿 RECOVERY MODE',
            };
            const activeModeColor = modeColor[activeMode];
            return (
              <>
                <View style={styles.paceSectionHeader}>
                  <Text style={styles.sectionTitle}>PACE MODE</Text>
                  <View style={[styles.paceActiveBadge, { borderColor: activeModeColor + '60', backgroundColor: activeModeColor + '15' }]}>
                    <Text style={[styles.paceActiveBadgeText, { color: activeModeColor }]}>{modeLabel[activeMode]}</Text>
                  </View>
                </View>
                <Text style={styles.paceSectionSub}>
                  Tell MaglakbAI how you're feeling. Your coaching adapts to match.
                </Text>
                <View style={styles.paceCards}>
                  {([
                    { mode: 'sprint' as PaceMode,   icon: '🚀', label: 'Sprint',   desc: 'Pushing hard. Full output mode.',   color: modeColor.sprint },
                    { mode: 'steady' as PaceMode,   icon: '⚡', label: 'Steady',   desc: 'Consistent pace. Default mode.',    color: modeColor.steady },
                    { mode: 'recovery' as PaceMode, icon: '🌿', label: 'Recovery', desc: 'Taking it easy. Light engagement.', color: modeColor.recovery },
                  ] as { mode: PaceMode; icon: string; label: string; desc: string; color: string }[]).map(({ mode, icon, label, desc, color }) => {
                    const isActive = activeMode === mode;
                    return (
                      <TouchableOpacity
                        key={mode}
                        style={[
                          styles.paceCard,
                          isActive && { borderColor: color + '70', backgroundColor: color + '12' },
                        ]}
                        onPress={() => setPaceMode(mode)}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={`Set pace to ${label}: ${desc}`}
                        accessibilityState={{ selected: isActive }}
                      >
                        <Text style={styles.paceCardIcon}>{icon}</Text>
                        <Text style={[styles.paceCardLabel, isActive && { color }]}>
                          {label}
                        </Text>
                        <Text style={styles.paceCardDesc} numberOfLines={2}>{desc}</Text>
                        {isActive && (
                          <View style={[styles.paceCardCheck, { backgroundColor: color }]}>
                            <Text style={styles.paceCardCheckText}>✓</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            );
          })()}
        </View>

        {/* Achievements */}
        {(unlockedAchievements.length > 0 || lockedAchievements.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ACHIEVEMENTS</Text>
            {unlockedAchievements.length === 0 && outputs.length === 0 && (
              <View style={styles.card}>
                <Text style={styles.emptyText}>
                  Log your first output to unlock achievements 🏅
                </Text>
              </View>
            )}
            <View style={styles.achievementsGrid}>
              {unlockedAchievements.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  onPress={() => setSelectedAchievement(a)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`${a.title} achievement, unlocked — ${a.description}`}
                >
                  <AchievementBadge achievement={a} unlocked />
                </TouchableOpacity>
              ))}
              {lockedAchievements.slice(0, 4).map((a) => {
                // ISSUE-008: pass progress so the badge renders a mini progress bar
                const prog = getAchievementProgress(a.id, outputs, userSkills, user);
                return (
                  <TouchableOpacity
                    key={a.id}
                    onPress={() => setSelectedAchievement(a)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`${a.title} achievement, locked — ${prog.current} of ${prog.required} ${prog.label}`}
                  >
                    <AchievementBadge
                      achievement={a}
                      unlocked={false}
                      progress={{ current: prog.current, required: prog.required }}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Output Gallery */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>YOUR OUTPUTS</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {outputs.length > 0 && (
                <Text style={styles.outputCount}>{outputs.length} total</Text>
              )}
              <TouchableOpacity
                style={styles.portfolioBtn}
                onPress={() => navigation.navigate('Portfolio')}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="View portfolio"
              >
                <Text style={styles.portfolioBtnText}>📂 Portfolio</Text>
              </TouchableOpacity>
            </View>
          </View>

          {outputs.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.emptyText}>
                No outputs yet. Log what you build to track your proof-of-work 🔨
              </Text>
            </View>
          ) : (
            <>
              {/* Type filter chips — only show types with at least one output */}
              {(() => {
                const typesWithOutputs = Array.from(new Set(outputs.map(o => o.type)))
                  .filter(t => t in OUTPUT_TYPE_META);
                if (typesWithOutputs.length < 2) return null;
                return (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.filterChipsScroll}
                    contentContainerStyle={styles.filterChipsContent}
                  >
                    <TouchableOpacity
                      style={[styles.filterChip, outputTypeFilter === null && styles.filterChipActive]}
                      onPress={() => setOutputTypeFilter(null)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel="Show all output types"
                      accessibilityState={{ selected: outputTypeFilter === null }}
                    >
                      <Text style={[styles.filterChipText, outputTypeFilter === null && styles.filterChipTextActive]}>
                        All
                      </Text>
                    </TouchableOpacity>
                    {typesWithOutputs.map(type => {
                      const meta = OUTPUT_TYPE_META[type] ?? { icon: '📦', label: 'Output' };
                      const isActive = outputTypeFilter === type;
                      return (
                        <TouchableOpacity
                          key={type}
                          style={[styles.filterChip, isActive && styles.filterChipActive]}
                          onPress={() => setOutputTypeFilter(isActive ? null : type)}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel={`Filter by ${meta.label}${isActive ? ', active' : ''}`}
                          accessibilityState={{ selected: isActive }}
                        >
                          <Text style={styles.filterChipIcon}>{meta.icon}</Text>
                          <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                            {meta.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                );
              })()}

              {/* Gesture hint */}
              <Text style={styles.deleteHint}>Tap to view · Hold to delete</Text>

              <View style={styles.outputsList}>
                {[...outputs]
                  .reverse()
                  .filter(o => outputTypeFilter === null || o.type === outputTypeFilter)
                  .map((output) => {
                    const meta = OUTPUT_TYPE_META[output.type] ?? { icon: '📦', label: 'Output' };
                    const evTier = output.evidenceTier ?? getEvidenceTier(output.link, output.description);
                    const evConfig = evTier === 'verified'
                      ? { icon: '🔗', color: Colors.success }
                      : evTier === 'documented'
                      ? { icon: '📝', color: Colors.primaryLight }
                      : null; // don't show a pill for 'logged'
                    return (
                      <TouchableOpacity
                        key={output.id}
                        style={styles.outputCard}
                        onPress={() => setSelectedOutput(output)}
                        onLongPress={() => setOutputToDelete(output)}
                        delayLongPress={400}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel={`${output.title} — ${meta.label}. Tap to view, hold to delete.`}
                        accessibilityHint="Tap to view details, long press to delete"
                      >
                        <View style={styles.outputIconBox}>
                          <Text style={styles.outputIcon}>{meta.icon}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.outputTitle} numberOfLines={1}>
                            {output.title}
                          </Text>
                          <Text style={styles.outputMeta}>
                            {[meta.label, output.skillName || null, timeAgo(output.createdAt)].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                        {evConfig && (
                          <View style={[styles.evidencePill, { borderColor: evConfig.color + '40', backgroundColor: evConfig.color + '12' }]}>
                            <Text style={[styles.evidencePillText, { color: evConfig.color }]}>{evConfig.icon}</Text>
                          </View>
                        )}
                        <View style={styles.outputXpBadge}>
                          <Text style={styles.outputXp}>+{output.xpGained}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                {outputTypeFilter !== null &&
                  outputs.filter(o => o.type === outputTypeFilter).length === 0 && (
                    <View style={styles.card}>
                      <Text style={styles.emptyText}>
                        No {OUTPUT_TYPE_META[outputTypeFilter]?.label ?? 'outputs'} logged yet.
                      </Text>
                    </View>
                  )}
              </View>
            </>
          )}
        </View>

        {/* ── Career Outcomes ─────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>CAREER OUTCOMES</Text>
              {careerOutcomes.length > 0 && (
                <Text style={styles.outcomeCount}>{careerOutcomes.length} win{careerOutcomes.length !== 1 ? 's' : ''} logged</Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.outcomeAddBtn}
              onPress={() => setShowOutcomeModal(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Log a career outcome"
            >
              <Text style={styles.outcomeAddBtnText}>+ Log a Win</Text>
            </TouchableOpacity>
          </View>

          {careerOutcomes.length === 0 ? (
            <View style={styles.outcomeEmptyState}>
              <Text style={styles.outcomeEmptyIcon}>🏆</Text>
              <Text style={styles.outcomeEmptyTitle}>Track your real-world wins</Text>
              <Text style={styles.outcomeEmptyBody}>
                Got an interview? Landed an offer? Earned a cert? Log it here — this is the proof that MaglakbAI is working.
              </Text>
              <TouchableOpacity
                style={styles.outcomeEmptyCTA}
                onPress={() => setShowOutcomeModal(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.outcomeEmptyCTAText}>Log Your First Win →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.outcomeList}>
              {careerOutcomes.map((outcome) => {
                const meta = OUTCOME_META[outcome.type];
                return (
                  <TouchableOpacity
                    key={outcome.id}
                    style={styles.outcomeCard}
                    onLongPress={() => setOutcomeToDelete(outcome)}
                    delayLongPress={400}
                    activeOpacity={0.85}
                    accessibilityLabel={`${meta.label}: ${outcome.title}. Hold to delete.`}
                  >
                    <View style={[styles.outcomeIconBox, { backgroundColor: meta.color + '20', borderColor: meta.color + '40' }]}>
                      <Text style={styles.outcomeIcon}>{meta.icon}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={styles.outcomeCardTopRow}>
                        <Text style={[styles.outcomeTypePill, { color: meta.color }]}>{meta.label.toUpperCase()}</Text>
                      </View>
                      <Text style={styles.outcomeTitle} numberOfLines={1}>{outcome.title}</Text>
                      {outcome.company ? (
                        <Text style={styles.outcomeMeta}>{outcome.company} · {outcome.date}</Text>
                      ) : (
                        <Text style={styles.outcomeMeta}>{outcome.date}</Text>
                      )}
                      {outcome.note ? (
                        <Text style={styles.outcomeNote} numberOfLines={2}>{outcome.note}</Text>
                      ) : null}
                    </View>
                    <View style={[styles.outcomeXpBadge, { backgroundColor: meta.color + '15', borderColor: meta.color + '30' }]}>
                      <Text style={[styles.outcomeXp, { color: meta.color }]}>+{outcome.xpAwarded}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Reset */}
        <TouchableOpacity style={styles.resetBtn} onPress={resetApp}>
          <Text style={styles.resetText}>Reset & Start Over</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Avatar Picker Modal */}
      <Modal visible={showAvatarPicker} transparent animationType="slide" onRequestClose={() => setShowAvatarPicker(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowAvatarPicker(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHandle} />
              <Text style={styles.pickerTitle}>Choose Your Avatar</Text>

              {/* Photo upload option */}
              <TouchableOpacity style={styles.photoUploadBtn} onPress={handleChoosePhoto} activeOpacity={0.8}>
                <View style={styles.photoUploadIcon}>
                  <Text style={{ fontSize: 22 }}>📷</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.photoUploadLabel}>Upload a Photo</Text>
                  <Text style={styles.photoUploadSub}>Use your own picture</Text>
                </View>
                {user.avatarUri && (
                  <Image source={{ uri: user.avatarUri }} style={styles.photoUploadPreview} />
                )}
              </TouchableOpacity>

              <View style={styles.avatarDivider}>
                <View style={styles.avatarDividerLine} />
                <Text style={styles.avatarDividerText}>or choose an emoji</Text>
                <View style={styles.avatarDividerLine} />
              </View>

              <View style={styles.emojiGrid}>
                {AVATAR_EMOJIS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={[styles.emojiOption, !user.avatarUri && user.avatarEmoji === emoji && styles.emojiOptionSelected]}
                    onPress={() => { updateAvatar(emoji); setShowAvatarPicker(false); }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.emojiOptionText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ height: 24 }} />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Share Sheet */}
      <Modal
        visible={showShareSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowShareSheet(false)}
      >
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowShareSheet(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHandle} />
              <Text style={styles.pickerTitle}>Share Your Progress</Text>

              <TouchableOpacity style={styles.shareOptionBtn} onPress={copyShareText} activeOpacity={0.8}>
                <Text style={styles.shareOptionIcon}>📋</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shareOptionLabel}>Copy to Clipboard</Text>
                  <Text style={styles.shareOptionSub}>Paste anywhere</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.shareOptionBtn} onPress={shareOnLinkedIn} activeOpacity={0.8}>
                <Text style={styles.shareOptionIcon}>💼</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shareOptionLabel}>Share on LinkedIn</Text>
                  <Text style={styles.shareOptionSub}>Opens LinkedIn composer</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.shareOptionBtn} onPress={shareOnFacebook} activeOpacity={0.8}>
                <Text style={styles.shareOptionIcon}>👥</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shareOptionLabel}>Share on Facebook</Text>
                  <Text style={styles.shareOptionSub}>Opens Facebook sharing</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.shareOptionBtn} onPress={shareOnTwitter} activeOpacity={0.8}>
                <Text style={styles.shareOptionIcon}>🐦</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shareOptionLabel}>Share on Twitter / X</Text>
                  <Text style={styles.shareOptionSub}>Opens with pre-filled text</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.shareCancelBtn} onPress={() => setShowShareSheet(false)} activeOpacity={0.7}>
                <Text style={styles.shareCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Achievement Detail Modal */}
      <Modal
        visible={!!selectedAchievement}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedAchievement(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setSelectedAchievement(null)}
        >
          {selectedAchievement && (() => {
            const isUnlocked = unlockedAchievementIds.includes(selectedAchievement.id);
            const rarity = RarityColors[selectedAchievement.rarity];
            const prog = getAchievementProgress(selectedAchievement.id, outputs, userSkills, user);
            const pct = prog.required > 0 ? Math.min(100, Math.round((prog.current / prog.required) * 100)) : 0;
            return (
              <TouchableOpacity activeOpacity={1} onPress={() => {}}>
                <View style={styles.pickerSheet}>
                  <View style={styles.pickerHandle} />

                  {/* Icon */}
                  <View style={[styles.achIconWrap, { backgroundColor: rarity.color + '18', borderColor: rarity.color + '40' }]}>
                    <Text style={styles.achIcon}>{isUnlocked ? selectedAchievement.icon : '🔒'}</Text>
                  </View>

                  {/* Rarity */}
                  <View style={[styles.achRarityBadge, { backgroundColor: rarity.color + '18', borderColor: rarity.color + '40' }]}>
                    <Text style={[styles.achRarityText, { color: rarity.color }]}>{rarity.label}</Text>
                  </View>

                  {/* Title & description */}
                  <Text style={styles.achTitle}>{selectedAchievement.title}</Text>
                  <Text style={styles.achDesc}>{selectedAchievement.description}</Text>

                  {/* Progress bar (locked only) */}
                  {!isUnlocked && prog.required > 0 && (
                    <View style={styles.achProgressSection}>
                      <View style={styles.achProgressBarBg}>
                        <View
                          style={[
                            styles.achProgressBarFill,
                            { width: `${pct}%` as any, backgroundColor: rarity.color },
                          ]}
                        />
                      </View>
                      <Text style={styles.achProgressLabel}>
                        {prog.current.toLocaleString()} / {prog.required.toLocaleString()} {prog.label}
                      </Text>
                    </View>
                  )}

                  {/* XP reward */}
                  <View style={styles.achXPRow}>
                    <Text style={styles.achXPLabel}>XP Reward</Text>
                    <View style={styles.achXPBadge}>
                      <Text style={styles.achXPValue}>+{selectedAchievement.xpGranted} XP</Text>
                    </View>
                  </View>

                  {isUnlocked && (
                    <Text style={styles.achUnlockedTag}>✓ Unlocked</Text>
                  )}

                  <View style={{ height: 32 }} />
                </View>
              </TouchableOpacity>
            );
          })()}
        </TouchableOpacity>
      </Modal>

      {/* Output Detail Modal */}
      <Modal
        visible={!!selectedOutput}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedOutput(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setSelectedOutput(null)}
        >
          {selectedOutput && (() => {
            const meta = OUTPUT_TYPE_META[selectedOutput.type] ?? { icon: '📦', label: 'Output' };
            return (
              <TouchableOpacity activeOpacity={1} onPress={() => {}}>
                <View style={styles.pickerSheet}>
                  <View style={styles.pickerHandle} />

                  {/* Type badge */}
                  <View style={styles.outputDetailTypeBadge}>
                    <Text style={styles.outputDetailTypeIcon}>{meta.icon}</Text>
                    <Text style={styles.outputDetailTypeLabel}>{meta.label}</Text>
                  </View>

                  {/* Title */}
                  <Text style={styles.outputDetailTitle}>{selectedOutput.title}</Text>

                  {/* Skill + XP row */}
                  <View style={styles.outputDetailMeta}>
                    {selectedOutput.skillName ? (
                      <View style={styles.outputDetailSkillChip}>
                        <Text style={styles.outputDetailSkillText}>🎯 {selectedOutput.skillName}</Text>
                      </View>
                    ) : null}
                    <View style={styles.outputDetailXpChip}>
                      <Text style={styles.outputDetailXpText}>+{selectedOutput.xpGained} XP</Text>
                    </View>
                  </View>

                  {/* Description */}
                  {selectedOutput.description ? (
                    <View style={styles.outputDetailSection}>
                      <Text style={styles.outputDetailSectionLabel}>DESCRIPTION</Text>
                      <Text style={styles.outputDetailBody}>{selectedOutput.description}</Text>
                    </View>
                  ) : null}

                  {/* Key takeaway */}
                  {selectedOutput.keyTakeaway ? (
                    <View style={styles.outputDetailSection}>
                      <Text style={styles.outputDetailSectionLabel}>KEY TAKEAWAY</Text>
                      <Text style={styles.outputDetailBody}>💡 {selectedOutput.keyTakeaway}</Text>
                    </View>
                  ) : null}

                  {/* Link */}
                  {selectedOutput.link ? (
                    <View style={styles.outputDetailSection}>
                      <Text style={styles.outputDetailSectionLabel}>LINK</Text>
                      <Text style={styles.outputDetailLink} numberOfLines={1}>{selectedOutput.link}</Text>
                    </View>
                  ) : null}

                  {/* Date */}
                  <Text style={styles.outputDetailDate}>
                    Logged {timeAgo(selectedOutput.createdAt)}
                  </Text>

                  {/* Delete shortcut */}
                  <TouchableOpacity
                    style={styles.outputDetailDeleteBtn}
                    onPress={() => {
                      setSelectedOutput(null);
                      setOutputToDelete(selectedOutput);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.outputDetailDeleteText}>🗑️ Delete Output</Text>
                  </TouchableOpacity>

                  <View style={{ height: 24 }} />
                </View>
              </TouchableOpacity>
            );
          })()}
        </TouchableOpacity>
      </Modal>

      {/* ISSUE-003: Delete output confirmation modal */}
      <Modal
        visible={!!outputToDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setOutputToDelete(null)}
      >
        <TouchableOpacity
          style={styles.deleteOverlay}
          activeOpacity={1}
          onPress={() => setOutputToDelete(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.deleteCard}>
            <Text style={styles.deleteCardEmoji}>🗑️</Text>
            <Text style={styles.deleteCardTitle}>Delete Output?</Text>
            <Text style={styles.deleteCardBody} numberOfLines={2}>
              "{outputToDelete?.title}"
            </Text>
            <Text style={styles.deleteCardSub}>
              This will remove −{outputToDelete?.xpGained} XP and may revert skill progress. Cannot be undone.
            </Text>
            <View style={styles.deleteCardActions}>
              <TouchableOpacity
                style={styles.deleteCancelBtn}
                onPress={() => setOutputToDelete(null)}
              >
                <Text style={styles.deleteCancelText}>Keep It</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteConfirmBtn}
                onPress={() => {
                  if (outputToDelete) {
                    deleteOutput(outputToDelete.id);
                    showToast({ message: `Output deleted (−${outputToDelete.xpGained} XP)`, emoji: '🗑️', variant: 'warning' });
                    setOutputToDelete(null);
                  }
                }}
              >
                <Text style={styles.deleteConfirmText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Log Career Outcome Modal ─────────────────────────────── */}
      <Modal visible={showOutcomeModal} transparent animationType="slide" onRequestClose={() => setShowOutcomeModal(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowOutcomeModal(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={styles.outcomeSheet}>
              <View style={styles.pickerHandle} />
              <Text style={styles.outcomeSheetTitle}>Log a Career Win 🏆</Text>
              <Text style={styles.outcomeSheetSub}>Self-report real outcomes. This is the proof MaglakbAI worked.</Text>

              {/* Outcome type grid */}
              <View style={styles.outcomeTypeGrid}>
                {OUTCOME_TYPES.map((type) => {
                  const m = OUTCOME_META[type];
                  const isActive = outcomeType === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.outcomeTypeChip,
                        isActive && { backgroundColor: m.color + '25', borderColor: m.color + '60' },
                        !isActive && { borderColor: Colors.border },
                      ]}
                      onPress={() => setOutcomeType(type)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.outcomeTypeChipIcon}>{m.icon}</Text>
                      <Text style={[styles.outcomeTypeChipLabel, isActive && { color: m.color }]}>{m.label}</Text>
                      <Text style={[styles.outcomeTypeChipXP, isActive && { color: m.color }]}>+{OUTCOME_XP[type]} XP</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Caption */}
              <Text style={styles.outcomeCaption}>{OUTCOME_META[outcomeType].caption}</Text>

              {/* Title */}
              <Text style={styles.outcomeFieldLabel}>TITLE *</Text>
              <TextInput
                style={styles.outcomeInput}
                placeholder={
                  outcomeType === 'interview' ? 'e.g. "Senior Data Engineer at Stripe"' :
                  outcomeType === 'offer' ? 'e.g. "Offer from Snowflake — $185k"' :
                  outcomeType === 'promotion' ? 'e.g. "Promoted to Staff Engineer"' :
                  outcomeType === 'role_change' ? 'e.g. "Joined Databricks as ML Engineer"' :
                  outcomeType === 'certification' ? 'e.g. "AWS Solutions Architect – Associate"' :
                  outcomeType === 'salary_increase' ? 'e.g. "25% raise at annual review"' :
                  outcomeType === 'portfolio' ? 'e.g. "Shipped csv-stats-tool on GitHub"' :
                  'e.g. "First freelance data client"'
                }
                placeholderTextColor={Colors.textMuted}
                value={outcomeTitle}
                onChangeText={setOutcomeTitle}
                autoFocus
              />

              {/* Company (optional) */}
              <Text style={styles.outcomeFieldLabel}>COMPANY / ORG <Text style={styles.outcomeFieldOptional}>(OPTIONAL)</Text></Text>
              <TextInput
                style={styles.outcomeInput}
                placeholder="Where did this happen?"
                placeholderTextColor={Colors.textMuted}
                value={outcomeCompany}
                onChangeText={setOutcomeCompany}
              />

              {/* Note (optional) */}
              <Text style={styles.outcomeFieldLabel}>NOTE <Text style={styles.outcomeFieldOptional}>(OPTIONAL)</Text></Text>
              <TextInput
                style={[styles.outcomeInput, { minHeight: 72, textAlignVertical: 'top' }]}
                placeholder="What led to this? Which skills opened the door?"
                placeholderTextColor={Colors.textMuted}
                value={outcomeNote}
                onChangeText={setOutcomeNote}
                multiline
              />

              {/* Submit */}
              <TouchableOpacity
                style={[
                  styles.outcomeSubmitBtn,
                  { backgroundColor: OUTCOME_META[outcomeType].color },
                  !outcomeTitle.trim() && { opacity: 0.4 },
                ]}
                onPress={handleSubmitOutcome}
                disabled={!outcomeTitle.trim()}
                activeOpacity={0.85}
              >
                <Text style={styles.outcomeSubmitText}>
                  Log It · +{OUTCOME_XP[outcomeType]} XP {OUTCOME_META[outcomeType].icon}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Delete Outcome Confirm ───────────────────────────────── */}
      <Modal visible={!!outcomeToDelete} transparent animationType="fade" onRequestClose={() => setOutcomeToDelete(null)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setOutcomeToDelete(null)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={styles.deleteCard}>
              <Text style={styles.deleteCardTitle}>Remove this outcome?</Text>
              <Text style={styles.deleteCardBody} numberOfLines={2}>
                "{outcomeToDelete?.title}"
              </Text>
              <Text style={styles.deleteCardSub}>
                This will remove −{outcomeToDelete?.xpAwarded} XP. Cannot be undone.
              </Text>
              <View style={styles.deleteCardActions}>
                <TouchableOpacity style={styles.deleteCancelBtn} onPress={() => setOutcomeToDelete(null)}>
                  <Text style={styles.deleteCancelText}>Keep It</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteConfirmBtn}
                  onPress={() => {
                    if (outcomeToDelete) {
                      deleteCareerOutcome(outcomeToDelete.id);
                      showToast({ message: `Outcome removed (−${outcomeToDelete.xpAwarded} XP)`, emoji: '🗑️', variant: 'warning' });
                      setOutcomeToDelete(null);
                    }
                  }}
                >
                  <Text style={styles.deleteConfirmText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (Colors: ColorsType) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  profileHeaderTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: {
    fontSize: 18,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },

  // Identity
  identitySection: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  avatarWrapper: {
    marginBottom: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarGlow: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    opacity: 0.18,
    // @ts-ignore
    boxShadow: '0 0 30px currentColor',
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 40,
  },
  avatarPhoto: {
    width: 83,
    height: 83,
    borderRadius: 42,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: -4,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.bg,
  },
  avatarEditBadgeText: {
    fontSize: 11,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  emojiOption: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryDim,
    // @ts-ignore
    boxShadow: '0 0 8px rgba(124,58,237,0.3)',
  },
  emojiOptionText: {
    fontSize: 26,
  },
  photoUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    padding: 14,
    marginHorizontal: 4,
    marginBottom: 16,
  },
  photoUploadIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoUploadLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  photoUploadSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  photoUploadPreview: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  avatarDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  avatarDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  avatarDividerText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  nameDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  nameEditHint: {
    fontSize: 13,
    backgroundColor: Colors.primary + '25',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  nameEditContainer: {
    width: '85%',
    marginBottom: 3,
  },
  nameInput: {
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.primary + '60',
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  userName: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
  },
  userHandle: {
    fontSize: FontSize.base,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  pathPill: {
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  pathPillText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  publicUrl: {
    fontSize: FontSize.xs,
    color: Colors.primary + 'AA',
    marginTop: 6,
  },
  bioDisplay: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    minWidth: 180,
    alignItems: 'center',
  },
  bioDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bioEditHint: {
    fontSize: 13,
  },
  bioText: {
    fontSize: FontSize.sm,
    color: Colors.textSub,
    textAlign: 'center',
    lineHeight: 20,
  },
  bioPlaceholder: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  bioEditContainer: {
    marginTop: Spacing.sm,
    width: '100%',
    paddingHorizontal: Spacing.md,
  },
  bioInput: {
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.primary + '60',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.text,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  bioEditActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: 6,
  },
  bioCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bioCancelText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  bioSaveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  bioSaveText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.white,
  },

  // Target role
  targetRoleDisplay: {
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    width: '100%',
    alignItems: 'center',
  },
  targetRoleIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  targetRoleText: {
    fontSize: FontSize.sm,
    color: Colors.primaryLight,
    fontWeight: '600',
    lineHeight: 20,
  },
  targetRoleEdit: {
    marginTop: Spacing.sm,
    width: '100%',
    paddingHorizontal: Spacing.md,
  },
  targetRoleEditLabel: {
    fontSize: FontSize.xs,
    color: Colors.primaryLight,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  targetRoleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  targetRoleInput: {
    flex: 1,
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.primary + '60',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    fontSize: FontSize.sm,
    color: Colors.text,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  statValue: {
    fontSize: FontSize.xl,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase', // UX-019: match the ALL-CAPS stat-label convention used on Home
  },
  statWeekNote: {
    fontSize: 9,
    color: Colors.success,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.border,
  },

  // Sections
  section: {
    marginBottom: Spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 3,
  },
  outputCount: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  portfolioBtn: {
    backgroundColor: Colors.primary + '20',
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.primary + '45',
  },
  portfolioBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primaryLight,
  },

  // Output filter chips
  filterChipsScroll: {
    marginBottom: Spacing.sm,
  },
  filterChipsContent: {
    gap: 6,
    paddingVertical: 2,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primaryDim,
    borderColor: Colors.primary,
  },
  filterChipIcon: {
    fontSize: 12,
  },
  filterChipText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  filterChipTextActive: {
    color: Colors.primaryLight,
  },

  // Level card
  levelCard: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
    alignItems: 'center',
    // @ts-ignore - web-only gradient
    backgroundImage: 'linear-gradient(135deg, rgba(124,58,237,0.10), rgba(79,70,229,0.05))',
  },
  levelCardLeft: {
    flex: 1,
  },
  levelNumber: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 2,
  },
  levelTitleText: {
    fontSize: FontSize.base,
    color: Colors.primaryLight,
    fontWeight: '600',
  },
  levelCardRight: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringWrapper: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSub,
  },

  // XP Sources breakdown
  xpSourcesCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 8,
  },
  xpSourcesTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  xpSourcesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  xpSourceItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  xpSourceIcon: {
    fontSize: 16,
  },
  xpSourceLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  xpSourceValue: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.gold,
  },
  xpSourceDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.border,
    marginHorizontal: 4,
  },

  // Card
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Evolution
  evolutionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  evolutionPathName: {
    fontSize: FontSize.base,
    fontWeight: '600',
  },
  evolutionPct: {
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  evolutionBarBg: {
    height: 7,
    backgroundColor: Colors.border,
    borderRadius: 4,
    marginBottom: 6,
    overflow: 'hidden',
  },
  evolutionBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  evolutionMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },

  // Mastery Framework
  masteryHeaderBlock: {
    marginBottom: 14,
  },
  masteryTitleBadge: {
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    marginBottom: 6,
  },
  masteryTitleBadgeText: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  masteryDescription: {
    fontSize: FontSize.sm,
    color: Colors.textSub,
    marginBottom: 4,
  },
  masteryNextStep: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  masteryLadder: {
    gap: 3,
    marginBottom: 14,
  },
  masteryTierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  masteryTierDot: {
    fontSize: 11,
    width: 14,
    textAlign: 'center',
  },
  masteryTierName: {
    flex: 1,
    fontSize: FontSize.sm,
  },
  masteryYouLabel: {
    fontSize: 11,
    fontStyle: 'italic',
    fontWeight: '600',
  },
  masteryDistRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
    marginTop: 2,
  },
  masteryDistItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  masteryDistCount: {
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  masteryDistLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  masteryDistDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },

  // Pace Mode
  paceSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  paceSectionSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
    lineHeight: 17,
  },
  paceActiveBadge: {
    backgroundColor: '#10B98118',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#10B98135',
  },
  paceActiveBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#6EE7B7',
    letterSpacing: 0.5,
  },
  paceCards: {
    flexDirection: 'row',
    gap: 8,
  },
  paceCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 10,
    alignItems: 'center',
    gap: 4,
    position: 'relative',
  },
  paceCardActive: {
    borderColor: Colors.primaryLight + '60',
    backgroundColor: Colors.primaryDim,
  },
  paceCardIcon: { fontSize: 20 },
  paceCardLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSub,
  },
  paceCardLabelActive: {
    color: Colors.primaryLight,
  },
  paceCardDesc: {
    fontSize: 9,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 13,
  },
  paceCardCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paceCardCheckText: {
    fontSize: 8,
    fontWeight: '900',
    color: Colors.white,
  },

  // Achievements
  achievementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  // Outputs
  outputsList: {
    gap: 8,
  },
  outputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  outputIconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: Colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    flexShrink: 0,
  },
  outputIcon: {
    fontSize: 18,
  },
  outputTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  outputMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  outputXpBadge: {
    backgroundColor: Colors.goldDim,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.gold + '30',
    flexShrink: 0,
  },
  outputXp: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.gold,
  },
  evidencePill: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
    marginRight: 4,
  },
  evidencePillText: {
    fontSize: 12,
  },

  // ── Career Outcomes ──────────────────────────────────────────────────────────
  outcomeCount: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500',
    marginTop: 2,
  },
  outcomeAddBtn: {
    backgroundColor: Colors.primary + '20',
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  outcomeAddBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primaryLight,
  },
  outcomeEmptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: 8,
  },
  outcomeEmptyIcon: {
    fontSize: 36,
    marginBottom: 4,
  },
  outcomeEmptyTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
  },
  outcomeEmptyBody: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: Spacing.md,
  },
  outcomeEmptyCTA: {
    marginTop: 4,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
  },
  outcomeEmptyCTAText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.white,
  },
  outcomeList: {
    gap: 10,
  },
  outcomeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  outcomeIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  outcomeIcon: {
    fontSize: 20,
  },
  outcomeCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  outcomeTypePill: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  outcomeTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  outcomeMeta: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  outcomeNote: {
    fontSize: 10,
    color: Colors.textSub,
    lineHeight: 14,
    marginTop: 2,
  },
  outcomeXpBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    flexShrink: 0,
  },
  outcomeXp: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },

  // ── Outcome Modal ────────────────────────────────────────────────────────────
  outcomeSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    padding: Spacing.lg,
    paddingBottom: 40,
    gap: 12,
    // @ts-ignore
    boxShadow: '0 -12px 48px rgba(0,0,0,0.5)',
    maxHeight: '90%',
  },
  outcomeSheetTitle: {
    fontSize: FontSize.lg,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'center',
    marginTop: 4,
  },
  outcomeSheetSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
  },
  outcomeTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  outcomeTypeChip: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: Colors.cardAlt,
    borderRadius: Radius.md,
    padding: 10,
    borderWidth: 1,
  },
  outcomeTypeChipIcon: {
    fontSize: 16,
  },
  outcomeTypeChipLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text,
  },
  outcomeTypeChipXP: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  outcomeCaption: {
    fontSize: FontSize.xs,
    color: Colors.primaryLight,
    fontWeight: '500',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  outcomeFieldLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 1,
    marginBottom: -6,
  },
  outcomeFieldOptional: {
    color: Colors.textMuted,
    fontWeight: '400',
  },
  outcomeInput: {
    backgroundColor: Colors.cardAlt,
    borderRadius: Radius.md,
    padding: 12,
    fontSize: FontSize.sm,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  outcomeSubmitBtn: {
    borderRadius: Radius.full,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  outcomeSubmitText: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.white,
  },

  // Shared modal chrome (used by avatar picker + achievement detail)
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl,
    paddingTop: 12, paddingHorizontal: Spacing.md, maxHeight: '75%',
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.border,
  },
  pickerHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.sm,
  },
  pickerTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text, marginBottom: 4 },

  // Reset
  resetBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
  },
  resetText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textDecorationLine: 'underline',
  },

  // Share button
  shareBtn: {
    marginTop: Spacing.md,
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.primary + '50',
    backgroundColor: Colors.primaryDim,
  },
  shareBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.primaryLight,
  },

  // Share sheet options
  shareOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.cardAlt,
    borderRadius: Radius.lg,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  shareOptionIcon: { fontSize: 24 },
  shareOptionLabel: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  shareOptionSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  shareCancelBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginTop: 4,
    marginBottom: Spacing.sm,
  },
  shareCancelText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '600' },

  // Achievement detail modal
  achIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  achIcon: {
    fontSize: 38,
  },
  achRarityBadge: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  achRarityText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  achTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  achDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSub,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  achProgressSection: {
    width: '100%',
    marginBottom: Spacing.md,
    gap: 6,
  },
  achProgressBarBg: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  achProgressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  achProgressLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  achXPRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    backgroundColor: Colors.goldDim,
    borderRadius: Radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.gold + '25',
    marginBottom: Spacing.sm,
  },
  achXPLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSub,
  },
  achXPBadge: {
    backgroundColor: Colors.gold + '20',
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.gold + '40',
  },
  achXPValue: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.gold,
  },
  achUnlockedTag: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.success,
    textAlign: 'center',
  },

  // ISSUE-003: output delete
  deleteHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.xs,
    marginTop: 2,
  },
  deleteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  deleteCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: '#EF444430',
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  deleteCardEmoji: {
    fontSize: 32,
    marginBottom: Spacing.sm,
  },
  deleteCardTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  deleteCardBody: {
    fontSize: FontSize.base,
    color: Colors.textSub,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  deleteCardSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: Spacing.lg,
  },
  deleteCardActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    width: '100%',
  },
  deleteCancelBtn: {
    flex: 1,
    backgroundColor: Colors.cardAlt,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  deleteCancelText: {
    fontSize: FontSize.base,
    fontWeight: '600',
    color: Colors.textSub,
  },
  deleteConfirmBtn: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteConfirmText: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: '#fff',
  },

  // Output detail modal
  outputDetailTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: Colors.cardAlt,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  outputDetailTypeIcon: {
    fontSize: 14,
  },
  outputDetailTypeLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },
  outputDetailTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    lineHeight: 26,
    marginBottom: 10,
  },
  outputDetailMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: Spacing.md,
  },
  outputDetailSkillChip: {
    backgroundColor: Colors.primaryDim,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.primary + '35',
  },
  outputDetailSkillText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.primaryLight,
  },
  outputDetailXpChip: {
    backgroundColor: Colors.goldDim,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.gold + '30',
  },
  outputDetailXpText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.gold,
  },
  outputDetailSection: {
    marginBottom: Spacing.md,
    width: '100%',
  },
  outputDetailSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 5,
  },
  outputDetailBody: {
    fontSize: FontSize.sm,
    color: Colors.textSub,
    lineHeight: 20,
  },
  outputDetailLink: {
    fontSize: FontSize.sm,
    color: Colors.primaryLight,
    lineHeight: 20,
    textDecorationLine: 'underline',
  },
  outputDetailDate: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.md,
  },
  outputDetailDeleteBtn: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#EF444425',
    backgroundColor: '#EF444408',
  },
  outputDetailDeleteText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: '#EF4444',
  },
});

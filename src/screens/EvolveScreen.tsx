import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  SafeAreaView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppStore, CAREER_PATHS, ALL_SKILLS } from '../store/appStore';
import {
  useThemeColors,
  ColorsType,
  Colors,
  Spacing,
  Radius,
  FontSize,
  PathColors,
  getPathColor,
  RarityColors,
  ThemeContext,
} from '../utils/theme';
import { useContext } from 'react';
import { page, track } from '../utils/analytics';
import CareerNode from '../components/CareerNode';
import DemandBadge from '../components/DemandBadge';
import ValidationChallengeModal from '../components/ValidationChallengeModal';
import { CustomSkill, Skill, UserSkill } from '../types';
import { pathHasProgress, isTestOutEligible } from '../domain/skillGraph';
import { uid } from '../utils/uid';
import { VALIDATION_BONUS_XP, MAX_TESTOUT_ATTEMPTS, TESTOUT_QUESTION_COUNT } from '../domain/progression';
import { getPathDemandLabel, DEMAND_SOURCE_LABEL } from '../data/marketDemand';

const PALETTE = ['#7C3AED', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#F97316'];
const ICON_OPTIONS = ['🎯', '📚', '🎨', '🏋️', '🎵', '🗣️', '✍️', '🔬', '🌍', '💼', '🍳', '📸', '🎭', '⚽', '🧘', '💡'];

function getSkillStreak(skillId: string, outputs: Array<{ skillId: string; createdAt: string }>): number {
  const skillDates = new Set(
    outputs.filter(o => o.skillId === skillId).map(o => o.createdAt.slice(0, 10))
  );
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 60; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (skillDates.has(d.toISOString().slice(0, 10))) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// ── Catalog selection (built-in paths) ──────────────────────────────────────

const PATH_CATEGORIES = [
  {
    label: 'Data & AI',
    pathIds: ['data-architect', 'data-engineer', 'ai-engineer', 'ml-engineer', 'data-analyst'],
  },
  {
    label: 'Engineering',
    pathIds: ['fullstack', 'backend-engineer', 'frontend-engineer', 'mobile-developer', 'cloud-engineer', 'devops'],
  },
  {
    label: 'Security & Architecture',
    pathIds: ['cybersecurity', 'solutions-architect', 'software-architect'],
  },
  {
    label: 'Business & Strategy',
    pathIds: ['product-manager', 'business-analyst', 'project-manager', 'ui-ux-designer', 'startup-founder'],
  },
];

function CatalogModal({
  visible,
  enrolledPathIds,
  onSelect,
  onClose,
}: {
  visible: boolean;
  enrolledPathIds: string[];
  onSelect: (pathId: string) => void;
  onClose: () => void;
}) {
  const Colors = useThemeColors();
  const catalog = makeCatalog(Colors);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={catalog.container}>
        <View style={catalog.header}>
          <TouchableOpacity onPress={onClose} style={catalog.cancelBtn}>
            <Text style={catalog.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={catalog.headerTitle}>Career Paths</Text>
          <View style={{ width: 60 }} />
        </View>
        <Text style={catalog.sub}>Select a path to add as a Secondary Roadmap.</Text>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={catalog.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {PATH_CATEGORIES.map(cat => (
            <View key={cat.label}>
              <Text style={catalog.catLabel}>{cat.label.toUpperCase()}</Text>
              {cat.pathIds.map(pid => {
                const path = CAREER_PATHS.find(p => p.id === pid);
                if (!path) return null;
                const pc = PathColors[pid] ?? { primary: '#7C3AED', text: '#C4B5FD', dim: 'rgba(124,58,237,0.08)' };
                const alreadyEnrolled = enrolledPathIds.includes(pid);
                return (
                  <TouchableOpacity
                    key={pid}
                    style={[catalog.pathRow, alreadyEnrolled && catalog.pathRowEnrolled]}
                    onPress={() => !alreadyEnrolled && onSelect(pid)}
                    activeOpacity={alreadyEnrolled ? 1 : 0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`${path.name}${alreadyEnrolled ? ', already enrolled' : ''}`}
                    accessibilityState={{ disabled: alreadyEnrolled }}
                  >
                    <View style={[catalog.pathIcon, { backgroundColor: pc.primary + '18' }]}>
                      <Text style={catalog.pathIconText}>{path.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[catalog.pathName, alreadyEnrolled && { color: Colors.textMuted }]}>
                        {path.name}
                      </Text>
                      <Text style={catalog.pathDesc} numberOfLines={1}>{path.description}</Text>
                      {/* Demand label + source attribution */}
                      {(() => {
                        const { label, sentiment } = getPathDemandLabel(pid);
                        if (!label) return null;
                        return (
                          <View style={catalog.demandBlock}>
                            <Text style={[
                              catalog.demandLine,
                              sentiment === 'growing' && { color: '#FCD34D' },
                            ]}>
                              {label}
                            </Text>
                            <Text style={catalog.demandSource}>
                              Based on {DEMAND_SOURCE_LABEL}
                            </Text>
                          </View>
                        );
                      })()}
                    </View>
                    {alreadyEnrolled ? (
                      <View style={catalog.enrolledBadge}>
                        <Text style={catalog.enrolledBadgeText}>ENROLLED</Text>
                      </View>
                    ) : (
                      <Text style={[catalog.addText, { color: pc.primary }]}>+ Add</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Custom roadmap creation modal ────────────────────────────────────────────

function AddCustomModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const Colors = useThemeColors();
  const modal = makeModal(Colors);
  const addCustomPath = useAppStore((s) => s.addCustomPath);
  const enrollInRoadmap = useAppStore((s) => s.enrollInRoadmap);
  const switchPath = useAppStore((s) => s.switchPath);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🎯');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const [skills, setSkills] = useState<CustomSkill[]>([{ id: uid('s'), name: '', description: '', icon: '⭐' }]);
  const [step, setStep] = useState(0);

  const reset = () => {
    setName(''); setIcon('🎯'); setDescription(''); setColor(PALETTE[0]);
    setSkills([{ id: uid('s'), name: '', description: '', icon: '⭐' }]);
    setStep(0);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleCreate = () => {
    const validSkills = skills.filter(s => s.name.trim()).map((s, i) => ({
      ...s,
      id: uid('custom_skill'),
      name: s.name.trim(),
    }));
    if (!name.trim() || validSkills.length === 0) return;
    const newPath = { name: name.trim(), icon, description: description.trim(), color, skills: validSkills };
    const newPathId = addCustomPath(newPath);
    switchPath(newPathId);
    handleClose();
  };

  const addSkill = () => setSkills(prev => [...prev, { id: uid('s'), name: '', description: '', icon: '⭐' }]);
  const updateSkill = (index: number, val: string) => setSkills(prev => prev.map((s, i) => i === index ? { ...s, name: val } : s));
  const removeSkill = (index: number) => setSkills(prev => prev.filter((_, i) => i !== index));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <SafeAreaView style={modal.container}>
          <View style={modal.header}>
            <TouchableOpacity onPress={handleClose} style={modal.cancelBtn}>
              <Text style={modal.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={modal.headerTitle}>Custom Roadmap</Text>
            <View style={{ width: 60 }} />
          </View>

          <View style={modal.steps}>
            {['Basics', 'Milestones'].map((label, i) => (
              <TouchableOpacity key={i} onPress={() => step > i && setStep(i)} style={modal.stepItem}>
                <View style={[modal.stepDot, i === step && modal.stepDotActive, i < step && modal.stepDotDone]}>
                  <Text style={[modal.stepDotText, i <= step && modal.stepDotTextActive]}>{i + 1}</Text>
                </View>
                <Text style={[modal.stepLabel, i === step && modal.stepLabelActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
            <View style={modal.stepLine} />
          </View>

          <ScrollView style={modal.scroll} contentContainerStyle={modal.scrollContent} showsVerticalScrollIndicator={false}>
            {step === 0 && (
              <View style={modal.stepContent}>
                <Text style={modal.fieldLabel}>ICON</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={modal.iconScroll}>
                  {ICON_OPTIONS.map(ic => (
                    <TouchableOpacity
                      key={ic}
                      style={[modal.iconOption, ic === icon && modal.iconOptionSelected]}
                      onPress={() => setIcon(ic)}
                    >
                      <Text style={modal.iconOptionText}>{ic}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={modal.fieldLabel}>ROADMAP NAME</Text>
                <TextInput
                  style={modal.input}
                  placeholder="e.g. Become a Lawyer, Learn Piano, CPA Exam..."
                  placeholderTextColor={Colors.textMuted}
                  value={name}
                  onChangeText={setName}
                  autoCorrect={false}
                />

                <Text style={modal.fieldLabel}>DESCRIPTION (optional)</Text>
                <TextInput
                  style={[modal.input, modal.inputMulti]}
                  placeholder="What do you want to achieve?"
                  placeholderTextColor={Colors.textMuted}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                />

                <Text style={modal.fieldLabel}>COLOR</Text>
                <View style={modal.colorRow}>
                  {PALETTE.map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[modal.colorSwatch, { backgroundColor: c }, c === color && modal.colorSwatchSelected]}
                      onPress={() => setColor(c)}
                    />
                  ))}
                </View>

                <TouchableOpacity
                  style={[modal.nextBtn, !name.trim() && modal.btnDisabled]}
                  onPress={() => name.trim() && setStep(1)}
                  activeOpacity={0.85}
                >
                  <Text style={modal.nextBtnText}>Next: Add Milestones →</Text>
                </TouchableOpacity>
              </View>
            )}

            {step === 1 && (
              <View style={modal.stepContent}>
                <Text style={modal.stepHint}>
                  Break your roadmap into milestones. Each is a checkpoint on your journey.
                </Text>

                {skills.map((skill, i) => (
                  <View key={skill.id} style={modal.skillRow}>
                    <View style={[modal.skillNumber, { backgroundColor: color + '30', borderColor: color + '60' }]}>
                      <Text style={[modal.skillNumberText, { color }]}>{i + 1}</Text>
                    </View>
                    <TextInput
                      style={modal.skillInput}
                      placeholder={`Milestone ${i + 1}...`}
                      placeholderTextColor={Colors.textMuted}
                      value={skill.name}
                      onChangeText={v => updateSkill(i, v)}
                    />
                    {skills.length > 1 && (
                      <TouchableOpacity onPress={() => removeSkill(i)} style={modal.removeSkillBtn}>
                        <Text style={modal.removeSkillText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

                <TouchableOpacity style={modal.addSkillBtn} onPress={addSkill} activeOpacity={0.8}>
                  <Text style={modal.addSkillBtnText}>+ Add milestone</Text>
                </TouchableOpacity>

                <View style={{ height: Spacing.xl }} />

                <View style={[modal.previewCard, { borderColor: color + '60', backgroundColor: color + '12' }]}>
                  <Text style={modal.previewIcon}>{icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[modal.previewName, { color }]}>{name || 'Your Roadmap'}</Text>
                    <Text style={modal.previewMeta}>{skills.filter(s => s.name.trim()).length} milestones · 0% complete</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[modal.createBtn, { backgroundColor: color }, skills.filter(s => s.name.trim()).length === 0 && modal.btnDisabled]}
                  onPress={handleCreate}
                  activeOpacity={0.85}
                >
                  <Text style={modal.createBtnText}>Create Roadmap ⚡</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Priority confirmation modal ───────────────────────────────────────────────

function PriorityConfirmModal({
  visible,
  newPathId,
  onConfirm,
  onDismiss,
}: {
  visible: boolean;
  newPathId: string | null;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const Colors = useThemeColors();
  const confirm = makeConfirm(Colors);
  const path = newPathId
    ? (CAREER_PATHS.find(p => p.id === newPathId) ?? null)
    : null;
  const pc = newPathId ? (PathColors[newPathId] ?? { primary: '#7C3AED', text: '#C4B5FD' }) : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={confirm.overlay}>
        <View style={confirm.sheet}>
          <Text style={confirm.emoji}>🎯</Text>
          <Text style={confirm.title}>Change Priority Roadmap?</Text>
          <Text style={confirm.body}>
            Focused learning produces better long-term results. Changing your priority roadmap will shift your learning plan, recommendations, milestones, and practice sessions.
          </Text>
          {path && pc && (
            <View style={[confirm.pathPreview, { backgroundColor: pc.primary + '15', borderColor: pc.primary + '40' }]}>
              <Text style={confirm.pathPreviewIcon}>{path.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[confirm.pathPreviewName, { color: pc.primary }]}>{path.name}</Text>
                <Text style={confirm.pathPreviewSub}>Will become your new Priority Roadmap</Text>
              </View>
            </View>
          )}
          <Text style={confirm.question}>Are you sure you want to change your primary goal?</Text>
          <TouchableOpacity style={[confirm.btn, confirm.btnConfirm]} onPress={onConfirm} activeOpacity={0.85}>
            <Text style={confirm.btnConfirmText}>Yes, Change Priority</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[confirm.btn, confirm.btnStay]} onPress={onDismiss} activeOpacity={0.85}>
            <Text style={confirm.btnStayText}>Stay Focused — Keep Current Priority</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Focus Check Modal ─────────────────────────────────────────────────────────
// Fires when user tries to add a 4th active secondary roadmap (>3 = overwhelm risk).

interface FocusCheckPath { pathId: string; name: string; icon: string; pct: number; color: string }

function FocusCheckModal({
  visible,
  activeSecondaryPaths,
  onProceed,
  onDismiss,
  onArchive,
}: {
  visible: boolean;
  activeSecondaryPaths: FocusCheckPath[];
  onProceed: () => void;
  onDismiss: () => void;
  onArchive: (pathId: string) => void;
}) {
  const Colors = useThemeColors();
  const fc = React.useMemo(() => makeFocusCheckStyles(Colors), [Colors]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <TouchableOpacity style={fc.overlay} activeOpacity={1} onPress={onDismiss}>
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <View style={fc.sheet}>
            <View style={fc.handle} />

            <Text style={fc.title}>⚡ Focus Check</Text>
            <Text style={fc.body}>
              You already have 3 active secondary paths. Research shows multi-tasking roadmaps leads to less completion.{'\n\n'}
              Consider pausing one first — or proceed if you're sure.
            </Text>

            {/* Active secondaries */}
            <Text style={fc.sectionLabel}>YOUR ACTIVE PATHS</Text>
            {activeSecondaryPaths.map((p) => (
              <View key={p.pathId} style={fc.pathRow}>
                <View style={[fc.pathIcon, { backgroundColor: p.color + '18' }]}>
                  <Text style={{ fontSize: 16 }}>{p.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={fc.pathName}>{p.name}</Text>
                  <Text style={fc.pathPct}>{p.pct}% complete</Text>
                </View>
                <TouchableOpacity
                  style={fc.archiveBtn}
                  onPress={() => onArchive(p.pathId)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Pause ${p.name} and add new path`}
                >
                  <Text style={fc.archiveBtnText}>Pause & Add →</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              style={fc.proceedBtn}
              onPress={onProceed}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={fc.proceedText}>Add Anyway (not recommended)</Text>
            </TouchableOpacity>

            <TouchableOpacity style={fc.cancelBtn} onPress={onDismiss} accessibilityRole="button">
              <Text style={fc.cancelText}>Stay Focused — Keep Current Paths</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const makeFocusCheckStyles = (Colors: ColorsType) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: 44,
    borderTopWidth: 1,
    borderColor: Colors.gold + '30',
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
    marginBottom: Spacing.sm,
  },
  body: {
    fontSize: FontSize.sm,
    color: Colors.textSub,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  pathRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pathIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pathName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  pathPct: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 1,
  },
  archiveBtn: {
    backgroundColor: Colors.cardAlt,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    flexShrink: 0,
  },
  archiveBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSub,
  },
  proceedBtn: {
    borderRadius: Radius.full,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: Spacing.md,
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  proceedText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
  },
});

// ── Add roadmap entry point (catalog vs custom) ───────────────────────────────

function AddRoadmapEntryModal({
  visible,
  enrolledPathIds,
  onClose,
  onEnroll,
  onCustom,
}: {
  visible: boolean;
  enrolledPathIds: string[];
  onClose: () => void;
  onEnroll: (pathId: string) => void;
  onCustom: () => void;
}) {
  const Colors = useThemeColors();
  const entry = makeEntry(Colors);
  const [mode, setMode] = useState<'entry' | 'catalog'>('entry');

  const handleClose = () => { setMode('entry'); onClose(); };
  const handleEnroll = (pathId: string) => { setMode('entry'); onEnroll(pathId); };

  return (
    <>
      <Modal visible={visible && mode === 'entry'} transparent animationType="fade" onRequestClose={handleClose}>
        <View style={entry.overlay}>
          <View style={entry.sheet}>
            <Text style={entry.title}>Add a Roadmap</Text>
            <Text style={entry.sub}>Choose a structured path from our catalog or build your own.</Text>

            <TouchableOpacity style={entry.option} onPress={() => setMode('catalog')} activeOpacity={0.85}>
              <View style={entry.optionIcon}>
                <Text style={entry.optionIconText}>📚</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={entry.optionTitle}>Browse Career Paths</Text>
                <Text style={entry.optionSub}>19 structured paths — Data, AI, Engineering, Business & more</Text>
              </View>
              <Text style={entry.optionArrow}>→</Text>
            </TouchableOpacity>

            <TouchableOpacity style={entry.option} onPress={() => { handleClose(); onCustom(); }} activeOpacity={0.85}>
              <View style={[entry.optionIcon, { backgroundColor: Colors.primary + '20' }]}>
                <Text style={entry.optionIconText}>✏️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={entry.optionTitle}>Create Custom Roadmap</Text>
                <Text style={entry.optionSub}>Any goal — Become a Lawyer, CPA, Music Producer, etc.</Text>
              </View>
              <Text style={entry.optionArrow}>→</Text>
            </TouchableOpacity>

            <TouchableOpacity style={entry.cancelBtn} onPress={handleClose} activeOpacity={0.7}>
              <Text style={entry.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <CatalogModal
        visible={visible && mode === 'catalog'}
        enrolledPathIds={enrolledPathIds}
        onSelect={handleEnroll}
        onClose={handleClose}
      />
    </>
  );
}

// ── Roadmap actions sheet ─────────────────────────────────────────────────────

function RoadmapActionsSheet({
  visible,
  pathId,
  isPriority,
  roadmapStatus,
  onSetPriority,
  onPause,
  onArchive,
  onReactivate,
  onEdit,
  onLockIn,
  onUnlock,
  onFork,
  onDeleteRebuild,
  onClose,
}: {
  visible: boolean;
  pathId: string;
  isPriority: boolean;
  roadmapStatus: string;
  onSetPriority: () => void;
  onPause: () => void;
  onArchive: () => void;
  onReactivate: () => void;
  onEdit: () => void;
  onLockIn: () => void;
  onUnlock: () => void;
  onFork: () => void;
  onDeleteRebuild: () => void;
  onClose: () => void;
}) {
  const Colors = useThemeColors();
  const actions = makeActions(Colors);
  const path = CAREER_PATHS.find(p => p.id === pathId);
  const customPaths = useAppStore(s => s.customPaths);
  const userSkills = useAppStore(s => s.userSkills);
  const roadmaps = useAppStore(s => s.roadmaps);
  const customPath = customPaths.find(p => p.id === pathId);
  const displayName = path?.name ?? customPath?.name ?? pathId;
  const displayIcon = path?.icon ?? customPath?.icon ?? '🎯';
  const pc = PathColors[pathId] ?? { primary: customPath?.color ?? '#7C3AED' };

  // FEAT-001 edit-state for this roadmap
  const isBuiltIn = CAREER_PATHS.some(p => p.id === pathId);
  const isJourneyCustom = !!customPath && pathId !== 'personal_library';
  const entry = roadmaps.find(r => r.pathId === pathId);
  const locked = !!entry?.locked;
  const skillIds = isBuiltIn
    ? (CAREER_PATHS.find(p => p.id === pathId)?.skillIds ?? [])
    : (customPath?.skills.map(s => s.id) ?? []);
  const started = pathHasProgress(skillIds, userSkills);
  const editable = isJourneyCustom && !locked && !started;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={actions.overlay} activeOpacity={1} onPress={onClose}>
        <View style={actions.sheet}>
          <View style={actions.handle} />
          <View style={actions.titleRow}>
            <Text style={actions.titleIcon}>{displayIcon}</Text>
            <Text style={actions.titleText}>{displayName}</Text>
          </View>

          {/* FEAT-001: edit milestones (pre-start, custom only) */}
          {editable && (
            <TouchableOpacity style={actions.row} onPress={onEdit} activeOpacity={0.8}>
              <Text style={actions.rowIcon}>🛠️</Text>
              <View style={{ flex: 1 }}>
                <Text style={actions.rowLabel}>Edit Milestones</Text>
                <Text style={actions.rowSub}>Add, rename, reorder — only before you start</Text>
              </View>
            </TouchableOpacity>
          )}

          {editable && (
            <TouchableOpacity style={actions.row} onPress={onLockIn} activeOpacity={0.8}>
              <Text style={actions.rowIcon}>🔒</Text>
              <View style={{ flex: 1 }}>
                <Text style={actions.rowLabel}>Lock It In</Text>
                <Text style={actions.rowSub}>Commit now and focus — no more changes</Text>
              </View>
            </TouchableOpacity>
          )}

          {isJourneyCustom && locked && !started && (
            <TouchableOpacity style={actions.row} onPress={onUnlock} activeOpacity={0.8}>
              <Text style={actions.rowIcon}>🔓</Text>
              <View style={{ flex: 1 }}>
                <Text style={actions.rowLabel}>Unlock to Edit</Text>
                <Text style={actions.rowSub}>Reopen milestones for changes</Text>
              </View>
            </TouchableOpacity>
          )}

          {isBuiltIn && (
            <TouchableOpacity style={actions.row} onPress={onFork} activeOpacity={0.8}>
              <Text style={actions.rowIcon}>📋</Text>
              <View style={{ flex: 1 }}>
                <Text style={actions.rowLabel}>Make an Editable Copy</Text>
                <Text style={actions.rowSub}>Customize milestones on your own copy</Text>
              </View>
            </TouchableOpacity>
          )}

          {!isPriority && roadmapStatus === 'ACTIVE' && (
            <TouchableOpacity style={actions.row} onPress={onSetPriority} activeOpacity={0.8}>
              <Text style={actions.rowIcon}>🎯</Text>
              <View style={{ flex: 1 }}>
                <Text style={actions.rowLabel}>Set as Priority</Text>
                <Text style={actions.rowSub}>Make this your main focus</Text>
              </View>
              <Text style={[actions.rowBadge, { color: pc.primary }]}>PRIORITY</Text>
            </TouchableOpacity>
          )}

          {roadmapStatus === 'ACTIVE' && (
            <TouchableOpacity style={actions.row} onPress={onPause} activeOpacity={0.8}>
              <Text style={actions.rowIcon}>⏸️</Text>
              <View style={{ flex: 1 }}>
                <Text style={actions.rowLabel}>Pause Roadmap</Text>
                <Text style={actions.rowSub}>Keep progress, pause recommendations</Text>
              </View>
            </TouchableOpacity>
          )}

          {(roadmapStatus === 'PAUSED' || roadmapStatus === 'ARCHIVED') && (
            <TouchableOpacity style={actions.row} onPress={onReactivate} activeOpacity={0.8}>
              <Text style={actions.rowIcon}>▶️</Text>
              <View style={{ flex: 1 }}>
                <Text style={actions.rowLabel}>Reactivate Roadmap</Text>
                <Text style={actions.rowSub}>Resume as a Secondary Roadmap</Text>
              </View>
            </TouchableOpacity>
          )}

          {roadmapStatus !== 'ARCHIVED' && (
            <TouchableOpacity style={actions.row} onPress={onArchive} activeOpacity={0.8}>
              <Text style={actions.rowIcon}>📦</Text>
              <View style={{ flex: 1 }}>
                <Text style={actions.rowLabel}>Archive Roadmap</Text>
                <Text style={actions.rowSub}>Pause and keep. Reactivate anytime.</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* FEAT-001: delete & rebuild — the escape hatch once a custom journey is locked/started */}
          {isJourneyCustom && (
            <TouchableOpacity style={[actions.row, actions.rowDanger]} onPress={onDeleteRebuild} activeOpacity={0.8}>
              <Text style={actions.rowIcon}>🗑️</Text>
              <View style={{ flex: 1 }}>
                <Text style={[actions.rowLabel, { color: Colors.danger }]}>Delete &amp; Rebuild</Text>
                <Text style={actions.rowSub}>Remove to start fresh — your proof &amp; XP are kept</Text>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={actions.dismissBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={actions.dismissText}>Close</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Edit Roadmap modal (FEAT-001: pre-start milestone editing) ────────────────
function EditRoadmapModal({
  visible,
  pathId,
  onClose,
}: {
  visible: boolean;
  pathId: string | null;
  onClose: () => void;
}) {
  const Colors = useThemeColors();
  const modal = makeModal(Colors);
  const edit = makeEdit(Colors);
  const customPaths = useAppStore((s) => s.customPaths);
  const addMilestone = useAppStore((s) => s.addMilestone);
  const renameMilestone = useAppStore((s) => s.renameMilestone);
  const removeMilestone = useAppStore((s) => s.removeMilestone);
  const reorderMilestones = useAppStore((s) => s.reorderMilestones);
  const lockRoadmap = useAppStore((s) => s.lockRoadmap);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('⭐');

  const path = pathId ? customPaths.find((p) => p.id === pathId) : null;
  const handleClose = () => { setNewName(''); setNewIcon('⭐'); onClose(); };

  if (!path || !pathId) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
        <View />
      </Modal>
    );
  }

  const color = path.color || Colors.primary;
  const ids = path.skills.map((s) => s.id);
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    const next = [...ids];
    [next[index], next[target]] = [next[target], next[index]];
    reorderMilestones(pathId, next);
  };
  const handleAdd = () => {
    const n = newName.trim();
    if (!n) return;
    addMilestone(pathId, n, newIcon);
    setNewName('');
    setNewIcon('⭐');
  };
  const handleLock = () => { lockRoadmap(pathId, true); handleClose(); };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <SafeAreaView style={modal.container}>
          <View style={modal.header}>
            <TouchableOpacity onPress={handleClose} style={modal.cancelBtn} accessibilityRole="button" accessibilityLabel="Done editing roadmap">
              <Text style={modal.cancelText}>Done</Text>
            </TouchableOpacity>
            <Text style={modal.headerTitle}>Edit Roadmap</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView style={modal.scroll} contentContainerStyle={modal.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={edit.banner}>
              <Text style={edit.bannerText}>
                ✏️ Shape this roadmap freely until you log your first proof. After that it locks in — so you finish what you start.
              </Text>
            </View>

            <View style={[modal.previewCard, { borderColor: color + '60', backgroundColor: color + '12', marginTop: Spacing.md }]}>
              <Text style={modal.previewIcon}>{path.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[modal.previewName, { color }]}>{path.name}</Text>
                <Text style={modal.previewMeta}>{path.skills.length} milestone{path.skills.length === 1 ? '' : 's'}</Text>
              </View>
            </View>

            <Text style={modal.fieldLabel}>MILESTONES</Text>
            {path.skills.map((skill, i) => (
              <View key={skill.id} style={modal.skillRow}>
                <View style={[modal.skillNumber, { backgroundColor: color + '30', borderColor: color + '60' }]}>
                  <Text style={[modal.skillNumberText, { color }]}>{i + 1}</Text>
                </View>
                <TextInput
                  style={modal.skillInput}
                  placeholder={`Milestone ${i + 1}...`}
                  placeholderTextColor={Colors.textMuted}
                  value={skill.name}
                  onChangeText={(v) => renameMilestone(pathId, skill.id, v)}
                  accessibilityLabel={`Milestone ${i + 1} name`}
                />
                <View style={edit.moveCol}>
                  <TouchableOpacity
                    style={[edit.moveBtn, i === 0 && modal.btnDisabled]}
                    disabled={i === 0}
                    onPress={() => move(i, -1)}
                    accessibilityRole="button"
                    accessibilityLabel={`Move milestone ${i + 1} up`}
                  >
                    <Text style={edit.moveText}>▲</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[edit.moveBtn, i === path.skills.length - 1 && modal.btnDisabled]}
                    disabled={i === path.skills.length - 1}
                    onPress={() => move(i, 1)}
                    accessibilityRole="button"
                    accessibilityLabel={`Move milestone ${i + 1} down`}
                  >
                    <Text style={edit.moveText}>▼</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={() => removeMilestone(pathId, skill.id)}
                  style={modal.removeSkillBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove milestone ${i + 1}`}
                >
                  <Text style={modal.removeSkillText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            <View style={edit.addRow}>
              <TouchableOpacity
                style={[modal.iconOption, { marginRight: 8, marginBottom: 0 }]}
                onPress={() => {
                  const idx = ICON_OPTIONS.indexOf(newIcon);
                  setNewIcon(ICON_OPTIONS[(idx + 1) % ICON_OPTIONS.length]);
                }}
                accessibilityRole="button"
                accessibilityLabel="Cycle new milestone icon"
              >
                <Text style={modal.iconOptionText}>{newIcon}</Text>
              </TouchableOpacity>
              <TextInput
                style={modal.skillInput}
                placeholder="Add a milestone…"
                placeholderTextColor={Colors.textMuted}
                value={newName}
                onChangeText={setNewName}
                onSubmitEditing={handleAdd}
                accessibilityLabel="New milestone name"
              />
              <TouchableOpacity
                style={[edit.addBtn, !newName.trim() && modal.btnDisabled]}
                disabled={!newName.trim()}
                onPress={handleAdd}
                accessibilityRole="button"
                accessibilityLabel="Add milestone"
              >
                <Text style={edit.addBtnText}>Add</Text>
              </TouchableOpacity>
            </View>

            <View style={{ height: Spacing.xl }} />

            <TouchableOpacity
              style={[edit.lockBtn, { borderColor: color + '80' }]}
              onPress={handleLock}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Lock this roadmap to focus"
            >
              <Text style={[edit.lockBtnText, { color }]}>🔒 Lock it in</Text>
              <Text style={edit.lockBtnSub}>Commit now — to change milestones later you'd delete &amp; rebuild</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Fork confirmation (built-in → editable copy) ──────────────────────────────
function ForkConfirmModal({
  visible,
  pathId,
  onConfirm,
  onDismiss,
}: {
  visible: boolean;
  pathId: string | null;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const Colors = useThemeColors();
  const confirm = makeConfirm(Colors);
  const path = pathId ? (CAREER_PATHS.find((p) => p.id === pathId) ?? null) : null;
  const pc = pathId ? (PathColors[pathId] ?? { primary: '#7C3AED' }) : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={confirm.overlay}>
        <View style={confirm.sheet}>
          <Text style={confirm.emoji}>📋</Text>
          <Text style={confirm.title}>Make an editable copy?</Text>
          <Text style={confirm.body}>
            Built-in roadmaps stay fixed so their milestones are consistent. We'll create your own editable copy you can shape before you start — the original stays as-is.
          </Text>
          {path && pc && (
            <View style={[confirm.pathPreview, { backgroundColor: pc.primary + '15', borderColor: pc.primary + '40' }]}>
              <Text style={confirm.pathPreviewIcon}>{path.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[confirm.pathPreviewName, { color: pc.primary }]}>{path.name} (My Copy)</Text>
                <Text style={confirm.pathPreviewSub}>Editable · enrolled as a secondary roadmap</Text>
              </View>
            </View>
          )}
          <TouchableOpacity style={[confirm.btn, confirm.btnStay]} onPress={onConfirm} activeOpacity={0.85}>
            <Text style={confirm.btnStayText}>Create Editable Copy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[confirm.btn, { backgroundColor: Colors.card }]} onPress={onDismiss} activeOpacity={0.85}>
            <Text style={[confirm.btnStayText, { color: Colors.textMuted }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Delete & rebuild confirmation ─────────────────────────────────────────────
function DeleteRebuildConfirmModal({
  visible,
  pathId,
  onConfirm,
  onDismiss,
}: {
  visible: boolean;
  pathId: string | null;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const Colors = useThemeColors();
  const confirm = makeConfirm(Colors);
  const customPaths = useAppStore((s) => s.customPaths);
  const builtIn = pathId ? CAREER_PATHS.find((p) => p.id === pathId) : null;
  const custom = pathId ? customPaths.find((p) => p.id === pathId) : null;
  const name = builtIn?.name ?? custom?.name ?? 'this roadmap';
  const icon = builtIn?.icon ?? custom?.icon ?? '🎯';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={confirm.overlay}>
        <View style={confirm.sheet}>
          <Text style={confirm.emoji}>🗑️</Text>
          <Text style={confirm.title}>Delete &amp; rebuild?</Text>
          <Text style={confirm.body}>
            To change a roadmap after you've started, delete it and build a fresh one. Your logged proof and XP are kept — only the roadmap structure is removed. This can't be undone.
          </Text>
          <View style={[confirm.pathPreview, { backgroundColor: Colors.danger + '12', borderColor: Colors.danger + '40' }]}>
            <Text style={confirm.pathPreviewIcon}>{icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[confirm.pathPreviewName, { color: Colors.danger }]}>{name}</Text>
              <Text style={confirm.pathPreviewSub}>Structure removed · proof &amp; XP kept</Text>
            </View>
          </View>
          <TouchableOpacity style={[confirm.btn, confirm.btnConfirm]} onPress={onConfirm} activeOpacity={0.85}>
            <Text style={confirm.btnConfirmText}>Delete &amp; Rebuild</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[confirm.btn, confirm.btnStay]} onPress={onDismiss} activeOpacity={0.85}>
            <Text style={confirm.btnStayText}>Keep My Roadmap</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Main EvolveScreen ─────────────────────────────────────────────────────────

export default function EvolveScreen() {
  const Colors = useThemeColors();
  const colorScheme = useContext(ThemeContext);
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const detail = React.useMemo(() => makeDetail(Colors), [Colors]);
  const navigation = useNavigation<any>();
  const user = useAppStore((s) => s.user);
  const userSkills = useAppStore((s) => s.userSkills);
  const outputs = useAppStore((s) => s.outputs);
  const customPaths = useAppStore((s) => s.customPaths);
  const roadmaps = useAppStore((s) => s.roadmaps);
  const prioritizedPathId = useAppStore((s) => s.prioritizedPathId);
  const setSelectedSkill = useAppStore((s) => s.setSelectedSkill);
  const validateSkill = useAppStore((s) => s.validateSkill);
  const pendingCelebration = useAppStore((s) => s.pendingCelebration);
  const clearCelebration = useAppStore((s) => s.clearCelebration);
  const enrollInRoadmap = useAppStore((s) => s.enrollInRoadmap);
  const setPriorityRoadmap = useAppStore((s) => s.setPriorityRoadmap);
  const pauseRoadmap = useAppStore((s) => s.pauseRoadmap);
  const archiveRoadmap = useAppStore((s) => s.archiveRoadmap);
  const reactivateRoadmap = useAppStore((s) => s.reactivateRoadmap);
  const switchPath = useAppStore((s) => s.switchPath);
  const forkBuiltInPath = useAppStore((s) => s.forkBuiltInPath);
  const deleteRoadmap = useAppStore((s) => s.deleteRoadmap);
  const lockRoadmap = useAppStore((s) => s.lockRoadmap);
  const marketDemand = useAppStore((s) => s.marketDemand);
  const loadMarketDemand = useAppStore((s) => s.loadMarketDemand);

  // Which roadmap's skill tree is currently shown
  const [activeViewPathId, setActiveViewPathId] = useState<string | null>(null);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [pendingPriorityId, setPendingPriorityId] = useState<string | null>(null);
  const [managingPathId, setManagingPathId] = useState<string | null>(null);
  const [detailSkill, setDetailSkill] = useState<{ skill: Skill; userSkill: UserSkill } | null>(null);
  const [validateTarget, setValidateTarget] = useState<Skill | null>(null);
  // GROW-002: when true the knowledge check is a "test out" (caps attempts, shuffles,
  // grants completion on pass) vs. the post-build validation of an already-completed skill.
  const [validateIsTestOut, setValidateIsTestOut] = useState(false);
  // Snapshot of persisted failed attempts at modal-open time (stable during the session
  // so it doesn't double-count with the modal's own in-session fail tracking).
  const [validateAttemptsUsed, setValidateAttemptsUsed] = useState(0);
  const testOutSkill = useAppStore((s) => s.testOutSkill);
  const recordTestOutAttempt = useAppStore((s) => s.recordTestOutAttempt);
  const [showArchived, setShowArchived] = useState(false);
  const [focusCheckPathId, setFocusCheckPathId] = useState<string | null>(null);
  // FEAT-001 edit flows
  const [editPathId, setEditPathId] = useState<string | null>(null);
  const [forkPathId, setForkPathId] = useState<string | null>(null);
  const [deletePathId, setDeletePathId] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: false }).start();
    page('evolve', { career_path: user?.careerPathId });
    // Load community market demand for the user's primary path on first mount
    if (user?.careerPathId) loadMarketDemand(user.careerPathId);
  }, []);

  useEffect(() => {
    if (pendingCelebration) {
      clearCelebration();
      const { newAchievements, ...rest } = pendingCelebration;
      // Map newAchievements → achievements to match the MilestoneDetail params (UX-030).
      navigation.navigate('MilestoneDetail', { ...rest, achievements: newAchievements });
    }
  }, [pendingCelebration]);

  // Default active view to priority path
  const effectiveViewId = activeViewPathId ?? prioritizedPathId ?? user?.careerPathId ?? null;

  if (!user) return null;

  const activeRoadmaps = roadmaps.filter(r => r.roadmapStatus === 'ACTIVE');
  const pausedOrArchived = roadmaps.filter(r => r.roadmapStatus === 'PAUSED' || r.roadmapStatus === 'ARCHIVED');
  const priorityRoadmap = roadmaps.find(r => r.priorityStatus === 'PRIORITY' && r.roadmapStatus === 'ACTIVE');
  const secondaryRoadmaps = roadmaps.filter(r => r.priorityStatus === 'SECONDARY' && r.roadmapStatus === 'ACTIVE');
  const enrolledPathIds = roadmaps.map(r => r.pathId);

  // Build path display info (theme-aware: text/border adapt for light mode)
  const getPathInfo = (pathId: string) => {
    const builtIn = CAREER_PATHS.find(p => p.id === pathId);
    const custom = customPaths.find(p => p.id === pathId);
    const customColor = custom?.color ?? '#7C3AED';
    const pc = PathColors[pathId]
      ? getPathColor(pathId, colorScheme)
      : { primary: customColor, dim: `rgba(124,58,237,0.08)`, text: colorScheme === 'light' ? customColor : '#C4B5FD', border: customColor + (colorScheme === 'light' ? '35' : '30') };
    const skills = builtIn
      ? ALL_SKILLS.filter(s => s.pathId === pathId).sort((a, b) => a.order - b.order)
      : (custom?.skills ?? []).map((s, i) => ({
          id: s.id, pathId: pathId as import('../types').CareerPathId, name: s.name, description: s.description, icon: s.icon || '⭐',
          xpReward: 100, rarity: 'common' as const, requiredOutputs: 1,
          prerequisites: i > 0 ? [custom!.skills[i - 1].id] : [], order: i + 1,
        }));
    const completed = skills.filter(s => userSkills[s.id]?.status === 'completed').length;
    const pct = skills.length > 0 ? Math.round((completed / skills.length) * 100) : 0;
    return {
      name: builtIn?.name ?? custom?.name ?? pathId,
      icon: builtIn?.icon ?? custom?.icon ?? '🎯',
      color: pc.primary,
      textColor: pc.text ?? pc.primary,
      dimColor: pc.dim ?? pc.primary + '15',
      borderColor: pc.border ?? pc.primary + '40',
      skills,
      completedCount: completed,
      pct,
    };
  };

  // Skill tree for active view path
  const viewInfo = effectiveViewId ? getPathInfo(effectiveViewId) : null;
  const managingEntry = managingPathId ? roadmaps.find(r => r.pathId === managingPathId) : null;

  // FEAT-001: edit-state for the currently-viewed roadmap (drives the header chip)
  const viewState = (() => {
    if (!effectiveViewId) return null;
    const builtIn = CAREER_PATHS.some(p => p.id === effectiveViewId);
    const custom = customPaths.find(p => p.id === effectiveViewId);
    const isJourneyCustom = !!custom && effectiveViewId !== 'personal_library';
    const entry = roadmaps.find(r => r.pathId === effectiveViewId);
    const locked = !!entry?.locked;
    const skillIds = builtIn
      ? (CAREER_PATHS.find(p => p.id === effectiveViewId)?.skillIds ?? [])
      : (custom?.skills.map(s => s.id) ?? []);
    const started = pathHasProgress(skillIds, userSkills);
    return { builtIn, isJourneyCustom, locked, started, editable: isJourneyCustom && !locked && !started };
  })();

  const handleNodePress = (skillId: string, status: string) => {
    if (status === 'locked') return;
    const builtInSkill = ALL_SKILLS.find(s => s.id === skillId);
    const customSkill = customPaths.flatMap(cp => cp.skills).find(cs => cs.id === skillId);
    if (!builtInSkill && !customSkill) {
      setSelectedSkill(skillId);
      navigation.navigate('Log');
      return;
    }
    const resolvedSkill: Skill = builtInSkill ?? {
      id: customSkill!.id,
      pathId: user.careerPathId as any,
      name: customSkill!.name,
      description: customSkill!.description ?? '',
      icon: customSkill!.icon ?? '⭐',
      xpReward: 100, rarity: 'common' as const,
      requiredOutputs: 1, prerequisites: [], order: 0,
    };
    const resolvedUserSkill: UserSkill = userSkills[skillId] ?? {
      skillId, status: 'available' as const, outputCount: 0,
    };
    setDetailSkill({ skill: resolvedSkill, userSkill: resolvedUserSkill });
  };

  const handleEnroll = (pathId: string) => {
    // Governance: soft-cap at 3 active secondary roadmaps to prevent overwhelm
    if (secondaryRoadmaps.length >= 3) {
      setShowAddEntry(false);
      setFocusCheckPathId(pathId);
      return;
    }
    enrollInRoadmap(pathId);
    setShowAddEntry(false);
    setActiveViewPathId(pathId);
  };

  const handleForceEnroll = () => {
    if (!focusCheckPathId) return;
    enrollInRoadmap(focusCheckPathId);
    setActiveViewPathId(focusCheckPathId);
    setFocusCheckPathId(null);
  };

  const handleSetPriority = (pathId: string) => {
    setManagingPathId(null);
    setPendingPriorityId(pathId);
  };

  const handleConfirmPriority = () => {
    if (pendingPriorityId) {
      setPriorityRoadmap(pendingPriorityId);
      setActiveViewPathId(pendingPriorityId);
    }
    setPendingPriorityId(null);
  };

  // FEAT-001 handlers
  const handleConfirmFork = () => {
    if (!forkPathId) return;
    const newId = forkBuiltInPath(forkPathId);
    setForkPathId(null);
    if (newId) {
      setActiveViewPathId(newId);
      setEditPathId(newId); // drop straight into editing the new copy
    }
  };

  const handleConfirmDelete = () => {
    if (!deletePathId) return;
    const id = deletePathId;
    deleteRoadmap(id);
    setDeletePathId(null);
    if (activeViewPathId === id) setActiveViewPathId(null);
    setShowCustomModal(true); // open the builder so they can rebuild fresh
  };

  // Header chip: state-aware primary action for the viewed roadmap
  const handleViewChipPress = () => {
    if (!effectiveViewId || !viewState) return;
    if (viewState.editable) setEditPathId(effectiveViewId);
    else if (viewState.isJourneyCustom && viewState.locked && !viewState.started) lockRoadmap(effectiveViewId, false);
    else if (viewState.isJourneyCustom && viewState.started) setDeletePathId(effectiveViewId);
    else if (viewState.builtIn) setForkPathId(effectiveViewId);
  };

  const viewChip = (() => {
    if (!viewState) return null;
    if (viewState.editable) return { label: '✏️ Edit', tint: viewInfo?.color ?? Colors.primary };
    if (viewState.isJourneyCustom && viewState.locked && !viewState.started) return { label: '🔒 Locked', tint: Colors.textMuted };
    if (viewState.isJourneyCustom && viewState.started) return { label: '🔒 In progress', tint: Colors.textMuted };
    if (viewState.builtIn) return { label: '📋 Editable copy', tint: Colors.gold };
    return null; // personal_library or unknown
  })();

  const renderCompactRoadmap = (pathId: string) => {
    const info = getPathInfo(pathId);
    return (
      // QA-002: card tap + ⋯ options are DOM siblings inside a plain View
      // container — never a <button> nested in a <button> (invalid HTML + a11y).
      <View
        key={pathId}
        style={[styles.compactRoadmap, { borderColor: info.borderColor }]}
      >
        <TouchableOpacity
          style={styles.compactMain}
          onPress={() => setActiveViewPathId(pathId)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${info.name} roadmap, ${info.pct}% complete`}
        >
          <View style={[styles.compactIcon, { backgroundColor: info.color + '18' }]}>
            <Text style={{ fontSize: 14 }}>{info.icon}</Text>
          </View>
          <Text style={styles.compactName} numberOfLines={1}>{info.name}</Text>
          <View style={styles.compactMeta}>
            <View style={[styles.compactBar, { backgroundColor: info.color + '18' }]}>
              <View style={[styles.compactBarFill, { width: `${info.pct}%` as any, backgroundColor: info.color }]} />
            </View>
            <Text style={[styles.compactPct, { color: info.color }]}>{info.pct}%</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.compactMore}
          onPress={() => setManagingPathId(pathId)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Options for ${info.name}`}
        >
          <Text style={styles.moreBtnText}>⋯</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderRoadmapCard = (pathId: string, isPriority: boolean) => {
    const info = getPathInfo(pathId);
    const isViewing = effectiveViewId === pathId;

    return (
      // QA-002: outer is a plain View container; the card tap, the ⋯ options
      // button, and the footer "view skills" affordance are DOM siblings —
      // never a <button> nested inside a <button> (invalid HTML + a11y defect).
      <View
        key={pathId}
        style={[
          isPriority ? styles.priorityCard : styles.secondaryCard,
          { borderColor: info.borderColor, backgroundColor: info.dimColor },
          isViewing && !isPriority && { borderColor: info.color + '80' },
        ]}
      >
        {isPriority && (
          <View style={[styles.priorityBadge, { backgroundColor: info.color }]}>
            <Text style={styles.priorityBadgeText}>⚡ PRIORITY</Text>
          </View>
        )}

        <View style={styles.cardTopRow}>
          <TouchableOpacity
            style={styles.cardTapMain}
            onPress={() => setActiveViewPathId(pathId)}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel={`${info.name} roadmap, ${info.pct}% complete`}
          >
            <View style={[styles.cardIconBox, { backgroundColor: info.color + '20' }]}>
              <Text style={styles.cardIcon}>{info.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardName, { color: isPriority ? info.textColor : Colors.text }]}>
                {info.name}
              </Text>
              <Text style={styles.cardMeta}>
                {info.completedCount}/{info.skills.length} skills · {info.pct}% complete
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.moreBtn}
            onPress={() => setManagingPathId(pathId)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Options for ${info.name}`}
          >
            <Text style={styles.moreBtnText}>⋯</Text>
          </TouchableOpacity>
        </View>

        {/* Progress bar */}
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${info.pct}%` as any, backgroundColor: info.color }]} />
        </View>

        {isPriority && (
          <TouchableOpacity
            style={styles.priorityFooter}
            onPress={() => setActiveViewPathId(pathId)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={isViewing ? `Viewing ${info.name} skills` : `View ${info.name} skills`}
          >
            <Text style={[styles.viewSkillsBtn, { color: info.color }]}>
              {isViewing ? '▾ Viewing skills below' : '▸ Tap to view skills'}
            </Text>
          </TouchableOpacity>
        )}

        {!isPriority && isViewing && (
          <Text style={[styles.viewingLabel, { color: info.color }]}>▾ Viewing skills</Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
        <View>
          <Text style={styles.headerTitle}>My Roadmaps</Text>
          <Text style={styles.headerSub}>
            {roadmaps.length === 0
              ? 'Add your first career roadmap'
              : `${activeRoadmaps.length} active · ${roadmaps.filter(r => r.priorityStatus === 'PRIORITY').length} priority`}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowAddEntry(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Add a new roadmap"
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </Animated.View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Empty state */}
        {roadmaps.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🗺️</Text>
            <Text style={styles.emptyTitle}>No roadmaps yet.</Text>
            <Text style={styles.emptySub}>
              Add your first career roadmap to start tracking your focused learning journey.
            </Text>
            <TouchableOpacity
              style={styles.emptyCta}
              onPress={() => setShowAddEntry(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.emptyCtaText}>Browse Career Paths ⚡</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Priority roadmap */}
        {priorityRoadmap && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>PRIORITY FOCUS</Text>
            {renderRoadmapCard(priorityRoadmap.pathId, true)}
          </View>
        )}

        {/* Secondary roadmaps */}
        {secondaryRoadmaps.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ALSO ENROLLED ({secondaryRoadmaps.length})</Text>
            {secondaryRoadmaps.map(r => renderCompactRoadmap(r.pathId))}
          </View>
        )}

        {/* Skill tree for active view */}
        {effectiveViewId && viewInfo && viewInfo.skills.length > 0 && (
          <View style={styles.section}>
            <View style={styles.skillTreeHeader}>
              {/* RES-004: numberOfLines={1} stops the label wrapping at 320px */}
              <Text style={[styles.sectionLabel, styles.skillTreeLabel]} numberOfLines={1}>MILESTONES</Text>
              <View style={styles.skillTreeHeaderRight}>
                <Text style={[styles.skillTreePath, { color: viewInfo.color }]} numberOfLines={1}>
                  {viewInfo.icon} {viewInfo.name}
                </Text>
                {viewChip && (
                  <TouchableOpacity
                    style={[styles.editChip, { borderColor: viewChip.tint + '55', backgroundColor: viewChip.tint + '1A' }]}
                    onPress={handleViewChipPress}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`${viewChip.label} — ${viewInfo.name}`}
                  >
                    <Text style={[styles.editChipText, { color: viewChip.tint }]}>{viewChip.label}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {viewInfo.skills.map((skill, index) => {
              const userSkill = userSkills[skill.id] ?? {
                skillId: skill.id,
                status: index === 0 ? 'available' as const : 'locked' as const,
                outputCount: 0,
              };
              const pathColor = {
                primary: viewInfo.color,
                text: viewInfo.textColor,
                dim: viewInfo.dimColor,
                border: viewInfo.borderColor,
              };
              const demand = marketDemand[skill.id];
              return (
                <View key={skill.id} style={{ position: 'relative' }}>
                  <CareerNode
                    skill={skill}
                    userSkill={userSkill}
                    pathColor={pathColor}
                    isFirst={index === 0}
                    isLast={index === viewInfo.skills.length - 1}
                    onPress={() => handleNodePress(skill.id, userSkill.status)}
                    onTestKnowledge={() => setValidateTarget(skill as Skill)}
                    completedAt={userSkill.completedAt}
                    skillStreak={getSkillStreak(skill.id, outputs)}
                    validated={userSkill.validated ?? false}
                  />
                  {demand && demand.level !== 'stable' && (
                    <View style={demandBadgeOverlayStyle}>
                      <DemandBadge level={demand.level} compact />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Paused / Archived section */}
        {pausedOrArchived.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.archivedToggle}
              onPress={() => setShowArchived(v => !v)}
              activeOpacity={0.8}
            >
              <Text style={styles.sectionLabel}>
                {showArchived ? '▾' : '▸'} PAUSED & ARCHIVED ({pausedOrArchived.length})
              </Text>
            </TouchableOpacity>

            {showArchived && pausedOrArchived.map(r => {
              const info = getPathInfo(r.pathId);
              return (
                <View
                  key={r.pathId}
                  style={[styles.archivedCard, { borderColor: Colors.border }]}
                >
                  <Text style={styles.archivedIcon}>{info.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.archivedName}>{info.name}</Text>
                    <Text style={styles.archivedMeta}>
                      {r.roadmapStatus} · {info.pct}% complete
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.moreBtn}
                    onPress={() => setManagingPathId(r.pathId)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.moreBtnText}>⋯</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Modals */}
      <AddRoadmapEntryModal
        visible={showAddEntry}
        enrolledPathIds={enrolledPathIds}
        onClose={() => setShowAddEntry(false)}
        onEnroll={handleEnroll}
        onCustom={() => { setShowAddEntry(false); setShowCustomModal(true); }}
      />

      <AddCustomModal
        visible={showCustomModal}
        onClose={() => setShowCustomModal(false)}
      />

      <PriorityConfirmModal
        visible={!!pendingPriorityId}
        newPathId={pendingPriorityId}
        onConfirm={handleConfirmPriority}
        onDismiss={() => setPendingPriorityId(null)}
      />

      {/* Focus Check — fires when user tries to add a 4th active secondary roadmap */}
      <FocusCheckModal
        visible={!!focusCheckPathId}
        activeSecondaryPaths={secondaryRoadmaps.map(r => {
          const info = getPathInfo(r.pathId);
          return { pathId: r.pathId, name: info.name, icon: info.icon, pct: info.pct, color: info.color };
        })}
        onProceed={handleForceEnroll}
        onDismiss={() => setFocusCheckPathId(null)}
        onArchive={(pathId) => {
          archiveRoadmap(pathId);
          // After archiving, immediately enroll the new one
          if (focusCheckPathId) {
            enrollInRoadmap(focusCheckPathId);
            setActiveViewPathId(focusCheckPathId);
          }
          setFocusCheckPathId(null);
        }}
      />

      {managingEntry && managingPathId && (
        <RoadmapActionsSheet
          visible={!!managingPathId}
          pathId={managingPathId}
          isPriority={managingEntry.priorityStatus === 'PRIORITY'}
          roadmapStatus={managingEntry.roadmapStatus}
          onSetPriority={() => handleSetPriority(managingPathId)}
          onPause={() => { pauseRoadmap(managingPathId); setManagingPathId(null); }}
          onArchive={() => { archiveRoadmap(managingPathId); setManagingPathId(null); }}
          onReactivate={() => { reactivateRoadmap(managingPathId); setManagingPathId(null); }}
          onEdit={() => { const id = managingPathId; setManagingPathId(null); setEditPathId(id); }}
          onLockIn={() => { lockRoadmap(managingPathId, true); setManagingPathId(null); }}
          onUnlock={() => { lockRoadmap(managingPathId, false); setManagingPathId(null); }}
          onFork={() => { const id = managingPathId; setManagingPathId(null); setForkPathId(id); }}
          onDeleteRebuild={() => { const id = managingPathId; setManagingPathId(null); setDeletePathId(id); }}
          onClose={() => setManagingPathId(null)}
        />
      )}

      <EditRoadmapModal
        visible={!!editPathId}
        pathId={editPathId}
        onClose={() => setEditPathId(null)}
      />

      <ForkConfirmModal
        visible={!!forkPathId}
        pathId={forkPathId}
        onConfirm={handleConfirmFork}
        onDismiss={() => setForkPathId(null)}
      />

      <DeleteRebuildConfirmModal
        visible={!!deletePathId}
        pathId={deletePathId}
        onConfirm={handleConfirmDelete}
        onDismiss={() => setDeletePathId(null)}
      />

      {/* Skill Detail Sheet */}
      <Modal
        visible={!!detailSkill}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailSkill(null)}
      >
        {detailSkill && (() => {
          const { skill, userSkill } = detailSkill;
          const isCompleted = userSkill.status === 'completed';
          const isInProgress = userSkill.status === 'in_progress';
          const progressPct = skill.requiredOutputs > 0
            ? Math.min(100, Math.round((userSkill.outputCount / skill.requiredOutputs) * 100))
            : 0;
          const rarity = RarityColors[skill.rarity] ?? RarityColors['common'];
          const skillPathColor = PathColors[skill.pathId] ?? {
            primary: viewInfo?.color ?? Colors.primary,
            dim: viewInfo?.dimColor ?? Colors.primaryDim,
            text: viewInfo?.textColor ?? Colors.primaryLight,
            border: viewInfo?.borderColor ?? Colors.primary + '40',
          };
          // GROW-002: can the user test out of this (available, foundational) skill?
          const pathSkillIds = CAREER_PATHS.find((p) => p.id === skill.pathId)?.skillIds ?? [];
          const canTestOut = isTestOutEligible(skill.id, userSkills, pathSkillIds, user?.experienceLevel);
          const openTestOut = () => {
            const target = skill as Skill;
            setDetailSkill(null);
            setValidateAttemptsUsed(userSkills[skill.id]?.testOutAttempts ?? 0);
            setValidateIsTestOut(true);
            setValidateTarget(target);
          };
          const prereqSkills = skill.prerequisites.map(pid => ({
            skill: ALL_SKILLS.find(s => s.id === pid),
            done: userSkills[pid]?.status === 'completed',
          })).filter(p => !!p.skill);

          return (
            <SafeAreaView style={detail.container}>
              <View style={detail.handle} />
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={detail.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={detail.topRow}>
                  <View style={[
                    detail.iconBox,
                    {
                      backgroundColor: isCompleted ? Colors.success + '25' : skillPathColor.dim,
                      borderColor: isCompleted ? Colors.success + '60' : skillPathColor.primary + '50',
                      // @ts-ignore
                      boxShadow: isCompleted
                        ? `0 0 20px ${Colors.success}30`
                        : `0 0 20px ${skillPathColor.primary}30`,
                    },
                  ]}>
                    {isCompleted
                      ? <Text style={detail.iconCheck}>✓</Text>
                      : <Text style={detail.iconEmoji}>{skill.icon}</Text>
                    }
                  </View>
                  <View style={detail.topMeta}>
                    <View style={[detail.rarityBadge, { backgroundColor: rarity.color + '20', borderColor: rarity.color + '50' }]}>
                      <Text style={[detail.rarityText, { color: rarity.color }]}>{rarity.label}</Text>
                    </View>
                    {isCompleted && (
                      <View style={[detail.masteredBadge, userSkill.validated && { backgroundColor: Colors.gold + '20', borderColor: Colors.gold + '50' }]}>
                        <Text style={[detail.masteredText, userSkill.validated && { color: Colors.gold }]}>
                          {userSkill.validated ? '★ VALIDATED' : '✓ MASTERED'}
                        </Text>
                      </View>
                    )}
                    {isInProgress && !isCompleted && (
                      <View style={detail.inProgressBadge}>
                        <Text style={detail.inProgressText}>⚡ IN PROGRESS</Text>
                      </View>
                    )}
                    {userSkill.status === 'available' && (
                      <View style={detail.readyBadge}>
                        <Text style={detail.readyText}>🟢 READY TO START</Text>
                      </View>
                    )}
                  </View>
                </View>

                <Text style={detail.skillName}>{skill.name}</Text>

                {skill.description ? (
                  <Text style={detail.skillDesc}>{skill.description}</Text>
                ) : null}

                {skill.whyItMatters ? (
                  <View style={detail.whyCard}>
                    <Text style={detail.whyLabel}>WHY IT MATTERS</Text>
                    <Text style={detail.whyText}>{skill.whyItMatters}</Text>
                  </View>
                ) : null}

                {skill.outputExamples && skill.outputExamples.length > 0 ? (
                  <View style={detail.examplesSection}>
                    <Text style={detail.examplesLabel}>WHAT TO BUILD</Text>
                    {skill.outputExamples.map((ex, i) => (
                      <View key={i} style={detail.exampleRow}>
                        <View style={detail.exampleBullet} />
                        <Text style={detail.exampleText}>{ex}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={detail.progressSection}>
                  <View style={detail.progressHeader}>
                    <Text style={detail.progressLabel}>PROGRESS</Text>
                    <Text style={detail.progressCount}>
                      {userSkill.outputCount} / {skill.requiredOutputs} outputs
                    </Text>
                  </View>
                  <View style={detail.progressBg}>
                    <View style={[
                      detail.progressFill,
                      {
                        width: `${progressPct}%` as any,
                        backgroundColor: isCompleted ? Colors.success : skillPathColor.primary,
                      },
                    ]} />
                  </View>
                  <Text style={detail.progressHint}>
                    {isCompleted
                      ? userSkill.validationSource === 'assessment'
                        ? 'Tested out ✓ — validated by assessment'
                        : 'Skill mastered ✓'
                      : `${skill.requiredOutputs - userSkill.outputCount} more output${skill.requiredOutputs - userSkill.outputCount !== 1 ? 's' : ''} to master this skill`
                    }
                  </Text>
                </View>

                <View style={detail.xpCard}>
                  <Text style={detail.xpCardIcon}>⚡</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={detail.xpCardLabel}>COMPLETION REWARD</Text>
                    <Text style={detail.xpCardValue}>+{skill.xpReward} XP</Text>
                  </View>
                  {isCompleted && userSkill.completedAt && (
                    <Text style={detail.completedDate}>
                      {new Date(userSkill.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Text>
                  )}
                </View>

                {prereqSkills.length > 0 && (
                  <View style={detail.prereqSection}>
                    <Text style={detail.prereqLabel}>PREREQUISITES</Text>
                    {prereqSkills.map(({ skill: ps, done }) => ps && (
                      <View key={ps.id} style={detail.prereqRow}>
                        <Text style={[detail.prereqIcon, { opacity: done ? 1 : 0.5 }]}>{ps.icon}</Text>
                        <Text style={[detail.prereqName, done && { color: Colors.success }]} numberOfLines={1}>
                          {ps.name}
                        </Text>
                        <Text style={[detail.prereqStatus, { color: done ? Colors.success : Colors.textMuted }]}>
                          {done ? '✓' : '🔒'}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={{ height: 24 }} />
              </ScrollView>

              <View style={detail.footer}>
                {!isCompleted ? (
                  <>
                    {/* GROW-002: experienced/building users can test out of a foundational
                        skill instead of building it. Pass the quiz → completed by assessment. */}
                    {canTestOut && (
                      <TouchableOpacity
                        style={[detail.ctaBtn, { backgroundColor: skillPathColor.primary }]}
                        onPress={openTestOut}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel={`Test out of ${skill.name} with a ${TESTOUT_QUESTION_COUNT}-question quiz`}
                      >
                        <Text style={detail.ctaBtnText}>
                          Test Out · {TESTOUT_QUESTION_COUNT} Questions → +{VALIDATION_BONUS_XP} XP 🎓
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[
                        canTestOut ? detail.dismissBtn : detail.ctaBtn,
                        !canTestOut && { backgroundColor: skillPathColor.primary },
                      ]}
                      onPress={() => {
                        setDetailSkill(null);
                        setSelectedSkill(skill.id);
                        navigation.navigate('Log');
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={canTestOut ? detail.dismissBtnText : detail.ctaBtnText}>
                        {canTestOut ? 'Or log work to build it ⚡' : 'Log Work on This Skill ⚡'}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : userSkill.validated ? (
                  <View style={detail.masteredCta}>
                    <Text style={detail.masteredCtaText}>🎓 Knowledge validated. Log more to keep building XP.</Text>
                  </View>
                ) : skill.validationQuestions?.length ? (
                  <TouchableOpacity
                    style={[detail.ctaBtn, { backgroundColor: skillPathColor.primary }]}
                    onPress={() => {
                      // Close the detail panel before opening the quiz so the two
                      // modals never stack (a stacked modal blocks interaction on web).
                      const target = skill;
                      setDetailSkill(null);
                      setValidateIsTestOut(false); // post-build validation, not a test-out
                      setValidateTarget(target);
                    }}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`Test your knowledge on ${skill.name}`}
                  >
                    <Text style={detail.ctaBtnText}>
                      Test Your Knowledge → +{VALIDATION_BONUS_XP} XP 🎓
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={detail.masteredCta}>
                    <Text style={detail.masteredCtaText}>🏆 This skill is mastered. Log more to keep building XP.</Text>
                  </View>
                )}
                <TouchableOpacity style={detail.dismissBtn} onPress={() => setDetailSkill(null)} activeOpacity={0.7}>
                  <Text style={detail.dismissBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          );
        })()}
      </Modal>

      {/* Knowledge challenge — two modes:
          • post-build validation of a COMPLETED skill (validateIsTestOut === false), and
          • GROW-002 "test out" of an available foundational skill (validateIsTestOut === true:
            capped attempts, shuffled questions, completion-on-pass). */}
      {validateTarget?.validationQuestions?.length ? (
        <ValidationChallengeModal
          visible={!!validateTarget}
          skillName={validateTarget.name}
          skillIcon={validateTarget.icon ?? '⚡'}
          questions={validateTarget.validationQuestions}
          pathColor={(PathColors[validateTarget.pathId] ?? { primary: Colors.primary }).primary}
          xpReward={VALIDATION_BONUS_XP}
          shuffle={validateIsTestOut}
          strict={validateIsTestOut}
          maxAttempts={validateIsTestOut ? MAX_TESTOUT_ATTEMPTS : undefined}
          attemptsUsed={validateIsTestOut ? validateAttemptsUsed : 0}
          onAttemptFail={validateIsTestOut ? () => recordTestOutAttempt(validateTarget.id) : undefined}
          onPass={() => {
            const id = validateTarget.id;
            if (validateIsTestOut) {
              // Pass the test → complete the skill by assessment (+XP, unlock dependents,
              // celebration). The pendingCelebration effect routes to MilestoneDetail.
              testOutSkill(id);
            } else {
              validateSkill(id);
              // Reflect the new validated state in the open detail panel immediately.
              setDetailSkill((prev) =>
                prev && prev.skill.id === id
                  ? { ...prev, userSkill: { ...prev.userSkill, validated: true, validatedAt: new Date().toISOString() } }
                  : prev,
              );
            }
            setValidateTarget(null);
            setValidateIsTestOut(false);
          }}
          onDismiss={() => { setValidateTarget(null); setValidateIsTestOut(false); }}
        />
      ) : null}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeStyles = (Colors: ColorsType) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.xs,
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  headerSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  addBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.full,
    paddingHorizontal: 16, paddingVertical: 9,
    // @ts-ignore
    boxShadow: '0 2px 12px rgba(124,58,237,0.4)',
  },
  addBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.white },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, flexGrow: 1 },

  section: { marginBottom: Spacing.md },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 2.5, marginBottom: Spacing.sm,
  },

  // Priority card
  priorityCard: {
    borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.md,
    // @ts-ignore
    boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
  },
  priorityBadge: {
    alignSelf: 'flex-start', borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10,
  },
  priorityBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 1 },

  // Secondary card
  secondaryCard: {
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.sm,
  },

  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTapMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIconBox: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardIcon: { fontSize: 22 },
  cardName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  cardMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  moreBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center',
  },
  moreBtnText: { fontSize: 18, color: Colors.textSub, letterSpacing: 2, lineHeight: 20 },

  compactRoadmap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  compactIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  compactName: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  compactMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactBar: {
    width: 48,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  compactBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  compactPct: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'right',
  },
  compactMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  compactMore: {
    paddingLeft: 4,
  },

  progressBg: {
    height: 5, backgroundColor: Colors.cardAlt, borderRadius: 3,
    marginTop: 12, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },

  priorityFooter: { marginTop: 10 },
  viewSkillsBtn: { fontSize: FontSize.xs, fontWeight: '600' },
  viewingLabel: { fontSize: FontSize.xs, fontWeight: '600', marginTop: 8 },

  skillTreeHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  // RES-004: label must not wrap — give it flexShrink:0 so the right-side chip can't crowd it
  skillTreeLabel: { flexShrink: 0 },
  skillTreePath: { fontSize: FontSize.xs, fontWeight: '600', flexShrink: 1 },
  skillTreeHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  editChip: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1,
  },
  editChipText: { fontSize: 11, fontWeight: '700' },

  // Archived section
  archivedToggle: { paddingVertical: 4 },
  archivedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.sm,
    opacity: 0.7,
  },
  archivedIcon: { fontSize: 22 },
  archivedName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSub },
  archivedMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },

  // Empty state
  emptyState: {
    alignItems: 'center', paddingTop: 60, paddingHorizontal: Spacing.xl, gap: 12,
  },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: '900', color: Colors.text },
  emptySub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
  emptyCta: {
    marginTop: Spacing.sm, backgroundColor: Colors.primary,
    borderRadius: Radius.full, paddingHorizontal: 28, paddingVertical: 16,
    // @ts-ignore
    boxShadow: '0 4px 16px rgba(124,58,237,0.4)',
  },
  emptyCtaText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.white },
});

const makeCatalog = (Colors: ColorsType) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  cancelBtn: { width: 60 },
  cancelText: { fontSize: FontSize.base, color: Colors.primaryLight },
  headerTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  sub: {
    fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm,
  },
  scrollContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  catLabel: {
    fontSize: 10, fontWeight: '700', color: Colors.textMuted, letterSpacing: 2.5,
    marginBottom: Spacing.sm, marginTop: Spacing.md,
  },
  pathRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1,
    borderColor: Colors.border, padding: Spacing.md, marginBottom: 8,
  },
  pathRowEnrolled: { opacity: 0.5 },
  pathIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.cardAlt,
  },
  pathIconText: { fontSize: 22 },
  pathName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  pathDesc: { fontSize: FontSize.xs, color: Colors.textMuted },
  demandBlock: { marginTop: 4, gap: 2 },
  demandLine: { fontSize: 11, fontWeight: '700', color: '#FCA5A5', letterSpacing: 0.2 },
  demandSource: { fontSize: 9, fontWeight: '400', color: Colors.textMuted, letterSpacing: 0.1 },
  enrolledBadge: {
    borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: Colors.success + '18', borderWidth: 1, borderColor: Colors.success + '40',
  },
  enrolledBadgeText: { fontSize: 9, fontWeight: '800', color: Colors.success, letterSpacing: 1 },
  addText: { fontSize: FontSize.sm, fontWeight: '700' },
});

const makeEntry = (Colors: ColorsType) => StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl,
    padding: Spacing.lg, paddingBottom: 40,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.border,
  },
  title: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, textAlign: 'center', marginBottom: 4 },
  sub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', marginBottom: Spacing.lg },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.card, borderRadius: Radius.xl, borderWidth: 1,
    borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.sm,
  },
  optionIcon: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.cardAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  optionIconText: { fontSize: 24 },
  optionTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, marginBottom: 3 },
  optionSub: { fontSize: FontSize.xs, color: Colors.textMuted },
  optionArrow: { fontSize: FontSize.md, color: Colors.textMuted },
  cancelBtn: { alignItems: 'center', paddingTop: Spacing.md },
  cancelText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '600' },
});

const makeConfirm = (Colors: ColorsType) => StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', padding: Spacing.lg,
  },
  sheet: {
    backgroundColor: Colors.surface, borderRadius: Radius.xxl,
    padding: Spacing.lg, width: '100%', maxWidth: 400,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
    // @ts-ignore
    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
  },
  emoji: { fontSize: 44, marginBottom: Spacing.sm },
  title: { fontSize: FontSize.lg, fontWeight: '900', color: Colors.text, textAlign: 'center', marginBottom: Spacing.sm },
  body: {
    fontSize: FontSize.sm, color: Colors.textSub, textAlign: 'center',
    lineHeight: 22, marginBottom: Spacing.md,
  },
  pathPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1,
    width: '100%', marginBottom: Spacing.md,
  },
  pathPreviewIcon: { fontSize: 28 },
  pathPreviewName: { fontSize: FontSize.base, fontWeight: '700', marginBottom: 2 },
  pathPreviewSub: { fontSize: FontSize.xs, color: Colors.textMuted },
  question: {
    fontSize: FontSize.sm, fontWeight: '600', color: Colors.text,
    textAlign: 'center', marginBottom: Spacing.md,
  },
  btn: {
    width: '100%', borderRadius: Radius.full, paddingVertical: 15,
    alignItems: 'center', marginBottom: Spacing.sm,
  },
  btnConfirm: {
    backgroundColor: Colors.danger,
    // @ts-ignore
    boxShadow: '0 4px 16px rgba(239,68,68,0.3)',
  },
  btnConfirmText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.white },
  btnStay: {
    backgroundColor: Colors.primary,
    // @ts-ignore
    boxShadow: '0 4px 16px rgba(124,58,237,0.3)',
  },
  btnStayText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.white, textAlign: 'center' },
});

const makeActions = (Colors: ColorsType) => StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl,
    paddingBottom: 40, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.border,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border,
    alignSelf: 'center', marginTop: 12, marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  titleIcon: { fontSize: 24 },
  titleText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: Spacing.lg, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  rowDanger: { borderBottomWidth: 0 },
  rowIcon: { fontSize: 22, width: 28, textAlign: 'center' },
  rowLabel: { fontSize: FontSize.base, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  rowSub: { fontSize: FontSize.xs, color: Colors.textMuted },
  rowBadge: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  dismissBtn: {
    alignItems: 'center', paddingVertical: Spacing.md,
    marginHorizontal: Spacing.lg, marginTop: 4,
    backgroundColor: Colors.card, borderRadius: Radius.xl,
  },
  dismissText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textMuted },
});

const makeModal = (Colors: ColorsType) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  cancelBtn: { width: 60 },
  cancelText: { fontSize: FontSize.base, color: Colors.primaryLight },
  headerTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },

  steps: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    paddingVertical: Spacing.md, gap: 32, position: 'relative',
  },
  stepLine: {
    position: 'absolute', height: 1, width: 60,
    backgroundColor: Colors.border, top: '50%' as any, left: '50%' as any,
    transform: [{ translateX: -30 }],
  },
  stepItem: { alignItems: 'center', gap: 4 },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.card, borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotActive: { borderColor: Colors.primaryLight, backgroundColor: Colors.primary + '30' },
  stepDotDone: { borderColor: Colors.success, backgroundColor: Colors.success + '30' },
  stepDotText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted },
  stepDotTextActive: { color: Colors.primaryLight },
  stepLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '500' },
  stepLabelActive: { color: Colors.primaryLight },

  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.md },
  stepContent: { gap: 0 },
  stepHint: {
    fontSize: FontSize.sm, color: Colors.textSub, lineHeight: 20,
    marginBottom: Spacing.md, textAlign: 'center',
  },
  fieldLabel: {
    fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 2, marginBottom: 8, marginTop: Spacing.md,
  },
  iconScroll: { marginBottom: Spacing.xs },
  iconOption: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.card,
    borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
    justifyContent: 'center', marginRight: 8,
  },
  iconOptionSelected: { borderColor: Colors.primaryLight, backgroundColor: Colors.primary + '30' },
  iconOptionText: { fontSize: 22 },
  input: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 14,
    fontSize: FontSize.base, color: Colors.text, marginBottom: 4,
  },
  inputMulti: { height: 80, textAlignVertical: 'top', paddingTop: 12 },
  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 4 },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  colorSwatchSelected: {
    // @ts-ignore
    boxShadow: '0 0 0 3px rgba(255,255,255,0.8)',
    transform: [{ scale: 1.15 }],
  },
  nextBtn: {
    borderRadius: Radius.full, paddingVertical: 16, alignItems: 'center',
    marginTop: Spacing.xl, backgroundColor: Colors.primary,
    // @ts-ignore
    boxShadow: '0 4px 16px rgba(124,58,237,0.4)',
  },
  nextBtnText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.white },
  skillRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  skillNumber: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center',
    justifyContent: 'center', borderWidth: 1.5, flexShrink: 0,
  },
  skillNumberText: { fontSize: FontSize.xs, fontWeight: '800' },
  skillInput: {
    flex: 1, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 12,
    fontSize: FontSize.sm, color: Colors.text,
  },
  removeSkillBtn: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.cardAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  removeSkillText: { fontSize: 11, color: Colors.textMuted },
  addSkillBtn: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md,
    paddingVertical: 12, alignItems: 'center', marginBottom: Spacing.md,
    borderStyle: 'dashed' as any,
  },
  addSkillBtnText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '500' },
  previewCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, marginBottom: Spacing.md,
  },
  previewIcon: { fontSize: 28 },
  previewName: { fontSize: FontSize.base, fontWeight: '700' },
  previewMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  createBtn: {
    borderRadius: Radius.full, paddingVertical: 16, alignItems: 'center',
    // @ts-ignore
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
  },
  createBtnText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.white },
  btnDisabled: { opacity: 0.35 },
});

// FEAT-001: Edit Roadmap modal styles
const makeEdit = (Colors: ColorsType) => StyleSheet.create({
  banner: {
    backgroundColor: Colors.primaryDim, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.primary + '30',
  },
  bannerText: { fontSize: FontSize.sm, color: Colors.text, lineHeight: 20, fontWeight: '500' },
  moveCol: { gap: 3 },
  moveBtn: {
    width: 30, height: 18, borderRadius: 6, backgroundColor: Colors.cardAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  moveText: { fontSize: 9, color: Colors.textMuted, lineHeight: 11 },
  addRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  addBtn: {
    marginLeft: 8, backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingHorizontal: 18, paddingVertical: 13, alignItems: 'center',
  },
  addBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.white },
  lockBtn: {
    borderWidth: 1.5, borderRadius: Radius.xl, paddingVertical: 14,
    alignItems: 'center', backgroundColor: 'transparent',
  },
  lockBtnText: { fontSize: FontSize.base, fontWeight: '800' },
  lockBtnSub: {
    fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4,
    textAlign: 'center', paddingHorizontal: Spacing.md,
  },
});

const makeDetail = (Colors: ColorsType) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border,
    alignSelf: 'center', marginTop: 12, marginBottom: 8,
  },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.xl },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginBottom: Spacing.md },
  iconBox: {
    width: 72, height: 72, borderRadius: 20, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  iconEmoji: { fontSize: 36 },
  iconCheck: { fontSize: 32, fontWeight: '700', color: Colors.success },
  topMeta: { flex: 1, gap: 8, paddingTop: 4 },
  rarityBadge: {
    alignSelf: 'flex-start', borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1,
  },
  rarityText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  masteredBadge: {
    alignSelf: 'flex-start', borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: Colors.success + '18', borderWidth: 1, borderColor: Colors.success + '40',
  },
  masteredText: { fontSize: 10, fontWeight: '800', color: Colors.success, letterSpacing: 1 },
  inProgressBadge: {
    alignSelf: 'flex-start', borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: Colors.primaryDim, borderWidth: 1, borderColor: Colors.primary + '50',
  },
  inProgressText: { fontSize: 10, fontWeight: '800', color: Colors.primaryLight, letterSpacing: 1 },
  readyBadge: {
    alignSelf: 'flex-start', borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: Colors.success + '12', borderWidth: 1, borderColor: Colors.success + '30',
  },
  readyText: { fontSize: 10, fontWeight: '700', color: Colors.success, letterSpacing: 0.5 },
  skillName: { fontSize: FontSize.xl, fontWeight: '900', color: Colors.text, marginBottom: Spacing.xs },
  skillDesc: { fontSize: FontSize.sm, color: Colors.textSub, lineHeight: 22, marginBottom: Spacing.sm },
  whyCard: {
    backgroundColor: Colors.primaryDim, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.primary + '30', marginBottom: Spacing.sm,
  },
  whyLabel: { fontSize: 9, fontWeight: '700', color: Colors.primaryLight, letterSpacing: 2, marginBottom: 5 },
  whyText: { fontSize: FontSize.sm, color: Colors.text, lineHeight: 21, fontWeight: '500' },
  examplesSection: {
    backgroundColor: Colors.card, borderRadius: Radius.xl, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm, gap: 10,
  },
  examplesLabel: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, letterSpacing: 2, marginBottom: 2 },
  exampleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  exampleBullet: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary,
    marginTop: 7, flexShrink: 0,
  },
  exampleText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSub, lineHeight: 21 },
  progressSection: {
    backgroundColor: Colors.card, borderRadius: Radius.xl, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm, gap: 8,
  },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, letterSpacing: 2 },
  progressCount: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  progressBg: {
    height: 8, backgroundColor: Colors.cardAlt, borderRadius: 4, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', borderRadius: 4,
    // @ts-ignore
    transition: 'width 0.6s ease',
  },
  progressHint: { fontSize: FontSize.xs, color: Colors.textMuted },
  xpCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.goldDim, borderRadius: Radius.xl, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.gold + '30', marginBottom: Spacing.sm,
  },
  xpCardIcon: { fontSize: 28 },
  xpCardLabel: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, letterSpacing: 2, marginBottom: 2 },
  xpCardValue: { fontSize: FontSize.lg, fontWeight: '900', color: Colors.gold },
  completedDate: { fontSize: FontSize.xs, color: Colors.textMuted, alignSelf: 'flex-end' },
  prereqSection: {
    backgroundColor: Colors.card, borderRadius: Radius.xl, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm, gap: 8,
  },
  prereqLabel: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, letterSpacing: 2, marginBottom: 4 },
  prereqRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  prereqIcon: { fontSize: 18 },
  prereqName: { flex: 1, fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSub },
  prereqStatus: { fontSize: FontSize.base, fontWeight: '700' },
  footer: {
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, paddingTop: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.border, gap: 8,
  },
  ctaBtn: {
    borderRadius: Radius.full, paddingVertical: 17, alignItems: 'center',
    // @ts-ignore
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  },
  ctaBtnText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.white, letterSpacing: 0.3 },
  masteredCta: {
    backgroundColor: Colors.success + '12', borderRadius: Radius.xl, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.success + '30', alignItems: 'center',
  },
  masteredCtaText: { fontSize: FontSize.sm, color: Colors.success, fontWeight: '600', textAlign: 'center' },
  dismissBtn: { alignItems: 'center', paddingVertical: 10 },
  dismissBtnText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '500' },
});

// Demand badge pinned to top-right corner of each skill node
const demandBadgeOverlayStyle = {
  position: 'absolute' as const,
  top: 12,
  right: 16,
  zIndex: 10,
};

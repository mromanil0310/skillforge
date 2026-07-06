import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Modal,
  Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useAppStore } from '../store/appStore';
import { isValidBackup } from '../store/persistence';
import { localDateStr } from '../utils/dates';
import { useThemeColors, ColorsType, Spacing, Radius, FontSize } from '../utils/theme';
import { useToast } from '../components/Toast';
import { page, getConsentStatus, setConsent } from '../utils/analytics';
import PrivacyPolicyModal, { PRIVACY_CONTACT } from '../components/PrivacyPolicyModal';
import TermsOfServiceModal from '../components/TermsOfServiceModal';
// ARCH-001: Supabase auth
import { sendMagicLink, signOut, deleteAccount, isSupabaseEnabled } from '../lib/auth';

const STORAGE_KEY = 'maglakbai_v1';

// Text-size steps (must stay within the store's 0.9–1.2 clamp).
const FONT_SCALE_STEPS = [0.9, 1.0, 1.1, 1.2];
const FONT_SCALE_LABELS = ['Small', 'Default', 'Large', 'X-Large'];
const fontScaleIndex = (scale: number): number => {
  const i = FONT_SCALE_STEPS.findIndex((s) => Math.abs(s - scale) < 0.001);
  return i === -1 ? 1 : i;
};

// Web-only: download the on-device save as a JSON backup file.
function exportProgress(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const blob = new Blob([raw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maglakbai-backup-${localDateStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

// Web-only: restore a previously exported backup, then reload to rehydrate the store.
function importProgress(onResult: (ok: boolean, msg: string) => void): void {
  try {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = reader.result as string;
          const parsed = JSON.parse(text);
          // Accepts both the current versioned envelope {v, data} and legacy flat saves.
          // (The previous inline check only knew the flat shape, so it rejected every
          // backup the current app exports — the round-trip was broken.)
          if (!isValidBackup(parsed)) {
            onResult(false, 'That file is not a MaglakbAI backup.');
            return;
          }
          localStorage.setItem(STORAGE_KEY, text);
          onResult(true, 'Backup restored. Reloading…');
          setTimeout(() => { if (typeof window !== 'undefined') window.location.reload(); }, 700);
        } catch {
          onResult(false, 'Could not read that backup file.');
        }
      };
      reader.onerror = () => onResult(false, 'Could not read that file.');
      reader.readAsText(file);
    };
    input.click();
  } catch {
    onResult(false, 'Import is not supported here.');
  }
}

type Nav = NativeStackNavigationProp<RootStackParamList>;

// ─── SettingsRow ──────────────────────────────────────────────────────────────
function SettingsRow({
  icon,
  label,
  value,
  onPress,
  valueColor,
  badge,
  disabled,
}: {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  valueColor?: string;
  badge?: string;
  disabled?: boolean;
}) {
  const Colors = useThemeColors();
  const styles = makeStyles(Colors);
  return (
    <TouchableOpacity
      style={[styles.row, disabled && styles.rowDisabled]}
      onPress={disabled ? undefined : onPress}
      activeOpacity={disabled ? 1 : 0.7}
      accessibilityRole={disabled ? 'text' : 'button'}
      accessibilityLabel={label}
    >
      <View style={styles.rowLeft}>
        <Text style={styles.rowIcon}>{icon}</Text>
        <Text style={[styles.rowLabel, disabled && styles.rowLabelDisabled]}>{label}</Text>
        {badge ? (
          <View style={styles.comingSoonBadge}>
            <Text style={styles.comingSoonText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.rowRight}>
        {value ? (
          <Text style={[styles.rowValue, valueColor ? { color: valueColor } : {}]} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {!disabled && <Text style={styles.rowChevron}>›</Text>}
      </View>
    </TouchableOpacity>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  const Colors = useThemeColors();
  const styles = makeStyles(Colors);
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

// ─── EditModal ────────────────────────────────────────────────────────────────
function EditModal({
  visible,
  title,
  placeholder,
  value,
  onSave,
  onCancel,
  keyboardType = 'default',
  autoCapitalize = 'words',
  maxLength = 60,
  helpText,
}: {
  visible: boolean;
  title: string;
  placeholder: string;
  value: string;
  onSave: (v: string) => void;
  onCancel: () => void;
  keyboardType?: 'default' | 'email-address';
  autoCapitalize?: 'none' | 'words' | 'sentences';
  maxLength?: number;
  helpText?: string;
}) {
  const Colors = useThemeColors();
  const styles = makeStyles(Colors);
  const [text, setText] = useState(value);
  // Reset when opening
  React.useEffect(() => { if (visible) setText(value); }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onCancel}>
        <TouchableOpacity activeOpacity={1} style={styles.editModalCard}>
          <Text style={styles.editModalTitle}>{title}</Text>
          <TextInput
            style={styles.editModalInput}
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor={Colors.textMuted}
            autoFocus
            maxLength={maxLength}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            returnKeyType="done"
            onSubmitEditing={() => onSave(text)}
          />
          {helpText ? <Text style={styles.editModalHelp}>{helpText}</Text> : null}
          <View style={styles.editModalActions}>
            <TouchableOpacity style={styles.editCancelBtn} onPress={onCancel}>
              <Text style={styles.editCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.editSaveBtn} onPress={() => onSave(text)}>
              <Text style={styles.editSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────
function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel,
  confirmColor,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const Colors = useThemeColors();
  const styles = makeStyles(Colors);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onCancel}>
        <TouchableOpacity activeOpacity={1} style={styles.confirmCard}>
          <Text style={styles.confirmTitle}>{title}</Text>
          <Text style={styles.confirmMessage}>{message}</Text>
          <View style={styles.confirmActions}>
            <TouchableOpacity style={styles.confirmCancelBtn} onPress={onCancel}>
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, confirmColor ? { backgroundColor: confirmColor } : {}]}
              onPress={onConfirm}
            >
              <Text style={styles.confirmBtnText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const user = useAppStore((s) => s.user);
  const updateName = useAppStore((s) => s.updateName);
  const updateEmail = useAppStore((s) => s.updateEmail);
  const resetApp = useAppStore((s) => s.resetApp);
  const colorScheme = useAppStore((s) => s.colorScheme);
  const setColorScheme = useAppStore((s) => s.setColorScheme);
  const fontScale = useAppStore((s) => s.fontScale);
  const setFontScale = useAppStore((s) => s.setFontScale);
  const fsIdx = fontScaleIndex(fontScale);
  const Colors = useThemeColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { showToast } = useToast();

  const supabaseUserId = useAppStore((s) => s.supabaseUserId);
  const supabaseEmail  = useAppStore((s) => s.supabaseEmail);
  const supabaseSyncing = useAppStore((s) => s.supabaseSyncing);

  const [editingField, setEditingField] = useState<'name' | 'email' | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [analyticsOn, setAnalyticsOn] = useState(getConsentStatus() === 'granted');
  // ARCH-001: Magic Link state
  const [magicLinkEmail, setMagicLinkEmail] = useState('');
  const [magicLinkSending, setMagicLinkSending] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  React.useEffect(() => {
    page('settings', {});
  }, []);

  if (!user) return null;

  const handleToggleAnalytics = (value: boolean) => {
    setConsent(value);
    setAnalyticsOn(value);
    showToast({
      message: value ? 'Anonymous analytics enabled' : 'Analytics turned off',
      emoji: value ? '📊' : '🚫',
      variant: 'success',
    });
  };

  const handleExport = () => {
    const ok = exportProgress();
    showToast({
      message: ok ? 'Backup downloaded' : 'Nothing to export yet',
      emoji: ok ? '💾' : '⚠️',
      variant: ok ? 'success' : 'warning',
    });
  };

  const handleImport = () => {
    importProgress((ok, msg) =>
      showToast({ message: msg, emoji: ok ? '✅' : '⚠️', variant: ok ? 'success' : 'warning' })
    );
  };

  const handleSaveName = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      showToast({ message: 'Name cannot be empty', emoji: '⚠️', variant: 'warning' });
      return;
    }
    updateName(trimmed);
    setEditingField(null);
    showToast({ message: 'Name updated', emoji: '✅', variant: 'success' });
  };

  const handleSaveEmail = (value: string) => {
    const trimmed = value.trim();
    // Basic email validation
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      showToast({ message: 'Please enter a valid email address', emoji: '⚠️', variant: 'warning' });
      return;
    }
    updateEmail(trimmed);
    setEditingField(null);
    showToast({ message: trimmed ? 'Email updated' : 'Email removed', emoji: '✅', variant: 'success' });
  };

  const handleReset = () => {
    setShowResetConfirm(false);
    resetApp();
    // resetApp sets hasOnboarded=false → AppNavigator redirects to Onboarding automatically
  };

  // COMP-001: permanently delete the cloud account + all data via the
  // delete-account Edge Function, then wipe the device and return to onboarding.
  const handleDeleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    const result = await deleteAccount();
    setDeleting(false);
    if (!result.ok) {
      showToast({
        message: result.error ?? 'Could not delete account. Please try again.',
        emoji: '⚠️',
        variant: 'warning',
      });
      return;
    }
    setShowDeleteConfirm(false);
    // resetApp also signs out locally; hasOnboarded=false → redirect to Onboarding.
    resetApp();
    showToast({ message: 'Account and cloud data permanently deleted.', emoji: '🗑️', variant: 'success' });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* ── Profile ───────────────────────────────────────────────── */}
        <SectionHeader title="PROFILE" />
        <View style={styles.sectionCard}>
          <SettingsRow
            icon="👤"
            label="Display Name"
            value={user.name}
            onPress={() => setEditingField('name')}
          />
          <View style={styles.rowDivider} />
          <SettingsRow
            icon="🔖"
            label="Handle"
            value={`@${user.handle}`}
            valueColor={Colors.textMuted}
            disabled
          />
          <View style={styles.rowDivider} />
          <SettingsRow
            icon="✉️"
            label="Email"
            value={user.email || 'Not set'}
            valueColor={user.email ? Colors.textSub : Colors.textMuted}
            onPress={() => setEditingField('email')}
          />
        </View>

        {/* ── Cloud Backup (ARCH-001: Supabase) ─────────────────────── */}
        {isSupabaseEnabled && (
          <>
            <SectionHeader title="CLOUD BACKUP" />
            <View style={styles.sectionCard}>
              {supabaseUserId ? (
                // Signed in — show status + sign-out
                <>
                  <View style={styles.row}>
                    <Text style={styles.rowIcon}>☁️</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowLabel}>Progress backed up</Text>
                      <Text style={[styles.rowValue, { color: Colors.success }]}>
                        {supabaseSyncing ? 'Syncing…' : `Signed in as ${supabaseEmail ?? 'unknown'}`}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.rowDivider} />
                  <SettingsRow
                    icon="🚪"
                    label="Sign out of cloud backup"
                    valueColor={Colors.danger}
                    onPress={async () => {
                      await signOut();
                      showToast({ message: 'Signed out. Progress stays on this device.', emoji: '📱', variant: 'success' });
                    }}
                  />
                </>
              ) : magicLinkSent ? (
                // Magic link sent — waiting
                <View style={[styles.row, { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
                  <Text style={styles.rowIcon}>📬</Text>
                  <Text style={[styles.rowLabel, { flex: 0 }]}>Check your inbox</Text>
                  <Text style={styles.rowSubValue}>
                    We sent a sign-in link to {magicLinkEmail}. Tap it on any device to back up and sync your progress.
                  </Text>
                  <TouchableOpacity onPress={() => { setMagicLinkSent(false); setMagicLinkEmail(''); }}>
                    <Text style={{ color: Colors.primaryLight, fontSize: FontSize.sm, marginTop: 4 }}>Use a different email →</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                // Not signed in — show Magic Link form
                <View style={[styles.row, { flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={styles.rowIcon}>☁️</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowLabel}>Back up to cloud</Text>
                      <Text style={styles.rowSubValue}>Sign in to keep your progress safe across devices. Your email is stored securely with Supabase — used only for sign-in, never shared.</Text>
                    </View>
                  </View>
                  <TextInput
                    style={[styles.input, { marginTop: 4 }]}
                    placeholder="Enter your email"
                    placeholderTextColor={Colors.textMuted}
                    value={magicLinkEmail}
                    onChangeText={setMagicLinkEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel="Email for cloud backup"
                  />
                  <TouchableOpacity
                    style={[styles.actionBtn, { opacity: magicLinkSending || !magicLinkEmail.includes('@') ? 0.4 : 1 }]}
                    disabled={magicLinkSending || !magicLinkEmail.includes('@')}
                    onPress={async () => {
                      setMagicLinkSending(true);
                      const result = await sendMagicLink(magicLinkEmail);
                      setMagicLinkSending(false);
                      if (result.ok) {
                        setMagicLinkSent(true);
                      } else {
                        showToast({ message: result.error ?? 'Failed to send link', emoji: '⚠️', variant: 'warning' });
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Send magic link to back up progress"
                  >
                    <Text style={styles.actionBtnText}>
                      {magicLinkSending ? 'Sending…' : 'Send Sign-in Link ✉️'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </>
        )}

        {/* ── Account ───────────────────────────────────────────────── */}
        <SectionHeader title="ACCOUNT" />
        <View style={styles.sectionCard}>
          <SettingsRow
            icon="❄️"
            label="Streak Freezes"
            value={`${user.streakFreezes ?? 0} available`}
            valueColor={Colors.primary + 'CC'}
            disabled
          />
          <View style={styles.rowDivider} />
          <SettingsRow
            icon="🔔"
            label="Notifications"
            badge="Phase 3"
            disabled
          />
        </View>

        {/* ── App info ─────────────────────────────────────────────── */}
        <SectionHeader title="APP" />
        <View style={styles.sectionCard}>
          <SettingsRow
            icon="🎨"
            label="Appearance"
            value={colorScheme === 'dark' ? '🌙 Dark' : '☀️ Light'}
            onPress={() => setColorScheme(colorScheme === 'dark' ? 'light' : 'dark')}
          />
          <View style={styles.rowDivider} />
          {/* Text Size — − / + stepper, scales the whole app */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🔠</Text>
              <Text style={styles.rowLabel}>Text Size</Text>
            </View>
            <View style={styles.fontStepper}>
              <TouchableOpacity
                style={[styles.fontStepBtn, fsIdx === 0 && styles.fontStepBtnDisabled]}
                onPress={() => setFontScale(FONT_SCALE_STEPS[Math.max(0, fsIdx - 1)])}
                disabled={fsIdx === 0}
                accessibilityRole="button"
                accessibilityLabel="Decrease text size"
              >
                <Text style={styles.fontStepMinus}>A</Text>
              </TouchableOpacity>
              <Text style={styles.fontScaleLabel}>{FONT_SCALE_LABELS[fsIdx]}</Text>
              <TouchableOpacity
                style={[styles.fontStepBtn, fsIdx === FONT_SCALE_STEPS.length - 1 && styles.fontStepBtnDisabled]}
                onPress={() => setFontScale(FONT_SCALE_STEPS[Math.min(FONT_SCALE_STEPS.length - 1, fsIdx + 1)])}
                disabled={fsIdx === FONT_SCALE_STEPS.length - 1}
                accessibilityRole="button"
                accessibilityLabel="Increase text size"
              >
                <Text style={styles.fontStepPlus}>A</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.rowDivider} />
          <SettingsRow
            icon="📦"
            label="Version"
            value="1.0.0 (Pilot)"
            valueColor={Colors.textMuted}
            disabled
          />
          <View style={styles.rowDivider} />
          <SettingsRow
            icon="🔒"
            label="Privacy Policy"
            onPress={() => setShowPrivacy(true)}
          />
          <View style={styles.rowDivider} />
          <SettingsRow
            icon="📄"
            label="Terms of Service"
            onPress={() => setShowTerms(true)}
          />
        </View>

        {/* ── Data & Privacy ────────────────────────────────────────── */}
        <SectionHeader title="DATA & PRIVACY" />
        <View style={styles.sectionCard}>
          {/* Analytics opt-in toggle */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>📊</Text>
              <Text style={styles.rowLabel}>Anonymous Analytics</Text>
            </View>
            <Switch
              value={analyticsOn}
              onValueChange={handleToggleAnalytics}
              trackColor={{ false: Colors.cardAlt, true: Colors.primary }}
              thumbColor={Colors.white}
              accessibilityLabel="Toggle anonymous analytics"
            />
          </View>
          <View style={styles.rowDivider} />
          <SettingsRow icon="💾" label="Export Data" value="Backup" onPress={handleExport} />
          <View style={styles.rowDivider} />
          <SettingsRow icon="📥" label="Import Backup" value="Restore" onPress={handleImport} />
        </View>
        <View style={styles.noticeRow}>
          <Text style={styles.noticeIcon}>📱</Text>
          <Text style={styles.noticeText}>
            {supabaseUserId
              ? 'Your progress is stored on this device and synced to your cloud backup, so it survives clearing your browser or switching devices.'
              : 'Your progress is stored only on this device. Export a backup regularly so you don’t lose it if you clear your browser or switch devices.'}
          </Text>
        </View>

        {/* ── Danger zone ───────────────────────────────────────────── */}
        <SectionHeader title="DANGER ZONE" />
        <View style={[styles.sectionCard, styles.dangerCard]}>
          <TouchableOpacity
            style={styles.dangerRow}
            onPress={() => setShowResetConfirm(true)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Reset all progress"
          >
            <Text style={styles.dangerIcon}>🗑️</Text>
            <View style={styles.dangerTextCol}>
              <Text style={styles.dangerLabel}>Reset All Progress</Text>
              <Text style={styles.dangerSub}>
                {supabaseUserId
                  ? 'Wipes this device and signs you out. Your cloud backup is kept.'
                  : 'Deletes all your XP, outputs, and skills. Cannot be undone.'}
              </Text>
            </View>
            <Text style={styles.dangerChevron}>›</Text>
          </TouchableOpacity>

          {/* COMP-001: full account + cloud erasure — only meaningful when signed in */}
          {isSupabaseEnabled && supabaseUserId && (
            <>
              <View style={styles.rowDivider} />
              <TouchableOpacity
                style={styles.dangerRow}
                onPress={() => setShowDeleteConfirm(true)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Delete account and all cloud data"
              >
                <Text style={styles.dangerIcon}>☠️</Text>
                <View style={styles.dangerTextCol}>
                  <Text style={styles.dangerLabel}>Delete Account</Text>
                  <Text style={styles.dangerSub}>
                    Permanently erases your account, cloud data, and email. Cannot be undone.
                  </Text>
                </View>
                <Text style={styles.dangerChevron}>›</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Edit modals */}
      <EditModal
        visible={editingField === 'name'}
        title="Display Name"
        placeholder="Your name"
        value={user.name}
        onSave={handleSaveName}
        onCancel={() => setEditingField(null)}
        autoCapitalize="words"
        maxLength={40}
      />
      <EditModal
        visible={editingField === 'email'}
        title="Email Address"
        placeholder="you@example.com"
        value={user.email ?? ''}
        onSave={handleSaveEmail}
        onCancel={() => setEditingField(null)}
        keyboardType="email-address"
        autoCapitalize="none"
        maxLength={120}
        helpText="Used for future account recovery and notifications."
      />

      {/* Reset confirmation */}
      <ConfirmModal
        visible={showResetConfirm}
        title="Reset All Progress?"
        message={
          supabaseUserId
            ? `This will permanently delete all progress for @${user.handle} from THIS DEVICE and sign you out of Cloud Backup. Your cloud backup is NOT deleted — signing in again can restore it. To erase your cloud data too, email ${PRIVACY_CONTACT}. This cannot be undone on this device.`
            : `This will permanently delete all your XP, outputs, skills, and settings. Your account @${user.handle} will be wiped. This cannot be undone.`
        }
        confirmLabel="Reset Everything"
        confirmColor="#EF4444"
        onConfirm={handleReset}
        onCancel={() => setShowResetConfirm(false)}
      />

      {/* COMP-001: permanent account deletion confirmation */}
      <ConfirmModal
        visible={showDeleteConfirm}
        title="Delete Account?"
        message={
          `This permanently erases your account and ALL cloud data for @${user.handle} — your profile, every output, your skill progress, and the email kept for Cloud Backup. This is a full erasure on our servers and on this device. It cannot be undone.`
        }
        confirmLabel={deleting ? 'Deleting…' : 'Delete Forever'}
        confirmColor="#EF4444"
        onConfirm={handleDeleteAccount}
        onCancel={() => { if (!deleting) setShowDeleteConfirm(false); }}
      />

      <PrivacyPolicyModal visible={showPrivacy} onClose={() => setShowPrivacy(false)} />
      <TermsOfServiceModal visible={showTerms} onClose={() => setShowTerms(false)} />
    </SafeAreaView>
  );
}

const makeStyles = (Colors: ColorsType) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },

  // ── Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 22,
    color: Colors.text,
    lineHeight: 28,
    fontWeight: '300',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  headerSpacer: {
    width: 36,
  },

  // ── Content
  content: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },

  // ── Section
  sectionHeader: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
  },

  // ── Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
  },
  rowDisabled: {
    opacity: 0.6,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  rowIcon: {
    fontSize: 18,
    width: 24,
    textAlign: 'center',
  },
  rowLabel: {
    fontSize: FontSize.base,
    fontWeight: '500',
    color: Colors.text,
  },
  rowLabelDisabled: {
    color: Colors.textSub,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '45%',
  },
  rowValue: {
    fontSize: FontSize.sm,
    color: Colors.textSub,
    textAlign: 'right',
  },
  rowChevron: {
    fontSize: 20,
    color: Colors.textMuted,
    lineHeight: 24,
    fontWeight: '300',
  },
  rowDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 52,
  },

  // ── Text Size stepper
  fontStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fontScaleLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSub,
    minWidth: 58,
    textAlign: 'center',
  },
  fontStepBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontStepBtnDisabled: {
    opacity: 0.4,
  },
  fontStepMinus: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.primaryLight,
  },
  fontStepPlus: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.primaryLight,
  },

  // ── Local-data notice
  noticeRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 4,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.lg,
  },
  noticeIcon: {
    fontSize: 14,
    marginTop: 1,
  },
  noticeText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 17,
  },

  // ── Coming soon badge
  comingSoonBadge: {
    backgroundColor: Colors.primaryDim,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  comingSoonText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.primaryLight,
    letterSpacing: 0.5,
  },

  // ── Danger zone
  dangerCard: {
    borderColor: '#EF444430',
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    gap: 12,
  },
  dangerIcon: {
    fontSize: 18,
    width: 24,
    textAlign: 'center',
  },
  dangerTextCol: {
    flex: 1,
  },
  dangerLabel: {
    fontSize: FontSize.base,
    fontWeight: '600',
    color: '#EF4444',
  },
  dangerSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  dangerChevron: {
    fontSize: 20,
    color: '#EF444480',
    lineHeight: 24,
    fontWeight: '300',
  },

  // ── Edit modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  editModalCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 380,
  },
  editModalTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  editModalInput: {
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.primary + '50',
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: FontSize.base,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  editModalHelp: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.md,
    lineHeight: 16,
  },
  editModalActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  editCancelBtn: {
    flex: 1,
    backgroundColor: Colors.cardAlt,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  editCancelText: {
    fontSize: FontSize.base,
    fontWeight: '600',
    color: Colors.textSub,
  },
  editSaveBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  editSaveText: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.white,
  },

  // ── Confirm modal
  confirmCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: '#EF444430',
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 380,
  },
  confirmTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  confirmMessage: {
    fontSize: FontSize.base,
    color: Colors.textSub,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  confirmCancelBtn: {
    flex: 1,
    backgroundColor: Colors.cardAlt,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  confirmCancelText: {
    fontSize: FontSize.base,
    fontWeight: '600',
    color: Colors.textSub,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmBtnText: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.white,
  },
  // ARCH-001: Cloud Backup section
  rowSubValue: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    flex: 1,
  },
  input: {
    backgroundColor: Colors.card ?? Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  actionBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 13,
    alignItems: 'center',
    // @ts-ignore — web only
    boxShadow: '0 4px 16px rgba(124,58,237,0.35)',
  },
  actionBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.white,
  },
});

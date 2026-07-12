// ─── Persistence ────────────────────────────────────────────────────────────────
// localStorage persistence for the MaglakbAI store, extracted from appStore.ts
// (ARCH-002) and made schema-versioned (ARCH-003).
//
// On disk the payload is a versioned envelope: `{ v: SCHEMA_VERSION, data: {...} }`.
// On load we detect the version, run migrations up to the current schema, and
// lightly validate the shape before handing it back — so a schema change can never
// silently corrupt or crash on stale data (with no backend, localStorage is the
// system of record). Legacy pre-ARCH-003 saves were unversioned flat objects;
// they are treated as schema v0 and migrated forward.

import type { StoreApi } from 'zustand';
import type { AppState } from './appStore'; // type-only import → no runtime cycle

const STORAGE_KEY = 'maglakbai_v1'; // current localStorage key
// Pre-rebrand keys, newest first. Read as a fallback and promoted to STORAGE_KEY
// on load so the SkillForge → MaglakbAI rename never orphans existing user data.
const LEGACY_STORAGE_KEYS = ['skillforge_v1'];
export const SCHEMA_VERSION = 1; // bump when the persisted shape changes; add a migration step below

interface VersionedEnvelope {
  v: number;
  data: unknown;
}

// The persisted slice of state — the single typed shape we read/write.
// (Adding a persisted field: update getPersistable + the equality check in
// attachPersistence, and add a migration step + SCHEMA_VERSION bump if the
// change isn't purely additive-with-safe-defaults.)
export type PersistedState = ReturnType<typeof getPersistable>;

function getPersistable(state: AppState) {
  return {
    hasOnboarded: state.hasOnboarded,
    user: state.user,
    userSkills: state.userSkills,
    outputs: state.outputs,
    unlockedAchievementIds: state.unlockedAchievementIds,
    customPaths: state.customPaths,
    prioritizedPathId: state.prioritizedPathId,
    roadmaps: state.roadmaps,
    celebratedMilestones: state.celebratedMilestones,
    userFeedPosts: state.userFeedPosts,
    savedPostIds: state.savedPostIds,
    colorScheme: state.colorScheme,
    fontScale: state.fontScale,
    reminderEnabled: state.reminderEnabled,
    reminderTime: state.reminderTime,
    reminderVibrate: state.reminderVibrate,
    reminderLastShownDate: state.reminderLastShownDate,
    careerOutcomes: state.careerOutcomes,
    submittedSignalSkillIds: state.submittedSignalSkillIds,
  };
}

// Is this parsed JSON a plausible MaglakbAI backup? Accepts BOTH shapes we have ever
// exported: the current versioned envelope `{ v, data: { user | hasOnboarded, ... } }`
// (ARCH-003) and the legacy flat save `{ user | hasOnboarded, ... }`. Kept here — next
// to the envelope definition — so import validation can't silently drift from the
// persisted format again (the Settings import previously checked only the flat shape
// and rejected every envelope-format backup the app itself exports).
export function isValidBackup(parsed: unknown): boolean {
  const looksLikeSave = (o: unknown): boolean =>
    isPlainObject(o) && ('user' in o || 'hasOnboarded' in o);
  if (looksLikeSave(parsed)) return true; // legacy flat backup
  return isPlainObject(parsed) && typeof parsed.v === 'number' && looksLikeSave(parsed.data);
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

// Migrate raw persisted `data` from `fromVersion` up to SCHEMA_VERSION.
// Each step transforms the previous shape into the next; returns null if the
// data can't be brought to the current version.
function migrate(data: Record<string, unknown>, fromVersion: number): Record<string, unknown> | null {
  let v = fromVersion;
  let d = data;
  // v0 → v1: the legacy unversioned flat object already matches v1's data shape (identity).
  if (v === 0) v = 1;
  // Future steps go here, e.g.:
  //   if (v === 1) { d = migrateV1toV2(d); v = 2; }
  return v === SCHEMA_VERSION ? d : null;
}

function saveToStorage(data: PersistedState): void {
  try {
    const envelope: VersionedEnvelope = { v: SCHEMA_VERSION, data };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Notify UI (e.g. avatar too large) — components listen for this event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('maglakbai:storage-quota-exceeded'));
    }
  }
}

export function loadFromStorage(): Partial<PersistedState> | null {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    let fromLegacyKey = false;
    if (!raw) {
      // No data under the current key — fall back to pre-rebrand keys so the
      // SkillForge → MaglakbAI rename doesn't orphan existing users' progress.
      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        const legacyRaw = localStorage.getItem(legacyKey);
        if (legacyRaw) {
          raw = legacyRaw;
          fromLegacyKey = true;
          break;
        }
      }
    }
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) return null;

    // Versioned envelope vs. legacy unversioned payload (schema v0).
    let version: number;
    let data: unknown;
    if (typeof parsed.v === 'number' && 'data' in parsed) {
      version = parsed.v;
      data = parsed.data;
    } else {
      version = 0;
      data = parsed;
    }

    if (!isPlainObject(data)) return null;
    if (version > SCHEMA_VERSION) return null; // saved by a newer app version → start fresh rather than crash

    const migrated = migrate(data, version);
    if (!migrated) return null;
    const result = migrated as Partial<PersistedState>;

    if (fromLegacyKey) {
      // Promote legacy data to the current key once, then drop the old key so
      // this fallback is a one-time migration rather than read on every load.
      try {
        saveToStorage(result as PersistedState);
        for (const legacyKey of LEGACY_STORAGE_KEYS) localStorage.removeItem(legacyKey);
      } catch {
        // best-effort — reading the data is what matters; promotion can retry next load
      }
    }

    return result;
  } catch (err) {
    // MED-007: don't fail silently — a read/parse error (corrupt storage, quota,
    // Safari ITP purge) should be visible when debugging "my progress vanished".
    console.warn('[persistence] loadFromStorage failed — starting fresh:', err);
    return null;
  }
}

// Subscribe to the store and persist the persistable slice on every change.
// Short-circuits via reference equality when no persisted field changed.
export function attachPersistence(store: StoreApi<AppState>): void {
  let last: PersistedState | null = null;
  store.subscribe((state) => {
    const p = getPersistable(state);
    if (
      last !== null &&
      last.hasOnboarded === p.hasOnboarded &&
      last.user === p.user &&
      last.userSkills === p.userSkills &&
      last.outputs === p.outputs &&
      last.unlockedAchievementIds === p.unlockedAchievementIds &&
      last.customPaths === p.customPaths &&
      last.prioritizedPathId === p.prioritizedPathId &&
      last.roadmaps === p.roadmaps &&
      last.celebratedMilestones === p.celebratedMilestones &&
      last.userFeedPosts === p.userFeedPosts &&
      last.savedPostIds === p.savedPostIds &&
      last.colorScheme === p.colorScheme &&
      last.fontScale === p.fontScale &&
      last.reminderEnabled === p.reminderEnabled &&
      last.reminderTime === p.reminderTime &&
      last.reminderVibrate === p.reminderVibrate &&
      last.reminderLastShownDate === p.reminderLastShownDate &&
      last.careerOutcomes === p.careerOutcomes &&
      last.submittedSignalSkillIds === p.submittedSignalSkillIds
    ) return;
    last = p;
    saveToStorage(p);
  });
}

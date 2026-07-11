// ─── Log-Reminder Timing ────────────────────────────────────────────────────────
// Pure decision for the in-app "log your output" reminder (an alarm that fires while
// the app is open). Kept dependency-free so the timing rules are unit-tested away from
// timers, the DOM, and the Vibration API. The component in components/LogReminder.tsx
// just wires this to a setInterval + toast + navigator.vibrate.
//
// NOTE: this is intentionally an in-app reminder — it can only fire while the app is
// open in the browser/PWA. Delivery when the app is CLOSED needs push/scheduled
// notifications (Phase 3), which the pilot does not ship.

import { localDateStr } from '../utils/dates';

// Parse an 'HH:MM' 24-hour wall-clock string → minutes since local midnight.
// Returns null for anything malformed or out of range.
export function parseHHMM(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export interface ReminderInput {
  enabled: boolean;
  reminderTime: string;          // 'HH:MM' local wall-clock the user picked
  loggedToday: boolean;          // did they already log an output today?
  lastShownDate: string | null;  // local date the reminder last fired (once-a-day guard)
  now?: Date;                    // injectable for tests; defaults to real now
}

// Should the reminder fire right now? True only when it's enabled, the user hasn't
// logged today, the reminder hasn't already fired today, and the chosen time has
// arrived (current local time ≥ the reminder time).
export function shouldFireLogReminder(input: ReminderInput): boolean {
  const now = input.now ?? new Date();
  if (!input.enabled) return false;
  if (input.loggedToday) return false;
  if (input.lastShownDate === localDateStr(now)) return false;
  const target = parseHHMM(input.reminderTime);
  if (target === null) return false;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= target;
}

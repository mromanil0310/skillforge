// ─── LogReminder ────────────────────────────────────────────────────────────────
// Headless "alarm" that reminds the user to log an output. Renders nothing; while the
// app is open it checks once a minute (and whenever the tab regains focus) whether the
// reminder should fire, then shows a toast and — if the user enabled it and the browser
// supports it — vibrates the device.
//
// This is an IN-APP reminder: it can only fire while the app is open. Firing when the
// app is CLOSED requires push/scheduled notifications (Phase 3), which the pilot doesn't
// ship. The timing decision lives in domain/reminder.ts so it stays unit-tested.

import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { useToast } from './Toast';
import { shouldFireLogReminder } from '../domain/reminder';
import { localDateStr } from '../utils/dates';

export const vibrationSupported = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export default function LogReminder() {
  const enabled = useAppStore((s) => s.reminderEnabled);
  const reminderTime = useAppStore((s) => s.reminderTime);
  const vibrate = useAppStore((s) => s.reminderVibrate);
  const lastShownDate = useAppStore((s) => s.reminderLastShownDate);
  const outputs = useAppStore((s) => s.outputs);
  const markReminderShown = useAppStore((s) => s.markReminderShown);
  const { showToast } = useToast();

  // Keep the latest values in a ref so the interval callback never goes stale
  // without re-creating the timer on every state change.
  const latest = useRef({ enabled, reminderTime, vibrate, lastShownDate, outputs });
  latest.current = { enabled, reminderTime, vibrate, lastShownDate, outputs };

  useEffect(() => {
    const check = () => {
      const s = latest.current;
      if (!s.enabled) return;
      const today = localDateStr();
      const loggedToday = s.outputs.some((o) => localDateStr(new Date(o.createdAt)) === today);
      if (!shouldFireLogReminder({
        enabled: s.enabled,
        reminderTime: s.reminderTime,
        loggedToday,
        lastShownDate: s.lastShownDate,
      })) return;

      markReminderShown(today); // once-a-day guard — stamp before showing
      if (s.vibrate && vibrationSupported()) {
        navigator.vibrate([200, 100, 200]); // buzz–pause–buzz, like a gentle alarm
      }
      showToast({
        message: 'Time to log an output — tap ➕ to keep your streak alive',
        emoji: '⏰',
        variant: 'warning',
        duration: 6000,
      });
    };

    check(); // catch the case where the app opens after the reminder time
    const id = setInterval(check, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible);
    }
    return () => {
      clearInterval(id);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
  }, [markReminderShown, showToast]);

  return null;
}

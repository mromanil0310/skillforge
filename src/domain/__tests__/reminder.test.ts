import { describe, it, expect } from 'vitest';
import { parseHHMM, shouldFireLogReminder } from '../reminder';
import { localDateStr } from '../../utils/dates';

describe('parseHHMM', () => {
  it('parses valid 24-hour times to minutes since midnight', () => {
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('09:30')).toBe(570);
    expect(parseHHMM('19:00')).toBe(1140);
    expect(parseHHMM('23:59')).toBe(1439);
  });
  it('returns null for malformed or out-of-range input', () => {
    expect(parseHHMM('7pm')).toBeNull();
    expect(parseHHMM('24:00')).toBeNull();
    expect(parseHHMM('12:60')).toBeNull();
    expect(parseHHMM('')).toBeNull();
  });
});

describe('shouldFireLogReminder', () => {
  const now = new Date(2026, 6, 11, 20, 0); // local 8:00 PM
  const base = { enabled: true, reminderTime: '19:00', loggedToday: false, lastShownDate: null, now };

  it('fires when enabled, unlogged, past the time, and not yet shown today', () => {
    expect(shouldFireLogReminder(base)).toBe(true);
  });
  it('does not fire when disabled', () => {
    expect(shouldFireLogReminder({ ...base, enabled: false })).toBe(false);
  });
  it('does not fire when the user already logged today', () => {
    expect(shouldFireLogReminder({ ...base, loggedToday: true })).toBe(false);
  });
  it('does not fire before the chosen time', () => {
    const early = new Date(2026, 6, 11, 18, 59);
    expect(shouldFireLogReminder({ ...base, now: early })).toBe(false);
  });
  it('fires exactly at the chosen minute', () => {
    const onTime = new Date(2026, 6, 11, 19, 0);
    expect(shouldFireLogReminder({ ...base, now: onTime })).toBe(true);
  });
  it('does not fire twice on the same day (once shown, stays quiet)', () => {
    expect(shouldFireLogReminder({ ...base, lastShownDate: localDateStr(now) })).toBe(false);
  });
  it('fires again the next day even if it fired yesterday', () => {
    expect(shouldFireLogReminder({ ...base, lastShownDate: '2026-07-10' })).toBe(true);
  });
  it('does not fire when the time string is malformed', () => {
    expect(shouldFireLogReminder({ ...base, reminderTime: 'evening' })).toBe(false);
  });
});

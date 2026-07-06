import { describe, it, expect } from 'vitest';
import { localDateStr, localDaysAgoStr } from '../dates';

// RR-5: day keys must follow the user's WALL CLOCK, not UTC.
describe('localDateStr', () => {
  it('formats the LOCAL calendar date (not the UTC date)', () => {
    // 00:30 local on Jan 2 — in any UTC+east timezone the UTC date is still Jan 1.
    const d = new Date(2026, 0, 2, 0, 30);
    expect(localDateStr(d)).toBe('2026-01-02');
  });

  it('pads month and day', () => {
    expect(localDateStr(new Date(2026, 2, 5))).toBe('2026-03-05');
  });

  it('disagrees with toISOString near local midnight in a non-UTC zone', () => {
    const d = new Date(2026, 6, 5, 0, 10); // 00:10 local
    if (d.getTimezoneOffset() !== 0) {
      expect(localDateStr(d)).not.toBe(d.toISOString().slice(0, 10));
    }
    expect(localDateStr(d)).toBe('2026-07-05');
  });
});

describe('localDaysAgoStr', () => {
  it('walks back across month and year boundaries in local time', () => {
    expect(localDaysAgoStr(1, new Date(2026, 0, 1, 9))).toBe('2025-12-31');
    expect(localDaysAgoStr(2, new Date(2026, 2, 1, 9))).toBe('2026-02-27');
  });

  it('0 days ago is today', () => {
    const now = new Date(2026, 6, 5, 23, 59);
    expect(localDaysAgoStr(0, now)).toBe(localDateStr(now));
  });
});

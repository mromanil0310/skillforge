// Local-calendar day keys (RR-5).
//
// A user's "day" — for streaks, the activity dots, and "logged today" — must follow
// their WALL CLOCK, not UTC. The app previously keyed days via toISOString().slice(0,10)
// (UTC), so for the Philippines (UTC+8) the day flipped at 08:00 AM: an output logged at
// 11 PM and another at 7 AM counted as the same "day", and the streak day rolled over
// mid-morning. Every semantic day comparison now goes through these helpers.
//
// Transition note (no migration needed): previously-stored lastActiveDate values are UTC
// day keys. For UTC+east users the UTC key is ≤ the local key, so switching frames can
// only make a gap look smaller — a streak is never broken by the switch (at worst one
// same-day log is read as consecutive-day once). For UTC-west users the UTC key can be
// one day ahead, costing at most one missed increment once. Both self-correct next log.

export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function localDaysAgoStr(daysAgo: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - daysAgo);
  return localDateStr(d);
}

/** Shared care: where each child is, and when they swap.
 *
 * Two things this deliberately is not. It is not a custody log — nothing here
 * records who did what, counts nights for anyone's benefit, or keeps evidence.
 * And it is not a separate app bolted on: a care schedule is a repeating cycle
 * anchored to a Monday, exactly like a work roster, so the calendar treats it
 * as one more thing the family has going on.
 */

import type { CareSchedule, Entry, Household, Id, ISODate, Settings } from '../types';
import { addDays, dayName, diffDays, startOfWeek, weekday } from '../lib/date';

export interface CarePattern {
  id: string;
  /** lowercase interface copy */
  label: string;
  sub: string;
  /** a is the household the cycle starts with */
  build: (a: Id, b: Id) => Id[];
}

const rep = (id: Id, n: number): Id[] => Array.from({ length: n }, () => id);

/** Cycles start on a Monday and run in whole weeks, so weekend-shaped
 *  patterns stay put. */
export const CARE_PATTERNS: CarePattern[] = [
  {
    id: 'alternatingWeeks',
    label: 'week on / week off',
    sub: 'a full week each, swapping every Monday',
    build: (a, b) => [...rep(a, 7), ...rep(b, 7)],
  },
  {
    id: '2-2-3',
    label: '2-2-3',
    sub: 'two days, two days, then a long weekend — alternating',
    build: (a, b) => [
      ...rep(a, 2), ...rep(b, 2), ...rep(a, 3),
      ...rep(b, 2), ...rep(a, 2), ...rep(b, 3),
    ],
  },
  {
    id: '3-4-4-3',
    label: '3-4-4-3',
    sub: 'three days, four days, and back the other way',
    build: (a, b) => [...rep(a, 3), ...rep(b, 4), ...rep(a, 4), ...rep(b, 3)],
  },
  {
    id: 'alternatingWeekends',
    label: 'alternating weekends',
    sub: 'mostly one home, every second weekend at the other',
    build: (a, b) => [...rep(a, 11), ...rep(b, 3)],
  },
  {
    id: 'custom',
    label: 'custom',
    sub: 'build the fortnight day by day',
    build: (a) => rep(a, 14),
  },
];

export function patternById(id: string): CarePattern | undefined {
  return CARE_PATTERNS.find((p) => p.id === id);
}

export function makeSchedule(
  childId: Id,
  patternId: string,
  a: Id,
  b: Id,
  anchor: ISODate,
): CareSchedule {
  const pattern = patternById(patternId) ?? CARE_PATTERNS[0];
  return {
    childId,
    patternId,
    cycle: pattern.build(a, b),
    // snap to a Monday so every pattern lines up with the week
    anchorDate: startOfWeek(anchor, true),
    overrides: {},
  };
}

/** Which household is this child at on this day? */
export function householdOn(schedule: CareSchedule, date: ISODate): Id | undefined {
  const override = schedule.overrides[date];
  if (override) return override;
  if (schedule.cycle.length === 0) return undefined;
  const delta = diffDays(date, schedule.anchorDate);
  const i = ((delta % schedule.cycle.length) + schedule.cycle.length) % schedule.cycle.length;
  return schedule.cycle[i];
}

export interface Handover {
  childId: Id;
  date: ISODate;
  from: Id;
  to: Id;
}

/** A handover is simply a day whose household differs from the day before. */
export function handoverOn(schedule: CareSchedule, date: ISODate): Handover | null {
  const to = householdOn(schedule, date);
  const from = householdOn(schedule, addDays(date, -1));
  if (!to || !from || to === from) return null;
  return { childId: schedule.childId, date, from, to };
}

export function handoversBetween(
  schedules: CareSchedule[],
  from: ISODate,
  to: ISODate,
): Handover[] {
  const out: Handover[] = [];
  for (const schedule of schedules) {
    let cursor = from;
    while (cursor <= to) {
      const h = handoverOn(schedule, cursor);
      if (h) out.push(h);
      cursor = addDays(cursor, 1);
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Where every child is on one day. The calendar shades days with this —
 *  care is a background state, not an event that happens every morning. */
export function careOnDate(
  schedules: CareSchedule[],
  date: ISODate,
): { childId: Id; householdId: Id }[] {
  return schedules
    .map((s) => {
      const householdId = householdOn(s, date);
      return householdId ? { childId: s.childId, householdId } : null;
    })
    .filter((x): x is { childId: Id; householdId: Id } => x !== null);
}

export function careBetween(
  schedules: CareSchedule[],
  from: ISODate,
  to: ISODate,
): Map<ISODate, { childId: Id; householdId: Id }[]> {
  const map = new Map<ISODate, { childId: Id; householdId: Id }[]>();
  let cursor = from;
  while (cursor <= to) {
    const row = careOnDate(schedules, cursor);
    if (row.length > 0) map.set(cursor, row);
    cursor = addDays(cursor, 1);
  }
  return map;
}

export function nextHandover(
  schedule: CareSchedule,
  from: ISODate,
  withinDays = 21,
): Handover | null {
  for (let i = 0; i <= withinDays; i++) {
    const h = handoverOn(schedule, addDays(from, i));
    if (h) return h;
  }
  return null;
}

/** 'back to Dad’s on Friday' — phrased as a plan, not a transaction. */
export function handoverLabel(h: Handover, households: Household[], today: ISODate): string {
  const to = households.find((x) => x.id === h.to)?.name ?? 'the other household';
  const days = diffDays(h.date, today);
  const when =
    days === 0 ? 'today' : days === 1 ? 'tomorrow' : days < 7 ? dayName(h.date) : `on ${dayName(h.date)}`;
  return `to ${to} ${when}`;
}

/** How long this stretch at the current household runs. */
export function stretchEnd(schedule: CareSchedule, date: ISODate, limit = 21): ISODate {
  const here = householdOn(schedule, date);
  let cursor = date;
  for (let i = 0; i < limit; i++) {
    const next = addDays(cursor, 1);
    if (householdOn(schedule, next) !== here) return cursor;
    cursor = next;
  }
  return cursor;
}

/* ---------- visibility between households ---------- */

/** The household whose eyes we are currently looking through. */
export function viewingHousehold(settings: Settings): Id | undefined {
  return settings.viewingAsHouseholdId ?? settings.homeHouseholdId;
}

/** Can the household currently being viewed see this entry?
 *
 * Default is yes. A family not using shared care never has an entry that
 * answers no, and nothing here hides anything until someone deliberately
 * marks an entry as one household's business.
 */
export function visibleToHousehold(entry: Entry, householdId: Id | undefined): boolean {
  const v = entry.householdVisibility;
  if (!v || v === 'both') return true;
  if (!householdId) return true;
  return v.household === householdId;
}

/* No gate needed: an entry with no household restriction is visible to
 * everyone, so this is a no-op for a family with one home. */
export function filterForHousehold(entries: Entry[], settings: Settings): Entry[] {
  const viewer = viewingHousehold(settings);
  return entries.filter((e) => visibleToHousehold(e, viewer));
}

/** True when the user is looking at someone else's view of the app. */
export function isPreviewing(settings: Settings): boolean {
  return (
    !!settings.viewingAsHouseholdId &&
    settings.viewingAsHouseholdId !== settings.homeHouseholdId
  );
}

/* ---------- helpers for the screens ---------- */

export function scheduleFor(
  schedules: CareSchedule[],
  childId: Id,
): CareSchedule | undefined {
  return schedules.find((s) => s.childId === childId);
}

/** The fortnight as day cells, for the pattern editor. */
export function cycleDays(schedule: CareSchedule): { index: number; day: string; householdId: Id }[] {
  return schedule.cycle.map((householdId, index) => ({
    index,
    day: dayName(addDays(schedule.anchorDate, index)).slice(0, 3),
    householdId,
  }));
}

export function isWeekend(date: ISODate): boolean {
  return weekday(date) >= 6;
}

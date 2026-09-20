/** School terms, and the holidays between them.
 *
 * For a family with children the school year is the shape of the whole year.
 * The useful part is not the terms themselves — it is the gaps: the fortnight
 * in April that someone has to cover, the six weeks over summer. So the terms
 * are stored and everything else is derived from them.
 */

import type { ISODate, JobType, SchoolLevel, SchoolTerm } from '../types';
import { addDays, diffDays, today } from '../lib/date';

export const SCHOOL_LEVELS: { value: SchoolLevel; label: string; sub: string }[] = [
  { value: 'daycare', label: 'daycare', sub: 'early childhood' },
  { value: 'primary', label: 'primary school', sub: 'years 1–6' },
  { value: 'intermediate', label: 'intermediate', sub: 'years 7–8' },
  { value: 'high', label: 'high school', sub: 'years 9–13' },
];

export const JOB_TYPES: { value: JobType; label: string }[] = [
  { value: 'fullTime', label: 'full time' },
  { value: 'partTime', label: 'part time' },
  { value: 'housekeeper', label: 'chief housekeeper' },
  { value: 'none', label: 'not working' },
];

export function schoolLevelLabel(level: SchoolLevel | undefined): string | undefined {
  return SCHOOL_LEVELS.find((l) => l.value === level)?.label;
}

export function jobTypeLabel(job: JobType | undefined): string | undefined {
  return JOB_TYPES.find((j) => j.value === job)?.label;
}

/* ---------- New Zealand ----------
 *
 * Terms 2 and 3 are fixed nationally. Term 1's start and Term 4's finish are
 * chosen by each school inside a window, so those two are marked approximate
 * and the app says so rather than pretending to know.
 *
 * Only a year whose dates have actually been published is offered. Guessing a
 * future year would put wrong dates in a family's calendar, which is worse
 * than making them type four dates.
 * Source: education.govt.nz, school terms and holiday dates.
 */
export const NZ_TERMS: Record<number, Omit<SchoolTerm, 'id'>[]> = {
  2026: [
    // starts between Mon 26 Jan and Mon 9 Feb — the school picks
    { name: 'Term 1', year: 2026, start: '2026-02-02', end: '2026-04-02', approximate: true },
    { name: 'Term 2', year: 2026, start: '2026-04-20', end: '2026-07-03' },
    { name: 'Term 3', year: 2026, start: '2026-07-20', end: '2026-09-25' },
    // ends no later than Fri 18 Dec
    { name: 'Term 4', year: 2026, start: '2026-10-12', end: '2026-12-18', approximate: true },
  ],
};

export function availablePresetYears(): number[] {
  return Object.keys(NZ_TERMS).map(Number).sort();
}

/* ---------- derived ---------- */

export function termOn(terms: SchoolTerm[], date: ISODate): SchoolTerm | undefined {
  return terms.find((t) => date >= t.start && date <= t.end);
}

export function isSchoolDay(terms: SchoolTerm[], date: ISODate): boolean {
  return Boolean(termOn(terms, date));
}

/** The holiday the family is in, if any — start and end of the gap. */
export function holidayAround(
  terms: SchoolTerm[],
  date: ISODate,
): { from: ISODate; to: ISODate } | undefined {
  if (terms.length === 0 || termOn(terms, date)) return undefined;
  const sorted = [...terms].sort((a, b) => a.start.localeCompare(b.start));
  const before = [...sorted].reverse().find((t) => t.end < date);
  const after = sorted.find((t) => t.start > date);
  if (!before || !after) return undefined;
  return { from: addDays(before.end, 1), to: addDays(after.start, -1) };
}

/** The next time school stops or starts, for the heads-up card. */
export function nextSchoolChange(
  terms: SchoolTerm[],
  from: ISODate = today(),
  withinDays = 21,
): { kind: 'holidaysStart' | 'termStarts'; date: ISODate; days: number; term?: SchoolTerm } | undefined {
  if (terms.length === 0) return undefined;
  const sorted = [...terms].sort((a, b) => a.start.localeCompare(b.start));

  const current = termOn(sorted, from);
  if (current) {
    const days = diffDays(current.end, from);
    if (days >= 0 && days <= withinDays) {
      return { kind: 'holidaysStart', date: addDays(current.end, 1), days: days + 1, term: current };
    }
    return undefined;
  }

  const next = sorted.find((t) => t.start >= from);
  if (!next) return undefined;
  const days = diffDays(next.start, from);
  return days <= withinDays ? { kind: 'termStarts', date: next.start, days, term: next } : undefined;
}

/** 'school holidays start on Saturday' / 'Term 4 starts in 5 days' */
export function schoolChangeLine(
  change: NonNullable<ReturnType<typeof nextSchoolChange>>,
): string {
  const when =
    change.days === 0 ? 'today' : change.days === 1 ? 'tomorrow' : `in ${change.days} days`;
  return change.kind === 'holidaysStart'
    ? `school holidays start ${when}.`
    : `${change.term?.name ?? 'term'} starts ${when}.`;
}

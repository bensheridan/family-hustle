/** "Off work" does not mean "available".
 *
 * Someone finishing a night shift is technically off, but they need sleep.
 * This module turns shifts into a plain-language read on whether a person can
 * actually be counted on that day.
 */

import type { Entry, Id, ISODate, Person } from '../types';
import { entryStartDate, expand, worksFromHomeOn } from './occurrences';
import { addDays, diffDays } from '../lib/date';
import { birthdayLine, yearsSince } from './birthdays';

export type AvailabilityState =
  | 'free'
  | 'working'
  | 'workingHome'
  | 'recovering'
  | 'limited';

export interface Availability {
  state: AvailabilityState;
  /** lowercase interface copy */
  label: string;
  detail?: string;
}

const LABELS: Record<AvailabilityState, string> = {
  free: 'around',
  working: 'at work',
  workingHome: 'working from home',
  recovering: 'sleeping off nights',
  limited: 'around, but stretched',
};

export function availabilityFor(
  entries: Entry[],
  personId: Id,
  date: ISODate,
): Availability {
  const shifts = expand(
    entries.filter((e) => e.type === 'shift' && e.personIds.includes(personId)),
    addDays(date, -1),
    date,
  );

  const onThisDay = shifts.filter((o) => o.date === date && !o.isTail);
  const tailToday = shifts.filter((o) => o.date === date && o.isTail);

  if (onThisDay.length > 0) {
    const shift = onThisDay[0];
    const impacts = shift.entry.type === 'shift' ? shift.entry.impacts : [];
    const detail = impacts.includes('availableBefore')
      ? 'free before the shift'
      : impacts.includes('availableAfter')
        ? 'free after the shift'
        : undefined;

    // At home but working is not the same as at work, and not the same as
    // free either. It is its own answer.
    if (shift.entry.type === 'shift' && worksFromHomeOn(shift.entry, date)) {
      return {
        state: 'workingHome',
        label: LABELS.workingHome,
        detail: detail ?? 'in the house, but working',
      };
    }

    return { state: 'working', label: LABELS.working, detail };
  }

  if (tailToday.length > 0) {
    const tail = tailToday[0];
    const impacts = tail.entry.type === 'shift' ? tail.entry.impacts : [];
    if (impacts.includes('sleepingAfter')) {
      return {
        state: 'recovering',
        label: LABELS.recovering,
        detail: 'off, but asleep — treat as unavailable',
      };
    }
    return { state: 'limited', label: LABELS.limited, detail: 'came off nights this morning' };
  }

  return { state: 'free', label: LABELS.free };
}

/** Anything the family should be nudged about for a given day. */
export interface HeadsUp {
  id: string;
  text: string;
  tone: 'info' | 'warn';
}

export function headsUpFor(
  entries: Entry[],
  people: { id: Id; name: string; role: string }[],
  date: ISODate,
): HeadsUp[] {
  const out: HeadsUp[] = [];
  const occs = expand(entries, date, date);

  for (const occ of occs) {
    if (occ.isTail) continue;

    if (occ.entry.prepNote) {
      out.push({
        id: `${occ.key}:prep`,
        text: occ.entry.prepNote,
        tone: 'info',
      });
    }

    if (occ.entry.type === 'shift') {
      const person = people.find((p) => p.id === occ.entry.personIds[0]);
      const impacts = occ.entry.impacts;
      if (person && impacts.includes('needsPickup')) {
        out.push({
          id: `${occ.key}:pickup`,
          text: `${person.name} is working — someone else needs to do pickup.`,
          tone: 'warn',
        });
      }
      if (person && occ.crossesMidnight) {
        out.push({
          id: `${occ.key}:nights`,
          text: `${person.name} is on nights tonight.`,
          tone: 'info',
        });
      }
    }
  }

  // A family event nobody flagged, but someone can't make
  const familyEvents = occs.filter((o) => o.entry.category === 'family' && !o.isTail);
  for (const ev of familyEvents) {
    const clashing = occs.filter(
      (o) =>
        o.entry.type === 'shift' &&
        !o.isTail &&
        o.entry.impacts.includes('noFamilyEvents'),
    );
    for (const clash of clashing) {
      const person = people.find((p) => p.id === clash.entry.personIds[0]);
      if (!person) continue;
      out.push({
        id: `${ev.key}:${clash.key}:clash`,
        text: `${person.name} is working and can't make ${ev.entry.title}.`,
        tone: 'warn',
      });
    }
  }

  return dedupe(out);
}

/** Things worth saying before the day arrives.
 *
 * Anything carrying a lead time gets mentioned once it comes inside it —
 * a birthday two weeks out, a renewal three weeks out. This is the whole
 * point of an annual reminder: on the day itself it is already too late to
 * buy a present or book the garage. */
export function upcomingReminders(
  entries: Entry[],
  people: Person[],
  from: ISODate,
): HeadsUp[] {
  const withLead = entries.filter((e) => (e.remindDaysBefore ?? 0) > 0);
  if (withLead.length === 0) return [];

  const maxLead = Math.max(...withLead.map((e) => e.remindDaysBefore ?? 0));
  const occs = expand(withLead, from, addDays(from, maxLead), { includeTails: false });

  const out: HeadsUp[] = [];
  for (const occ of occs) {
    if (occ.isTail) continue;
    const lead = occ.entry.remindDaysBefore ?? 0;
    const days = diffDays(occ.date, from);
    if (days < 0 || days > lead) continue;

    // A birthday can say how old they are turning, which is the bit people
    // actually want to know.
    if (occ.entry.derived === 'birthday') {
      const person = people.find((p) => p.id === occ.entry.personIds[0]);
      if (person) {
        out.push({
          id: `${occ.key}:birthday`,
          text: birthdayLine(person, occ.date, from),
          tone: days <= 1 ? 'warn' : 'info',
        });
        continue;
      }
    }

    const years = occ.entry.marksYears
      ? yearsSince(entryStartDate(occ.entry) ?? occ.date, occ.date)
      : undefined;

    out.push({
      id: `${occ.key}:lead`,
      text: years
        ? `${occ.entry.title} ${whenPhrase(days)} — ${years} years.`
        : `${occ.entry.title} ${whenPhrase(days)}.`,
      tone: days <= 2 ? 'warn' : 'info',
    });
  }
  return out;
}

function whenPhrase(days: number): string {
  if (days === 0) return 'is today';
  if (days === 1) return 'is tomorrow';
  if (days < 14) return `is in ${days} days`;
  if (days < 21) return 'is in a fortnight';
  return `is in ${Math.round(days / 7)} weeks`;
}

function dedupe(items: HeadsUp[]): HeadsUp[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    if (seen.has(i.text)) return false;
    seen.add(i.text);
    return true;
  });
}

export function availabilityColour(state: AvailabilityState): string {
  switch (state) {
    case 'working':
      return 'var(--p-orange)';
    case 'workingHome':
      return 'var(--p-teal)';
    case 'recovering':
      return 'var(--alert)';
    case 'limited':
      return 'var(--warn)';
    default:
      return 'var(--good)';
  }
}

/** "Off work" does not mean "available".
 *
 * Someone finishing a night shift is technically off, but they need sleep.
 * This module turns shifts into a plain-language read on whether a person can
 * actually be counted on that day.
 */

import type { Entry, Id, ISODate } from '../types';
import { expand } from './occurrences';
import { addDays } from '../lib/date';

export type AvailabilityState = 'free' | 'working' | 'recovering' | 'limited';

export interface Availability {
  state: AvailabilityState;
  /** lowercase interface copy */
  label: string;
  detail?: string;
}

const LABELS: Record<AvailabilityState, string> = {
  free: 'around',
  working: 'at work',
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
    case 'recovering':
      return 'var(--alert)';
    case 'limited':
      return 'var(--warn)';
    default:
      return 'var(--good)';
  }
}

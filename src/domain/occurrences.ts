/** Turning stored entries into dated things you can put on a calendar.
 *
 * The one rule worth stating out loud: an overnight shift is ONE shift.
 * Tuesday 6:00pm → Wednesday 6:00am produces a single occurrence anchored to
 * Tuesday, plus an optional muted tail on Wednesday that points back at the
 * same entry. It is never two unrelated events.
 */

import type { Entry, ISODate, Occurrence, Recurrence, ShiftEntry } from '../types';
import { addDays, at, daysBetween, diffDays, toISO, weekday } from '../lib/date';

/** Does a recurrence put this entry on this day? */
export function occursOn(entry: Entry, date: ISODate): boolean {
  const start = entryStartDate(entry);
  if (!start) return false;
  if (date < start) return false;
  if (entry.until && date > entry.until) return false;
  if (entry.exceptions.includes(date)) return false;

  const r: Recurrence = entry.recurrence;
  const delta = diffDays(date, start);

  switch (r.kind) {
    case 'none':
      return date === start;
    case 'daily':
      return delta % Math.max(1, r.interval) === 0;
    case 'weekly': {
      if (!r.weekdays.includes(weekday(date))) return false;
      const weeksApart = Math.floor(diffDays(date, startOfWeekISO(start)) / 7);
      return weeksApart % Math.max(1, r.interval) === 0;
    }
    case 'monthlyDay': {
      const day = Number(date.slice(8, 10));
      if (day === r.day) return true;
      /* Rent due on the 31st still has to come out in February. A monthly
       * date past the end of a short month lands on its last day, which is
       * what a bank does with it. */
      const lastOfMonth = new Date(
        Number(date.slice(0, 4)),
        Number(date.slice(5, 7)),
        0,
      ).getDate();
      return r.day > lastOfMonth && day === lastOfMonth;
    }
    case 'yearly': {
      const [, startMonth, startDay] = start.split('-');
      const [, month, day] = date.split('-');
      if (month === startMonth && day === startDay) return true;
      // 29 February falls back to the 28th in the years it does not exist
      const leapDay = startMonth === '02' && startDay === '29';
      return leapDay && month === '02' && day === '28' && !isLeapYear(Number(date.slice(0, 4)));
    }
    case 'roster': {
      const cycle = Math.max(1, r.on + r.off);
      return ((delta % cycle) + cycle) % cycle < r.on;
    }
    case 'customRoster': {
      if (r.sequence.length === 0) return false;
      const i = ((delta % r.sequence.length) + r.sequence.length) % r.sequence.length;
      return r.sequence[i] === 'on';
    }
  }
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function startOfWeekISO(iso: ISODate): ISODate {
  return addDays(iso, -(weekday(iso) - 1));
}

export function entryStartDate(entry: Entry): ISODate | undefined {
  if (entry.type === 'task') return entry.dueDate;
  return entry.startDate;
}

/** Does this shift run past midnight? */
export function crossesMidnight(shift: ShiftEntry): boolean {
  return shift.endTime <= shift.startTime;
}

/** Is this particular day worked from home?
 *
 * Working from home is its own thing, not a kind of time off. The person is
 * unavailable in the way work makes you unavailable, but they are in the
 * house — so they can let the dog out, take a delivery, and be there when
 * school rings. The rest of the app needs to be able to tell the difference. */
export function worksFromHomeOn(shift: ShiftEntry, date: ISODate): boolean {
  if (shift.wfhWeekdays && shift.wfhWeekdays.length > 0) {
    return shift.wfhWeekdays.includes(weekday(date));
  }
  return shift.wfh === true;
}

function buildOccurrence(entry: Entry, date: ISODate): Occurrence {
  if (entry.type === 'shift') {
    const over = crossesMidnight(entry);
    return {
      key: `${entry.id}@${date}`,
      entry,
      date,
      start: at(date, entry.startTime),
      end: at(over ? addDays(date, 1) : date, entry.endTime),
      allDay: false,
      crossesMidnight: over,
      isTail: false,
    };
  }

  if (entry.type === 'task') {
    return {
      key: `${entry.id}@${date}`,
      entry,
      date,
      start: at(date, entry.dueTime),
      end: at(date, entry.dueTime),
      allDay: !entry.dueTime,
      crossesMidnight: false,
      isTail: false,
      done: entry.doneDates.includes(date),
    };
  }

  const span = Math.max(1, entry.spansDays ?? 1);
  return {
    key: `${entry.id}@${date}`,
    entry,
    date,
    start: at(date, entry.allDay ? undefined : entry.startTime),
    end: at(addDays(date, span - 1), entry.allDay ? undefined : entry.endTime ?? entry.startTime),
    allDay: entry.allDay,
    crossesMidnight: false,
    isTail: false,
  };
}

/** The morning-after sliver of an overnight shift. Same entry, muted. */
function tailOccurrence(base: Occurrence): Occurrence {
  const tailDate = toISO(base.end);
  return {
    ...base,
    key: `${base.entry.id}@${base.date}~tail`,
    date: tailDate,
    isTail: true,
  };
}

export interface ExpandOptions {
  /** include the morning-after sliver of overnight shifts */
  includeTails?: boolean;
}

export function expand(
  entries: Entry[],
  from: ISODate,
  to: ISODate,
  options: ExpandOptions = {},
): Occurrence[] {
  const { includeTails = true } = options;
  const out: Occurrence[] = [];
  // Look back a week so overnight shifts and multi-day events that began
  // before the window can still reach into it.
  const scan = daysBetween(addDays(from, -7), to);

  for (const entry of entries) {
    for (const date of scan) {
      if (!occursOn(entry, date)) continue;
      const occ = buildOccurrence(entry, date);

      if (date >= from) out.push(occ);

      if (includeTails && occ.crossesMidnight) {
        const tail = tailOccurrence(occ);
        if (tail.date >= from && tail.date <= to) out.push(tail);
      }

      // multi-day events show on every day they cover
      if (entry.type === 'event' && (entry.spansDays ?? 1) > 1) {
        for (let i = 1; i < (entry.spansDays ?? 1); i++) {
          const d = addDays(date, i);
          if (d < from || d > to) continue;
          out.push({ ...occ, key: `${entry.id}@${date}+${i}`, date: d, isTail: true });
        }
      }
    }
  }

  return out.sort(compareOccurrences);
}

export function compareOccurrences(a: Occurrence, b: Occurrence): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const t = a.start.getTime() - b.start.getTime();
  if (t !== 0) return t;
  return a.entry.title.localeCompare(b.entry.title);
}

export function occurrencesOn(entries: Entry[], date: ISODate): Occurrence[] {
  return expand(entries, date, date);
}

/** Group a flat list by day, keyed by ISO date. */
export function groupByDate(occs: Occurrence[]): Map<ISODate, Occurrence[]> {
  const map = new Map<ISODate, Occurrence[]>();
  for (const o of occs) {
    const list = map.get(o.date);
    if (list) list.push(o);
    else map.set(o.date, [o]);
  }
  return map;
}

/** 'Tuesday 6:00pm → Wednesday 6:00am' vs '4:30pm'. */
export function timeLabel(occ: Occurrence): string {
  if (occ.allDay) return 'all day';
  const start = fmt(occ.start);
  if (occ.entry.type === 'task') return start;
  if (occ.entry.type === 'shift') {
    const end = fmt(occ.end);
    return occ.crossesMidnight ? `${start} → ${end}` : `${start}–${end}`;
  }
  const e = occ.entry;
  return e.endTime ? `${start}–${fmt(occ.end)}` : start;
}

function fmt(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const mer = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${mer}` : `${hour}:${`${m}`.padStart(2, '0')}${mer}`;
}

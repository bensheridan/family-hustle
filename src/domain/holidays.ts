/** Public holidays.
 *
 * Stored once and turned into calendar entries the same way birthdays are,
 * so they get the calendar, the filters and the fridge export without any of
 * it being written twice.
 *
 * The date kept is the one the family gets off. Where a holiday falls at a
 * weekend New Zealand moves the day off to the Monday, and it is the Monday
 * that decides whether anyone is at work — so that is the date, with the real
 * one noted where it differs, because Anzac Day services are on the 25th
 * whichever day that is.
 *
 * Only years that have been published are here. Regional anniversary days are
 * not: they vary by region and the family's own council is the authority, so
 * guessing one would be worse than leaving it to them to add.
 * Source: employment.govt.nz, public holidays and anniversary dates.
 */

import type { EventEntry, ISODate, PublicHoliday } from '../types';
import { diffDays } from '../lib/date';

type Seed = Omit<PublicHoliday, 'id'>;

const nz = (year: number, rows: [string, ISODate, ISODate?][]): Seed[] =>
  rows.map(([name, date, actualDate]) => ({ name, date, actualDate, year }));

export const NZ_HOLIDAYS: Record<number, Seed[]> = {
  2026: nz(2026, [
    ['New Year’s Day', '2026-01-01'],
    ['Day after New Year’s Day', '2026-01-02'],
    ['Waitangi Day', '2026-02-06'],
    ['Good Friday', '2026-04-03'],
    ['Easter Monday', '2026-04-06'],
    ['Anzac Day', '2026-04-27', '2026-04-25'],
    ['King’s Birthday', '2026-06-01'],
    ['Matariki', '2026-07-10'],
    ['Labour Day', '2026-10-26'],
    ['Christmas Day', '2026-12-25'],
    ['Boxing Day', '2026-12-28', '2026-12-26'],
  ]),
  2027: nz(2027, [
    ['New Year’s Day', '2027-01-01'],
    ['Day after New Year’s Day', '2027-01-04', '2027-01-02'],
    ['Waitangi Day', '2027-02-08', '2027-02-06'],
    ['Good Friday', '2027-03-26'],
    ['Easter Monday', '2027-03-29'],
    ['Anzac Day', '2027-04-26', '2027-04-25'],
    ['King’s Birthday', '2027-06-07'],
    ['Matariki', '2027-06-25'],
    ['Labour Day', '2027-10-25'],
    ['Christmas Day', '2027-12-27', '2027-12-25'],
    ['Boxing Day', '2027-12-28', '2027-12-26'],
  ]),
};

export function availableHolidayYears(): number[] {
  return Object.keys(NZ_HOLIDAYS).map(Number).sort();
}

/** Public holidays as calendar entries, generated rather than stored twice. */
export function holidayEntries(holidays: PublicHoliday[]): EventEntry[] {
  return holidays.map((h) => ({
    id: `holiday:${h.id}`,
    type: 'event' as const,
    title: h.name,
    category: 'holiday' as const,
    personIds: [],
    visibility: 'everyone' as const,
    startDate: h.date,
    allDay: true,
    recurrence: { kind: 'none' as const },
    exceptions: [],
    derived: 'holiday' as const,
    createdAt: 0,
  }));
}

export function holidayOn(
  holidays: PublicHoliday[],
  date: ISODate,
): PublicHoliday | undefined {
  return holidays.find((h) => h.date === date);
}

/** 'Labour Day is on Monday' — worth knowing before booking anything. */
export function nextHoliday(
  holidays: PublicHoliday[],
  from: ISODate,
  withinDays = 14,
): PublicHoliday | undefined {
  const sorted = [...holidays].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.find((h) => {
    const days = diffDays(h.date, from);
    return days >= 0 && days <= withinDays;
  });
}

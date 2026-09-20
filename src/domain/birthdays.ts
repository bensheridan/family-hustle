/** Birthdays and the other things that come round once a year.
 *
 * A family member's birthday is not an event someone has to remember to
 * create. It falls out of their profile, the same way a handover falls out of
 * the care schedule — so it cannot be forgotten, duplicated, or deleted by
 * accident, and it is right every year without anyone touching it.
 *
 * The part that actually helps is the lead time. A birthday you find out
 * about on the morning is a birthday you have already failed to buy a present
 * for.
 */

import type { EventEntry, ISODate, Person } from '../types';
import { diffDays, fromISO, today } from '../lib/date';

/** How far ahead a birthday starts being mentioned. */
export const BIRTHDAY_LEAD_DAYS = 14;

/** Turn every saved birthday into a yearly all-day entry. */
export function birthdayEntries(people: Person[]): EventEntry[] {
  return people
    .filter((p) => p.birthday)
    .map((person) => ({
      id: `birthday:${person.id}`,
      type: 'event' as const,
      title: `${person.name}’s birthday`,
      category: 'family' as const,
      personIds: [person.id],
      visibility: 'everyone' as const,
      startDate: person.birthday!,
      allDay: true,
      recurrence: { kind: 'yearly' as const },
      exceptions: [],
      remindDaysBefore: BIRTHDAY_LEAD_DAYS,
      derived: 'birthday' as const,
      createdAt: 0,
    }));
}

/** How old they are turning on that date. Undefined if we only know the day
 *  and month, or if the birthday is in the future (an expected baby). */
export function ageOn(person: Person, date: ISODate): number | undefined {
  if (!person.birthday) return undefined;
  const born = fromISO(person.birthday);
  const age = Number(date.slice(0, 4)) - born.getFullYear();
  return age > 0 && age < 130 ? age : undefined;
}

/** The next time this birthday comes round, from today. */
export function nextBirthday(person: Person, from: ISODate = today()): ISODate | undefined {
  if (!person.birthday) return undefined;
  const [, month, day] = person.birthday.split('-');
  const year = Number(from.slice(0, 4));
  const thisYear = `${year}-${month}-${day}`;
  return thisYear >= from ? thisYear : `${year + 1}-${month}-${day}`;
}

/** 'turns 11 on Saturday' / 'turns 11 today' */
export function birthdayLine(person: Person, date: ISODate, from: ISODate = today()): string {
  const age = ageOn(person, date);
  const days = diffDays(date, from);
  const turns = age ? `turns ${age}` : 'has a birthday';
  if (days === 0) return `${person.name} ${turns} today.`;
  if (days === 1) return `${person.name} ${turns} tomorrow.`;
  if (days <= 14) return `${person.name} ${turns} in ${days} days.`;
  return `${person.name} ${turns} on ${date}.`;
}

/** Days from now until the next birthday — for sorting and for deciding
 *  whether to say anything yet. */
export function daysUntilBirthday(person: Person, from: ISODate = today()): number | undefined {
  const next = nextBirthday(person, from);
  return next ? diffDays(next, from) : undefined;
}

export function isWithinLead(date: ISODate, leadDays: number, from: ISODate = today()): boolean {
  const days = diffDays(date, from);
  return days >= 0 && days <= leadDays;
}

/** When the clocks change.
 *
 * Worked out from the device's own timezone rather than from a table of
 * rules. Comparing the UTC offset on consecutive days finds the transition
 * wherever the family lives, stays right when a country changes its mind, and
 * needs no data to go stale.
 *
 * Shift lengths across the change already come out right — times are stored
 * as wall clock and resolved locally, so a 6pm–6am night is 11 hours the
 * night the clocks go forward and 13 the night they go back, with nothing
 * special done about it.
 */

import type { ISODate } from '../types';
import { addDays, dayName, diffDays, fromISO, today } from '../lib/date';

export interface ClockChange {
  date: ISODate;
  /** forward loses an hour of sleep, back gives one away */
  direction: 'forward' | 'back';
  minutes: number;
}

/** Minutes ahead of UTC at midday on a date — midday avoids the transition
 *  hour itself, which is the one time of day that is ambiguous. */
function offsetAt(date: ISODate): number {
  const d = fromISO(date);
  return -new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTimezoneOffset();
}

export function nextClockChange(
  from: ISODate = today(),
  withinDays = 200,
): ClockChange | undefined {
  let cursor = from;
  let offset = offsetAt(cursor);
  for (let i = 0; i < withinDays; i++) {
    const next = addDays(cursor, 1);
    const nextOffset = offsetAt(next);
    if (nextOffset !== offset) {
      return {
        date: next,
        direction: nextOffset > offset ? 'forward' : 'back',
        minutes: Math.abs(nextOffset - offset),
      };
    }
    cursor = next;
    offset = nextOffset;
  }
  return undefined;
}

/** 'the clocks go forward on Sunday — an hour less sleep.' */
export function clockChangeLine(change: ClockChange, from: ISODate = today()): string {
  const days = diffDays(change.date, from);
  const when =
    days === 0 ? 'tonight' : days === 1 ? 'tomorrow' : days < 7 ? `on ${dayName(change.date)}` : `in ${days} days`;
  const hour = change.minutes === 60 ? 'an hour' : `${change.minutes} minutes`;
  return change.direction === 'forward'
    ? `the clocks go forward ${when} — ${hour} less sleep.`
    : `the clocks go back ${when} — ${hour} more sleep.`;
}

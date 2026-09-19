/** Local-time date helpers.
 *
 * Everything is stored as 'YYYY-MM-DD' + 'HH:mm' and resolved against the
 * device's local time. No UTC conversion anywhere — a 6pm shift is 6pm.
 */

import type { ISODate, Time } from '../types';

export function toISO(d: Date): ISODate {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromISO(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function at(iso: ISODate, time?: Time): Date {
  const d = fromISO(iso);
  if (time) {
    const [h, min] = time.split(':').map(Number);
    d.setHours(h, min, 0, 0);
  }
  return d;
}

export function today(): ISODate {
  return toISO(new Date());
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function addMonths(iso: ISODate, n: number): ISODate {
  const d = fromISO(iso);
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return toISO(d);
}

export function diffDays(a: ISODate, b: ISODate): number {
  const ms = fromISO(a).getTime() - fromISO(b).getTime();
  return Math.round(ms / 86400000);
}

/** 1 = Monday … 7 = Sunday. */
export function weekday(iso: ISODate): number {
  const js = fromISO(iso).getDay();
  return js === 0 ? 7 : js;
}

export function startOfWeek(iso: ISODate, mondayFirst = true): ISODate {
  const wd = weekday(iso);
  const back = mondayFirst ? wd - 1 : wd % 7;
  return addDays(iso, -back);
}

export function startOfMonth(iso: ISODate): ISODate {
  const d = fromISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function endOfMonth(iso: ISODate): ISODate {
  const d = fromISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function daysBetween(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** The 6×7 grid behind a month view — includes the spill days either side. */
export function monthGrid(iso: ISODate, mondayFirst = true): ISODate[] {
  const first = startOfMonth(iso);
  const start = startOfWeek(first, mondayFirst);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function isSameMonth(a: ISODate, b: ISODate): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/* ---------- formatting ----------
 * Month and weekday names are proper nouns, so they keep their capitals.
 * Everything else in the UI stays lowercase. */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function monthName(iso: ISODate): string {
  return MONTHS[fromISO(iso).getMonth()];
}

export function monthYear(iso: ISODate): string {
  return `${monthName(iso)} ${fromISO(iso).getFullYear()}`;
}

export function dayName(iso: ISODate): string {
  return DAYS[weekday(iso) - 1];
}

export function shortDay(iso: ISODate): string {
  return dayName(iso).slice(0, 3);
}

/** 'Saturday, 19 September' */
export function fullDate(iso: ISODate): string {
  return `${dayName(iso)}, ${fromISO(iso).getDate()} ${monthName(iso)}`;
}

/** '19 Sep' */
export function shortDate(iso: ISODate): string {
  return `${fromISO(iso).getDate()} ${monthName(iso).slice(0, 3)}`;
}

/** '6:00pm' — lowercase meridiem, no space, no leading zero. */
export function formatTime(time: Time): string {
  const [h, m] = time.split(':').map(Number);
  const mer = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${mer}` : `${hour}:${`${m}`.padStart(2, '0')}${mer}`;
}

export function formatTimeFromDate(d: Date): string {
  return formatTime(`${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`);
}

/** 'today', 'tomorrow', otherwise 'Monday 22 September'. */
export function relativeDay(iso: ISODate, ref: ISODate = today()): string {
  const d = diffDays(iso, ref);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  if (d > 1 && d < 7) return dayName(iso);
  return `${dayName(iso)} ${fromISO(iso).getDate()} ${monthName(iso)}`;
}

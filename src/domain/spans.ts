/** Things that last more than a day, and how to draw them across a week.
 *
 * A holiday is one thing, so a month grid should show one bar rather than
 * seven separate marks. Two grids need this now — the calendar and the
 * printed sheet — so the arithmetic lives here once instead of being written
 * twice and drifting.
 */

import type { Entry, EventEntry, ISODate, Occurrence } from '../types';
import { addDays, diffDays } from '../lib/date';
import { expand } from './occurrences';

export interface Span {
  occ: Occurrence;
  from: ISODate;
  to: ISODate;
}

export interface PlacedSpan extends Span {
  /** 0–6 within the week, already clipped to it */
  startCol: number;
  endCol: number;
  /** which stacked row it sits on */
  lane: number;
  startsHere: boolean;
  endsHere: boolean;
}

export function isMultiDay(entry: Entry): boolean {
  return entry.type === 'event' && (entry.spansDays ?? 1) > 1;
}

/** Every multi-day event touching the window.
 *
 * The search starts well before it, because a stay that began last month is
 * still happening in this one and would otherwise disappear the moment the
 * calendar was paged forward. */
export function collectSpans(entries: Entry[], from: ISODate, to: ISODate): Span[] {
  const multi = entries.filter(isMultiDay);
  if (multi.length === 0) return [];
  return expand(multi, addDays(from, -180), to, { includeTails: false })
    .filter((o) => !o.isTail)
    .map((o) => ({
      occ: o,
      from: o.date,
      to: addDays(o.date, ((o.entry as EventEntry).spansDays ?? 1) - 1),
    }))
    .filter((s) => s.to >= from && s.from <= to);
}

/** Clip the spans to one week and stack them so none sits on another. */
export function layoutWeek(spans: Span[], weekFrom: ISODate, weekTo: ISODate): PlacedSpan[] {
  const laneEnds: number[] = [];
  return spans
    .filter((s) => s.to >= weekFrom && s.from <= weekTo)
    .map((s) => ({
      ...s,
      startCol: Math.max(0, diffDays(s.from, weekFrom)),
      endCol: Math.min(6, diffDays(s.to, weekFrom)),
      startsHere: s.from >= weekFrom,
      endsHere: s.to <= weekTo,
    }))
    .sort((a, b) => a.startCol - b.startCol || b.endCol - a.endCol)
    .map((s) => {
      let lane = laneEnds.findIndex((end) => end < s.startCol);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = s.endCol;
      return { ...s, lane };
    });
}

export function laneCount(placed: PlacedSpan[]): number {
  return placed.reduce((max, s) => Math.max(max, s.lane + 1), 0);
}

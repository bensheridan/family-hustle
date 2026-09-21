/** Reading a month of shifts out of a rostering app's calendar screen.
 *
 * The photo people take is a month grid. The trap is that in the cells that
 * matter, the times REPLACE the date: a working Friday the 5th does not say
 * "5", it says "06:30 / 16:30". Only the off days print their number. So the
 * date of a shift is positional — it comes from where the cell sits in the
 * grid, not from anything written in it.
 *
 * That makes the printed day numbers useful for something better than dates:
 * they are anchors. If the grid says cell 11 holds "11", the reconstruction
 * is aligned. If it does not, something was misread, and we can say so
 * instead of silently inventing a month of wrong shifts.
 *
 * Nothing here calls out to anything. The phone's own text recognition does
 * the reading; this turns what it produces back into dates.
 */

import type { ISODate } from '../types';
import { monthGrid, fromISO, monthName } from '../lib/date';

export interface DutyCell {
  date: ISODate;
  /** the day number as printed in the grid, for the anchor check */
  expectedDay: number;
  start?: string;
  end?: string;
  /** an off day, printed as a bare number */
  off: boolean;
  /** true when the grid printed a number here that did not match */
  mismatch?: boolean;
  /** outside the month being imported */
  spill: boolean;
}

export interface RosterRead {
  cells: DutyCell[];
  /** anchors that lined up, and anchors that did not */
  anchorsMatched: number;
  anchorsMissed: number;
  shiftCount: number;
  /** days inside a run that did not add up, so were deliberately left blank */
  unreadableDays: number;
  warnings: string[];
  /** true when the text carried its own dates rather than a grid position */
  fromList?: boolean;
  /** the month the text appears to describe, when it says */
  detectedMonth?: string;
}

type Token = { kind: 'time'; value: string } | { kind: 'day'; value: number };

/** Pull times and bare day numbers out of pasted text, in reading order.
 *
 * Times win over numbers so "06:30" is one token, not two. Word boundaries
 * keep a year like 2026 from being read as 20 and 26. */
export function tokenise(text: string): Token[] {
  const out: Token[] = [];
  const re = /\b(\d{1,2}:\d{2})\b|\b(\d{1,2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) out.push({ kind: 'time', value: normaliseTime(m[1]) });
    else {
      const n = Number(m[2]);
      if (n >= 1 && n <= 31) out.push({ kind: 'day', value: n });
    }
  }
  return out;
}

function normaliseTime(t: string): string {
  const [h, m] = t.split(':');
  return `${h.padStart(2, '0')}:${m}`;
}

/** Match the printed day numbers to the cells they belong to.
 *
 * Day numbers only appear on off days, so they are sparse — but they are the
 * only thing in the grid that states its own date, which makes them the one
 * reliable landmark. */
function matchAnchors(
  tokens: Token[],
  grid: ISODate[],
): { tokenIndex: number; cellIndex: number }[] {
  const anchors: { tokenIndex: number; cellIndex: number }[] = [];
  let cell = 0;
  for (let t = 0; t < tokens.length && cell < grid.length; t++) {
    const token = tokens[t];
    if (token.kind !== 'day') continue;
    for (let c = cell; c < grid.length; c++) {
      if (fromISO(grid[c]).getDate() === token.value) {
        anchors.push({ tokenIndex: t, cellIndex: c });
        cell = c + 1;
        break;
      }
    }
  }
  return anchors;
}

export function readGrid(
  text: string,
  month: ISODate,
  mondayFirst = true,
): RosterRead {
  const tokens = tokenise(text);
  const grid = monthGrid(month, mondayFirst);
  const monthPrefix = month.slice(0, 7);

  const cells: DutyCell[] = grid.map((date) => ({
    date,
    expectedDay: fromISO(date).getDate(),
    off: true,
    spill: date.slice(0, 7) !== monthPrefix,
  }));

  const anchors = matchAnchors(tokens, grid);
  for (const a of anchors) cells[a.cellIndex].off = true;

  /* The anchors cut the month into runs of working days. Between two of them
   * the number of cells is known exactly, so the number of times is known
   * exactly too: two per cell.
   *
   * That equality is the safety check. If a single time is misread, the run
   * comes up short, every later pair in it would shift by one, and the whole
   * month after that point would be confidently wrong. So a run that does not
   * add up is not guessed at — it is left blank and reported, because a shift
   * with the wrong hours is worse than a shift that is missing. */
  let uncertainRuns = 0;
  let uncertainDays = 0;

  const runs: { fromCell: number; toCell: number; fromToken: number; toToken: number }[] = [];
  let prevCell = -1;
  let prevToken = -1;
  for (const a of anchors) {
    if (a.cellIndex > prevCell + 1) {
      runs.push({
        fromCell: prevCell + 1,
        toCell: a.cellIndex - 1,
        fromToken: prevToken + 1,
        toToken: a.tokenIndex - 1,
      });
    }
    prevCell = a.cellIndex;
    prevToken = a.tokenIndex;
  }
  if (prevCell < grid.length - 1) {
    runs.push({
      fromCell: prevCell + 1,
      toCell: grid.length - 1,
      fromToken: prevToken + 1,
      toToken: tokens.length - 1,
    });
  }

  for (const run of runs) {
    const cellCount = run.toCell - run.fromCell + 1;
    const times: string[] = [];
    for (let t = run.fromToken; t <= run.toToken; t++) {
      const tok = tokens[t];
      if (tok?.kind === 'time') times.push(tok.value);
    }

    if (times.length === cellCount * 2) {
      for (let k = 0; k < cellCount; k++) {
        const cell = cells[run.fromCell + k];
        cell.off = false;
        cell.start = times[k * 2];
        cell.end = times[k * 2 + 1];
      }
      continue;
    }

    // A trailing run is allowed to be short: the grid spills into next month
    // and the photo simply stopped.
    const trailing = run.toCell === grid.length - 1;
    if (trailing && times.length % 2 === 0 && times.length <= cellCount * 2) {
      for (let k = 0; k < times.length / 2; k++) {
        const cell = cells[run.fromCell + k];
        cell.off = false;
        cell.start = times[k * 2];
        cell.end = times[k * 2 + 1];
      }
      continue;
    }

    uncertainRuns++;
    for (let k = 0; k < cellCount; k++) {
      const cell = cells[run.fromCell + k];
      if (!cell.spill) uncertainDays++;
      cell.mismatch = true;
    }
  }

  const anchorsMatched = anchors.length;
  const anchorsMissed = tokens.filter((t) => t.kind === 'day').length - anchorsMatched;
  const shiftCount = cells.filter((c) => !c.off && !c.spill).length;
  const warnings: string[] = [];

  if (uncertainRuns > 0) {
    warnings.push(
      `${uncertainDays} day${uncertainDays === 1 ? '' : 's'} could not be read and ${uncertainDays === 1 ? 'is' : 'are'} left blank — the times did not add up, so they have not been guessed. fill them in below.`,
    );
  }
  if (anchorsMatched === 0 && shiftCount > 0) {
    warnings.push(
      'none of the printed day numbers were found, so the dates may be shifted. check a few against the photo before saving.',
    );
  }
  if (shiftCount === 0 && uncertainRuns === 0) {
    warnings.push('no shifts found. paste the whole calendar, including the day numbers.');
  }

  return { cells, anchorsMatched, anchorsMissed, shiftCount, unreadableDays: uncertainDays, warnings };
}

/* ---------------- a written-out list ----------------
 *
 * The other way a roster arrives, and the better one. Asked to write the
 * screen out, any assistant produces lines like
 *
 *   Saturday 3 October: 06:30–16:30
 *
 * which carries its own date and needs none of the positional reasoning the
 * grid does. Nothing has to be inferred, so nothing can be inferred wrongly.
 */

const MONTH_NAMES = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

const TIME_RANGE = /(\d{1,2}:\d{2})\s*(?:–|—|-|to|until|→)\s*(\d{1,2}:\d{2})/i;

export interface ListLine {
  date: ISODate;
  start: string;
  end: string;
}

/** Does this text carry its own dates?
 *
 * The tell is one date and one shift per line. A grid row pasted as text
 * carries a whole week — four, six, a dozen times on one line — and must
 * still go through the positional reading, dashes between its times or not. */
export function looksLikeList(text: string): boolean {
  let dated = 0;
  for (const line of text.split(/\r?\n/)) {
    const times = line.match(/\b\d{1,2}:\d{2}\b/g) ?? [];
    // a whole week on one line is a grid, whatever separates its times
    if (times.length > 2) return false;
    if (times.length !== 2) continue;
    const rest = line.replace(/\b\d{1,2}:\d{2}\b/g, ' ');
    if (/\b([1-9]|[12]\d|3[01])\b/.test(rest)) dated++;
  }
  return dated >= 2;
}

function monthIndexIn(text: string): number | undefined {
  const m = text.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
  return m ? MONTH_NAMES.indexOf(m[1]) : undefined;
}

export function readList(text: string, month: ISODate): { lines: ListLine[]; monthsSeen: Set<string> } {
  const fallbackYear = Number(month.slice(0, 4));
  const fallbackMonth = Number(month.slice(5, 7)) - 1;
  const lines: ListLine[] = [];
  const monthsSeen = new Set<string>();

  for (const raw of text.split(/\r?\n/)) {
    const times = raw.match(TIME_RANGE);
    if (!times) continue;

    // take the times out before looking for a day number, so 06:30 does not
    // offer up a 6 or a 30
    const rest = raw.replace(TIME_RANGE, ' ');
    const dayMatch = rest.match(/\b([1-9]|[12]\d|3[01])\b/);
    if (!dayMatch) continue;

    const day = Number(dayMatch[1]);
    const mi = monthIndexIn(rest) ?? fallbackMonth;
    // a list that runs into the new year names its month; trust that over
    // the year of the month being imported only when it clearly wraps
    const year = mi < fallbackMonth - 6 ? fallbackYear + 1 : fallbackYear;
    const date = `${year}-${`${mi + 1}`.padStart(2, '0')}-${`${day}`.padStart(2, '0')}`;

    lines.push({ date, start: normaliseTime(times[1]), end: normaliseTime(times[2]) });
    monthsSeen.add(date.slice(0, 7));
  }

  return { lines, monthsSeen };
}

/** Read whichever shape was pasted. */
export function readRoster(text: string, month: ISODate, mondayFirst = true): RosterRead {
  if (!looksLikeList(text)) return readGrid(text, month, mondayFirst);

  const { lines, monthsSeen } = readList(text, month);
  const grid = monthGrid(month, mondayFirst);
  const monthPrefix = month.slice(0, 7);
  const byDate = new Map(lines.map((l) => [l.date, l]));

  const cells: DutyCell[] = grid.map((date) => {
    const line = byDate.get(date);
    return {
      date,
      expectedDay: fromISO(date).getDate(),
      off: !line,
      start: line?.start,
      end: line?.end,
      spill: date.slice(0, 7) !== monthPrefix,
    };
  });

  const warnings: string[] = [];
  const placed = cells.filter((c) => !c.off && !c.spill).length;
  const elsewhere = lines.length - cells.filter((c) => !c.off).length;

  if (lines.length === 0) {
    warnings.push('no dates with times were found. each line needs a day and a start and finish.');
  }
  if (elsewhere > 0) {
    const other = [...monthsSeen].filter((m) => m !== monthPrefix).join(', ');
    warnings.push(
      `${elsewhere} of these fall outside ${monthName(month)}${other ? ` (they look like ${other})` : ''} — change the month above to bring them in.`,
    );
  }

  return {
    cells,
    anchorsMatched: placed,
    anchorsMissed: 0,
    shiftCount: placed,
    unreadableDays: 0,
    warnings,
    /** a written list states its dates, so nothing was guessed */
    fromList: true,
    detectedMonth: [...monthsSeen][0],
  };
}

/** '06:30' → '22:00' crossing midnight is normal in a roster. */
export function crossesMidnightTimes(start: string, end: string): boolean {
  return end <= start;
}

/** A rough name for the shift, from its hours. */
export function describeShift(start: string, end: string): string {
  const h = Number(start.slice(0, 2));
  if (crossesMidnightTimes(start, end)) return 'night shift';
  if (h < 8) return 'early shift';
  if (h < 12) return 'day shift';
  if (h < 16) return 'afternoon shift';
  return 'evening shift';
}


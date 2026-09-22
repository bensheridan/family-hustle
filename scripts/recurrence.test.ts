/* Monthly and fortnightly dates, which money depends on being exactly right.
 * Run with: npm run test:recurrence */
import { occursOn } from '../src/domain/occurrences';
import { nextHoliday } from '../src/domain/holidays';
import type { EventEntry, PublicHoliday } from '../src/types';

const ev = (startDate: string, recurrence: EventEntry['recurrence']): EventEntry => ({
  id: 'x', type: 'event', title: 't', category: 'moneyOut', personIds: [],
  visibility: 'everyone', startDate, allDay: true, recurrence, exceptions: [], createdAt: 0,
});

const cases: [string, boolean, string][] = [];
const check = (label: string, e: EventEntry, date: string, want: boolean) =>
  cases.push([`${label} — ${date}`, occursOn(e, date) === want, label]);

// rent on the 31st still has to come out of a short month
const r31 = ev('2026-01-31', { kind: 'monthlyDay', day: 31 });
check('31st', r31, '2026-01-31', true);
check('31st', r31, '2026-02-28', true);   // February lands on its last day
check('31st', r31, '2026-02-27', false);
check('31st', r31, '2026-03-31', true);
check('31st', r31, '2026-04-30', true);   // April has 30
check('31st', r31, '2026-04-29', false);

// a normal monthly date is untouched by that
const r20 = ev('2026-01-20', { kind: 'monthlyDay', day: 20 });
check('20th', r20, '2026-02-20', true);
check('20th', r20, '2026-02-28', false);
check('20th', r20, '2026-01-19', false);  // never before it starts

// fortnightly pay, every other Thursday
const fortnightly = ev('2026-09-24', { kind: 'weekly', interval: 2, weekdays: [4] });
check('fortnightly', fortnightly, '2026-09-24', true);
check('fortnightly', fortnightly, '2026-10-01', false);  // the off week
check('fortnightly', fortnightly, '2026-10-08', true);
check('fortnightly', fortnightly, '2026-10-22', true);
check('fortnightly', fortnightly, '2026-10-07', false);  // wrong weekday

// weekly must not have been broken by the interval work
const weekly = ev('2026-09-24', { kind: 'weekly', interval: 1, weekdays: [4] });
check('weekly', weekly, '2026-10-01', true);
check('weekly', weekly, '2026-10-08', true);

let failed = 0;
for (const [label, ok] of cases) {
  if (!ok) { console.log(`FAIL ${label}`); failed++; }
}
console.log(failed === 0 ? `all ${cases.length} recurrence cases pass` : `\n${failed} of ${cases.length} FAILED`);
if (failed > 0) process.exit(1);

/* ---- alternating labels: the bins take turns ---- */
import { occurrenceTitle } from '../src/domain/occurrences';
import type { TaskEntry } from '../src/types';

const bins: TaskEntry = {
  id: 'b', type: 'task', title: 'Bins out', category: 'task', personIds: [],
  visibility: 'everyone', dueDate: '2026-09-23', doneDates: [],
  alternates: ['rubbish', 'recycling'],
  recurrence: { kind: 'weekly', interval: 1, weekdays: [3] },
  exceptions: [], createdAt: 0,
};

const altCases: [string, string][] = [
  ['2026-09-23', 'Bins out — rubbish'],
  ['2026-09-30', 'Bins out — recycling'],
  ['2026-10-07', 'Bins out — rubbish'],
  ['2026-10-14', 'Bins out — recycling'],
  // months later it must still be in step: 2027-01-06 is week 15 from the
  // start, and an odd week is recycling
  ['2027-01-06', 'Bins out — recycling'],
  ['2027-01-13', 'Bins out — rubbish'],
];

let altFailed = 0;
for (const [date, want] of altCases) {
  const got = occurrenceTitle(bins, date);
  if (got !== want) { console.log(`FAIL alternates ${date}: wanted "${want}", got "${got}"`); altFailed++; }
}

// one label, or none, must leave the title alone
const plain: TaskEntry = { ...bins, alternates: ['rubbish'] };
if (occurrenceTitle(plain, '2026-09-30') !== 'Bins out') {
  console.log('FAIL a single label should not be appended'); altFailed++;
}

console.log(altFailed === 0
  ? `all ${altCases.length + 1} alternating cases pass`
  : `${altFailed} alternating cases FAILED`);
if (altFailed > 0) process.exit(1);

/* ---------------------------------------------------------------------------
 * How far away a public holiday is.
 *
 * This used to measure the gap by handing two YYYY-MM-DD strings to
 * new Date(), which reads them as UTC midnight — the one place in the app
 * that left local time, against the rule the rest of the date handling
 * depends on. It gave the right answer, because both ends were wrong in the
 * same direction. These cases pin the answer down so it stays right now the
 * gap is measured in local days, where a 23 or 25 hour day is a real thing.
 *
 * NZ clocks go forward on 27 Sep 2026 and back on 5 Apr 2027, so the pairs
 * below straddle both. Run under TZ=Pacific/Auckland to mean anything.
 */
const hol = (date: string, name: string): PublicHoliday => ({
  id: `h-${date}`, date, name, region: 'national',
});

const holidayCases: [string, PublicHoliday[], string, number, string | undefined][] = [
  // [label, holidays, from, withinDays, expected name]
  ['the day itself counts', [hol('2026-09-28', 'A')], '2026-09-28', 14, 'A'],
  ['yesterday does not', [hol('2026-09-27', 'A')], '2026-09-28', 14, undefined],
  ['across the spring clock change', [hol('2026-09-28', 'A')], '2026-09-26', 14, 'A'],
  ['spring change, exactly on the limit', [hol('2026-10-10', 'A')], '2026-09-26', 14, 'A'],
  ['spring change, one day past it', [hol('2026-10-11', 'A')], '2026-09-26', 14, undefined],
  ['across the autumn clock change', [hol('2027-04-06', 'A')], '2027-04-04', 14, 'A'],
  ['autumn change, exactly on the limit', [hol('2027-04-18', 'A')], '2027-04-04', 14, 'A'],
  ['autumn change, one day past it', [hol('2027-04-19', 'A')], '2027-04-04', 14, undefined],
  ['the nearest one wins', [hol('2026-12-28', 'B'), hol('2026-12-25', 'A')], '2026-12-24', 14, 'A'],
];

let holFailed = 0;
for (const [label, list, from, within, want] of holidayCases) {
  const got = nextHoliday(list, from, within)?.name;
  if (got !== want) {
    console.log(`FAIL ${label} — wanted ${want ?? 'nothing'}, got ${got ?? 'nothing'}`);
    holFailed++;
  }
}

console.log(holFailed === 0
  ? `all ${holidayCases.length} next-holiday cases pass (TZ=${process.env.TZ ?? 'system'})`
  : `${holFailed} next-holiday cases FAILED`);
if (holFailed > 0) process.exit(1);

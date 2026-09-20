/* Monthly and fortnightly dates, which money depends on being exactly right.
 * Run with: npm run test:recurrence */
import { occursOn } from '../src/domain/occurrences';
import type { EventEntry } from '../src/types';

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
process.exit(failed === 0 ? 0 : 1);

/* Checks readRoster against the roster screen it was designed from.
 * Run with: npm run test:roster */
import { readRoster } from '../src/domain/rosterImport';

const rows = `
1 2 3 4 06:30 16:30 06:30 16:30 14:00 23:00
14:00 23:00 22:00 07:00 22:00 07:00 11 12 13 14
06:30 15:30 06:30 15:30 14:00 23:00 14:00 23:00 22:00 07:00 22:00 07:00 21
22 23 08:00 16:00 06:30 15:30 06:30 16:30 16:00 02:00 14:00 23:00
22:00 07:00 22:00 07:00 1 2 3 4 06:30 14:30
`;

const cases: [string, string][] = [
  ['clean paste', rows],
  [
    // a made-up name: fixtures must never carry a real person's details
    'whole screenshot, status bar and legend',
    `18:04 97\nTeam Calendar\nTheo Alder\nJun 2026\nMON TUE WED THU FRI SAT SUN\n${rows}\n` +
      `Off Duty  On Duty  Standby Duty\nAttendance  Absence  Public Holiday  Blackout Period`,
  ],
  ['times separated by a dash', rows.replace(/(\d\d:\d\d) (\d\d:\d\d)/g, '$1 - $2')],
  ['one time misread as a word', rows.replace('08:00 16:00', 'OB:OO 16:00')],
];

const expected: Record<string, [string, string]> = {
  '2026-06-05': ['06:30', '16:30'], '2026-06-06': ['06:30', '16:30'],
  '2026-06-07': ['14:00', '23:00'], '2026-06-08': ['14:00', '23:00'],
  '2026-06-09': ['22:00', '07:00'], '2026-06-10': ['22:00', '07:00'],
  '2026-06-15': ['06:30', '15:30'], '2026-06-16': ['06:30', '15:30'],
  '2026-06-17': ['14:00', '23:00'], '2026-06-18': ['14:00', '23:00'],
  '2026-06-19': ['22:00', '07:00'], '2026-06-20': ['22:00', '07:00'],
  '2026-06-24': ['08:00', '16:00'], '2026-06-25': ['06:30', '15:30'],
  '2026-06-26': ['06:30', '16:30'], '2026-06-27': ['16:00', '02:00'],
  '2026-06-28': ['14:00', '23:00'], '2026-06-29': ['22:00', '07:00'],
  '2026-06-30': ['22:00', '07:00'],
};

let failures = 0;
for (const [label, text] of cases) {
  const r = readRoster(text, '2026-06-01');
  const got: Record<string, [string, string]> = {};
  for (const c of r.cells) if (!c.off && !c.spill && c.start && c.end) got[c.date] = [c.start, c.end];

  /* A misread time means the pairs after it in that run are unknowable, so the
   * whole run between two anchors is deliberately dropped rather than guessed.
   * Everything before the error must survive intact. */
  const dropped = ['2026-06-24','2026-06-25','2026-06-26','2026-06-27','2026-06-28','2026-06-29','2026-06-30'];
  const want = label.includes('misread')
    ? Object.fromEntries(Object.entries(expected).filter(([d]) => !dropped.includes(d)))
    : expected;

  const keys = [...new Set([...Object.keys(want), ...Object.keys(got)])].sort();
  const wrong = keys.filter((k) => JSON.stringify(want[k]) !== JSON.stringify(got[k]));
  for (const k of wrong) console.log(`   ${k}: expected ${want[k] ?? '—'}, got ${got[k] ?? '—'}`);
  // a run that could not be read must be reported, never silently dropped
  const mustWarn = label.includes('misread');
  const warned = r.warnings.some((w) => w.includes('left blank'));
  const ok = wrong.length === 0 && (!mustWarn || warned);
  if (mustWarn && !warned) console.log('   no warning raised for the unreadable run');
  if (!ok) failures++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${label} — ${Object.keys(got).length} shifts, ` +
      `${r.anchorsMatched} anchors matched, ${r.warnings.length} warning(s)`,
  );
}
console.log(failures === 0 ? '\nall grid cases pass' : `\n${failures} grid cases FAILED`);
if (failures > 0) process.exit(1);

/* ---- a written-out list, which is how it actually arrives ----
 * Verbatim from the list Emma was given when she asked for the roster
 * written out, including the en dashes and the trailing sentence. */
const written = `Theo Alder — October 2026 shifts
\t•\tSaturday 3 October: 06:30–16:30
\t•\tSunday 4 October: 06:30–14:30
\t•\tMonday 5 October: 14:00–23:00
\t•\tTuesday 6 October: 14:00–23:00
\t•\tWednesday 7 October: 22:00–07:00
\t•\tThursday 8 October: 22:00–07:00
\t•\tMonday 12 October: 08:00–16:00
\t•\tTuesday 13 October: 06:30–15:30
\t•\tWednesday 14 October: 06:30–15:30
\t•\tThursday 15 October: 14:00–23:00
\t•\tFriday 16 October: 16:00–02:00
\t•\tSaturday 17 October: 22:00–07:00
\t•\tSunday 18 October: 22:00–07:00
\t•\tFriday 23 October: 06:30–16:30
\t•\tSaturday 24 October: 06:30–16:30
\t•\tSunday 25 October: 14:00–23:00
\t•\tMonday 26 October: 14:00–23:00
\t•\tTuesday 27 October: 22:00–07:00
\t•\tWednesday 28 October: 22:00–07:00
I've left out the days shown as off duty.`;

const writtenExpected: Record<string, [string, string]> = {
  '2026-10-03': ['06:30', '16:30'], '2026-10-04': ['06:30', '14:30'],
  '2026-10-05': ['14:00', '23:00'], '2026-10-06': ['14:00', '23:00'],
  '2026-10-07': ['22:00', '07:00'], '2026-10-08': ['22:00', '07:00'],
  '2026-10-12': ['08:00', '16:00'], '2026-10-13': ['06:30', '15:30'],
  '2026-10-14': ['06:30', '15:30'], '2026-10-15': ['14:00', '23:00'],
  '2026-10-16': ['16:00', '02:00'], '2026-10-17': ['22:00', '07:00'],
  '2026-10-18': ['22:00', '07:00'], '2026-10-23': ['06:30', '16:30'],
  '2026-10-24': ['06:30', '16:30'], '2026-10-25': ['14:00', '23:00'],
  '2026-10-26': ['14:00', '23:00'], '2026-10-27': ['22:00', '07:00'],
  '2026-10-28': ['22:00', '07:00'],
};

const listCases: [string, string][] = [
  ['as given', written],
  ['plainer wording', written.replace(/: /g, ' ').replace(/–/g, ' - ')],
  ['no month named on each line', written.replace(/ October/g, '')],
];

let listFailed = 0;
for (const [label, text] of listCases) {
  const r = readRoster(text, '2026-10-01');
  const got: Record<string, [string, string]> = {};
  for (const c of r.cells) if (!c.off && c.start && c.end) got[c.date] = [c.start, c.end];
  const keys = [...new Set([...Object.keys(writtenExpected), ...Object.keys(got)])].sort();
  const wrong = keys.filter((k) => JSON.stringify(writtenExpected[k]) !== JSON.stringify(got[k]));
  for (const k of wrong) console.log(`   ${k}: expected ${writtenExpected[k] ?? '—'}, got ${got[k] ?? '—'}`);
  if (wrong.length > 0) listFailed++;
  console.log(
    `${wrong.length === 0 ? 'ok  ' : 'FAIL'} list, ${label} — ${Object.keys(got).length} shifts, ` +
      `${r.warnings.length} warning(s)`,
  );
}

// a grid must not be mistaken for a list, or the positional logic is skipped
const gridRead = readRoster(rows, '2026-06-01');
const gridOk = gridRead.shiftCount === 19 && !gridRead.fromList;
console.log(`${gridOk ? 'ok  ' : 'FAIL'} a grid is still read as a grid (${gridRead.shiftCount} shifts)`);
if (!gridOk) listFailed++;

console.log(listFailed === 0 ? 'all list cases pass' : `${listFailed} list cases FAILED`);
if (listFailed > 0) process.exit(1);

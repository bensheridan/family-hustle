import type { Occurrence, Person } from '../types';
import { CATEGORIES, colourVar } from '../domain/categories';
import { timeLabel, worksFromHomeOn } from '../domain/occurrences';
import { dayName } from '../lib/date';
import { AvatarStack } from './ui';
import { useStore } from '../state/store';

/** One line on the calendar.
 *
 * The tail of an overnight shift renders muted and says which shift it belongs
 * to, so it reads as the end of Tuesday's shift rather than a new Wednesday one.
 */
export function OccurrenceRow({
  occ,
  onClick,
  showDay,
}: {
  occ: Occurrence;
  onClick?: () => void;
  showDay?: boolean;
}) {
  const { personById, dispatch } = useStore();
  const people = occ.entry.personIds
    .map(personById)
    .filter((p): p is Person => Boolean(p));

  const rail = people[0] ? colourVar(people[0].colour) : CATEGORIES[occ.entry.category].colour;
  const isTask = occ.entry.type === 'task';
  const fromHome = occ.entry.type === 'shift' && worksFromHomeOn(occ.entry, occ.date);
  const muted = occ.isTail || occ.done;

  // The list shows when a thing starts; how long it runs goes in the meta line,
  // so one row is always one line.
  const full = timeLabel(occ);
  const [startLabel, endLabel] = splitRange(full);
  const time = occ.isTail
    ? occ.entry.type === 'shift'
      ? `till ${endLabel ?? ''}`
      : '—'
    : occ.allDay
      ? 'all day'
      : startLabel;

  // One row, one line of context. Order: when, who, where, how long.
  const meta = [
    showDay ? dayName(occ.date) : null,
    isTask && !occ.allDay ? time : null,
    people.length > 0 ? people.map((p) => p.name).join(', ') : null,
    occ.entry.location ?? null,
    occ.isTail && occ.entry.type === 'shift'
      ? `${dayName(shiftedBack(occ))}’s shift`
      : occ.crossesMidnight
        ? `overnight, till ${endLabel} ${dayName(tailDate(occ))}`
        : endLabel && !isTask
          ? `till ${endLabel}`
          : null,
  ].filter(Boolean) as string[];

  return (
    <div className="row" style={{ opacity: muted ? 0.55 : 1 }}>
      <span className="row__rail" style={{ background: rail }} />

      {isTask ? (
        <button
          type="button"
          className="task-check"
          data-done={occ.done}
          aria-label={occ.done ? 'mark as not done' : 'mark as done'}
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: 'task/toggle', id: occ.entry.id, date: occ.date });
          }}
        />
      ) : (
        <span className="row__time">{time}</span>
      )}

      <button type="button" className="row__main" onClick={onClick} style={{ background: 'none' }}>
        <div
          className="row__title"
          style={{ textDecoration: occ.done ? 'line-through' : undefined }}
        >
          {occ.entry.title}
        </div>
        <div className="row__meta">{meta.join(' · ')}</div>
      </button>

      {fromHome && (
        <span className="wfh-tag" title="worked from home">
          🏠 home
        </span>
      )}
      {people.length > 1 && <AvatarStack people={people} max={3} />}
    </div>
  );
}

/** '6pm → 6am' or '8:45am–3pm' → ['6pm', '6am'] */
function splitRange(label: string): [string, string | undefined] {
  const parts = label.split(/→|–/).map((s) => s.trim());
  return [parts[0], parts[1]];
}

function shiftedBack(occ: Occurrence): string {
  return isoOf(occ.start);
}

function tailDate(occ: Occurrence): string {
  return isoOf(occ.end);
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}

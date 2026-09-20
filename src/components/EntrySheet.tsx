import type { Occurrence, Person } from '../types';
import { useStore } from '../state/store';
import { Avatar, Chip, Sheet } from '../components/ui';
import { CATEGORIES } from '../domain/categories';
import { timeLabel, worksFromHomeOn } from '../domain/occurrences';
import { dayName, fullDate } from '../lib/date';

/** Detail for one dated thing. Shows ownership and visibility separately,
 *  because an event can belong to Otis and still be the whole family's problem. */
export function EntrySheet({ occ, onClose }: { occ: Occurrence; onClose: () => void }) {
  const { dispatch, personById, careEnabled, households, householdById } = useStore();
  const entry = occ.entry;
  const owners = entry.personIds.map(personById).filter((p): p is Person => Boolean(p));
  const repeats = entry.recurrence.kind !== 'none';

  const seenBy =
    entry.visibility === 'everyone'
      ? 'everyone'
      : entry.visibility.only
          .map((id) => personById(id)?.name)
          .filter(Boolean)
          .join(', ');

  return (
    <Sheet title={entry.title} onClose={onClose}>
      <div className="detail">
        <div className="detail__when">
          <strong>{occ.crossesMidnight ? overnightLine(occ) : fullDate(occ.date)}</strong>
          {!occ.crossesMidnight && <span> · {timeLabel(occ)}</span>}
        </div>

        {entry.location && <div className="detail__row">at {entry.location}</div>}

        <div className="detail__chips">
          <Chip outline>
            <span className="dot" style={{ background: CATEGORIES[entry.category].colour }} />
            {CATEGORIES[entry.category].label}
          </Chip>
          {repeats && <Chip outline>{repeatLabel(entry)}</Chip>}
          {occ.crossesMidnight && <Chip outline>one shift, crosses midnight</Chip>}
          {entry.type === 'shift' && worksFromHomeOn(entry, occ.date) && (
            <Chip outline>🏠 worked from home</Chip>
          )}
        </div>

        <div className="detail__block">
          <div className="detail__label">belongs to</div>
          <div className="detail__people">
            {owners.map((p) => (
              <span key={p.id} className="detail__person">
                <Avatar person={p} size="sm" />
                {p.name}
              </span>
            ))}
          </div>
        </div>

        <div className="detail__block">
          <div className="detail__label">who can see it</div>
          <div>{seenBy}</div>
        </div>

        {careEnabled && households.length > 1 && (
          <div className="detail__block">
            <div className="detail__label">which households</div>
            <div>
              {!entry.householdVisibility || entry.householdVisibility === 'both'
                ? 'both households'
                : `just ${householdById(entry.householdVisibility.household)?.name ?? 'one household'}`}
            </div>
          </div>
        )}

        {entry.type === 'shift' && entry.impacts.length > 0 && (
          <div className="detail__block">
            <div className="detail__label">what it means at home</div>
            <div className="choices">
              {entry.impacts.map((i) => (
                <Chip key={i} outline>
                  {impactLabel(i)}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {entry.prepNote && (
          <div className="detail__note">
            <span>{entry.prepNote}</span>
          </div>
        )}

        <div className="detail__actions">
          {repeats && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                dispatch({ type: 'entry/skipDate', id: entry.id, date: occ.date });
                onClose();
              }}
            >
              skip this one
            </button>
          )}
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              dispatch({ type: 'entry/remove', id: entry.id });
              onClose();
            }}
          >
            delete {repeats ? 'the whole series' : ''}
          </button>
        </div>


      </div>
    </Sheet>
  );
}

function overnightLine(occ: Occurrence): string {
  const startDay = dayName(occ.date);
  const endDay = dayName(
    `${occ.end.getFullYear()}-${`${occ.end.getMonth() + 1}`.padStart(2, '0')}-${`${occ.end.getDate()}`.padStart(2, '0')}`,
  );
  const [from, to] = timeLabel(occ).split('→').map((s) => s.trim());
  return `${startDay} ${from} → ${endDay} ${to}`;
}

function repeatLabel(entry: Occurrence['entry']): string {
  const r = entry.recurrence;
  switch (r.kind) {
    case 'daily':
      return r.interval === 1 ? 'every day' : `every ${r.interval} days`;
    case 'weekly':
      return `every ${r.weekdays.map((w) => DAY_SHORT[w - 1]).join(', ')}`;
    case 'monthlyDay':
      return `monthly on the ${r.day}`;
    case 'roster':
      return `${r.on} on / ${r.off} off`;
    case 'customRoster':
      return `custom roster · ${r.sequence.length} day cycle`;
    default:
      return 'once';
  }
}

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function impactLabel(i: string): string {
  switch (i) {
    case 'needsPickup':
      return 'kids need pickup';
    case 'noFamilyEvents':
      return "can't attend family events";
    case 'sleepingAfter':
      return 'sleeping after night shift';
    case 'availableBefore':
      return 'available before shift';
    case 'availableAfter':
      return 'available after shift';
    default:
      return i;
  }
}

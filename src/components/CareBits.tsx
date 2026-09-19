import { Link } from 'react-router-dom';
import type { Handover } from '../domain/care';
import {
  careOnDate,
  handoverLabel,
  handoverOn,
  householdOn,
  nextHandover,
  scheduleFor,
  stretchEnd,
} from '../domain/care';
import { colourVar } from '../domain/categories';
import { dayName, fullDate, today } from '../lib/date';
import { useStore } from '../state/store';
import { Avatar, Chip, Sheet } from './ui';
import type { Household, Id, ISODate } from '../types';

/** The shade for one day.
 *
 * From user testing: care should read as the colour of the day, not as an
 * event sitting on it. One household → a flat wash. Children in different
 * places → hard-stop bands, so a split day looks split.
 */
export function careTint(colours: string[], strength = 16): string | undefined {
  if (colours.length === 0) return undefined;
  const wash = (c: string) => `color-mix(in srgb, ${colourVar(c)} ${strength}%, transparent)`;

  const distinct = [...new Set(colours)];
  if (distinct.length === 1) return wash(distinct[0]);

  const step = 100 / distinct.length;
  const stops = distinct
    .map((c, i) => `${wash(c)} ${i * step}% ${(i + 1) * step}%`)
    .join(', ');
  return `linear-gradient(135deg, ${stops})`;
}

export function HouseholdDot({ household, size = 10 }: { household: Household; size?: number }) {
  return (
    <span
      className="dot"
      style={{ background: colourVar(household.colour), width: size, height: size }}
      aria-hidden
    />
  );
}

/** "who's got the kids" — the question shared care actually has to answer. */
export function WhosGotTheKids({
  date = today(),
  onPick,
}: {
  date?: ISODate;
  /** when given, each child becomes tappable so that one day can be moved */
  onPick?: (childId: Id) => void;
}) {
  const { state, children, householdById, households, careEnabled } = useStore();
  if (!careEnabled || children.length === 0) return null;

  const rows = children
    .map((child) => {
      const schedule = scheduleFor(state.careSchedules, child.id);
      if (!schedule) return null;
      const household = householdById(householdOn(schedule, date));
      const until = stretchEnd(schedule, date);
      const swapping = handoverOn(schedule, date);
      const next = nextHandover(schedule, date);
      const overridden = Boolean(schedule.overrides[date]);
      return { child, household, until, swapping, next, overridden };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return null;

  return (
    <div className="card card--pad carewho">
      {rows.map(({ child, household, until, swapping, next, overridden }) => (
        <div
          key={child.id}
          className="carewho__row"
          role={onPick ? 'button' : undefined}
          tabIndex={onPick ? 0 : undefined}
          onClick={onPick ? () => onPick(child.id) : undefined}
          onKeyDown={
            onPick
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') onPick(child.id);
                }
              : undefined
          }
          style={onPick ? { cursor: 'pointer' } : undefined}
        >
          <Avatar person={child} size="sm" />
          <div className="carewho__main">
            <div className="carewho__name">{child.name}</div>
            <div className="carewho__at">
              <span
                className="dot"
                style={{ background: household ? colourVar(household.colour) : 'var(--ink-3)' }}
              />
              {household?.name ?? 'unscheduled'}
              {/* Always say when they next move — "at Dad's" on its own makes
                  you go and check the schedule, which is the thing this card
                  exists to save you. */}
              <span className="muted">
                {' · '}
                {until !== date
                  ? `until ${dayName(until)}`
                  : next
                    ? handoverLabel(next, households, date)
                    : 'no swap coming up'}
              </span>
            </div>
          </div>
          {overridden && <span className="carewho__swap carewho__swap--alt">changed</span>}
          {swapping && !overridden && <span className="carewho__swap">swapping</span>}
        </div>
      ))}
    </div>
  );
}

/** 'at Theo’s' / 'Otis at Theo’s, Juno at Nadia’s' — a quiet line in a day
 *  header, not a row in the day's list. */
export function CareDayLabel({
  date,
  filterChildId,
}: {
  date: ISODate;
  filterChildId?: Id | 'everyone';
}) {
  const { state, householdById, personById, careEnabled } = useStore();
  if (!careEnabled) return null;

  const rows = careOnDate(state.careSchedules, date).filter(
    (r) => !filterChildId || filterChildId === 'everyone' || r.childId === filterChildId,
  );
  if (rows.length === 0) return null;

  const byHousehold = new Map<Id, string[]>();
  for (const r of rows) {
    const name = personById(r.childId)?.name;
    if (!name) continue;
    const list = byHousehold.get(r.householdId);
    if (list) list.push(name);
    else byHousehold.set(r.householdId, [name]);
  }
  if (byHousehold.size === 0) return null;

  // Everyone in one place is the common case, and it deserves the short line.
  const single = byHousehold.size === 1;

  return (
    <span className="caredaylabel">
      {[...byHousehold.entries()].map(([householdId, names]) => {
        const household = householdById(householdId);
        if (!household) return null;
        return (
          <span key={householdId} className="caredaylabel__part">
            <HouseholdDot household={household} size={7} />
            {single && rows.length > 1 ? '' : `${joinNames(names)} `}
            at {household.name}
          </span>
        );
      })}
    </span>
  );
}

/** Handovers as calendar rows. Generated from the schedule, never stored, so
 *  they cannot drift out of sync with the pattern they came from.
 *
 *  Three children moving the same way on the same day is one event in real
 *  life, so it is one row here. */
export function HandoverRows({ handovers }: { handovers: Handover[] }) {
  const { personById, householdById } = useStore();

  const groups = new Map<string, Handover[]>();
  for (const h of handovers) {
    const key = `${h.from}→${h.to}`;
    const list = groups.get(key);
    if (list) list.push(h);
    else groups.set(key, [h]);
  }

  return (
    <>
      {[...groups.entries()].map(([key, group]) => {
        const from = householdById(group[0].from);
        const to = householdById(group[0].to);
        if (!to) return null;
        const names = group
          .map((h) => personById(h.childId)?.name)
          .filter((n): n is string => Boolean(n));
        if (names.length === 0) return null;

        return (
          <Link key={key} to="/shared-care" className="row handover">
            <span className="row__rail" style={{ background: colourVar(to.colour) }} />
            <span className="row__time handover__icon" aria-hidden>
              ⇄
            </span>
            <span className="row__main">
              <span className="row__title">
                {joinNames(names)} to {to.name}
              </span>
              <span className="row__meta">handover{from ? ` · from ${from.name}` : ''}</span>
            </span>
          </Link>
        );
      })}
    </>
  );
}

/** 'Otis', 'Otis and Juno', 'Otis, Juno and Wren' */
function joinNames(names: string[]): string {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Moving one child for one day, without touching the pattern — the thing
 *  the setup screen tells you to come here for. */
export function CareDaySheet({
  childId,
  date,
  onClose,
}: {
  childId: Id;
  date: ISODate;
  onClose: () => void;
}) {
  const { state, dispatch, personById, households } = useStore();
  const child = personById(childId);
  const schedule = scheduleFor(state.careSchedules, childId);
  if (!child || !schedule) return null;

  const current = householdOn(schedule, date);
  const overridden = Boolean(schedule.overrides[date]);

  return (
    <Sheet title={`${child.name} on ${fullDate(date)}`} onClose={onClose}>
      <div className="field">
        <span className="field__label">where are they this day?</span>
        <div className="choices">
          {households.map((h) => (
            <Chip
              key={h.id}
              outline
              active={current === h.id}
              onClick={() => {
                dispatch({ type: 'care/override', childId, date, householdId: h.id });
                onClose();
              }}
            >
              <HouseholdDot household={h} />
              {h.name}
            </Chip>
          ))}
        </div>
        <span className="field__hint">
          this changes one day only. the pattern carries on as it was.
        </span>
      </div>

      {overridden && (
        <button
          type="button"
          className="btn btn--ghost btn--block"
          onClick={() => {
            dispatch({ type: 'care/clearOverride', childId, date });
            onClose();
          }}
        >
          back to the usual pattern
        </button>
      )}
    </Sheet>
  );
}

/** The banner that makes it obvious you are looking at someone else's view. */
export function PreviewBanner() {
  const { state, dispatch, householdById } = useStore();
  const viewingAs = state.settings.viewingAsHouseholdId;
  if (!state.settings.sharedCareEnabled || !viewingAs) return null;
  if (viewingAs === state.settings.homeHouseholdId) return null;
  const household = householdById(viewingAs);

  return (
    <div className="previewbar">
      <span>
        viewing as <strong>{household?.name ?? 'the other household'}</strong>
      </span>
      <button
        type="button"
        onClick={() => dispatch({ type: 'settings', patch: { viewingAsHouseholdId: undefined } })}
      >
        back to mine
      </button>
    </div>
  );
}

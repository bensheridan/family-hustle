import { useState } from 'react';
import { Link } from 'react-router-dom';
import { newId, useStore } from '../state/store';
import {
  CARE_PATTERNS,
  handoverLabel,
  householdOn,
  makeSchedule,
  nextHandover,
  patternById,
  scheduleFor,
  stretchEnd,
} from '../domain/care';
import { addDays, dayName, shortDate, today } from '../lib/date';
import { Avatar, Chip, SectionHead, Sheet } from '../components/ui';
import { PERSON_COLOURS, colourVar } from '../domain/categories';
import { HouseholdDot } from '../components/CareBits';
import type { Household, Id } from '../types';

/** Homes, and which children move between them.
 *
 * Two things this screen is careful about, both learned the hard way.
 *
 * Having more than one household is not the same as being separated. A
 * grandparent in a retirement village is another household; so is a flatting
 * teenager. The app must never infer a relationship from the number of homes,
 * and must never create a home on someone's behalf and put a partner's name
 * on it.
 *
 * And shared care is per child, not per family. A parent can have three
 * children where two go to their dad's and one does not. Turning anything
 * "on" must never assume it applies to all of them.
 */
export function Households() {
  const { state, dispatch, children, pets, households, multiHousehold } = useStore();
  const [editing, setEditing] = useState<Household | null>(null);
  const day = today();

  const addHousehold = () => {
    const household: Household = {
      id: newId(),
      name: 'new home',
      colour: PERSON_COLOURS[households.length % PERSON_COLOURS.length],
    };
    dispatch({ type: 'household/add', household });
    setEditing(household);
  };

  const peopleAt = (id: Id) => state.people.filter((p) => p.householdId === id);
  /* Children move between parents; a dog can move too. Adults are left out
   * not on principle but because nobody has asked for it. */
  const movers = [...children, ...pets];
  const unassigned = state.people.filter((p) => !p.householdId);

  return (
    <>
      <header className="topbar">
        <div>
          <div className="topbar__title">households</div>
          <div className="topbar__sub">where everyone lives</div>
        </div>
        <Link className="btn btn--sm btn--quiet" to="/more">
          back
        </Link>
      </header>

      <section className="section">
        <SectionHead
          title="homes"
          action={
            <button type="button" className="section__link" onClick={addHousehold}>
              + add a home
            </button>
          }
        />
        <div className="card">
          {households.map((h) => {
            const living = peopleAt(h.id);
            return (
              <div key={h.id} className="row">
                <HouseholdDot household={h} size={16} />
                <span className="row__main">
                  <span className="row__title">{h.name}</span>
                  <span className="row__meta">
                    {living.length > 0
                      ? living.map((p) => p.name).join(', ')
                      : 'nobody assigned yet'}
                    {h.id === state.settings.homeHouseholdId ? ' · this device' : ''}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn--sm btn--quiet"
                  onClick={() => setEditing(h)}
                >
                  edit
                </button>
              </div>
            );
          })}
        </div>
        {!multiHousehold && (
          <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
            most families have one. add another for a co-parent, a grandparent in their own
            place, or anywhere else the family spends time.
          </p>
        )}
      </section>

      {multiHousehold && (
        <section className="section">
          <SectionHead title="who lives where" />
          <div className="card">
            {state.people.map((p) => (
              <div key={p.id} className="row">
                <Avatar person={p} size="sm" />
                <span className="row__main">
                  <span className="row__title">{p.name}</span>
                </span>
                <span className="choices" style={{ justifyContent: 'flex-end' }}>
                  {households.map((h) => (
                    <Chip
                      key={h.id}
                      outline
                      active={p.householdId === h.id}
                      onClick={() =>
                        dispatch({
                          type: 'person/update',
                          id: p.id,
                          patch: { householdId: p.householdId === h.id ? undefined : h.id },
                        })
                      }
                    >
                      <HouseholdDot household={h} size={7} />
                      {h.name}
                    </Chip>
                  ))}
                </span>
              </div>
            ))}
          </div>
          {unassigned.length > 0 && (
            <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
              {unassigned.map((p) => p.name).join(', ')} {unassigned.length === 1 ? 'has' : 'have'}{' '}
              no home set. nothing breaks — it just means the calendar cannot say where they are.
            </p>
          )}
        </section>
      )}

      {/* Asked one at a time, because it is true of some and not others. */}
      {multiHousehold && movers.length > 0 && (
        <section className="section">
          <SectionHead title="who moves between homes" />
          <p className="muted" style={{ fontSize: 13.5, marginBottom: 10 }}>
            some move between homes and some do not — children, and the dog. this is asked for
            each of them separately.
          </p>
          {movers.map((m) => (
            <MoveArrangement key={m.id} personId={m.id} date={day} />
          ))}
        </section>
      )}

      {multiHousehold && (
        <section className="section">
          <SectionHead title="checking the other view" />
          <div className="card card--pad">
            <div className="choices">
              {households.map((h) => {
                const viewing =
                  (state.settings.viewingAsHouseholdId ?? state.settings.homeHouseholdId) === h.id;
                return (
                  <Chip
                    key={h.id}
                    outline
                    active={viewing}
                    onClick={() =>
                      dispatch({
                        type: 'settings',
                        patch: {
                          viewingAsHouseholdId:
                            h.id === state.settings.homeHouseholdId ? undefined : h.id,
                        },
                      })
                    }
                  >
                    <HouseholdDot household={h} />
                    {h.name}
                  </Chip>
                );
              })}
            </div>
            <p className="field__hint">
              this only changes what you see. nothing is sent anywhere, and nothing changes for
              them.
            </p>
          </div>
        </section>
      )}

      {editing && <HouseholdSheet household={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/** One person or pet: do they move between homes, and if so, how. */
function MoveArrangement({ personId, date }: { personId: Id; date: string }) {
  const { state, dispatch, households, personById } = useStore();
  const subject = personById(personId);
  const schedule = scheduleFor(state.careSchedules, personId);
  if (!subject) return null;

  const base = households.find((h) => h.id === subject.householdId) ?? households[0];
  const other = households.find((h) => h.id !== base?.id) ?? households[1];

  const startMoving = () => {
    if (!base || !other) return;
    dispatch({
      type: 'care/set',
      schedule: makeSchedule(personId, CARE_PATTERNS[0].id, base.id, other.id, date),
    });
  };

  return (
    <div className="card card--pad" style={{ marginBottom: 10 }}>
      <div className="carehero" style={{ marginBottom: 12 }}>
        <Avatar person={subject} size="lg" />
        <div>
          <div className="carehero__where">{subject.name}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {schedule
              ? (() => {
                  const at = households.find((h) => h.id === householdOn(schedule, date));
                  const next = nextHandover(schedule, date);
                  const until = stretchEnd(schedule, date);
                  return `at ${at?.name ?? 'nobody'}${
                    until !== date ? ` until ${dayName(until)}` : ''
                  }${next ? ` · ${handoverLabel(next, households, date)}` : ''}`;
                })()
              : `lives at ${base?.name ?? 'no home set'}`}
          </div>
        </div>
      </div>

      <div className="choices">
        <Chip outline active={!schedule} onClick={() => dispatch({ type: 'care/remove', personId })}>
          lives in one home
        </Chip>
        <Chip outline active={Boolean(schedule)} onClick={startMoving}>
          moves between homes
        </Chip>
      </div>

      {schedule && (
        <>
          <div className="divider" />
          <div className="field__label">the pattern</div>
          <div className="choices">
            {CARE_PATTERNS.map((p) => (
              <Chip
                key={p.id}
                outline
                active={schedule.patternId === p.id}
                onClick={() =>
                  dispatch({
                    type: 'care/set',
                    schedule: {
                      ...makeSchedule(
                        personId,
                        p.id,
                        schedule.cycle[0],
                        schedule.cycle.find((id) => id !== schedule.cycle[0]) ?? schedule.cycle[0],
                        schedule.anchorDate,
                      ),
                      overrides: schedule.overrides,
                    },
                  })
                }
              >
                {p.label}
              </Chip>
            ))}
          </div>
          <p className="field__hint">
            {patternById(schedule.patternId)?.sub ?? 'built day by day'}
          </p>

          <div className="field__label" style={{ marginTop: 12 }}>
            tap any day to change it
          </div>
          <CycleEditor personId={personId} />
          <p className="field__hint">
            the fortnight repeats from {shortDate(schedule.anchorDate)}. changing a day here
            changes it every fortnight — to move one weekend only, change it on the calendar.
          </p>
        </>
      )}
    </div>
  );
}

/** The repeating fortnight, as two rows of seven. */
function CycleEditor({ personId }: { personId: Id }) {
  const { state, dispatch, households } = useStore();
  const schedule = scheduleFor(state.careSchedules, personId);
  if (!schedule) return null;

  const nextHouseholdAfter = (current: Id): Id => {
    const i = households.findIndex((h) => h.id === current);
    return households[(i + 1) % households.length].id;
  };

  return (
    <div className="cycle">
      {schedule.cycle.map((householdId, index) => {
        const date = addDays(schedule.anchorDate, index);
        const household = households.find((h) => h.id === householdId);
        return (
          <button
            key={index}
            type="button"
            className="cycle__day"
            style={{ background: household ? colourVar(household.colour) : 'var(--surface-2)' }}
            title={`${dayName(date)} — ${household?.name ?? 'unset'}`}
            onClick={() =>
              dispatch({
                type: 'care/cycleDay',
                personId,
                index,
                householdId: nextHouseholdAfter(householdId),
              })
            }
          >
            <span className="cycle__dayname">{dayName(date).slice(0, 1)}</span>
          </button>
        );
      })}
    </div>
  );
}

function HouseholdSheet({ household, onClose }: { household: Household; onClose: () => void }) {
  const { state, dispatch, households } = useStore();
  const [name, setName] = useState(household.name);
  const isHome = household.id === state.settings.homeHouseholdId;

  return (
    <Sheet title="this home" onClose={onClose}>
      <label className="field">
        <span className="field__label">what it’s called</span>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nana’s"
          autoFocus
        />
        <span className="field__hint">
          whatever the family calls it. this is a name, so it keeps its capital.
        </span>
      </label>

      <div className="field">
        <span className="field__label">colour</span>
        <div className="choices">
          {PERSON_COLOURS.map((c) => (
            <button
              key={c}
              type="button"
              className="swatch"
              data-on={household.colour === c}
              style={{ background: colourVar(c) }}
              aria-label={c}
              onClick={() =>
                dispatch({ type: 'household/update', id: household.id, patch: { colour: c } })
              }
            />
          ))}
        </div>
      </div>

      {!isHome && (
        <button
          type="button"
          className="btn btn--ghost btn--block"
          style={{ marginBottom: 10 }}
          onClick={() => {
            dispatch({ type: 'settings', patch: { homeHouseholdId: household.id } });
            onClose();
          }}
        >
          this is the home on this device
        </button>
      )}

      <button
        type="button"
        className="btn btn--accent btn--block"
        onClick={() => {
          dispatch({
            type: 'household/update',
            id: household.id,
            patch: { name: name.trim() || household.name },
          });
          onClose();
        }}
      >
        save
      </button>

      {households.length > 1 && !isHome && (
        <button
          type="button"
          className="btn btn--danger btn--block"
          style={{ marginTop: 10 }}
          onClick={() => {
            dispatch({ type: 'household/remove', id: household.id });
            onClose();
          }}
        >
          remove this home
        </button>
      )}
    </Sheet>
  );
}

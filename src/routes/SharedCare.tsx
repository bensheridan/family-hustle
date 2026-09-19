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
import { Avatar, Chip, Empty, SectionHead, Sheet } from '../components/ui';
import { colourVar } from '../domain/categories';
import { HouseholdDot } from '../components/CareBits';
import type { Household, Id } from '../types';

/** Setting up shared care.
 *
 * Reachable from more — not the tab bar. The brief is clear that this is an
 * optional feature set, not the identity of the app, so it lives where the
 * other family configuration lives.
 */
export function SharedCare() {
  const { state, dispatch, children, households, householdById } = useStore();
  const [renaming, setRenaming] = useState<Household | null>(null);
  const day = today();

  if (!state.settings.sharedCareEnabled) {
    return (
      <>
        <header className="topbar">
          <div>
            <div className="topbar__title">shared care</div>
          </div>
          <Link className="btn btn--sm btn--quiet" to="/more">
            back
          </Link>
        </header>
        <div className="card" style={{ marginTop: 16 }}>
          <Empty icon="🏠">shared care is switched off for this family.</Empty>
        </div>
        <button
          type="button"
          className="btn btn--accent btn--block"
          onClick={() => dispatch({ type: 'sharedCare/enable' })}
        >
          turn it on
        </button>
      </>
    );
  }

  return (
    <>
      <header className="topbar">
        <div>
          <div className="topbar__title">shared care</div>
          <div className="topbar__sub">where the kids are, and when they swap</div>
        </div>
        <Link className="btn btn--sm btn--quiet" to="/more">
          back
        </Link>
      </header>

      {/* households */}
      <section className="section">
        <SectionHead
          title="households"
          action={
            <button
              type="button"
              className="section__link"
              onClick={() =>
                dispatch({
                  type: 'household/add',
                  household: { id: newId(), name: 'new household', colour: 'amber' },
                })
              }
            >
              + add
            </button>
          }
        />
        <div className="card">
          {households.map((h) => (
            <div key={h.id} className="row">
              <HouseholdDot household={h} size={16} />
              <span className="row__main">
                <span className="row__title">{h.name}</span>
                <span className="row__meta">
                  {h.id === state.settings.homeHouseholdId ? 'this device' : 'the other home'}
                </span>
              </span>
              <button
                type="button"
                className="btn btn--sm btn--quiet"
                onClick={() => setRenaming(h)}
              >
                edit
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* per child */}
      {children.length === 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <Empty>no children in the family yet.</Empty>
        </div>
      ) : (
        children.map((child) => {
          const schedule = scheduleFor(state.careSchedules, child.id);
          if (!schedule) {
            return (
              <section key={child.id} className="section">
                <SectionHead title={child.name} />
                <div className="card card--pad">
                  <button
                    type="button"
                    className="btn btn--ghost btn--block"
                    onClick={() =>
                      dispatch({
                        type: 'care/set',
                        schedule: makeSchedule(
                          child.id,
                          CARE_PATTERNS[0].id,
                          households[0].id,
                          households[1]?.id ?? households[0].id,
                          day,
                        ),
                      })
                    }
                  >
                    set up a schedule for {child.name}
                  </button>
                </div>
              </section>
            );
          }

          const at = householdById(householdOn(schedule, day));
          const until = stretchEnd(schedule, day);
          const next = nextHandover(schedule, day);

          return (
            <section key={child.id} className="section">
              <SectionHead title={child.name} />

              <div className="card card--pad carehero">
                <Avatar person={child} size="lg" />
                <div>
                  <div className="carehero__where">
                    at <strong>{at?.name ?? 'nobody'}</strong>
                    {until !== day && <> until {dayName(until)}</>}
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {next ? handoverLabel(next, households, day) : 'no swap coming up'}
                  </div>
                </div>
              </div>

              <div className="card card--pad" style={{ marginTop: 10 }}>
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
                              child.id,
                              p.id,
                              households[0].id,
                              households[1]?.id ?? households[0].id,
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

                <div className="divider" />

                <div className="field__label">tap any day to change it</div>
                <CycleEditor childId={child.id} />

                <p className="field__hint">
                  the fortnight repeats from {shortDate(schedule.anchorDate)}. changing a day here
                  changes it every fortnight — to move one weekend only, change it on the calendar.
                </p>
              </div>
            </section>
          );
        })
      )}

      <section className="section">
        <SectionHead title="turning it off" />
        <div className="card card--pad">
          <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>
            shared care disappears from the calendar, the kids’ pages and the fridge export. your
            schedule is kept, so turning it back on costs you nothing.
          </p>
          <button
            type="button"
            className="btn btn--danger btn--block"
            onClick={() => dispatch({ type: 'sharedCare/disable' })}
          >
            turn shared care off
          </button>
        </div>
      </section>

      {renaming && <HouseholdSheet household={renaming} onClose={() => setRenaming(null)} />}
    </>
  );
}

/** The repeating fortnight, as two rows of seven. */
function CycleEditor({ childId }: { childId: Id }) {
  const { state, dispatch, households } = useStore();
  const schedule = scheduleFor(state.careSchedules, childId);
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
            style={{
              background: household ? colourVar(household.colour) : 'var(--surface-2)',
            }}
            title={`${dayName(date)} — ${household?.name ?? 'unset'}`}
            onClick={() =>
              dispatch({
                type: 'care/cycleDay',
                childId,
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
    <Sheet title="household" onClose={onClose}>
      <label className="field">
        <span className="field__label">what it’s called</span>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mum’s"
          autoFocus
        />
        <span className="field__hint">
          whatever the kids call it. this is a name, so it keeps its capital.
        </span>
      </label>

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
          this is the household on this device
        </button>
      )}

      <button
        type="button"
        className="btn btn--accent btn--block"
        onClick={() => {
          dispatch({ type: 'household/update', id: household.id, patch: { name: name.trim() || household.name } });
          onClose();
        }}
      >
        save
      </button>

      {households.length > 2 && !isHome && (
        <button
          type="button"
          className="btn btn--danger btn--block"
          style={{ marginTop: 10 }}
          onClick={() => {
            dispatch({ type: 'household/remove', id: household.id });
            onClose();
          }}
        >
          remove this household
        </button>
      )}
    </Sheet>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../state/store';
import { expand, timeLabel, worksFromHomeOn } from '../domain/occurrences';
import { availabilityColour, availabilityFor } from '../domain/availability';
import { addDays, dayName, startOfWeek, today } from '../lib/date';
import { Avatar, Chip, Empty, SectionHead } from '../components/ui';
import { colourVar } from '../domain/categories';
import type { Id } from '../types';

/** Work sits in its own section so a roster does not drown the family
 *  calendar — but every shift still feeds the calendar underneath. */
export function Work() {
  const { state, workers } = useStore();
  const [who, setWho] = useState<Id | null>(workers[0]?.id ?? null);
  const [weekOffset, setWeekOffset] = useState(0);

  const person = workers.find((p) => p.id === who) ?? workers[0];
  const weekStart = addDays(startOfWeek(today(), state.settings.weekStartsMonday), weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  if (!person) {
    return (
      <>
        <header className="topbar">
          <div className="topbar__title">work</div>
        </header>
        <div className="card" style={{ marginTop: 16 }}>
          <Empty icon="🗓">
            nobody in the family works shifts yet. add a shift and this section switches itself on.
          </Empty>
        </div>
        <Link className="btn btn--accent btn--block" to="/add">
          add a shift
        </Link>
      </>
    );
  }

  const shifts = expand(
    state.entries.filter((e) => e.type === 'shift' && e.personIds.includes(person.id)),
    weekStart,
    addDays(weekStart, 6),
  );

  const hours = shifts
    .filter((o) => !o.isTail)
    .reduce((sum, o) => sum + (o.end.getTime() - o.start.getTime()) / 3600000, 0);

  return (
    <>
      <header className="topbar">
        <div>
          <div className="topbar__title">work</div>
          <div className="topbar__sub">
            {person.name} — {weekOffset === 0 ? 'this week' : weekOffset === 1 ? 'next week' : `week of ${dayName(weekStart)}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="stepper" onClick={() => setWeekOffset((w) => w - 1)}>
            ‹
          </button>
          <button type="button" className="stepper" onClick={() => setWeekOffset((w) => w + 1)}>
            ›
          </button>
        </div>
      </header>

      {workers.length > 1 && (
        <div className="scroll-x" style={{ marginTop: 10 }}>
          {workers.map((w) => (
            <Chip key={w.id} outline active={w.id === person.id} onClick={() => setWho(w.id)}>
              <span className="dot" style={{ background: colourVar(w.colour) }} />
              {w.name}
            </Chip>
          ))}
        </div>
      )}

      <div className="card card--pad worksummary" style={{ marginTop: 14 }}>
        <Avatar person={person} size="lg" />
        <div>
          <div className="worksummary__hours">{Math.round(hours)} hours</div>
          <div className="muted" style={{ fontSize: 13.5 }}>
            {shifts.filter((o) => !o.isTail).length} days
            {(() => {
              const home = shifts.filter(
                (o) => !o.isTail && o.entry.type === 'shift' && worksFromHomeOn(o.entry, o.date),
              ).length;
              return home > 0 ? `, ${home} from home` : '';
            })()}
          </div>
        </div>
      </div>

      <section className="section">
        <SectionHead title="the week" />
        <div className="card">
          {days.map((d) => {
            const onDay = shifts.filter((o) => o.date === d && !o.isTail);
            const tail = shifts.filter((o) => o.date === d && o.isTail);
            const avail = availabilityFor(state.entries, person.id, d);
            return (
              <div key={d} className="row">
                <span className="row__time" style={{ width: 44 }}>
                  {dayName(d).slice(0, 3)}
                </span>
                <div className="row__main">
                  {onDay.length > 0 ? (
                    onDay.map((o) => (
                      <div key={o.key}>
                        <div className="row__title">
                          {timeLabel(o)}
                          {o.entry.type === 'shift' && worksFromHomeOn(o.entry, d) && (
                            <span className="wfh-tag" style={{ marginLeft: 8 }}>
                              🏠 home
                            </span>
                          )}
                        </div>
                        <div className="row__meta">
                          {o.entry.title}
                          {o.crossesMidnight && ` · finishes ${dayName(addDays(d, 1))}`}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div>
                      <div className="row__title muted">off</div>
                      {tail.length > 0 && (
                        <div className="row__meta">came off nights</div>
                      )}
                    </div>
                  )}
                </div>
                <span
                  className="availability__state"
                  style={{
                    color: availabilityColour(avail.state),
                    fontSize: 11.5,
                    textAlign: 'right',
                    maxWidth: 96,
                    lineHeight: 1.25,
                  }}
                >
                  {avail.label}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <SectionHead title="what it means at home" />
        <div className="card card--pad">
          <p className="muted" style={{ fontSize: 14 }}>
            off work is not the same as available. a shift can say the kids need pickup, that
            someone is asleep after nights, or that they can’t make family events — and the rest of
            the app reads it that way.
          </p>
        </div>
      </section>

      <Link className="btn btn--accent btn--block" to="/add" style={{ marginTop: 14 }}>
        add a shift
      </Link>
    </>
  );
}

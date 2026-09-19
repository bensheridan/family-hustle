import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../state/store';
import { addDays, fullDate, relativeDay, today } from '../lib/date';
import { expand, groupByDate } from '../domain/occurrences';
import { availabilityColour, availabilityFor, headsUpFor } from '../domain/availability';
import { OccurrenceRow } from '../components/OccurrenceRow';
import { Avatar, Empty, SectionHead } from '../components/ui';
import { EntrySheet } from '../components/EntrySheet';
import { WhosGotTheKids } from '../components/CareBits';
import { filterForHousehold } from '../domain/care';
import type { Occurrence } from '../types';

/** The family command centre: what is happening today, what is coming up. */
export function Home() {
  const { state, workers, personById, careEnabled } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState<Occurrence | null>(null);

  const day = today();
  const weekEnd = addDays(day, 7);

  // When previewing another household, the home screen has to be their home
  // screen — otherwise the preview proves nothing.
  const entries = useMemo(
    () => filterForHousehold(state.entries, state.settings),
    [state.entries, state.settings],
  );

  const todays = useMemo(
    () => expand(entries, day, day).filter((o) => !o.done),
    [entries, day],
  );
  const upcoming = useMemo(
    () => expand(entries, addDays(day, 1), weekEnd).filter((o) => !o.isTail && !o.done),
    [entries, day, weekEnd],
  );
  const headsUp = useMemo(
    () => [
      ...headsUpFor(entries, state.people, day),
      ...headsUpFor(entries, state.people, addDays(day, 1)).map((h) => ({
        ...h,
        text: `tomorrow — ${h.text}`,
      })),
    ],
    [entries, state.people, day],
  );

  const byDay = groupByDate(upcoming);

  return (
    <>
      <header className="topbar">
        <div>
          <div className="topbar__title wordmark">
            Family <em>hustle</em>
          </div>
          <div className="topbar__sub">{fullDate(day)}</div>
        </div>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => navigate('/add')}>
          + add
        </button>
      </header>

      {/* who's around — only meaningful once someone works shifts */}
      {workers.length > 0 && (
        <section className="section">
          <SectionHead title="who’s around today" />
          <div className="card card--pad availability">
            {/* availability is a question about the grown-ups — who can
                actually do the pickup, not who is in the family */}
            {state.people
              .filter((p) => p.role === 'adult')
              .map((p) => {
                const a = availabilityFor(entries, p.id, day);
                return (
                  <div key={p.id} className="availability__item">
                    <Avatar person={p} size="sm" />
                    <div>
                      <div className="availability__name">{p.name}</div>
                      <div
                        className="availability__state"
                        style={{ color: availabilityColour(a.state) }}
                      >
                        {a.label}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {careEnabled && (
        <section className="section">
          <SectionHead
            title="who’s got the kids"
            action={
              <Link className="section__link" to="/shared-care">
                schedule →
              </Link>
            }
          />
          <WhosGotTheKids date={day} />
        </section>
      )}

      <section className="section">
        <SectionHead title="today" />
        <div className="card">
          {todays.length === 0 ? (
            <Empty icon="🌤">nothing on today. enjoy it while it lasts.</Empty>
          ) : (
            todays.map((o) => <OccurrenceRow key={o.key} occ={o} onClick={() => setOpen(o)} />)
          )}
        </div>
      </section>

      {headsUp.length > 0 && (
        <section className="section">
          <SectionHead title="heads up" />
          <div className="card card--pad headsup">
            {headsUp.slice(0, 4).map((h) => (
              <p key={h.id} className="headsup__line" data-tone={h.tone}>
                {h.text}
              </p>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <SectionHead
          title="your week"
          action={
            <Link className="section__link" to="/calendar">
              see the calendar →
            </Link>
          }
        />
        <div className="card">
          {upcoming.length === 0 ? (
            <Empty>the rest of the week is clear.</Empty>
          ) : (
            [...byDay.entries()].slice(0, 5).map(([date, occs]) => (
              <div key={date} className="daygroup">
                <div className="daygroup__head">{relativeDay(date, day)}</div>
                {occs.map((o) => (
                  <OccurrenceRow key={o.key} occ={o} onClick={() => setOpen(o)} />
                ))}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="section">
        <SectionHead title="quick access" />
        <div className="tilegrid">
          <Link className="tile" to="/calendar">
            <span className="tile__label">calendar</span>
            <span className="tile__sub">the whole picture</span>
          </Link>
          <Link className="tile" to="/kids">
            <span className="tile__label">kids</span>
            <span className="tile__sub">
              {state.people.filter((p) => p.role === 'child').length} of them
            </span>
          </Link>
          {workers.length > 0 && (
            <Link className="tile" to="/work">
              <span className="tile__label">work</span>
              <span className="tile__sub">
                {workers.map((w) => personById(w.id)?.name).filter(Boolean).join(', ')}
              </span>
            </Link>
          )}
          <Link className="tile" to="/fridge">
            <span className="tile__label">fridge calendar</span>
            <span className="tile__sub">print the month</span>
          </Link>
        </div>
      </section>

      {open && <EntrySheet occ={open} onClose={() => setOpen(null)} />}
    </>
  );
}

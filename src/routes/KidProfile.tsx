import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '../state/store';
import { expand } from '../domain/occurrences';
import { addDays, dayName, relativeDay, shortDate, today } from '../lib/date';
import { ageOn, daysUntilBirthday, nextBirthday } from '../domain/birthdays';
import { Avatar, Empty, SectionHead } from '../components/ui';
import { OccurrenceRow } from '../components/OccurrenceRow';
import { EntrySheet } from '../components/EntrySheet';
import { CATEGORIES, colourVar } from '../domain/categories';
import {
  filterForHousehold,
  handoverLabel,
  householdOn,
  nextHandover,
  scheduleFor,
  stretchEnd,
} from '../domain/care';
import type { Category, Occurrence } from '../types';

/** A child's calendar is not something you maintain — it falls out of the
 *  events already assigned to them. */
export function KidProfile() {
  const { id } = useParams();
  const { state, entries: allEntries, personById, householdById, households, careEnabled } = useStore();
  const [open, setOpen] = useState<Occurrence | null>(null);
  const child = id ? personById(id) : undefined;
  const day = today();

  if (!child) {
    return (
      <>
        <header className="topbar">
          <div className="topbar__title">not found</div>
        </header>
        <Empty>
          that person isn’t in the family. <Link to="/kids">back to kids</Link>.
        </Empty>
      </>
    );
  }

  const theirs = filterForHousehold(allEntries, state.settings).filter((e) =>
    e.personIds.includes(child.id),
  );
  const schedule = careEnabled ? scheduleFor(state.careSchedules, child.id) : undefined;
  const upcoming = expand(theirs, day, addDays(day, 60)).filter((o) => !o.isTail && !o.done);

  const groups: { category: Category; occs: Occurrence[] }[] = (
    ['school', 'activity', 'appointment', 'family', 'task'] as Category[]
  )
    .map((category) => ({
      category,
      occs: upcoming.filter((o) => o.entry.category === category),
    }))
    .filter((g) => g.occs.length > 0);

  return (
    <>
      <header className="topbar">
        <div>
          <div className="topbar__title">{child.name}</div>
          <div className="topbar__sub">
            {(() => {
              if (!child.birthday) return 'no birthday saved yet';
              const next = nextBirthday(child, day);
              const days = daysUntilBirthday(child, day);
              const age = next ? ageOn(child, next) : undefined;
              const turning = age ? `turns ${age}` : 'birthday';
              if (days === 0) return `${turning} today 🎂`;
              if (days !== undefined && days <= 30) {
                return `${turning} in ${days} days · ${shortDate(next!)}`;
              }
              return `${turning} on ${shortDate(next!)}`;
            })()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Link className="btn btn--sm btn--ghost" to={`/add?person=${child.id}`}>
            + add
          </Link>
          <Link className="btn btn--sm btn--quiet" to="/kids">
            back
          </Link>
        </div>
      </header>

      <div className="card card--pad kidhero">
        <Avatar person={child} size="lg" />
        <div>
          <div className="kidhero__next">
            {upcoming[0] ? (
              <>
                next up — <strong>{upcoming[0].title}</strong>{' '}
                {relativeDay(upcoming[0].date, day)}
              </>
            ) : (
              'nothing on the horizon'
            )}
          </div>
        </div>
      </div>

      {schedule && (
        <section className="section">
          <SectionHead
            title="care schedule"
            action={
              <Link className="section__link" to="/households">
                change →
              </Link>
            }
          />
          <div className="card card--pad">
            <div className="carehero__where">
              at{' '}
              <strong>
                <span
                  className="dot"
                  style={{
                    background: colourVar(
                      householdById(householdOn(schedule, day))?.colour ?? 'purple',
                    ),
                    marginRight: 6,
                  }}
                />
                {householdById(householdOn(schedule, day))?.name ?? 'unscheduled'}
              </strong>
              {stretchEnd(schedule, day) !== day && <> until {dayName(stretchEnd(schedule, day))}</>}
            </div>
            <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
              {(() => {
                const next = nextHandover(schedule, day);
                return next ? handoverLabel(next, households, day) : 'no swap coming up';
              })()}
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <SectionHead title="coming up" />
        <div className="card">
          {upcoming.length === 0 ? (
            <Empty>nothing scheduled.</Empty>
          ) : (
            upcoming
              .slice(0, 8)
              .map((o) => (
                <OccurrenceRow key={o.key} occ={o} onClick={() => setOpen(o)} showDay />
              ))
          )}
        </div>
      </section>

      {groups.map((g) => (
        <section key={g.category} className="section">
          <SectionHead title={CATEGORIES[g.category].label} />
          <div className="card">
            {g.occs.slice(0, 5).map((o) => (
              <OccurrenceRow key={o.key} occ={o} onClick={() => setOpen(o)} showDay />
            ))}
          </div>
        </section>
      ))}

      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <Link
          className="btn btn--accent"
          style={{ flex: 1 }}
          to={`/add?kind=activity&person=${child.id}`}
        >
          add an activity
        </Link>
        <Link
          className="btn btn--ghost"
          style={{ flex: 1 }}
          to={`/add?kind=appointment&person=${child.id}`}
        >
          add an appointment
        </Link>
      </div>

      {open && <EntrySheet occ={open} onClose={() => setOpen(null)} />}
    </>
  );
}

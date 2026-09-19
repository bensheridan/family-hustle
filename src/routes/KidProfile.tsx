import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '../state/store';
import { expand } from '../domain/occurrences';
import { addDays, relativeDay, shortDate, today } from '../lib/date';
import { Avatar, Empty, SectionHead } from '../components/ui';
import { OccurrenceRow } from '../components/OccurrenceRow';
import { EntrySheet } from '../components/EntrySheet';
import { CATEGORIES } from '../domain/categories';
import type { Category, Occurrence } from '../types';

/** A child's calendar is not something you maintain — it falls out of the
 *  events already assigned to them. */
export function KidProfile() {
  const { id } = useParams();
  const { state, personById } = useStore();
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

  const theirs = state.entries.filter((e) => e.personIds.includes(child.id));
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
            {child.birthday ? `birthday ${shortDate(child.birthday)}` : 'no birthday saved yet'}
          </div>
        </div>
        <Link className="btn btn--sm btn--quiet" to="/kids">
          back
        </Link>
      </header>

      <div className="card card--pad kidhero">
        <Avatar person={child} size="lg" />
        <div>
          <div className="kidhero__next">
            {upcoming[0] ? (
              <>
                next up — <strong>{upcoming[0].entry.title}</strong>{' '}
                {relativeDay(upcoming[0].date, day)}
              </>
            ) : (
              'nothing on the horizon'
            )}
          </div>
        </div>
      </div>

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

      {open && <EntrySheet occ={open} onClose={() => setOpen(null)} />}
    </>
  );
}

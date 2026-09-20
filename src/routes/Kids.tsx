import { Link } from 'react-router-dom';
import { useStore } from '../state/store';
import { expand } from '../domain/occurrences';
import { addDays, diffDays, relativeDay, shortDate, today } from '../lib/date';
import { Avatar, Empty } from '../components/ui';
import { timeLabel } from '../domain/occurrences';

export function Kids() {
  const { entries: allEntries, children } = useStore();
  const day = today();

  return (
    <>
      <header className="topbar">
        <div>
          <div className="topbar__title">kids</div>
          <div className="topbar__sub">everything that belongs to each of them</div>
        </div>
      </header>

      {children.length === 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <Empty icon="👶">
            no children in the family yet. add one from <Link to="/more">more</Link>.
          </Empty>
        </div>
      ) : (
        <div className="section">
          {children.map((child) => {
            const next = expand(
              allEntries.filter((e) => e.personIds.includes(child.id)),
              day,
              addDays(day, 14),
            ).filter((o) => !o.isTail && !o.done);

            // Three lines of "School" is true but useless — show the next
            // occurrence of three different things instead.
            const seen = new Set<string>();
            const preview = next.filter((o) => {
              if (seen.has(o.entry.id)) return false;
              seen.add(o.entry.id);
              return true;
            });

            return (
              /* Two sibling links rather than a button inside a link: open
                 the child, or add something for them without opening them. */
              <div key={child.id} className="card kidcard">
                <div className="kidcard__head">
                  <Link to={`/kids/${child.id}`} className="kidcard__headmain">
                    <Avatar person={child} size="lg" />
                    <div>
                      <div className="kidcard__name">{child.name}</div>
                      <div className="kidcard__count muted">
                        {next.length === 0
                          ? 'nothing coming up'
                          : `${next.length} things in the next 2 weeks`}
                      </div>
                    </div>
                  </Link>
                  <Link
                    to={`/add?person=${child.id}`}
                    className="kidcard__plus"
                    aria-label={`add something for ${child.name}`}
                  >
                    +
                  </Link>
                </div>
                <Link to={`/kids/${child.id}`} className="kidcard__lines">
                  {preview.slice(0, 3).map((o) => (
                    <div key={o.key} className="kidcard__line">
                      {/* "Wednesday 30 September" wraps a narrow card to three
                          lines; past a week the short date says as much. */}
                      <span className="muted">
                        {diffDays(o.date, day) <= 7 ? relativeDay(o.date, day) : shortDate(o.date)}
                      </span>
                      <span>{o.title}</span>
                      <span className="muted">{o.allDay ? '' : timeLabel(o)}</span>
                    </div>
                  ))}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../state/store';
import {
  addDays,
  addMonths,
  daysBetween,
  fullDate,
  isSameMonth,
  monthGrid,
  monthYear,
  relativeDay,
  startOfMonth,
  startOfWeek,
  today,
} from '../lib/date';
import { expand, groupByDate } from '../domain/occurrences';
import { CATEGORIES, colourVar } from '../domain/categories';
import { OccurrenceRow } from '../components/OccurrenceRow';
import { EntrySheet } from '../components/EntrySheet';
import { Chip, Empty, Segmented } from '../components/ui';
import type { Category, Id, ISODate, Occurrence } from '../types';

type View = 'month' | 'week' | 'day';

export function CalendarPage() {
  const { state, personById } = useStore();
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState<ISODate>(today());
  const [person, setPerson] = useState<Id | 'everyone'>('everyone');
  const [hidden, setHidden] = useState<Category[]>([]);
  const [open, setOpen] = useState<Occurrence | null>(null);
  const [selected, setSelected] = useState<ISODate>(today());

  const sharedCare = state.settings.sharedCareEnabled;

  // Categories the family has actually opted into. Shared care stays out of
  // the filter bar entirely when it is switched off.
  const categories = useMemo(
    () =>
      (Object.keys(CATEGORIES) as Category[]).filter(
        (c) => !(CATEGORIES[c].optional && !sharedCare),
      ),
    [sharedCare],
  );

  const range = useMemo(() => {
    if (view === 'day') return { from: cursor, to: cursor };
    if (view === 'week') {
      const from = startOfWeek(cursor, state.settings.weekStartsMonday);
      return { from, to: addDays(from, 6) };
    }
    const grid = monthGrid(cursor, state.settings.weekStartsMonday);
    return { from: grid[0], to: grid[41] };
  }, [view, cursor, state.settings.weekStartsMonday]);

  const occurrences = useMemo(() => {
    const filtered = state.entries.filter((e) => {
      if (hidden.includes(e.category)) return false;
      if (!sharedCare && e.category === 'sharedCare') return false;
      if (person !== 'everyone' && !e.personIds.includes(person)) return false;
      return true;
    });
    return expand(filtered, range.from, range.to);
  }, [state.entries, hidden, person, sharedCare, range.from, range.to]);

  const byDate = useMemo(() => groupByDate(occurrences), [occurrences]);

  const step = (dir: number) => {
    if (view === 'month') setCursor(addMonths(cursor, dir));
    else if (view === 'week') setCursor(addDays(cursor, dir * 7));
    else setCursor(addDays(cursor, dir));
  };

  const heading =
    view === 'month' ? monthYear(cursor) : view === 'week' ? weekLabel(range.from, range.to) : fullDate(cursor);

  return (
    <>
      <header className="topbar">
        <div>
          <div className="topbar__title">calendar</div>
          <div className="topbar__sub">{heading}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="stepper" onClick={() => step(-1)} aria-label="previous">
            ‹
          </button>
          <button type="button" className="stepper" onClick={() => step(1)} aria-label="next">
            ›
          </button>
        </div>
      </header>

      <div style={{ marginTop: 4 }}>
        <Segmented
          value={view}
          onChange={(v) => setView(v)}
          options={[
            { value: 'month', label: 'month' },
            { value: 'week', label: 'week' },
            { value: 'day', label: 'day' },
          ]}
        />
      </div>

      {/* who */}
      <div className="scroll-x" style={{ marginTop: 12 }}>
        <Chip active={person === 'everyone'} outline onClick={() => setPerson('everyone')}>
          everyone
        </Chip>
        {state.people.map((p) => (
          <Chip key={p.id} active={person === p.id} outline onClick={() => setPerson(p.id)}>
            <span className="dot" style={{ background: colourVar(p.colour) }} />
            {p.name}
          </Chip>
        ))}
      </div>

      {/* what */}
      <div className="scroll-x" style={{ marginTop: 8 }}>
        {categories.map((c) => {
          const off = hidden.includes(c);
          return (
            // dimmed reads as hidden — a solid pill per category would make
            // the default state look like five things were selected
            <Chip
              key={c}
              outline
              style={{ opacity: off ? 0.45 : 1 }}
              onClick={() =>
                setHidden((h) => (off ? h.filter((x) => x !== c) : [...h, c]))
              }
            >
              <span
                className="dot"
                style={{ background: off ? 'var(--line-strong)' : CATEGORIES[c].colour }}
              />
              {CATEGORIES[c].label}
            </Chip>
          );
        })}
      </div>

      {view === 'month' && (
        <MonthView
          cursor={cursor}
          byDate={byDate}
          selected={selected}
          onSelect={setSelected}
          mondayFirst={state.settings.weekStartsMonday}
        />
      )}

      {view === 'month' && (
        <section className="section">
          <div className="daygroup__head" style={{ marginBottom: 6 }}>
            {relativeDay(selected)}
          </div>
          <div className="card">
            {(byDate.get(selected) ?? []).length === 0 ? (
              <Empty>nothing on.</Empty>
            ) : (
              byDate.get(selected)!.map((o) => (
                <OccurrenceRow key={o.key} occ={o} onClick={() => setOpen(o)} />
              ))
            )}
          </div>
        </section>
      )}

      {view === 'week' && (
        <section className="section">
          {daysBetween(range.from, range.to).map((d) => (
            <div key={d} className="weekday">
              <div className="weekday__head">
                <span>{relativeDay(d)}</span>
                {d === today() && <span className="weekday__today">today</span>}
              </div>
              <div className="card">
                {(byDate.get(d) ?? []).length === 0 ? (
                  <div className="row muted" style={{ fontSize: 14 }}>
                    clear
                  </div>
                ) : (
                  byDate.get(d)!.map((o) => (
                    <OccurrenceRow key={o.key} occ={o} onClick={() => setOpen(o)} />
                  ))
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {view === 'day' && (
        <section className="section">
          <div className="card">
            {(byDate.get(cursor) ?? []).length === 0 ? (
              <Empty icon="🌤">nothing on {relativeDay(cursor)}.</Empty>
            ) : (
              byDate.get(cursor)!.map((o) => (
                <OccurrenceRow key={o.key} occ={o} onClick={() => setOpen(o)} />
              ))
            )}
          </div>
        </section>
      )}

      <div className="section" style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            setCursor(today());
            setSelected(today());
          }}
        >
          today
        </button>
        <Link className="btn btn--ghost" to={`/fridge?month=${startOfMonth(cursor)}`}>
          export month
        </Link>
      </div>

      {open && <EntrySheet occ={open} onClose={() => setOpen(null)} />}
      {person !== 'everyone' && (
        <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
          showing {personById(person)?.name} only.
        </p>
      )}
    </>
  );
}

function MonthView({
  cursor,
  byDate,
  selected,
  onSelect,
  mondayFirst,
}: {
  cursor: ISODate;
  byDate: Map<ISODate, Occurrence[]>;
  selected: ISODate;
  onSelect: (d: ISODate) => void;
  mondayFirst: boolean;
}) {
  const { personById } = useStore();
  const grid = monthGrid(cursor, mondayFirst);
  const heads = mondayFirst
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const now = today();

  return (
    <div className="month" style={{ marginTop: 16 }}>
      <div className="month__heads">
        {heads.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      <div className="month__grid">
        {grid.map((d) => {
          const occs = byDate.get(d) ?? [];
          const outside = !isSameMonth(d, cursor);
          return (
            <button
              key={d}
              type="button"
              className="month__cell"
              data-outside={outside}
              data-today={d === now}
              data-selected={d === selected}
              onClick={() => onSelect(d)}
            >
              <span className="month__num">{Number(d.slice(8, 10))}</span>
              <span className="month__dots">
                {occs.slice(0, 4).map((o) => {
                  const p = o.entry.personIds[0] ? personById(o.entry.personIds[0]) : undefined;
                  return (
                    <span
                      key={o.key}
                      className="month__dot"
                      style={{
                        background: p ? colourVar(p.colour) : CATEGORIES[o.entry.category].colour,
                        opacity: o.isTail ? 0.4 : 1,
                      }}
                    />
                  );
                })}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function weekLabel(from: ISODate, to: ISODate): string {
  const a = `${Number(from.slice(8, 10))}`;
  const b = `${Number(to.slice(8, 10))}`;
  return isSameMonth(from, to)
    ? `${a}–${b} ${monthYear(from)}`
    : `${a} ${monthYear(from).split(' ')[0]} – ${b} ${monthYear(to)}`;
}

import { useMemo, useState, type CSSProperties } from 'react';
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
import {
  CareDayLabel,
  CareDaySheet,
  HandoverRows,
  WhosGotTheKids,
  careTint,
} from '../components/CareBits';
import { careBetween, filterForHousehold, handoversBetween } from '../domain/care';
import type { Handover } from '../domain/care';
import { collectSpans, isMultiDay, layoutWeek, laneCount, type Span } from '../domain/spans';
import type { Category, Id, ISODate, Occurrence } from '../types';

type View = 'month' | 'week' | 'day';

export function CalendarPage() {
  const { state, entries: allEntries, personById, careEnabled } = useStore();
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState<ISODate>(today());
  const [person, setPerson] = useState<Id | 'everyone'>('everyone');
  const [hidden, setHidden] = useState<Category[]>([]);
  const [open, setOpen] = useState<Occurrence | null>(null);
  const [selected, setSelected] = useState<ISODate>(today());
  const [moving, setMoving] = useState<Id | null>(null);

  const sharedCare = careEnabled;

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

  const visibleEntries = useMemo(() => {
    const visible = filterForHousehold(allEntries, state.settings);
    return visible.filter((e) => {
      if (hidden.includes(e.category)) return false;
      if (!sharedCare && e.category === 'sharedCare') return false;
      if (person !== 'everyone' && !e.personIds.includes(person)) return false;
      return true;
    });
  }, [allEntries, state.settings, hidden, person, sharedCare]);

  const occurrences = useMemo(
    () => expand(visibleEntries, range.from, range.to),
    [visibleEntries, range.from, range.to],
  );

  /* Something lasting a week is one thing, so the month draws it as one bar.
   * The search reaches well back, because a stay that began last month is
   * still happening in this one. */
  const spans = useMemo(
    () => collectSpans(visibleEntries, range.from, range.to),
    [visibleEntries, range.from, range.to],
  );

  const byDate = useMemo(() => groupByDate(occurrences), [occurrences]);

  /* A month full of "School" and "Work" is true and useless. Whatever happens
   * on the fewest days is what makes a day different from the one before it,
   * so that is what gets the room. */
  const rarity = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of occurrences) counts.set(o.entry.id, (counts.get(o.entry.id) ?? 0) + 1);
    return counts;
  }, [occurrences]);

  // Handovers are derived from the care schedules, never stored, so they can
  // never drift out of sync with the pattern they came from.
  const handovers = useMemo(() => {
    if (!careEnabled || hidden.includes('sharedCare')) return new Map<ISODate, Handover[]>();
    const all = handoversBetween(state.careSchedules, range.from, range.to).filter(
      (h) => person === 'everyone' || h.personId === person,
    );
    const map = new Map<ISODate, Handover[]>();
    for (const h of all) {
      const list = map.get(h.date);
      if (list) list.push(h);
      else map.set(h.date, [h]);
    }
    return map;
  }, [careEnabled, hidden, state.careSchedules, range.from, range.to, person]);

  const handoversOn = (d: ISODate) => handovers.get(d) ?? [];

  // Care shows as the shade of the day rather than a row on it, so a glance
  // at the month answers "who has them that week" without reading anything.
  const shades = useMemo(() => {
    const map = new Map<ISODate, string | undefined>();
    if (!careEnabled || hidden.includes('sharedCare')) return map;
    const care = careBetween(state.careSchedules, range.from, range.to);
    for (const [date, row] of care) {
      const relevant = person === 'everyone' ? row : row.filter((r) => r.personId === person);
      const colours = relevant
        .map((r) => state.households.find((h) => h.id === r.householdId)?.colour)
        .filter((c): c is NonNullable<typeof c> => Boolean(c));
      map.set(date, careTint(colours));
    }
    return map;
  }, [careEnabled, hidden, state.careSchedules, state.households, range.from, range.to, person]);

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
          handovers={handovers}
          rarity={rarity}
          spans={spans}
          shades={shades}
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
          {careEnabled && (
            <div style={{ marginBottom: 10 }}>
              <WhosGotTheKids date={selected} onPick={(id) => setMoving(id)} />
            </div>
          )}
          <div className="card">
            <HandoverRows handovers={handoversOn(selected)} />
            {(byDate.get(selected) ?? []).length === 0 ? (
              handoversOn(selected).length === 0 && <Empty>nothing on.</Empty>
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
              <div className="weekday__head" style={{ '--care-tint': shades.get(d) ?? 'transparent' } as CSSProperties}>
                <span>{relativeDay(d)}</span>
                <span className="weekday__right">
                  {careEnabled && <CareDayLabel date={d} filterChildId={person} />}
                  {d === today() && <span className="weekday__today">today</span>}
                </span>
              </div>
              <div className="card">
                <HandoverRows handovers={handoversOn(d)} />
                {(byDate.get(d) ?? []).length === 0 ? (
                  handoversOn(d).length === 0 && (
                    <div className="row muted" style={{ fontSize: 14 }}>
                      clear
                    </div>
                  )
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
          {careEnabled && (
            <div style={{ marginBottom: 10 }}>
              <WhosGotTheKids date={cursor} onPick={(id) => setMoving(id)} />
            </div>
          )}
          <div className="card">
            <HandoverRows handovers={handoversOn(cursor)} />
            {(byDate.get(cursor) ?? []).length === 0 ? (
              handoversOn(cursor).length === 0 && (
                <Empty icon="🌤">nothing on {relativeDay(cursor)}.</Empty>
              )
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
      {moving && (
        <CareDaySheet
          personId={moving}
          date={view === 'day' ? cursor : selected}
          onClose={() => setMoving(null)}
        />
      )}
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
  handovers,
  rarity,
  spans,
  shades,
  selected,
  onSelect,
  mondayFirst,
}: {
  cursor: ISODate;
  byDate: Map<ISODate, Occurrence[]>;
  handovers: Map<ISODate, Handover[]>;
  rarity: Map<string, number>;
  spans: Span[];
  shades: Map<ISODate, string | undefined>;
  selected: ISODate;
  onSelect: (d: ISODate) => void;
  mondayFirst: boolean;
}) {
  const { personById } = useStore();
  const grid = monthGrid(cursor, mondayFirst);
  const weeks = Array.from({ length: 6 }, (_, w) => grid.slice(w * 7, w * 7 + 7));
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
        {weeks.map((week) => {
          const weekFrom = week[0];
          const weekTo = week[6];

          /* Bars are laid out per week: a stay clipped to the days it covers
           * here, stacked into lanes so two overlapping trips do not sit on
           * top of each other. The cells below then make room for them. */
          const bars = layoutWeek(spans, weekFrom, weekTo);

          return (
            <div
              key={weekFrom}
              className="month__week"
              style={{ '--lanes': laneCount(bars) } as CSSProperties}
            >
              {week.map((d) => {
                const all = byDate.get(d) ?? [];
                const outside = !isSameMonth(d, cursor);
                // whatever is drawn as a bar is not repeated as a chip
                const occs = [...all]
                  .filter((o) => !isMultiDay(o.entry))
                  .sort((a, b) => (rarity.get(a.entry.id) ?? 0) - (rarity.get(b.entry.id) ?? 0));
                return (
                  <button
                    key={d}
                    type="button"
                    className="month__cell"
                    data-outside={outside}
                    data-today={d === now}
                    data-selected={d === selected}
                    style={{ '--care-tint': shades.get(d) ?? 'transparent' } as CSSProperties}
                    onClick={() => onSelect(d)}
                  >
                    <span className="month__num">{Number(d.slice(8, 10))}</span>
                    {(handovers.get(d)?.length ?? 0) > 0 && (
                      <span className="month__handover" title="handover" aria-hidden>
                        ⇄
                      </span>
                    )}
                    <span className="month__items">
                      {occs.slice(0, 3).map((o) => {
                        const p = o.entry.personIds[0]
                          ? personById(o.entry.personIds[0])
                          : undefined;
                        const colour = p
                          ? colourVar(p.colour)
                          : CATEGORIES[o.entry.category].colour;
                        return (
                          <span
                            key={o.key}
                            className="month__item"
                            style={{
                              background: `color-mix(in srgb, ${colour} 20%, transparent)`,
                              borderLeftColor: colour,
                              opacity: o.isTail ? 0.45 : 1,
                            }}
                            title={o.title}
                          >
                            {o.title}
                          </span>
                        );
                      })}
                      {occs.length > 3 && (
                        <span className="month__more">+{occs.length - 3}</span>
                      )}
                    </span>
                  </button>
                );
              })}

              {bars.length > 0 && (
                <div className="month__spans">
                  {bars.map((b) => {
                    const p = b.occ.entry.personIds[0]
                      ? personById(b.occ.entry.personIds[0])
                      : undefined;
                    const colour = p
                      ? colourVar(p.colour)
                      : CATEGORIES[b.occ.entry.category].colour;
                    return (
                      <button
                        key={b.occ.key}
                        type="button"
                        className="month__span"
                        data-starts={b.startsHere}
                        data-ends={b.endsHere}
                        style={{
                          gridColumn: `${b.startCol + 1} / ${b.endCol + 2}`,
                          gridRow: b.lane + 1,
                          background: `color-mix(in srgb, ${colour} 26%, transparent)`,
                          borderColor: colour,
                        }}
                        title={b.occ.title}
                        onClick={() => onSelect(b.startsHere ? b.from : weekFrom)}
                      >
                        {b.startsHere ? b.occ.title : `… ${b.occ.title}`}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
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

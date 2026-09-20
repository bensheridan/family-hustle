import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toPng } from 'html-to-image';
import { useStore } from '../state/store';
import {
  addMonths,
  isSameMonth,
  monthGrid,
  monthName,
  monthYear,
  startOfMonth,
  today,
} from '../lib/date';
import { expand, groupByDate, timeLabel } from '../domain/occurrences';
import { careOnDate, handoverOn } from '../domain/care';
import { colourVar } from '../domain/categories';
import { Toggle } from '../components/ui';
import { careTint, joinNames } from '../components/CareBits';
import type { Category, ISODate, Occurrence } from '../types';

/** The fridge calendar.
 *
 * This is designed for paper, not as a screenshot of the app: a full
 * Monday–Sunday grid, real dates, room to read it from across the kitchen.
 */
export function Fridge() {
  const { state, entries: allEntries, personById, householdById, careEnabled } = useStore();
  const [params] = useSearchParams();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const { scrollerRef, scale } = useFitToWidth(SHEET_W);

  const [month, setMonth] = useState<ISODate>(
    startOfMonth(params.get('month') ?? today()),
  );

  const [show, setShow] = useState<Record<Category, boolean>>({
    school: true,
    activity: true,
    appointment: false,
    family: true,
    work: true,
    task: false,
    sharedCare: true,
    // not on the wall by default — the mortgage is nobody else's business
    moneyIn: false,
    moneyOut: false,
    holiday: true,
  });
  const [showTimes, setShowTimes] = useState(true);
  const [showNames, setShowNames] = useState(true);

  const grid = useMemo(
    () => monthGrid(month, state.settings.weekStartsMonday),
    [month, state.settings.weekStartsMonday],
  );

  const byDate = useMemo(() => {
    const entries = allEntries.filter((e) => show[e.category]);
    return groupByDate(expand(entries, grid[0], grid[41], { includeTails: false }));
  }, [allEntries, show, grid]);

  /* Care on paper.
   *
   * Shading carries the day-to-day state, the same as on screen. But a fridge
   * calendar gets photocopied and read in bad light, so the colour cannot be
   * the only signal: where a stretch begins, the household is named. After
   * that the shade carries it until the next name appears. */
  const careByDate = useMemo(() => {
    const map = new Map<ISODate, { tint?: string; labels: string[] }>();
    if (!careEnabled || !show.sharedCare) return map;

    // whoever actually moves — children, the dog, or both
    const scheduled = state.careSchedules;
    if (scheduled.length === 0) return map;

    for (const [index, d] of grid.entries()) {
      const row = careOnDate(state.careSchedules, d);
      if (row.length === 0) continue;

      const colours = row
        .map((r) => householdById(r.householdId)?.colour)
        .filter((c): c is NonNullable<typeof c> => Boolean(c));

      // spill days from the neighbouring months stay paler
      const outside = !isSameMonth(d, month);
      const tint = careTint(colours, outside ? 8 : 15);

      // who arrives where today
      const arriving = new Map<string, string[]>();
      for (const schedule of scheduled) {
        const h = handoverOn(schedule, d);
        if (!h) continue;
        const name = personById(schedule.personId)?.name;
        if (!name) continue;
        const list = arriving.get(h.to);
        if (list) list.push(name);
        else arriving.set(h.to, [name]);
      }

      const labels: string[] = [];
      const moved = new Set([...arriving.values()].flat());

      // handovers are the news, so they lead
      for (const [householdId, names] of arriving) {
        const household = householdById(householdId);
        if (!household) continue;
        labels.push(
          names.length === scheduled.length
            ? `→ ${household.name}`
            : `${joinNames(names)} → ${household.name}`,
        );
      }

      /* Every week also starts with the household named. Two tints of the
       * same lightness are the same grey once this is photocopied, so a
       * reader in black and white needs an anchor in every row — including
       * for whoever did not move that day. */
      if (index % 7 === 0) {
        const staying = new Map<string, string[]>();
        for (const r of row) {
          const name = personById(r.personId)?.name;
          if (!name || moved.has(name)) continue;
          const list = staying.get(r.householdId);
          if (list) list.push(name);
          else staying.set(r.householdId, [name]);
        }
        for (const [householdId, names] of staying) {
          const household = householdById(householdId);
          if (!household) continue;
          labels.push(
            names.length === scheduled.length
              ? `at ${household.name}`
              : `${joinNames(names)} at ${household.name}`,
          );
        }
      }

      map.set(d, { tint, labels });
    }
    return map;
  }, [
    careEnabled,
    show.sharedCare,
    state.careSchedules,
    grid,
    month,
    householdById,
    personById,
  ]);

  const heads = state.settings.weekStartsMonday
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const saveImage = async () => {
    if (!sheetRef.current) return;
    setBusy(true);
    try {
      const url = await toPng(sheetRef.current, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        // the sheet is styled for paper — capture it that way regardless of theme
        style: { colorScheme: 'light' },
      });
      const a = document.createElement('a');
      a.href = url;
      a.download = `family-hustle-${monthName(month).toLowerCase()}.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fridge">
      <header className="fridge__bar">
        <Link className="btn btn--sm btn--quiet" to="/calendar">
          back
        </Link>
        <div className="fridge__title">your fridge calendar</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="stepper"
            onClick={() => setMonth(addMonths(month, -1))}
            aria-label="previous month"
          >
            ‹
          </button>
          <button
            type="button"
            className="stepper"
            onClick={() => setMonth(addMonths(month, 1))}
            aria-label="next month"
          >
            ›
          </button>
        </div>
      </header>

      <div className="fridge__scroller" ref={scrollerRef}>
        <div
          className="fridge__page"
          style={{
            transform: `scale(${scale})`,
            height: SHEET_H * scale,
            width: SHEET_W,
          }}
        >
          {/* Everything inside this node is what gets printed and exported. */}
          <div className="fridge-sheet" ref={sheetRef}>
            <div className="fridge-sheet__head">
              <div>
                <div className="fridge-sheet__month">{monthYear(month)}</div>
                <div className="fridge-sheet__brand">Family hustle</div>
              </div>
              <div className="fridge-sheet__key">
                {state.people
                  .filter((p) => p.role !== 'pet')
                  .map((p) => (
                    <span key={p.id} className="fridge-sheet__keyitem">
                      <span className="dot" style={{ background: colourVar(p.colour) }} />
                      {p.name}
                    </span>
                  ))}
                {careEnabled &&
                  show.sharedCare &&
                  state.households.map((h) => (
                    <span key={h.id} className="fridge-sheet__keyitem">
                      <span
                        className="fridge-sheet__swatch"
                        style={{
                          background: `color-mix(in srgb, ${colourVar(h.colour)} 15%, #fff)`,
                          borderColor: colourVar(h.colour),
                        }}
                        aria-hidden
                      />
                      {h.name}
                    </span>
                  ))}
              </div>
            </div>

            <div className="fridge-sheet__heads">
              {heads.map((h) => (
                <span key={h}>{h}</span>
              ))}
            </div>

            <div className="fridge-sheet__grid">
              {grid.map((d) => {
                const occs = byDate.get(d) ?? [];
                const outside = !isSameMonth(d, month);
                const care = careByDate.get(d);
                return (
                  <div
                    key={d}
                    className="fridge-cell"
                    data-outside={outside}
                    style={{ '--care-tint': care?.tint ?? 'transparent' } as CSSProperties}
                  >
                    <div className="fridge-cell__num">{Number(d.slice(8, 10))}</div>
                    {care && care.labels.length > 0 && (
                      <div className="fridge-cell__carelabel">
                        {care.labels.map((l) => (
                          <span key={l}>{l}</span>
                        ))}
                      </div>
                    )}
                    <div className="fridge-cell__items">
                      {occs.slice(0, 5).map((o) => (
                        <FridgeItem
                          key={o.key}
                          occ={o}
                          showTime={showTimes}
                          showName={showNames}
                          colour={
                            o.entry.personIds[0]
                              ? colourVar(personById(o.entry.personIds[0])?.colour ?? 'purple')
                              : 'var(--ink-3)'
                          }
                          name={
                            o.entry.personIds.length === 1
                              ? personById(o.entry.personIds[0])?.name
                              : undefined
                          }
                        />
                      ))}
                      {occs.length > 5 && (
                        <div className="fridge-item fridge-item--more">
                          +{occs.length - 5} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="fridge-sheet__foot">
              stuck on the fridge by Family hustle · {monthYear(month)}
            </div>
          </div>
        </div>
      </div>

      <div className="fridge__controls">
        <div className="fridge__controlhead">show</div>
        <div className="card">
          <Toggle label="school/daycare" on={show.school} onChange={(v) => setShow({ ...show, school: v })} />
          <Toggle label="activities" on={show.activity} onChange={(v) => setShow({ ...show, activity: v })} />
          <Toggle label="family" on={show.family} onChange={(v) => setShow({ ...show, family: v })} />
          <Toggle label="work & shifts" on={show.work} onChange={(v) => setShow({ ...show, work: v })} />
          <Toggle
            label="appointments"
            on={show.appointment}
            onChange={(v) => setShow({ ...show, appointment: v })}
          />
          <Toggle label="tasks" on={show.task} onChange={(v) => setShow({ ...show, task: v })} />
          <Toggle
            label="money in"
            on={show.moneyIn}
            onChange={(v) => setShow({ ...show, moneyIn: v })}
          />
          <Toggle
            label="money out"
            on={show.moneyOut}
            onChange={(v) => setShow({ ...show, moneyOut: v })}
          />
          {careEnabled && (
            <Toggle
              label="shared care"
              on={show.sharedCare}
              onChange={(v) => setShow({ ...show, sharedCare: v })}
            />
          )}
          <Toggle label="times" on={showTimes} onChange={setShowTimes} />
          <Toggle label="names" on={showNames} onChange={setShowNames} />
        </div>

        <div className="fridge__buttons">
          <button type="button" className="btn btn--accent" onClick={saveImage} disabled={busy}>
            {busy ? 'saving…' : 'save as image'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => window.print()}>
            save as PDF
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => window.print()}>
            print
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          for PDF, choose “save as PDF” as the destination in the print dialog. the sheet is laid
          out for A4 landscape.
        </p>
      </div>
    </div>
  );
}

/** The sheet is a fixed A4-landscape canvas; the preview just scales it down
 *  to whatever width the screen has. */
const SHEET_W = 1050;
const SHEET_H = 742;

function useFitToWidth(width: number) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => {
      const styles = getComputedStyle(el);
      const pad = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const available = el.clientWidth - pad;
      if (available > 0) setScale(Math.min(1, available / width));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  return { scrollerRef, scale };
}

function FridgeItem({
  occ,
  showTime,
  showName,
  colour,
  name,
}: {
  occ: Occurrence;
  showTime: boolean;
  showName: boolean;
  colour: string;
  name?: string;
}) {
  const time = occ.allDay ? '' : timeLabel(occ).split('–')[0].split('→')[0].trim();
  return (
    <div className="fridge-item">
      <span className="fridge-item__dot" style={{ background: colour }} />
      <span className="fridge-item__text">
        {showTime && time && <span className="fridge-item__time">{time}</span>}
        <span className="fridge-item__title">{occ.title}</span>
        {showName && name && <span className="fridge-item__who">{name}</span>}
      </span>
    </div>
  );
}

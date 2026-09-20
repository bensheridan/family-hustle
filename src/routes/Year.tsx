import { Link } from 'react-router-dom';
import { newId, useStore } from '../state/store';
import { NZ_TERMS, availablePresetYears, holidayAround, nextSchoolChange, schoolChangeLine } from '../domain/school';
import { NZ_HOLIDAYS, availableHolidayYears } from '../domain/holidays';
import { clockChangeLine, nextClockChange } from '../domain/clocks';
import { fullDate, shortDate, today } from '../lib/date';
import { SectionHead, Empty } from '../components/ui';
import type { SchoolTerm } from '../types';

/** Term dates.
 *
 * The terms themselves are not the useful part — the gaps between them are.
 * Six weeks over summer and a fortnight in April are the bits somebody has to
 * cover, so once the dates are in, the app can see them coming.
 */
export function Year() {
  const { state, dispatch, children } = useStore();
  const year = Number(today().slice(0, 4));
  const terms = [...state.schoolTerms].sort((a, b) => a.start.localeCompare(b.start));
  const day = today();
  const change = nextSchoolChange(terms, day, 60);
  const holiday = holidayAround(terms, day);

  const loadPreset = (y: number) => {
    const preset = NZ_TERMS[y];
    if (!preset) return;
    const kept = state.schoolTerms.filter((t) => t.year !== y);
    dispatch({
      type: 'terms/set',
      terms: [...kept, ...preset.map((t) => ({ ...t, id: newId() }))],
    });
  };

  const addTerm = () => {
    const term: SchoolTerm = {
      id: newId(),
      name: `Term ${terms.filter((t) => t.year === year).length + 1}`,
      year,
      start: `${year}-01-01`,
      end: `${year}-12-31`,
    };
    dispatch({ type: 'terms/set', terms: [...state.schoolTerms, term] });
  };

  return (
    <>
      <header className="topbar">
        <div>
          <div className="topbar__title">the year</div>
          <div className="topbar__sub">terms, public holidays, and the clocks</div>
        </div>
        <Link className="btn btn--sm btn--quiet" to="/more">
          back
        </Link>
      </header>

      {children.length === 0 && (
        <p className="muted" style={{ fontSize: 13.5, marginTop: 14 }}>
          no children in the family, so this probably isn’t for you — but it’s here if you want it.
        </p>
      )}

      {terms.length > 0 && (change || holiday) && (
        <div className="card card--pad" style={{ marginTop: 14 }}>
          {holiday ? (
            <div className="yearnote">school holidays, back {shortDate(holiday.to)}</div>
          ) : change ? (
            <div className="yearnote">{schoolChangeLine(change)}</div>
          ) : null}
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            {holiday
              ? `from ${shortDate(holiday.from)}`
              : change
                ? fullDate(change.date)
                : ''}
          </div>
        </div>
      )}

      {(() => {
        const clocks = nextClockChange(day, 200);
        return clocks ? (
          <div className="card card--pad" style={{ marginTop: 14 }}>
            <div className="yearnote">{clockChangeLine(clocks, day)}</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
              {fullDate(clocks.date)} · worked out from this device’s timezone, so it is right
              wherever you are
            </div>
          </div>
        ) : null;
      })()}

      <section className="section">
        <SectionHead
          title="school terms"
          action={
            <button type="button" className="section__link" onClick={addTerm}>
              + add a term
            </button>
          }
        />
        <div className="card">
          {terms.length === 0 ? (
            <Empty icon="🎒">no term dates yet.</Empty>
          ) : (
            terms.map((t) => <TermRow key={t.id} term={t} />)
          )}
        </div>
      </section>

      <section className="section">
        <SectionHead title="start from the published dates" />
        <div className="card card--pad">
          <div className="choices">
            {availablePresetYears().map((y) => (
              <button key={y} type="button" className="btn btn--ghost btn--sm" onClick={() => loadPreset(y)}>
                New Zealand {y}
              </button>
            ))}
          </div>
          <p className="field__hint" style={{ marginTop: 10 }}>
            from the Ministry of Education. terms 2 and 3 are the same for every school; each school
            picks its own start in Term 1 and finish in Term 4, so those two are a best guess —
            check them against your school and adjust.
          </p>
          <p className="field__hint">
            only years the ministry has published are offered. a year that isn’t listed hasn’t been
            confirmed, and wrong dates in a calendar are worse than none.
          </p>
        </div>
      </section>

      <section className="section">
        <SectionHead title="public holidays" />
        <div className="card">
          {state.publicHolidays.length === 0 ? (
            <Empty icon="🇳🇿">none saved yet.</Empty>
          ) : (
            [...state.publicHolidays]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((h) => (
                <div key={h.id} className="row">
                  <span className="row__main">
                    <span className="row__title">{h.name}</span>
                    <span className="row__meta">
                      {fullDate(h.date)}
                      {h.actualDate ? ` · moved from ${shortDate(h.actualDate)}` : ''}
                    </span>
                  </span>
                </div>
              ))
          )}
        </div>
        <div className="card card--pad" style={{ marginTop: 10 }}>
          <div className="choices">
            {availableHolidayYears().map((y) => (
              <button
                key={y}
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() =>
                  dispatch({
                    type: 'holidays/set',
                    holidays: [
                      ...state.publicHolidays.filter((h) => h.year !== y),
                      ...NZ_HOLIDAYS[y].map((h) => ({ ...h, id: newId() })),
                    ],
                  })
                }
              >
                New Zealand {y}
              </button>
            ))}
            {state.publicHolidays.length > 0 && (
              <button
                type="button"
                className="btn btn--quiet btn--sm"
                onClick={() => dispatch({ type: 'holidays/clear' })}
              >
                clear
              </button>
            )}
          </div>
          <p className="field__hint" style={{ marginTop: 10 }}>
            the date kept is the day off. where a holiday falls at a weekend the day off moves to
            the Monday, and the original is noted — Anzac Day services are on the 25th whichever
            day that lands on.
          </p>
          <p className="field__hint">
            regional anniversary days are not included: they vary by region and your council is the
            one that knows. add yours as a yearly event.
          </p>
        </div>
      </section>

      {terms.length > 0 && (
        <button
          type="button"
          className="btn btn--danger btn--block"
          style={{ marginTop: 18 }}
          onClick={() => dispatch({ type: 'terms/clear' })}
        >
          clear all term dates
        </button>
      )}
    </>
  );
}

function TermRow({ term }: { term: SchoolTerm }) {
  const { dispatch, state } = useStore();
  const update = (patch: Partial<SchoolTerm>) =>
    dispatch({ type: 'terms/update', id: term.id, patch });

  return (
    <div className="row" style={{ display: 'block' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <input
          className="termrow__name"
          value={term.name}
          onChange={(e) => update({ name: e.target.value })}
        />
        {term.approximate && <span className="termrow__approx">school picks</span>}
        <button
          type="button"
          className="btn btn--sm btn--quiet"
          style={{ marginLeft: 'auto' }}
          onClick={() =>
            dispatch({
              type: 'terms/set',
              terms: state.schoolTerms.filter((t) => t.id !== term.id),
            })
          }
        >
          remove
        </button>
      </div>
      <div className="input-pair termrow__dates" style={{ marginTop: 8 }}>
        <input
          className="input"
          type="date"
          value={term.start}
          onChange={(e) => update({ start: e.target.value, approximate: false })}
        />
        <span className="input-pair__arrow">→</span>
        <input
          className="input"
          type="date"
          value={term.end}
          onChange={(e) => update({ end: e.target.value, approximate: false })}
        />
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { newId, useStore } from '../state/store';
import { readRoster, describeShift, type DutyCell } from '../domain/rosterImport';
import { addMonths, monthYear, startOfMonth, today, fromISO } from '../lib/date';
import { Chip, Field, FieldGroup, SectionHead } from '../components/ui';
import { colourVar } from '../domain/categories';
import type { Id, ShiftEntry, ShiftType } from '../types';

/** Getting a month of someone else's roster in without typing it twice.
 *
 * Nothing here leaves the phone. The phone's own text recognition does the
 * reading — hold down on the roster screenshot, "copy text", paste. That is
 * better OCR than anything worth shipping ourselves, it is free, and the
 * roster never goes near a server.
 *
 * Everything lands in a grid to confirm before a single shift is saved.
 * Rosters decide whether someone is home for the school run, so a wrong
 * shift is worse than no shift, and nothing is written until it has been
 * looked at.
 */
export function ImportRoster() {
  const { state, dispatch, adults } = useStore();
  const navigate = useNavigate();

  const candidates = adults.length > 0 ? adults : state.people.filter((p) => p.role !== 'pet');
  const [personId, setPersonId] = useState<Id>(candidates[0]?.id ?? '');
  const [month, setMonth] = useState(startOfMonth(today()));
  const [text, setText] = useState('');
  const [edits, setEdits] = useState<Record<string, { start: string; end: string } | null>>({});

  const read = useMemo(() => readRoster(text, month), [text, month]);

  // what the grid shows: the read, with any hand corrections on top
  const cells: DutyCell[] = read.cells.map((c) => {
    const edit = edits[c.date];
    if (edit === undefined) return c;
    if (edit === null) return { ...c, off: true, start: undefined, end: undefined, mismatch: false };
    return { ...c, off: false, start: edit.start, end: edit.end, mismatch: false };
  });

  const keeping = cells.filter((c) => !c.off && !c.spill && c.start && c.end);
  const person = state.people.find((p) => p.id === personId);

  const save = () => {
    if (!person) return;
    for (const cell of keeping) {
      const entry: ShiftEntry = {
        id: newId(),
        type: 'shift',
        title: describeShift(cell.start!, cell.end!),
        category: 'work',
        personIds: [person.id],
        visibility: 'everyone',
        startDate: cell.date,
        shiftType: shiftTypeFor(cell.start!, cell.end!),
        startTime: cell.start!,
        endTime: cell.end!,
        impacts: [],
        recurrence: { kind: 'none' },
        exceptions: [],
        createdAt: Date.now(),
      };
      dispatch({ type: 'entry/add', entry });
    }
    if (!person.worksShifts) {
      dispatch({ type: 'person/update', id: person.id, patch: { worksShifts: true } });
    }
    navigate('/work');
  };

  return (
    <>
      <header className="topbar">
        <div>
          <div className="topbar__title">import a roster</div>
          <div className="topbar__sub">a month at a time, from a screenshot</div>
        </div>
        <Link className="btn btn--sm btn--quiet" to="/work">
          back
        </Link>
      </header>

      <div className="card card--pad" style={{ marginTop: 14 }}>
        <div className="row__title" style={{ marginBottom: 6 }}>
          how this works
        </div>
        <ol className="howto">
          <li>screenshot the roster calendar on their phone.</li>
          <li>
            hold down on the screenshot and choose <strong>copy text</strong> — the phone reads it,
            not us.
          </li>
          <li>paste it below, then check the month before saving.</li>
        </ol>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          nothing is uploaded. the text stays on this phone.
        </p>
      </div>

      <FieldGroup label="whose roster?">
        <div className="choices">
          {candidates.map((p) => (
            <Chip key={p.id} outline active={personId === p.id} onClick={() => setPersonId(p.id)}>
              <span className="dot" style={{ background: colourVar(p.colour) }} />
              {p.name}
            </Chip>
          ))}
        </div>
      </FieldGroup>

      <FieldGroup label="which month?">
        <div className="monthpick">
          <button type="button" className="stepper" onClick={() => setMonth(addMonths(month, -1))}>
            ‹
          </button>
          <span className="monthpick__label">{monthYear(month)}</span>
          <button type="button" className="stepper" onClick={() => setMonth(addMonths(month, 1))}>
            ›
          </button>
        </div>
      </FieldGroup>

      <Field label="paste the roster" hint="day numbers and all — the numbers are how the dates are worked out.">
        <textarea
          className="input"
          style={{ minHeight: 120, fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'1 2 3 4 06:30 16:30 06:30 16:30 14:00 23:00\n14:00 23:00 22:00 07:00 …'}
        />
      </Field>

      {text.trim().length > 0 && (
        <>
          {read.warnings.map((w) => (
            <p key={w} className="importwarn">
              {w}
            </p>
          ))}

          <section className="section">
            <SectionHead
              title={`${keeping.length} shift${keeping.length === 1 ? '' : 's'} found`}
              action={
                read.anchorsMatched > 0 ? (
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {read.anchorsMatched} dates confirmed
                  </span>
                ) : undefined
              }
            />
            <div className="card card--pad">
              <div className="importgrid__heads">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="importgrid">
                {cells.map((c) => (
                  <ImportCell
                    key={c.date}
                    cell={c}
                    onSet={(v) => setEdits((e) => ({ ...e, [c.date]: v }))}
                  />
                ))}
              </div>
              <p className="field__hint" style={{ marginTop: 10 }}>
                tap any day to change or clear it. grey days are days off.
              </p>
            </div>
          </section>

          <button
            type="button"
            className="btn btn--accent btn--block"
            style={{ marginTop: 16 }}
            onClick={save}
            disabled={keeping.length === 0 || !person}
          >
            add {keeping.length} shift{keeping.length === 1 ? '' : 's'} for {person?.name}
          </button>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
            these are added as individual days, so any of them can be changed or deleted later
            without touching the rest.
          </p>
        </>
      )}
    </>
  );
}

function ImportCell({
  cell,
  onSet,
}: {
  cell: DutyCell;
  onSet: (v: { start: string; end: string } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(cell.start ?? '09:00');
  const [end, setEnd] = useState(cell.end ?? '17:00');

  if (open) {
    return (
      <div className="importcell importcell--editing">
        <input
          className="importcell__time"
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <input
          className="importcell__time"
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
        <div className="importcell__actions">
          <button
            type="button"
            onClick={() => {
              onSet({ start, end });
              setOpen(false);
            }}
          >
            set
          </button>
          <button
            type="button"
            onClick={() => {
              onSet(null);
              setOpen(false);
            }}
          >
            off
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="importcell"
      data-off={cell.off}
      data-spill={cell.spill}
      data-unread={cell.mismatch && !cell.off}
      onClick={() => setOpen(true)}
    >
      <span className="importcell__day">{fromISO(cell.date).getDate()}</span>
      {cell.start && cell.end ? (
        <span className="importcell__times">
          {cell.start}
          <br />
          {cell.end}
        </span>
      ) : cell.mismatch ? (
        <span className="importcell__unread">?</span>
      ) : null}
    </button>
  );
}

function shiftTypeFor(start: string, end: string): ShiftType {
  const h = Number(start.slice(0, 2));
  if (end <= start) return 'night';
  if (h < 8) return 'early';
  if (h < 12) return 'day';
  if (h < 16) return 'late';
  return 'evening';
}

import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { newId, useStore } from '../state/store';
import { Chip, Field, FieldGroup, Segmented } from '../components/ui';
import { IMPACTS, SHIFT_TYPES, colourVar } from '../domain/categories';
import { crossesMidnight } from '../domain/occurrences';
import { dayName, formatTime, today } from '../lib/date';
import type {
  Category,
  HouseholdVisibility,
  Entry,
  EventEntry,
  Id,
  Recurrence,
  ShiftEntry,
  ShiftImpact,
  ShiftType,
  TaskEntry,
  Visibility,
} from '../types';

type Kind = 'event' | 'shift' | 'task' | 'reminder' | 'appointment' | 'activity';

const KINDS: { kind: Kind; label: string; sub: string }[] = [
  { kind: 'event', label: 'event', sub: 'anything on the calendar' },
  { kind: 'activity', label: 'activity', sub: 'sport, club, lessons' },
  { kind: 'appointment', label: 'appointment', sub: 'doctor, dentist, car' },
  { kind: 'shift', label: 'shift', sub: 'work and rosters' },
  { kind: 'task', label: 'task', sub: 'something to get done' },
  { kind: 'reminder', label: 'reminder', sub: 'a nudge at a time' },
];

export function AddPage() {
  const { state, dispatch } = useStore();
  const [kind, setKind] = useState<Kind | null>(null);
  const navigate = useNavigate();

  const repeatLast = () => {
    const t = state.lastTemplate;
    if (!t) return;
    dispatch({
      type: 'entry/add',
      entry: { ...(t.entry as Omit<Entry, 'id' | 'createdAt'>), id: newId(), createdAt: Date.now() } as Entry,
    });
    navigate('/');
  };

  if (!kind) {
    return (
      <>
        <header className="topbar">
          <div>
            <div className="topbar__title">what are you adding?</div>
            <div className="topbar__sub">few fields. fast entry. done.</div>
          </div>
          <button type="button" className="btn btn--sm btn--quiet" onClick={() => navigate(-1)}>
            cancel
          </button>
        </header>

        {state.lastTemplate && (
          <button type="button" className="repeatlast" onClick={repeatLast}>
            <span className="repeatlast__label">repeat last</span>
            <span className="repeatlast__value">{state.lastTemplate.label}</span>
          </button>
        )}

        <div className="onb__choices" style={{ marginTop: 14 }}>
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              className="pickcard"
              onClick={() => setKind(k.kind)}
            >
              <span className="pickcard__label">{k.label}</span>
              <span className="pickcard__sub">{k.sub}</span>
            </button>
          ))}
        </div>
      </>
    );
  }

  if (kind === 'shift') return <ShiftForm onBack={() => setKind(null)} />;
  if (kind === 'task' || kind === 'reminder')
    return <TaskForm kind={kind} onBack={() => setKind(null)} />;
  return <EventForm kind={kind} onBack={() => setKind(null)} />;
}

/* ---------------- event ---------------- */

function EventForm({ kind, onBack }: { kind: Kind; onBack: () => void }) {
  const { state, dispatch } = useStore();
  const navigate = useNavigate();

  const defaultCategory: Category =
    kind === 'activity' ? 'activity' : kind === 'appointment' ? 'appointment' : 'family';

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<Category>(defaultCategory);
  const [who, setWho] = useState<Id[]>([]);
  const [date, setDate] = useState(today());
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState('16:30');
  const [end, setEnd] = useState('17:30');
  const [where, setWhere] = useState('');
  const [repeat, setRepeat] = useState<'none' | 'weekly' | 'daily'>('none');
  const [visibleToAll, setVisibleToAll] = useState(true);
  const [prep, setPrep] = useState('');
  const [households, setHouseholds] = useState<HouseholdVisibility>('both');

  const categories: Category[] = state.settings.sharedCareEnabled
    ? ['activity', 'school', 'appointment', 'family', 'sharedCare']
    : ['activity', 'school', 'appointment', 'family'];

  const save = () => {
    const recurrence: Recurrence =
      repeat === 'weekly'
        ? { kind: 'weekly', interval: 1, weekdays: [weekdayOf(date)] }
        : repeat === 'daily'
          ? { kind: 'daily', interval: 1 }
          : { kind: 'none' };

    const visibility: Visibility = visibleToAll ? 'everyone' : { only: who };

    const entry: EventEntry = {
      id: newId(),
      type: 'event',
      title: title.trim(),
      category,
      personIds: who.length > 0 ? who : state.people.map((p) => p.id),
      visibility,
      householdVisibility: households,
      location: where.trim() || undefined,
      prepNote: prep.trim() || undefined,
      startDate: date,
      allDay,
      startTime: allDay ? undefined : start,
      endTime: allDay ? undefined : end,
      recurrence,
      exceptions: [],
      createdAt: Date.now(),
    };

    dispatch({ type: 'entry/add', entry });
    dispatch({
      type: 'template/set',
      template: { label: entry.title, entry: stripIds(entry) },
    });
    navigate('/');
  };

  return (
    <FormShell title={`add ${kind}`} onBack={onBack} onSave={save} canSave={!!title.trim()}>
      <Field label="what?">
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === 'appointment' ? 'Dentist — Otis' : 'Otis’s BJJ'}
          autoFocus
        />
      </Field>

      <PeoplePicker label="who?" value={who} onChange={setWho} />

      <FieldGroup label="what kind of thing?">
        <div className="choices">
          {categories.map((c) => (
            <Chip key={c} outline active={category === c} onClick={() => setCategory(c)}>
              {CATEGORY_LABEL[c]}
            </Chip>
          ))}
        </div>
      </FieldGroup>

      <Field label="when?">
        <input
          className="input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>

      <FieldGroup label="time">
        <Segmented
          value={allDay ? 'allday' : 'timed'}
          onChange={(v) => setAllDay(v === 'allday')}
          options={[
            { value: 'timed', label: 'at a time' },
            { value: 'allday', label: 'all day' },
          ]}
        />
        {!allDay && (
          <div className="input-pair" style={{ marginTop: 10 }}>
            <input
              className="input"
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
            <span className="input-pair__arrow">→</span>
            <input
              className="input"
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        )}
      </FieldGroup>

      <Field label="where?">
        <input
          className="input"
          value={where}
          onChange={(e) => setWhere(e.target.value)}
          placeholder="The Hive"
        />
      </Field>

      <FieldGroup label="repeat?">
        <div className="choices">
          <Chip outline active={repeat === 'none'} onClick={() => setRepeat('none')}>
            just once
          </Chip>
          <Chip outline active={repeat === 'weekly'} onClick={() => setRepeat('weekly')}>
            every {dayName(date)}
          </Chip>
          <Chip outline active={repeat === 'daily'} onClick={() => setRepeat('daily')}>
            every day
          </Chip>
        </div>
      </FieldGroup>

      <FieldGroup
        label="who can see it?"
        hint="an event can belong to one person and still be everyone’s business."
      >
        <Segmented
          value={visibleToAll ? 'all' : 'some'}
          onChange={(v) => setVisibleToAll(v === 'all')}
          options={[
            { value: 'all', label: 'everyone' },
            { value: 'some', label: 'just the people on it' },
          ]}
        />
      </FieldGroup>

      <HouseholdField value={households} onChange={setHouseholds} />

      <Field label="anything to remember?" hint="shows up as a heads up the day before.">
        <input
          className="input"
          value={prep}
          onChange={(e) => setPrep(e.target.value)}
          placeholder="Don’t forget the gi 🥋"
        />
      </Field>
    </FormShell>
  );
}

/* ---------------- shift ---------------- */

function ShiftForm({ onBack }: { onBack: () => void }) {
  const { state, dispatch, adults } = useStore();
  const navigate = useNavigate();
  const candidates = adults.length > 0 ? adults : state.people.filter((p) => p.role !== 'pet');

  const [personId, setPersonId] = useState<Id>(candidates[0]?.id ?? '');
  const [shiftType, setShiftType] = useState<ShiftType>('day');
  const [date, setDate] = useState(today());
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  // 'week' is first and default: most people work a standard week, and it was
  // previously the one thing this form could not express.
  const [pattern, setPattern] = useState<'week' | 'none' | '4-4' | '7-7' | 'custom'>('week');
  const [customOn, setCustomOn] = useState(3);
  const [customOff, setCustomOff] = useState(2);
  const [impacts, setImpacts] = useState<ShiftImpact[]>([]);
  /** weekday → not working | at work | from home */
  const [week, setWeek] = useState<Record<number, DayMode>>({
    1: 'onsite', 2: 'onsite', 3: 'onsite', 4: 'onsite', 5: 'onsite', 6: 'off', 7: 'off',
  });
  const [wfhAll, setWfhAll] = useState(false);

  const workingDays = WEEKDAYS.filter((d) => week[d.value] !== 'off').map((d) => d.value);
  const wfhDays = WEEKDAYS.filter((d) => week[d.value] === 'home').map((d) => d.value);

  const overnight = crossesMidnight({ startTime: start, endTime: end } as ShiftEntry);

  const pickType = (t: ShiftType) => {
    setShiftType(t);
    const preset = SHIFT_TYPES.find((s) => s.value === t);
    if (preset && t !== 'custom') {
      setStart(preset.start);
      setEnd(preset.end);
    }
  };

  const save = () => {
    const recurrence: Recurrence =
      pattern === 'week'
        ? { kind: 'weekly', interval: 1, weekdays: workingDays }
        : pattern === '4-4'
          ? { kind: 'roster', on: 4, off: 4 }
          : pattern === '7-7'
            ? { kind: 'roster', on: 7, off: 7 }
            : pattern === 'custom'
              ? { kind: 'roster', on: customOn, off: customOff }
              : { kind: 'none' };

    const person = state.people.find((p) => p.id === personId);

    const entry: ShiftEntry = {
      id: newId(),
      type: 'shift',
      // "day shift" is roster language. A standard week is just work.
      title:
        pattern === 'week' && (shiftType === 'day' || shiftType === 'custom')
          ? 'Work'
          : `${SHIFT_TYPES.find((s) => s.value === shiftType)?.label ?? 'shift'} shift`,
      category: 'work',
      personIds: [personId],
      visibility: 'everyone',
      startDate: date,
      shiftType,
      startTime: start,
      endTime: end,
      impacts,
      wfhWeekdays: pattern === 'week' && wfhDays.length > 0 ? wfhDays : undefined,
      wfh: pattern !== 'week' && wfhAll ? true : undefined,
      recurrence,
      exceptions: [],
      createdAt: Date.now(),
    };

    dispatch({ type: 'entry/add', entry });
    // Turn work on for this person — the work tab appears the moment it matters.
    if (person && !person.worksShifts) {
      dispatch({ type: 'person/update', id: personId, patch: { worksShifts: true } });
    }
    dispatch({
      type: 'template/set',
      template: { label: `${entry.title} · ${person?.name ?? ''}`, entry: stripIds(entry) },
    });
    navigate('/work');
  };

  return (
    <FormShell title="add shift" onBack={onBack} onSave={save} canSave={!!personId}>
      <FieldGroup label="who’s working?">
        <div className="choices">
          {candidates.map((p) => (
            <Chip key={p.id} outline active={personId === p.id} onClick={() => setPersonId(p.id)}>
              <span className="dot" style={{ background: colourVar(p.colour) }} />
              {p.name}
            </Chip>
          ))}
        </div>
      </FieldGroup>

      <FieldGroup label="shift type">
        <div className="choices">
          {SHIFT_TYPES.map((s) => (
            <Chip key={s.value} outline active={shiftType === s.value} onClick={() => pickType(s.value)}>
              {s.label}
            </Chip>
          ))}
        </div>
      </FieldGroup>

      <Field
        label={pattern === 'week' ? 'starting from' : 'when?'}
        hint={pattern === 'week' ? 'the week runs from here on.' : undefined}
      >
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      <FieldGroup label="hours">
        <div className="input-pair">
          <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          <span className="input-pair__arrow">→</span>
          <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div className="shiftpreview" data-overnight={overnight}>
          {overnight ? (
            <>
              <strong>
                {pattern === 'week' ? describeDays(workingDays) : dayName(date)} {formatTime(start)}{' '}
                → {formatTime(end)} the next morning
              </strong>
              <span>one shift, crossing midnight.</span>
            </>
          ) : (
            <strong>
              {pattern === 'week' ? describeDays(workingDays) : dayName(date)}{' '}
              {formatTime(start)}–{formatTime(end)}
            </strong>
          )}
          {pattern === 'week' && wfhDays.length > 0 && (
            <span>from home on {describeDays(wfhDays)}.</span>
          )}
        </div>
      </FieldGroup>

      <FieldGroup label="does this follow a pattern?">
        <div className="choices">
          <Chip outline active={pattern === 'week'} onClick={() => setPattern('week')}>
            the same days each week
          </Chip>
          <Chip outline active={pattern === 'none'} onClick={() => setPattern('none')}>
            just this once
          </Chip>
          <Chip outline active={pattern === '4-4'} onClick={() => setPattern('4-4')}>
            4 on / 4 off
          </Chip>
          <Chip outline active={pattern === '7-7'} onClick={() => setPattern('7-7')}>
            7 on / 7 off
          </Chip>
          <Chip outline active={pattern === 'custom'} onClick={() => setPattern('custom')}>
            custom pattern
          </Chip>
        </div>
        {pattern === 'week' && (
          <WeekPicker week={week} onChange={setWeek} />
        )}
        {pattern !== 'week' && (
          <div className="choices" style={{ marginTop: 10 }}>
            <Chip outline active={wfhAll} onClick={() => setWfhAll(!wfhAll)}>
              🏠 worked from home
            </Chip>
          </div>
        )}
        {pattern === 'custom' && (
          <div className="input-pair" style={{ marginTop: 10 }}>
            <input
              className="input"
              type="number"
              min={1}
              max={28}
              value={customOn}
              onChange={(e) => setCustomOn(Number(e.target.value))}
            />
            <span className="input-pair__arrow">on /</span>
            <input
              className="input"
              type="number"
              min={1}
              max={28}
              value={customOff}
              onChange={(e) => setCustomOff(Number(e.target.value))}
            />
          </div>
        )}
      </FieldGroup>

      <FieldGroup
        label="what does it mean at home?"
        hint="optional — but it is what lets the app tell off work from actually available."
      >
        <div className="choices">
          {IMPACTS.map((i) => (
            <Chip
              key={i.value}
              outline
              active={impacts.includes(i.value)}
              onClick={() =>
                setImpacts((cur) =>
                  cur.includes(i.value) ? cur.filter((x) => x !== i.value) : [...cur, i.value],
                )
              }
            >
              {i.label}
            </Chip>
          ))}
        </div>
      </FieldGroup>
    </FormShell>
  );
}

/* ---------------- the working week ---------------- */

type DayMode = 'off' | 'onsite' | 'home';

const WEEKDAYS = [
  { value: 1, short: 'M', name: 'Monday' },
  { value: 2, short: 'T', name: 'Tuesday' },
  { value: 3, short: 'W', name: 'Wednesday' },
  { value: 4, short: 'T', name: 'Thursday' },
  { value: 5, short: 'F', name: 'Friday' },
  { value: 6, short: 'S', name: 'Saturday' },
  { value: 7, short: 'S', name: 'Sunday' },
];

const NEXT_MODE: Record<DayMode, DayMode> = {
  off: 'onsite',
  onsite: 'home',
  home: 'off',
};

/** One control for both questions: which days are worked, and which of those
 *  are worked from home. Tapping a day cycles off → at work → from home. */
function WeekPicker({
  week,
  onChange,
}: {
  week: Record<number, DayMode>;
  onChange: (w: Record<number, DayMode>) => void;
}) {
  return (
    <div style={{ marginTop: 10 }}>
      <div className="weekpick">
        {WEEKDAYS.map((d) => (
          <button
            key={d.value}
            type="button"
            className="weekpick__day"
            data-mode={week[d.value]}
            aria-label={`${d.name} — ${MODE_LABEL[week[d.value]]}`}
            onClick={() => onChange({ ...week, [d.value]: NEXT_MODE[week[d.value]] })}
          >
            <span className="weekpick__letter">{d.short}</span>
            {week[d.value] === 'home' && <span className="weekpick__home">🏠</span>}
          </button>
        ))}
      </div>
      <div className="weekpick__key">
        <span>
          <i className="weekpick__swatch" data-mode="onsite" /> at work
        </span>
        <span>
          <i className="weekpick__swatch" data-mode="home" /> from home
        </span>
        <span className="muted">tap a day to change it</span>
      </div>
    </div>
  );
}

const MODE_LABEL: Record<DayMode, string> = {
  off: 'not working',
  onsite: 'at work',
  home: 'from home',
};

/** 'Monday to Friday', 'Monday and Thursday', 'Monday, Wednesday and Friday' */
export function describeDays(days: number[]): string {
  if (days.length === 0) return 'no days';
  if (days.length === 7) return 'every day';
  const names = days.map((d) => WEEKDAYS[d - 1].name);
  const consecutive = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  if (consecutive && days.length > 2) return `${names[0]} to ${names[names.length - 1]}`;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/* ---------------- task ---------------- */

function TaskForm({ kind, onBack }: { kind: Kind; onBack: () => void }) {
  const { state, dispatch } = useStore();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [who, setWho] = useState<Id[]>([]);
  const [date, setDate] = useState(today());
  const [time, setTime] = useState(kind === 'reminder' ? '18:00' : '');
  const [weekly, setWeekly] = useState(false);
  const [households, setHouseholds] = useState<HouseholdVisibility>('both');

  const save = () => {
    const entry: TaskEntry = {
      id: newId(),
      type: 'task',
      title: title.trim(),
      category: 'task',
      personIds: who.length > 0 ? who : state.people.map((p) => p.id),
      visibility: 'everyone',
      householdVisibility: households,
      dueDate: date,
      dueTime: time || undefined,
      doneDates: [],
      recurrence: weekly ? { kind: 'weekly', interval: 1, weekdays: [weekdayOf(date)] } : { kind: 'none' },
      exceptions: [],
      createdAt: Date.now(),
    };
    dispatch({ type: 'entry/add', entry });
    dispatch({ type: 'template/set', template: { label: entry.title, entry: stripIds(entry) } });
    navigate('/');
  };

  return (
    <FormShell title={`add ${kind}`} onBack={onBack} onSave={save} canSave={!!title.trim()}>
      <Field label="what?">
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === 'reminder' ? 'Bins out' : 'Pay school trip'}
          autoFocus
        />
      </Field>

      <PeoplePicker label="who’s doing it?" value={who} onChange={setWho} />

      <Field label="when?">
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      <Field label="at a time?" hint="leave it blank if it just needs doing that day.">
        <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </Field>

      <FieldGroup label="repeat?">
        <div className="choices">
          <Chip outline active={!weekly} onClick={() => setWeekly(false)}>
            just once
          </Chip>
          <Chip outline active={weekly} onClick={() => setWeekly(true)}>
            every {dayName(date)}
          </Chip>
        </div>
      </FieldGroup>

      <HouseholdField value={households} onChange={setHouseholds} />
    </FormShell>
  );
}

/* ---------------- shared bits ---------------- */

function FormShell({
  title,
  onBack,
  onSave,
  canSave,
  children,
}: {
  title: string;
  onBack: () => void;
  onSave: () => void;
  canSave: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <header className="topbar">
        <div>
          <div className="topbar__title">{title}</div>
        </div>
        <button type="button" className="btn btn--sm btn--quiet" onClick={onBack}>
          back
        </button>
      </header>
      <div style={{ marginTop: 14 }}>{children}</div>
      <button
        type="button"
        className="btn btn--accent btn--block"
        style={{ marginTop: 6 }}
        onClick={onSave}
        disabled={!canSave}
      >
        {title}
      </button>
    </>
  );
}

function PeoplePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Id[];
  onChange: (v: Id[]) => void;
}) {
  const { state } = useStore();
  const toggle = (id: Id) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <FieldGroup label={label} hint={value.length === 0 ? 'nobody picked means everyone.' : undefined}>
      <div className="choices">
        {state.people.map((p) => (
          <Chip key={p.id} outline active={value.includes(p.id)} onClick={() => toggle(p.id)}>
            <span className="dot" style={{ background: colourVar(p.colour) }} />
            {p.name}
          </Chip>
        ))}
      </div>
    </FieldGroup>
  );
}

/** Only appears for families using shared care, and defaults to both —
 *  the app never quietly hides a child's life from the other household. */
function HouseholdField({
  value,
  onChange,
}: {
  value: HouseholdVisibility;
  onChange: (v: HouseholdVisibility) => void;
}) {
  const { careEnabled, households, state } = useStore();
  if (!careEnabled || households.length < 2) return null;
  const home = state.settings.homeHouseholdId ?? households[0].id;
  const homeName = households.find((h) => h.id === home)?.name ?? 'this household';

  return (
    <FieldGroup
      label="which households?"
      hint="school and activities usually belong to both. the things that are only your business don't have to be."
    >
      <div className="choices">
        <Chip outline active={value === 'both'} onClick={() => onChange('both')}>
          both households
        </Chip>
        <Chip
          outline
          active={value !== 'both'}
          onClick={() => onChange({ household: home })}
        >
          just {homeName}
        </Chip>
      </div>
    </FieldGroup>
  );
}

const CATEGORY_LABEL: Record<Category, string> = {
  activity: 'activity',
  school: 'school/daycare',
  appointment: 'appointment',
  family: 'family',
  work: 'work',
  task: 'task',
  sharedCare: 'shared care',
};

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const js = new Date(y, m - 1, d).getDay();
  return js === 0 ? 7 : js;
}

function stripIds(entry: Entry): Omit<Entry, 'id' | 'createdAt'> {
  const { id: _id, createdAt: _createdAt, ...rest } = entry;
  return rest as Omit<Entry, 'id' | 'createdAt'>;
}

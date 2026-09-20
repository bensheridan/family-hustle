import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { newId, useStore } from '../state/store';
import { blankState } from '../data/seed';
import { Avatar, Chip, FieldGroup, Toggle } from '../components/ui';
import { PERSON_COLOURS, colourVar } from '../domain/categories';
import type { HouseholdMode, Person, PersonRole } from '../types';

type Step = 'welcome' | 'people' | 'setup' | 'work' | 'done';

export function Onboarding() {
  const { state, dispatch } = useStore();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('welcome');

  const finish = () => {
    dispatch({ type: 'settings', patch: { onboarded: true } });
    navigate('/', { replace: true });
  };

  return (
    <div className="onb">
      {step === 'welcome' && (
        <Welcome
          onStart={() => {
            dispatch({ type: 'reset', state: blankState() });
            setStep('people');
          }}
          onDemo={finish}
        />
      )}

      {step === 'people' && (
        <People
          onNext={() => setStep('setup')}
          petsEnabled={state.settings.petsEnabled}
          onPets={(v) => dispatch({ type: 'settings', patch: { petsEnabled: v } })}
        />
      )}

      {step === 'setup' && <Setup onNext={() => setStep('work')} />}

      {step === 'work' && <Work onNext={() => setStep('done')} />}

      {step === 'done' && <Done onFinish={finish} />}
    </div>
  );
}

/* ---------------- steps ---------------- */

function Welcome({ onStart, onDemo }: { onStart: () => void; onDemo: () => void }) {
  return (
    <div className="onb__pane onb__pane--hero">
      <div className="onb__brandmark">
        <span className="wordmark">
          Family <em>hustle</em>
        </span>
      </div>
      <h1 className="onb__headline">
        everything your family
        <br />
        needs, in one place.
      </h1>
      <p className="onb__lede">
        school, activities, appointments, work, shifts and the chaos in between —
        all on one calendar.
      </p>
      <div className="onb__actions">
        <button type="button" className="btn btn--accent btn--block" onClick={onStart}>
          set up my family
        </button>
        <button type="button" className="btn btn--ghost btn--block" onClick={onDemo}>
          look around with a demo family
        </button>
      </div>
    </div>
  );
}

function People({
  onNext,
  petsEnabled,
  onPets,
}: {
  onNext: () => void;
  petsEnabled: boolean;
  onPets: (v: boolean) => void;
}) {
  const { state, dispatch } = useStore();
  const [name, setName] = useState('');
  const [role, setRole] = useState<PersonRole>('adult');

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const person: Person = {
      id: newId(),
      name: trimmed,
      role,
      colour: PERSON_COLOURS[state.people.length % PERSON_COLOURS.length],
      worksShifts: false,
    };
    dispatch({ type: 'person/add', person });
    setName('');
  };

  const roles: { value: PersonRole; label: string }[] = [
    { value: 'adult', label: 'adult' },
    { value: 'child', label: 'child' },
    ...(petsEnabled ? [{ value: 'pet' as PersonRole, label: 'pet' }] : []),
  ];

  return (
    <div className="onb__pane">
      <StepHead n={1} title="who’s in your hustle?" sub="add everyone. you can change this later." />

      <ul className="card onb__list">
        {state.people.map((p) => (
          <li key={p.id} className="row">
            <Avatar person={p} />
            <span className="row__main">
              <span className="row__title">{p.name}</span>
              <span className="row__meta">{p.role}</span>
            </span>
            <button
              type="button"
              className="btn btn--sm btn--quiet"
              onClick={() => dispatch({ type: 'person/remove', id: p.id })}
            >
              remove
            </button>
          </li>
        ))}
        {state.people.length === 0 && (
          <li className="empty" style={{ padding: 22 }}>
            nobody yet — start with yourself.
          </li>
        )}
      </ul>

      <div className="onb__add">
        <div className="segmented" style={{ marginBottom: 10 }}>
          {roles.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={role === r.value}
              onClick={() => setRole(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
        {/* a form so Enter — and the phone keyboard's "go" — both add someone */}
        <form
          style={{ display: 'flex', gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            className="input"
            placeholder="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn btn--primary" disabled={!name.trim()}>
            add
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <Toggle
          label="we have pets"
          description="adds pets to the family, for vet visits and the like"
          on={petsEnabled}
          onChange={onPets}
        />
      </div>

      <StepFoot onNext={onNext} disabled={state.people.length === 0} />
    </div>
  );
}

function Setup({ onNext }: { onNext: () => void }) {
  const { state, dispatch } = useStore();
  const mode = state.settings.householdMode;

  // Shared care is one option among four. It is never preselected.
  const options: { value: HouseholdMode; label: string; sub: string }[] = [
    { value: 'one', label: 'one household', sub: 'everyone under one roof' },
    { value: 'multiple', label: 'more than one home', sub: 'family spread across places' },
    { value: 'sharedCare', label: 'shared care', sub: 'some kids move between homes' },
    { value: 'undecided', label: 'I’ll decide later', sub: 'skip it — nothing changes' },
  ];

  const choose = (value: HouseholdMode) =>
    dispatch({
      type: 'settings',
      patch: { householdMode: value },
    });

  return (
    <div className="onb__pane">
      <StepHead
        n={2}
        title="how does your family work?"
        sub="this only decides what we show you. nothing is locked in."
      />
      <div className="onb__choices">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="pickcard"
            data-on={mode === o.value}
            onClick={() => choose(o.value)}
          >
            <span className="pickcard__label">{o.label}</span>
            <span className="pickcard__sub">{o.sub}</span>
          </button>
        ))}
      </div>
      <StepFoot onNext={onNext} />
    </div>
  );
}

function Work({ onNext }: { onNext: () => void }) {
  const { state, dispatch, adults } = useStore();
  const anyone = state.people.filter((p) => p.role !== 'pet');
  const list = adults.length > 0 ? adults : anyone;

  return (
    <div className="onb__pane">
      <StepHead
        n={3}
        title="whose work should be on the calendar?"
        sub="a standard week, a rotating roster, nights — whatever shape it is."
      />
      <FieldGroup label="tap anyone whose work the family needs to see">
        <div className="choices">
          {list.map((p) => (
            <Chip
              key={p.id}
              active={p.worksShifts}
              outline
              onClick={() =>
                dispatch({ type: 'person/update', id: p.id, patch: { worksShifts: !p.worksShifts } })
              }
            >
              <span className="dot" style={{ background: colourVar(p.colour) }} />
              {p.name}
            </Chip>
          ))}
        </div>
      </FieldGroup>
      <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
        nobody? no problem — the work section stays out of your way until you need it.
      </p>
      <StepFoot onNext={onNext} nextLabel="next" />
    </div>
  );
}

function Done({ onFinish }: { onFinish: () => void }) {
  const { state } = useStore();
  return (
    <div className="onb__pane onb__pane--hero">
      <div className="onb__brandmark">
        <span className="wordmark">
          Family <em>hustle</em>
        </span>
      </div>
      <h1 className="onb__headline">that’s the hard part done.</h1>
      <p className="onb__lede">
        {state.people.length} in the family. add your first thing whenever you’re ready — it takes
        about ten seconds.
      </p>
      <div className="onb__avatars">
        {state.people.map((p) => (
          <Avatar key={p.id} person={p} size="lg" />
        ))}
      </div>
      <div className="onb__actions">
        <button type="button" className="btn btn--accent btn--block" onClick={onFinish}>
          let’s go
        </button>
      </div>
    </div>
  );
}

/* ---------------- bits ---------------- */

function StepHead({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <header className="onb__head">
      <span className="onb__step">step {n} of 3</span>
      <h1 className="onb__title">{title}</h1>
      <p className="onb__sub">{sub}</p>
    </header>
  );
}

function StepFoot({
  onNext,
  disabled,
  nextLabel = 'next',
}: {
  onNext: () => void;
  disabled?: boolean;
  nextLabel?: string;
}) {
  return (
    <div className="onb__foot">
      <button
        type="button"
        className="btn btn--accent btn--block"
        onClick={onNext}
        disabled={disabled}
      >
        {nextLabel}
      </button>
    </div>
  );
}

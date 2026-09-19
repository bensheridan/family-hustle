import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clearStorage, newId, useStore } from '../state/store';
import { blankState, seedState } from '../data/seed';
import { Avatar, Chip, SectionHead, Sheet, Toggle } from '../components/ui';
import { PERSON_COLOURS, colourVar } from '../domain/categories';
import { HouseholdDot } from '../components/CareBits';
import type { HouseholdMode, Person, PersonRole } from '../types';

export function More() {
  const { state, dispatch, households, careEnabled } = useStore();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);

  const setMode = (mode: HouseholdMode) => {
    if (mode === 'sharedCare') {
      dispatch({ type: 'sharedCare/enable' });
      return;
    }
    if (careEnabled) dispatch({ type: 'sharedCare/disable' });
    dispatch({ type: 'settings', patch: { householdMode: mode } });
  };

  const modes: { value: HouseholdMode; label: string }[] = [
    { value: 'one', label: 'one household' },
    { value: 'multiple', label: 'multiple households' },
    { value: 'sharedCare', label: 'shared care' },
    { value: 'undecided', label: 'not sure yet' },
  ];

  return (
    <>
      <header className="topbar">
        <div>
          <div className="topbar__title">more</div>
          <div className="topbar__sub">the app adapts to your family, not the other way round</div>
        </div>
      </header>

      <section className="section">
        <SectionHead
          title="family"
          action={
            <button type="button" className="section__link" onClick={() => setAdding(true)}>
              + add someone
            </button>
          }
        />
        <div className="card">
          {state.people.map((p) => (
            <div key={p.id} className="row">
              <Avatar person={p} />
              <span className="row__main">
                <span className="row__title">{p.name}</span>
                <span className="row__meta">
                  {p.role}
                  {p.worksShifts && <span>· works shifts</span>}
                </span>
              </span>
              <button
                type="button"
                className="btn btn--sm btn--quiet"
                onClick={() =>
                  dispatch({
                    type: 'person/update',
                    id: p.id,
                    patch: { worksShifts: !p.worksShifts },
                  })
                }
              >
                {p.worksShifts ? 'work off' : 'work on'}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <SectionHead title="how your family works" />
        <div className="card card--pad">
          <div className="choices">
            {modes.map((m) => (
              <Chip
                key={m.value}
                outline
                active={state.settings.householdMode === m.value}
                onClick={() => setMode(m.value)}
              >
                {m.label}
              </Chip>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
            shared care, multiple households and shift work are all optional. leave them off and
            you’ll never see them.
          </p>
        </div>
      </section>

      <section className="section">
        <SectionHead title="optional features" />
        <div className="card">
          <Toggle
            label="shared care"
            description="handovers, parenting schedules and visibility between households"
            on={careEnabled}
            onChange={(v) =>
              dispatch({ type: v ? 'sharedCare/enable' : 'sharedCare/disable' })
            }
          />
          <Toggle
            label="pets"
            description="vet visits, grooming, the dog’s medication"
            on={state.settings.petsEnabled}
            onChange={(v) => dispatch({ type: 'settings', patch: { petsEnabled: v } })}
          />
          <Toggle
            label="weeks start on Monday"
            description="turn off if your week starts on Sunday"
            on={state.settings.weekStartsMonday}
            onChange={(v) => dispatch({ type: 'settings', patch: { weekStartsMonday: v } })}
          />
        </div>
      </section>

      {careEnabled && (
        <section className="section">
          <SectionHead title="shared care" />
          <Link className="card card--pad fridgecta" to="/shared-care">
            <div>
              <div className="row__title">care schedule</div>
              <div className="row__meta">patterns, handovers and households</div>
            </div>
            <span className="kidcard__chev">›</span>
          </Link>

          <div className="card" style={{ marginTop: 10 }}>
            <div className="row" style={{ display: 'block' }}>
              <div className="field__label" style={{ marginBottom: 8 }}>
                check what the other household sees
              </div>
              <div className="choices">
                {households.map((h) => {
                  const viewing =
                    (state.settings.viewingAsHouseholdId ?? state.settings.homeHouseholdId) === h.id;
                  return (
                    <Chip
                      key={h.id}
                      outline
                      active={viewing}
                      onClick={() =>
                        dispatch({
                          type: 'settings',
                          patch: {
                            viewingAsHouseholdId:
                              h.id === state.settings.homeHouseholdId ? undefined : h.id,
                          },
                        })
                      }
                    >
                      <HouseholdDot household={h} />
                      {h.name}
                    </Chip>
                  );
                })}
              </div>
              <div className="field__hint">
                this only changes what you see. nothing is sent anywhere, and nothing changes for
                them.
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <SectionHead title="the fridge" />
        <Link className="card card--pad fridgecta" to="/fridge">
          <div>
            <div className="row__title">export month</div>
            <div className="row__meta">a printable calendar for the fridge door</div>
          </div>
          <span className="kidcard__chev">›</span>
        </Link>
      </section>

      <section className="section">
        <SectionHead title="this prototype" />
        <div className="card">
          <button
            type="button"
            className="row"
            onClick={() => {
              dispatch({ type: 'reset', state: { ...seedState(), settings: { ...seedState().settings, onboarded: true } } });
              navigate('/');
            }}
          >
            <span className="row__main">
              <span className="row__title">reload the demo family</span>
              <span className="row__meta">Nadia, Theo, Otis, Juno and Wren</span>
            </span>
          </button>
          <button
            type="button"
            className="row"
            onClick={() => {
              dispatch({ type: 'reset', state: blankState() });
              navigate('/welcome');
            }}
          >
            <span className="row__main">
              <span className="row__title">start from scratch</span>
              <span className="row__meta">clears everything and runs setup again</span>
            </span>
          </button>
          <button
            type="button"
            className="row"
            onClick={() => {
              clearStorage();
              window.location.reload();
            }}
          >
            <span className="row__main">
              <span className="row__title">clear saved data</span>
              <span className="row__meta">everything lives in this browser only</span>
            </span>
          </button>
        </div>
      </section>

      {adding && <AddPersonSheet onClose={() => setAdding(false)} />}
    </>
  );
}

function AddPersonSheet({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const [name, setName] = useState('');
  const [role, setRole] = useState<PersonRole>('child');

  const roles: PersonRole[] = state.settings.petsEnabled
    ? ['adult', 'child', 'pet']
    : ['adult', 'child'];

  const save = () => {
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
    onClose();
  };

  return (
    <Sheet title="add someone" onClose={onClose}>
      <label className="field">
        <span className="field__label">name</span>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Wren"
          autoFocus
        />
      </label>
      <div className="field">
        <span className="field__label">they’re a…</span>
        <div className="choices">
          {roles.map((r) => (
            <Chip key={r} outline active={role === r} onClick={() => setRole(r)}>
              {r}
            </Chip>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field__label">colour</span>
        <div className="choices">
          {PERSON_COLOURS.map((c) => (
            <span
              key={c}
              className="dot dot--lg"
              style={{ background: colourVar(c), width: 22, height: 22 }}
            />
          ))}
        </div>
        <span className="field__hint">assigned automatically — you can change it later.</span>
      </div>
      <button
        type="button"
        className="btn btn--accent btn--block"
        onClick={save}
        disabled={!name.trim()}
      >
        add to the family
      </button>
    </Sheet>
  );
}

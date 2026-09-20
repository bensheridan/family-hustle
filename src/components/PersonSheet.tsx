import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../state/store';
import { Avatar, Chip, Sheet } from './ui';
import { HouseholdDot } from './CareBits';
import { PERSON_COLOURS, colourVar } from '../domain/categories';
import { JOB_TYPES, SCHOOL_LEVELS } from '../domain/school';
import { scheduleFor } from '../domain/care';
import { ageOn, nextBirthday } from '../domain/birthdays';
import { today } from '../lib/date';
import type { Person } from '../types';

/** Editing one person.
 *
 * Until now a person could be created and never changed — no birthday, no
 * school, not even a name correction. Everything the family wants to record
 * about someone lives here, and which questions get asked depends on who they
 * are: a five-year-old does not have a job and an adult is not at
 * intermediate.
 */
export function PersonSheet({ person, onClose }: { person: Person; onClose: () => void }) {
  const { state, dispatch, households, multiHousehold } = useStore();
  const navigate = useNavigate();
  const [name, setName] = useState(person.name);

  const set = (patch: Partial<Person>) =>
    dispatch({ type: 'person/update', id: person.id, patch });

  const schedule = scheduleFor(state.careSchedules, person.id);
  const homeId = state.settings.homeHouseholdId ?? households[0]?.id;

  /* Emma asked for "full time in your household, or a percentage with you".
   * The percentage is already known — it falls out of the care cycle — so it
   * is worked out rather than asked for. */
  const shareWithUs = schedule
    ? Math.round(
        (schedule.cycle.filter((id) => id === homeId).length / schedule.cycle.length) * 100,
      )
    : 100;

  return (
    <Sheet title={person.name} onClose={onClose}>
      <div className="personsheet__head">
        <Avatar person={person} size="lg" />
        <div>
          <div className="row__title">{person.role}</div>
          {person.birthday && (
            <div className="row__meta">
              {(() => {
                const next = nextBirthday(person, today());
                const age = next ? ageOn(person, next) : undefined;
                return age ? `turns ${age} next birthday` : 'birthday saved';
              })()}
            </div>
          )}
        </div>
      </div>

      <label className="field">
        <span className="field__label">name</span>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => set({ name: name.trim() || person.name })}
        />
      </label>

      <div className="field">
        <span className="field__label">colour</span>
        <div className="choices">
          {PERSON_COLOURS.map((c) => (
            <button
              key={c}
              type="button"
              className="swatch"
              data-on={person.colour === c}
              style={{ background: colourVar(c) }}
              aria-label={c}
              onClick={() => set({ colour: c })}
            />
          ))}
        </div>
      </div>

      <label className="field">
        <span className="field__label">birthday</span>
        <input
          className="input"
          type="date"
          value={person.birthday ?? ''}
          onChange={(e) => set({ birthday: e.target.value || undefined })}
        />
        <span className="field__hint">
          the year matters — it is how the app knows what age they are turning.
        </span>
      </label>

      {/* ---- children ---- */}
      {person.role === 'child' && (
        <>
          <div className="field">
            <span className="field__label">where they’re at</span>
            <div className="choices">
              {SCHOOL_LEVELS.map((l) => (
                <Chip
                  key={l.value}
                  outline
                  active={person.schoolLevel === l.value}
                  onClick={() =>
                    set({ schoolLevel: person.schoolLevel === l.value ? undefined : l.value })
                  }
                >
                  {l.label}
                </Chip>
              ))}
            </div>
          </div>

          <label className="field">
            <span className="field__label">which school?</span>
            <input
              className="input"
              value={person.schoolName ?? ''}
              onChange={(e) => set({ schoolName: e.target.value || undefined })}
              placeholder="Kowhai Primary"
            />
          </label>
        </>
      )}

      {/* ---- adults ---- */}
      {person.role === 'adult' && (
        <>
          <div className="field">
            <span className="field__label">work</span>
            <div className="choices">
              {JOB_TYPES.map((j) => (
                <Chip
                  key={j.value}
                  outline
                  active={person.jobType === j.value}
                  onClick={() => set({ jobType: person.jobType === j.value ? undefined : j.value })}
                >
                  {j.label}
                </Chip>
              ))}
            </div>
          </div>

          {person.jobType && person.jobType !== 'none' && person.jobType !== 'housekeeper' && (
            <label className="field">
              <span className="field__label">what they do</span>
              <input
                className="input"
                value={person.jobTitle ?? ''}
                onChange={(e) => set({ jobTitle: e.target.value || undefined })}
                placeholder="Central Station"
              />
            </label>
          )}

          <div className="card" style={{ marginBottom: 16 }}>
            <button
              type="button"
              className="toggle"
              onClick={() => set({ worksShifts: !person.worksShifts })}
              aria-pressed={person.worksShifts}
            >
              <span className="row__main">
                <span className="row__title" style={{ fontWeight: 600 }}>
                  shifts and rosters
                </span>
                <span className="row__meta" style={{ whiteSpace: 'normal' }}>
                  puts their work on the family calendar
                </span>
              </span>
              <span className="toggle__switch" data-on={person.worksShifts} />
            </button>
          </div>
        </>
      )}

      {/* ---- where they live ---- */}
      {multiHousehold && (
        <div className="field">
          <span className="field__label">home</span>
          <div className="choices">
            {households.map((h) => (
              <Chip
                key={h.id}
                outline
                active={person.householdId === h.id}
                onClick={() => set({ householdId: h.id })}
              >
                <HouseholdDot household={h} size={7} />
                {h.name}
              </Chip>
            ))}
          </div>
          {schedule && (
            <div className="field__hint">
              {shareWithUs === 100
                ? 'here all of the time.'
                : `about ${shareWithUs}% of the time here, from the care pattern.`}
            </div>
          )}
        </div>
      )}

      <div className="detail__actions">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            onClose();
            navigate(`/add?kind=activity&person=${person.id}`);
          }}
        >
          add an activity
        </button>
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => {
            dispatch({ type: 'person/remove', id: person.id });
            onClose();
          }}
        >
          remove
        </button>
      </div>
    </Sheet>
  );
}

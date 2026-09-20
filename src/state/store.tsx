import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import type {
  CareSchedule,
  Entry,
  Household,
  Id,
  ISODate,
  Person,
  Settings,
  State,
  Template,
} from '../types';
import { seedState } from '../data/seed';
import { viewingHousehold } from '../domain/care';
import { birthdayEntries } from '../domain/birthdays';

const KEY = 'family-hustle:v1';

type Action =
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'household/add'; household: Household }
  | { type: 'household/update'; id: Id; patch: Partial<Household> }
  | { type: 'household/remove'; id: Id }
  | { type: 'care/set'; schedule: CareSchedule }
  | { type: 'care/remove'; personId: Id }
  | { type: 'care/override'; personId: Id; date: ISODate; householdId: Id }
  | { type: 'care/clearOverride'; personId: Id; date: ISODate }
  | { type: 'care/cycleDay'; personId: Id; index: number; householdId: Id }
  | { type: 'person/add'; person: Person }
  | { type: 'person/update'; id: Id; patch: Partial<Person> }
  | { type: 'person/remove'; id: Id }
  | { type: 'entry/add'; entry: Entry }
  | { type: 'entry/update'; id: Id; patch: Partial<Entry> }
  | { type: 'entry/remove'; id: Id }
  | { type: 'entry/skipDate'; id: Id; date: ISODate }
  | { type: 'task/toggle'; id: Id; date: ISODate }
  | { type: 'template/set'; template: Template }
  | { type: 'reset'; state: State };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'settings':
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case 'household/add':
      return { ...state, households: [...state.households, action.household] };

    case 'household/update':
      return {
        ...state,
        households: state.households.map((h) =>
          h.id === action.id ? { ...h, ...action.patch } : h,
        ),
      };

    case 'household/remove':
      return {
        ...state,
        households: state.households.filter((h) => h.id !== action.id),
        // anyone living there, and any child who moved there, comes unstuck
        people: state.people.map((p) =>
          p.householdId === action.id ? { ...p, householdId: undefined } : p,
        ),
        careSchedules: state.careSchedules.filter((s) => !s.cycle.includes(action.id)),
      };

    case 'care/set':
      return {
        ...state,
        careSchedules: [
          ...state.careSchedules.filter((s) => s.personId !== action.schedule.personId),
          action.schedule,
        ],
      };

    case 'care/remove':
      return {
        ...state,
        careSchedules: state.careSchedules.filter((s) => s.personId !== action.personId),
      };

    case 'care/override':
      return {
        ...state,
        careSchedules: state.careSchedules.map((s) =>
          s.personId === action.personId
            ? { ...s, overrides: { ...s.overrides, [action.date]: action.householdId } }
            : s,
        ),
      };

    case 'care/clearOverride':
      return {
        ...state,
        careSchedules: state.careSchedules.map((s) => {
          if (s.personId !== action.personId) return s;
          const overrides = { ...s.overrides };
          delete overrides[action.date];
          return { ...s, overrides };
        }),
      };

    case 'care/cycleDay':
      return {
        ...state,
        careSchedules: state.careSchedules.map((s) => {
          if (s.personId !== action.personId) return s;
          const cycle = [...s.cycle];
          cycle[action.index] = action.householdId;
          // editing a day by hand means it is no longer a named pattern
          return { ...s, cycle, patternId: 'custom' };
        }),
      };

    case 'person/add':
      return { ...state, people: [...state.people, action.person] };

    case 'person/update':
      return {
        ...state,
        people: state.people.map((p) =>
          p.id === action.id ? { ...p, ...action.patch } : p,
        ),
      };

    case 'person/remove':
      return {
        ...state,
        people: state.people.filter((p) => p.id !== action.id),
        entries: state.entries
          .map((e) => ({ ...e, personIds: e.personIds.filter((id) => id !== action.id) }))
          .filter((e) => e.personIds.length > 0),
      };

    case 'entry/add':
      return { ...state, entries: [...state.entries, action.entry] };

    case 'entry/update':
      return {
        ...state,
        entries: state.entries.map((e) =>
          e.id === action.id ? ({ ...e, ...action.patch } as Entry) : e,
        ),
      };

    case 'entry/remove':
      return { ...state, entries: state.entries.filter((e) => e.id !== action.id) };

    case 'entry/skipDate':
      return {
        ...state,
        entries: state.entries.map((e) =>
          e.id === action.id ? { ...e, exceptions: [...e.exceptions, action.date] } : e,
        ),
      };

    case 'task/toggle':
      return {
        ...state,
        entries: state.entries.map((e) => {
          if (e.id !== action.id || e.type !== 'task') return e;
          const done = e.doneDates.includes(action.date)
            ? e.doneDates.filter((d) => d !== action.date)
            : [...e.doneDates, action.date];
          return { ...e, doneDates: done };
        }),
      };

    case 'template/set':
      return { ...state, lastTemplate: action.template };

    case 'reset':
      return action.state;
  }
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as State;
      if (parsed && Array.isArray(parsed.people)) return migrate(parsed);
    }
  } catch {
    // storage can be blocked or hold something stale — fall through to seed
  }
  return seedState();
}

/** Saved state predates shared care, so fill in what it is missing rather
 *  than throwing the family's data away. */
function migrate(state: State): State {
  return {
    ...state,
    // schedules saved before this applied to children only
    careSchedules: (state.careSchedules ?? []).map((c) => ({
      ...c,
      personId: c.personId ?? (c as unknown as { childId?: Id }).childId,
    })),
    households: (state.households ?? []).map((h, i) => ({
      ...h,
      colour: h.colour ?? (i === 0 ? ('purple' as const) : ('teal' as const)),
    })),
    // anyone saved before homes were assignable lives at the first one
    people: (state.people ?? []).map((p) => ({
      ...p,
      householdId: p.householdId ?? state.households?.[0]?.id,
    })),
  };
}

interface Store {
  state: State;
  dispatch: (a: Action) => void;
  /** Everything the calendar should show: what the family entered, plus the
   *  entries derived from their profiles. Screens use this, not state.entries. */
  entries: Entry[];
  /** helpers the screens actually reach for */
  personById: (id: Id) => Person | undefined;
  adults: Person[];
  children: Person[];
  pets: Person[];
  /** anyone who has turned work on — the work tab hides until someone has */
  workers: Person[];
  /** true only when the family has switched shared care on */
  careEnabled: boolean;
  /** true once the family has more than one home — which is a separate
   *  question from whether any child moves between them */
  multiHousehold: boolean;
  households: Household[];
  householdById: (id: Id | undefined) => Household | undefined;
  /** the household whose view is currently on screen */
  viewerHouseholdId: Id | undefined;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // not fatal — the app still works for this session
    }
  }, [state]);

  const value = useMemo<Store>(() => {
    const people = state.people;
    /* Shared care is on for a family when a child actually moves between
     * homes — not because a switch was flipped. Emma has three children and
     * two of them go to their dad's; the third simply lives at home, and
     * nothing about the app should suggest otherwise. */
    const careEnabled = state.careSchedules.length > 0;
    const multiHousehold = state.households.length > 1;
    return {
      state,
      dispatch,
      entries: [...state.entries, ...birthdayEntries(people)],
      personById: (id) => people.find((p) => p.id === id),
      adults: people.filter((p) => p.role === 'adult'),
      children: people.filter((p) => p.role === 'child'),
      pets: people.filter((p) => p.role === 'pet'),
      workers: people.filter((p) => p.worksShifts),
      careEnabled,
      multiHousehold,
      households: state.households,
      householdById: (id) => state.households.find((h) => h.id === id),
      viewerHouseholdId: multiHousehold ? viewingHousehold(state.settings) : undefined,
    };
  }, [state]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

export function newId(): Id {
  return Math.random().toString(36).slice(2, 10);
}

export function clearStorage() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

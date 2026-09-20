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
import { CARE_PATTERNS, makeSchedule, viewingHousehold } from '../domain/care';
import { birthdayEntries } from '../domain/birthdays';
import { today } from '../lib/date';

const KEY = 'family-hustle:v1';

type Action =
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'sharedCare/enable' }
  | { type: 'sharedCare/disable' }
  | { type: 'household/add'; household: Household }
  | { type: 'household/update'; id: Id; patch: Partial<Household> }
  | { type: 'household/remove'; id: Id }
  | { type: 'care/set'; schedule: CareSchedule }
  | { type: 'care/override'; childId: Id; date: ISODate; householdId: Id }
  | { type: 'care/clearOverride'; childId: Id; date: ISODate }
  | { type: 'care/cycleDay'; childId: Id; index: number; householdId: Id }
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

    /* Turning shared care on hands the family something that already works:
     * a second household and a week on / week off schedule per child. They
     * change the pattern; they don't start from a blank screen. */
    case 'sharedCare/enable': {
      // Two adults is the common shape, and naming each home after the adult
      // who lives there is what the kids would actually say. Better than
      // making anyone rename "household 2".
      const adults = state.people.filter((p) => p.role === 'adult');
      const households =
        state.households.length >= 2
          ? state.households
          : [
              {
                ...state.households[0],
                name:
                  !state.households[0] || state.households[0].name === 'Home'
                    ? adults[0]
                      ? `${adults[0].name}’s`
                      : 'Home'
                    : state.households[0].name,
                colour: adults[0]?.colour ?? state.households[0]?.colour ?? 'purple',
              },
              {
                id: newId(),
                name: adults[1] ? `${adults[1].name}’s` : 'the other home',
                colour: adults[1]?.colour ?? ('teal' as const),
              },
            ];
      const [a, b] = households;
      const children = state.people.filter((p) => p.role === 'child');
      const careSchedules = children.map(
        (child) =>
          state.careSchedules.find((s) => s.childId === child.id) ??
          makeSchedule(child.id, CARE_PATTERNS[0].id, a.id, b.id, today()),
      );
      return {
        ...state,
        households,
        careSchedules,
        settings: {
          ...state.settings,
          sharedCareEnabled: true,
          householdMode: 'sharedCare',
          homeHouseholdId: state.settings.homeHouseholdId ?? a.id,
          viewingAsHouseholdId: undefined,
        },
      };
    }

    /* Off means gone from the interface, but the schedule is kept — turning
     * it back on should not cost the family their setup. */
    case 'sharedCare/disable':
      return {
        ...state,
        settings: {
          ...state.settings,
          sharedCareEnabled: false,
          householdMode: state.settings.householdMode === 'sharedCare' ? 'one' : state.settings.householdMode,
          viewingAsHouseholdId: undefined,
        },
      };

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
        careSchedules: state.careSchedules.filter((s) => !s.cycle.includes(action.id)),
      };

    case 'care/set':
      return {
        ...state,
        careSchedules: [
          ...state.careSchedules.filter((s) => s.childId !== action.schedule.childId),
          action.schedule,
        ],
      };

    case 'care/override':
      return {
        ...state,
        careSchedules: state.careSchedules.map((s) =>
          s.childId === action.childId
            ? { ...s, overrides: { ...s.overrides, [action.date]: action.householdId } }
            : s,
        ),
      };

    case 'care/clearOverride':
      return {
        ...state,
        careSchedules: state.careSchedules.map((s) => {
          if (s.childId !== action.childId) return s;
          const overrides = { ...s.overrides };
          delete overrides[action.date];
          return { ...s, overrides };
        }),
      };

    case 'care/cycleDay':
      return {
        ...state,
        careSchedules: state.careSchedules.map((s) => {
          if (s.childId !== action.childId) return s;
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
    careSchedules: state.careSchedules ?? [],
    households: (state.households ?? []).map((h, i) => ({
      ...h,
      colour: h.colour ?? (i === 0 ? ('purple' as const) : ('teal' as const)),
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
    const careEnabled = state.settings.sharedCareEnabled;
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
      households: state.households,
      householdById: (id) => state.households.find((h) => h.id === id),
      viewerHouseholdId: careEnabled ? viewingHousehold(state.settings) : undefined,
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

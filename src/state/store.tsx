import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import type { Entry, Id, ISODate, Person, Settings, State, Template } from '../types';
import { seedState } from '../data/seed';

const KEY = 'family-hustle:v1';

type Action =
  | { type: 'settings'; patch: Partial<Settings> }
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
      if (parsed && Array.isArray(parsed.people)) return parsed;
    }
  } catch {
    // storage can be blocked or hold something stale — fall through to seed
  }
  return seedState();
}

interface Store {
  state: State;
  dispatch: (a: Action) => void;
  /** helpers the screens actually reach for */
  personById: (id: Id) => Person | undefined;
  adults: Person[];
  children: Person[];
  pets: Person[];
  /** anyone who has turned work on — the work tab hides until someone has */
  workers: Person[];
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
    return {
      state,
      dispatch,
      personById: (id) => people.find((p) => p.id === id),
      adults: people.filter((p) => p.role === 'adult'),
      children: people.filter((p) => p.role === 'child'),
      pets: people.filter((p) => p.role === 'pet'),
      workers: people.filter((p) => p.worksShifts),
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

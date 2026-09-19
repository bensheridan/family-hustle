/** A believable family to open the app with.
 *
 * Deliberately a two-adult, three-child, one-household family with one shift
 * worker — shared care is off, because it is not the default family structure.
 * Dates are anchored to the current week so the demo is never stale.
 */

import type { Entry, EventEntry, Person, ShiftEntry, State, TaskEntry } from '../types';
import { addDays, startOfWeek, today } from '../lib/date';

let n = 0;
const id = (prefix: string) => `${prefix}${++n}`;

export function seedState(): State {
  const monday = startOfWeek(today());
  const d = (offset: number) => addDays(monday, offset);

  const nadia: Person = {
    id: 'p-nadia', name: 'Nadia', role: 'adult', colour: 'purple', worksShifts: false,
  };
  const theo: Person = {
    id: 'p-theo', name: 'Theo', role: 'adult', colour: 'blue', worksShifts: true,
  };
  const otis: Person = {
    id: 'p-otis', name: 'Otis', role: 'child', colour: 'orange', worksShifts: false,
    birthday: '2015-03-04',
  };
  const juno: Person = {
    id: 'p-juno', name: 'Juno', role: 'child', colour: 'green', worksShifts: false,
    birthday: '2017-11-22',
  };
  const wren: Person = {
    id: 'p-wren', name: 'Wren', role: 'child', colour: 'pink', worksShifts: false,
    birthday: '2021-06-09',
  };

  const people = [nadia, theo, otis, juno, wren];
  const everyone = people.map((p) => p.id);

  const event = (e: Omit<EventEntry, 'id' | 'type' | 'createdAt' | 'exceptions'>): EventEntry => ({
    ...e,
    id: id('e'),
    type: 'event',
    exceptions: [],
    createdAt: Date.now(),
  });

  const shift = (s: Omit<ShiftEntry, 'id' | 'type' | 'createdAt' | 'exceptions' | 'category'>): ShiftEntry => ({
    ...s,
    id: id('s'),
    type: 'shift',
    category: 'work',
    exceptions: [],
    createdAt: Date.now(),
  });

  const task = (t: Omit<TaskEntry, 'id' | 'type' | 'createdAt' | 'exceptions' | 'doneDates'>): TaskEntry => ({
    ...t,
    id: id('t'),
    type: 'task',
    exceptions: [],
    doneDates: [],
    createdAt: Date.now(),
  });

  const entries: Entry[] = [
    // ---- school & daycare ----
    event({
      title: 'School',
      category: 'school',
      personIds: [otis.id, juno.id],
      visibility: 'everyone',
      location: 'Kowhai Primary',
      startDate: d(0),
      allDay: false,
      startTime: '08:45',
      endTime: '15:00',
      recurrence: { kind: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] },
    }),
    event({
      title: 'Daycare',
      category: 'school',
      personIds: [wren.id],
      visibility: 'everyone',
      location: 'Little Oaks',
      startDate: d(0),
      allDay: false,
      startTime: '08:00',
      endTime: '16:30',
      recurrence: { kind: 'weekly', interval: 1, weekdays: [1, 3, 5] },
    }),
    event({
      title: 'Cross Country',
      category: 'school',
      personIds: [otis.id],
      visibility: 'everyone',
      location: 'Kowhai Primary',
      startDate: d(8),
      allDay: false,
      startTime: '13:00',
      endTime: '15:00',
      recurrence: { kind: 'none' },
      prepNote: 'Otis needs running shoes and a named water bottle.',
    }),
    event({
      title: 'Swimming Sports',
      category: 'school',
      personIds: [juno.id],
      visibility: 'everyone',
      location: 'Aquatic Centre',
      startDate: d(10),
      allDay: false,
      startTime: '09:30',
      endTime: '14:00',
      recurrence: { kind: 'none' },
    }),

    // ---- activities ----
    event({
      title: 'BJJ',
      category: 'activity',
      personIds: [otis.id],
      visibility: 'everyone',
      location: 'The Hive',
      startDate: d(1),
      allDay: false,
      startTime: '16:30',
      endTime: '17:30',
      recurrence: { kind: 'weekly', interval: 1, weekdays: [2] },
      prepNote: "Don't forget the gi 🥋",
    }),
    event({
      title: 'Swimming',
      category: 'activity',
      personIds: [juno.id],
      visibility: 'everyone',
      location: 'Aquatic Centre',
      startDate: d(5),
      allDay: false,
      startTime: '08:30',
      endTime: '09:15',
      recurrence: { kind: 'weekly', interval: 1, weekdays: [6] },
    }),

    // ---- family ----
    event({
      title: 'Lunch with Nana',
      category: 'family',
      personIds: everyone,
      visibility: 'everyone',
      location: "Nana's",
      startDate: d(5),
      allDay: false,
      startTime: '12:30',
      endTime: '14:30',
      recurrence: { kind: 'none' },
    }),
    event({
      title: "Juno's birthday",
      category: 'family',
      personIds: everyone,
      visibility: 'everyone',
      startDate: `${new Date().getFullYear()}-11-22`,
      allDay: true,
      recurrence: { kind: 'none' },
    }),

    // ---- appointments ----
    event({
      title: 'Dentist — Otis',
      category: 'appointment',
      personIds: [otis.id, nadia.id],
      visibility: 'everyone',
      location: 'Bay Dental',
      startDate: d(9),
      allDay: false,
      startTime: '15:30',
      endTime: '16:15',
      recurrence: { kind: 'none' },
    }),
    event({
      title: 'Car service',
      category: 'appointment',
      personIds: [nadia.id, theo.id],
      visibility: 'everyone',
      location: 'Northside Auto',
      startDate: d(17),
      allDay: true,
      recurrence: { kind: 'none' },
    }),

    // ---- work: one shift worker, a 4 on / 4 off roster of nights ----
    shift({
      title: 'Night shift',
      personIds: [theo.id],
      visibility: 'everyone',
      location: 'Central Station',
      startDate: d(1),
      shiftType: 'night',
      startTime: '18:00',
      endTime: '06:00',
      impacts: ['sleepingAfter', 'needsPickup', 'noFamilyEvents'],
      recurrence: { kind: 'roster', on: 4, off: 4 },
    }),

    // ---- tasks ----
    task({
      title: 'Pay school trip',
      category: 'task',
      personIds: [nadia.id],
      visibility: 'everyone',
      dueDate: d(3),
      recurrence: { kind: 'none' },
    }),
    task({
      title: 'Bins out',
      category: 'task',
      personIds: [theo.id, nadia.id],
      visibility: 'everyone',
      dueDate: d(2),
      dueTime: '19:00',
      recurrence: { kind: 'weekly', interval: 1, weekdays: [3] },
    }),
  ];

  return {
    settings: {
      onboarded: false,
      householdMode: 'one',
      sharedCareEnabled: false,
      petsEnabled: false,
      weekStartsMonday: true,
    },
    households: [{ id: 'h-1', name: 'Home' }],
    people,
    entries,
  };
}

/** An empty family, for someone who wants to start from scratch. */
export function blankState(): State {
  return {
    settings: {
      onboarded: false,
      householdMode: 'undecided',
      sharedCareEnabled: false,
      petsEnabled: false,
      weekStartsMonday: true,
    },
    households: [{ id: 'h-1', name: 'Home' }],
    people: [],
    entries: [],
  };
}

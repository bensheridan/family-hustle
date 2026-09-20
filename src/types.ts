/** Family hustle — domain types.
 *
 * Two rules from the brief shape this file:
 *  1. The app adapts to the family. Nothing here assumes shared care,
 *     separated parents, multiple households or shift work.
 *  2. Everything the family sees lives on one calendar, so events, shifts
 *     and tasks share a single `Entry` union.
 */

export type Id = string;

/** ISO calendar day, 'YYYY-MM-DD'. Always local — never UTC. */
export type ISODate = string;
/** 24h wall clock, 'HH:mm'. */
export type Time = string;

export type PersonRole = 'adult' | 'child' | 'pet';

export type PersonColour =
  | 'purple'
  | 'blue'
  | 'orange'
  | 'green'
  | 'pink'
  | 'teal'
  | 'amber'
  | 'indigo';

export interface Person {
  id: Id;
  /** A proper noun — stored and shown exactly as the family typed it. */
  name: string;
  role: PersonRole;
  colour: PersonColour;
  /** Which home they live at. Only meaningful once there is more than one. */
  householdId?: Id;
  /** Opt in per person. Until someone opts in, work never appears in the app. */
  worksShifts: boolean;
  birthday?: ISODate;
}

export interface Household {
  id: Id;
  /** What the family calls it — "Mum's", "Dad's", "Home". A proper noun. */
  name: string;
  colour: PersonColour;
}

/** How the family is set up. Never defaults to shared care. */
export type HouseholdMode = 'one' | 'multiple' | 'sharedCare' | 'undecided';

export interface Settings {
  onboarded: boolean;
  householdMode: HouseholdMode;
  petsEnabled: boolean;
  weekStartsMonday: boolean;
  /** The household this device belongs to. */
  homeHouseholdId?: Id;
  /** Temporarily viewing the app as another household, to check what they
   *  can see. Never changes data — only what is shown. */
  viewingAsHouseholdId?: Id;
}

/** Where someone is, day by day.
 *
 * A cycle of household ids repeating from an anchor Monday, which covers
 * week on/week off, 2-2-3, alternating weekends and anything hand-built —
 * the same shape as a work roster, because it is the same problem.
 * Overrides handle the swapped weekend without touching the pattern.
 */
export interface CareSchedule {
  /** A child moving between parents, or a dog that spends part of its week
   *  at someone else's place. The schedule does not care which. */
  personId: Id;
  /** one household id per day of the cycle */
  cycle: Id[];
  /** always a Monday, so weekend patterns line up */
  anchorDate: ISODate;
  /** which preset built the cycle, for showing it back to the family */
  patternId: string;
  /** one-off changes: ISO date → household id */
  overrides: Record<ISODate, Id>;
}

export type Category =
  | 'school'
  | 'activity'
  | 'appointment'
  | 'family'
  | 'work'
  | 'task'
  | 'sharedCare';

export type EntryType = 'event' | 'shift' | 'task';

/** Who can see it. An event can belong to one person and still be family-visible. */
export type Visibility = 'everyone' | { only: Id[] };

/** Which households can see an entry. Undefined means both — nothing is
 *  hidden from a family that isn't using shared care. */
export type HouseholdVisibility = 'both' | { household: Id };

export type Recurrence =
  | { kind: 'none' }
  | { kind: 'daily'; interval: number }
  /** weekdays use 1 = Monday … 7 = Sunday */
  | { kind: 'weekly'; interval: number; weekdays: number[] }
  | { kind: 'monthlyDay'; day: number }
  /** same date every year — birthdays, renewals, anniversaries */
  | { kind: 'yearly' }
  /** rotating roster, e.g. 4 on / 4 off, counted from the entry's start date */
  | { kind: 'roster'; on: number; off: number }
  /** a hand-built cycle, e.g. ['on','on','off','off','off'] */
  | { kind: 'customRoster'; sequence: ('on' | 'off')[] };

interface EntryBase {
  id: Id;
  /** Free text from the family — often a proper noun, so never case-forced. */
  title: string;
  category: Category;
  personIds: Id[];
  visibility: Visibility;
  /** Only consulted when shared care is on. */
  householdVisibility?: HouseholdVisibility;
  location?: string;
  /** The "don't forget the gi 🥋" line. Drives the heads-up card. */
  prepNote?: string;
  /** Say something this many days ahead. A birthday you hear about on the
   *  morning is already too late to do anything about. */
  remindDaysBefore?: number;
  /** Count the years since it started, the way an anniversary does. A
   *  renewal does not want this; a wedding does. */
  marksYears?: boolean;
  /** Generated from somewhere else — a person's birthday, say — rather than
   *  created by hand. Derived entries cannot be edited or deleted on the
   *  calendar, because the thing that produced them is the real record. */
  derived?: 'birthday';
  recurrence: Recurrence;
  /** Last day the recurrence runs, inclusive. */
  until?: ISODate;
  /** Days skipped from a recurring series. */
  exceptions: ISODate[];
  createdAt: number;
}

export interface EventEntry extends EntryBase {
  type: 'event';
  startDate: ISODate;
  allDay: boolean;
  startTime?: Time;
  endTime?: Time;
  /** For multi-day events like a school camp. */
  spansDays?: number;
}

export type ShiftType =
  | 'day'
  | 'evening'
  | 'night'
  | 'overnight'
  | 'early'
  | 'late'
  | 'custom';

/** Off work does not necessarily mean available. */
export type ShiftImpact =
  | 'needsPickup'
  | 'noFamilyEvents'
  | 'sleepingAfter'
  | 'availableBefore'
  | 'availableAfter';

export interface ShiftEntry extends EntryBase {
  type: 'shift';
  category: 'work';
  startDate: ISODate;
  shiftType: ShiftType;
  startTime: Time;
  /** If endTime <= startTime the shift crosses midnight. It stays one shift. */
  endTime: Time;
  impacts: ShiftImpact[];
  /** Worked from home on these weekdays (1 = Monday). Lets one weekly entry
   *  cover "Monday to Friday, from home on Monday and Thursday". */
  wfhWeekdays?: number[];
  /** Worked from home every time — for rosters and one-offs, where weekdays
   *  are not the unit. */
  wfh?: boolean;
}

export interface TaskEntry extends EntryBase {
  type: 'task';
  dueDate?: ISODate;
  dueTime?: Time;
  /** Completion is per dated occurrence so a repeating task can be ticked weekly. */
  doneDates: ISODate[];
}

export type Entry = EventEntry | ShiftEntry | TaskEntry;

/** One dated instance of an entry, produced by expanding recurrence. */
export interface Occurrence {
  key: string;
  entry: Entry;
  /** The day this occurrence is anchored to. */
  date: ISODate;
  start: Date;
  end: Date;
  allDay: boolean;
  crossesMidnight: boolean;
  /** True on the morning after an overnight shift — the tail of one shift,
   *  not a second event. */
  isTail: boolean;
  done?: boolean;
}

export interface Template {
  label: string;
  entry: Omit<Entry, 'id' | 'createdAt'>;
}

export interface State {
  settings: Settings;
  households: Household[];
  people: Person[];
  entries: Entry[];
  /** One per child, only when shared care is on. */
  careSchedules: CareSchedule[];
  /** Powers "repeat last" — the fastest way to add the thing you always add. */
  lastTemplate?: Template;
}

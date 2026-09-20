import type { Category, ShiftImpact, ShiftType } from '../types';

interface CategoryMeta {
  /** lowercase — this is interface copy, not a proper noun */
  label: string;
  colour: string;
  /** shared care only ever shows when the family has turned it on */
  optional?: boolean;
}

export const CATEGORIES: Record<Category, CategoryMeta> = {
  moneyIn: { label: 'money in', colour: 'var(--money-in)' },
  moneyOut: { label: 'money out', colour: 'var(--money-out)' },
  school: { label: 'school/daycare', colour: 'var(--p-blue)' },
  activity: { label: 'activities', colour: 'var(--p-green)' },
  appointment: { label: 'appointments', colour: 'var(--p-teal)' },
  family: { label: 'family', colour: 'var(--p-purple)' },
  work: { label: 'work & shifts', colour: 'var(--p-orange)' },
  task: { label: 'tasks', colour: 'var(--p-amber)' },
  sharedCare: { label: 'shared care', colour: 'var(--p-pink)', optional: true },
};

/** Singular labels for the add flow. */
export const CATEGORY_SINGULAR: Record<Category, string> = {
  moneyIn: 'money in',
  moneyOut: 'money out',
  school: 'school/daycare',
  activity: 'activity',
  appointment: 'appointment',
  family: 'family',
  work: 'work',
  task: 'task',
  sharedCare: 'shared care',
};

export const SHIFT_TYPES: { value: ShiftType; label: string; start: string; end: string }[] = [
  { value: 'day', label: 'day', start: '07:00', end: '15:00' },
  { value: 'evening', label: 'evening', start: '15:00', end: '23:00' },
  { value: 'night', label: 'night', start: '22:00', end: '06:00' },
  { value: 'overnight', label: 'overnight', start: '18:00', end: '06:00' },
  { value: 'early', label: 'early start', start: '05:00', end: '13:00' },
  { value: 'late', label: 'late finish', start: '14:00', end: '22:00' },
  { value: 'custom', label: 'custom', start: '09:00', end: '17:00' },
];

export const IMPACTS: { value: ShiftImpact; label: string }[] = [
  { value: 'needsPickup', label: 'kids need pickup' },
  { value: 'noFamilyEvents', label: "can't attend family events" },
  { value: 'sleepingAfter', label: 'sleeping after night shift' },
  { value: 'availableBefore', label: 'available before shift' },
  { value: 'availableAfter', label: 'available after shift' },
];

export const PERSON_COLOURS = [
  'purple', 'blue', 'orange', 'green', 'pink', 'teal', 'amber', 'indigo',
] as const;

export function colourVar(colour: string): string {
  return `var(--p-${colour})`;
}

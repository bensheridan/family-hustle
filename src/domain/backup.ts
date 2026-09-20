/** The family's data as a file they own.
 *
 * No account, no server, no company holding a family's movements. The whole
 * thing is one readable JSON file: put it in iCloud Drive or OneDrive and the
 * folder syncs it, back it up however you back anything up, and read it in a
 * text editor in ten years when this app no longer exists.
 *
 * The cost of that is honest and worth stating: a folder that syncs whole
 * files has no idea what is inside them. Two people editing on two phones
 * produces a winner and a loser, or a "conflicted copy", not a merge. So a
 * file is a good way to keep and move a family's data, and not on its own a
 * good way for two people to edit it at once.
 */

import type { State } from '../types';

export const BACKUP_FORMAT = 1;

export interface Backup {
  app: 'family-hustle';
  format: number;
  savedAt: string;
  state: State;
}

export function makeBackup(state: State): Backup {
  return {
    app: 'family-hustle',
    format: BACKUP_FORMAT,
    savedAt: new Date().toISOString(),
    state,
  };
}

export function serialise(state: State): string {
  // indented on purpose: this is a file someone may open and read
  return JSON.stringify(makeBackup(state), null, 2);
}

export interface BackupSummary {
  savedAt?: string;
  people: number;
  entries: number;
  households: number;
  terms: number;
  holidays: number;
}

export type ParseResult =
  | { ok: true; state: State; summary: BackupSummary }
  | { ok: false; error: string };

/** Read a file back, refusing anything that is not ours rather than
 *  half-loading it and leaving the family with a broken calendar. */
export function parseBackup(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'that file is not readable as JSON.' };
  }

  if (typeof data !== 'object' || data === null) {
    return { ok: false, error: 'that file does not contain a backup.' };
  }

  const backup = data as Partial<Backup>;
  if (backup.app !== 'family-hustle') {
    return { ok: false, error: 'that file was not saved by Family hustle.' };
  }
  if (typeof backup.format !== 'number' || backup.format > BACKUP_FORMAT) {
    return {
      ok: false,
      error: 'that file was saved by a newer version of the app than this one.',
    };
  }

  const state = backup.state as State | undefined;
  if (!state || !Array.isArray(state.people) || !Array.isArray(state.entries)) {
    return { ok: false, error: 'that backup is missing the family or the calendar.' };
  }

  return {
    ok: true,
    state,
    summary: {
      savedAt: backup.savedAt,
      people: state.people.length,
      entries: state.entries.length,
      households: state.households?.length ?? 0,
      terms: state.schoolTerms?.length ?? 0,
      holidays: state.publicHolidays?.length ?? 0,
    },
  };
}

export function summarise(state: State): BackupSummary {
  return {
    people: state.people.length,
    entries: state.entries.length,
    households: state.households.length,
    terms: state.schoolTerms.length,
    holidays: state.publicHolidays.length,
  };
}

export function suggestedFilename(): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
  return `family-hustle-${stamp}.json`;
}

/** Saving straight into a chosen file needs the File System Access API,
 *  which desktop Chrome and Edge have and Safari does not — so it is offered
 *  where it exists and never assumed. */
export function canLinkToFile(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker ===
      'function'
  );
}

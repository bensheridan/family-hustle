/** Keeping this device and the family's box in step.
 *
 * localStorage stays the truth on this device, so the app works with no
 * signal at all; the box is where the family's copies meet. The rules, from
 * docs/pi-sync.md:
 *
 * - One phone writes, the others read. Nothing is merged, ever.
 * - If the box moved on and nothing changed here, take it. Nothing is lost,
 *   so there is nothing to ask.
 * - If the box moved on *and* something changed here, say so and let the
 *   person choose. Never pick for them.
 * - Being offline is not an error. Changes wait and go when the box is back.
 *
 * When it checks: on opening, on coming back to the front, on coming back
 * online, and a moment after each change. Never on a timer while idle — the
 * same reasoning as UpdateBar.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useStore } from './store';
import { readBackup, type BackupSummary } from '../domain/backup';
import {
  adopt,
  blockedAsMixedContent,
  fingerprint,
  loadRecord,
  pull,
  push,
  saveRecord,
  type Remote,
  type SyncConfig,
  type SyncRecord,
} from '../lib/sync';
import type { State } from '../types';

export type SyncStatus =
  | 'off'
  | 'checking'
  | 'synced'
  | 'saving'
  /** could not reach the box; changes here wait */
  | 'offline'
  | 'unauthorised'
  /** this phone has the read token and has changes the box will not take */
  | 'read-only'
  /** changed here and on the box; waiting for someone to choose */
  | 'diverged'
  /** the box has nothing yet */
  | 'empty'
  | 'too-big'
  /** the box holds something this version of the app cannot read, or
   *  refused what this one sent */
  | 'refused';

export interface Conflict {
  remote: Remote;
  state: State;
  summary: BackupSummary;
}

interface Sync {
  record: SyncRecord;
  status: SyncStatus;
  conflict?: Conflict;
  /** true when this device has changes the box has not got */
  unsent: boolean;
  /** connect from the data screen; resolves to an error to show, if any */
  connect: (config: SyncConfig) => Promise<string | undefined>;
  /** connect from onboarding, taking the box's family as this device's */
  join: (config: SyncConfig) => Promise<string | undefined>;
  disconnect: () => void;
  takeTheirs: () => void;
  keepMine: () => void;
  /** the box is empty: put this device's family on it */
  seed: () => void;
}

const Ctx = createContext<Sync | null>(null);

const DEBOUNCE_MS = 1500;
const RETRY_MS = 15_000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const { state, dispatch } = useStore();

  const [record, setRecord] = useState<SyncRecord>(loadRecord);
  const [status, setStatus] = useState<SyncStatus>(record.config ? 'checking' : 'off');
  const [conflict, setConflictState] = useState<Conflict>();

  // the sync loop runs outside React's render, so it reads through refs
  const recordRef = useRef(record);
  const stateRef = useRef(state);
  stateRef.current = state;
  const conflictRef = useRef<Conflict>();
  const busy = useRef(false);
  const again = useRef(false);
  const seeding = useRef(false);
  const retry = useRef<ReturnType<typeof setTimeout>>();

  const update = useCallback((patch: Partial<SyncRecord>) => {
    recordRef.current = { ...recordRef.current, ...patch };
    saveRecord(recordRef.current);
    setRecord(recordRef.current);
  }, []);

  const setConflict = (c: Conflict | undefined) => {
    conflictRef.current = c;
    setConflictState(c);
  };

  const apply = useCallback(
    (remote: Remote, remoteState: State) => {
      const next = adopt(remoteState, stateRef.current);
      stateRef.current = next;
      dispatch({ type: 'reset', state: next });
      update({
        version: remote.version,
        synced: fingerprint(next),
        last: { version: remote.version, updatedAt: remote.updatedAt, updatedBy: remote.updatedBy },
      });
      setConflict(undefined);
      setStatus('synced');
    },
    [dispatch, update],
  );

  const sync = useCallback(async (): Promise<void> => {
    const config = recordRef.current.config;
    if (!config) return;
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    clearTimeout(retry.current);
    const later = () => {
      setStatus('offline');
      retry.current = setTimeout(() => void sync(), RETRY_MS);
    };

    try {
      const got = await pull(config);
      if (got.kind === 'unauthorised') return setStatus('unauthorised');
      if (got.kind === 'unreachable') return later();

      const rec = recordRef.current;
      const mine = fingerprint(stateRef.current);
      const changedHere = mine !== rec.synced;

      if (got.kind === 'empty') {
        if (!seeding.current || rec.readOnly) return setStatus('empty');
      } else {
        const { remote } = got;
        if (remote.version !== rec.version) {
          const read = readBackup(remote.document);
          if (!read.ok) return setStatus('refused');
          if (!changedHere) return apply(remote, read.state);
          // both moved: stop and ask
          setConflict({ remote, state: read.state, summary: read.summary });
          return setStatus('diverged');
        }
        update({ last: { version: remote.version, updatedAt: remote.updatedAt, updatedBy: remote.updatedBy } });
      }

      if (!changedHere && got.kind !== 'empty') return setStatus('synced');
      if (rec.readOnly) return setStatus('read-only');
      if (conflictRef.current) return;

      setStatus('saving');
      const snapshot = stateRef.current;
      const expected = got.kind === 'empty' ? 0 : rec.version;
      const put = await push(config, snapshot, expected);
      switch (put.kind) {
        case 'saved':
          seeding.current = false;
          update({
            version: put.version,
            synced: fingerprint(snapshot),
            last: { version: put.version, updatedAt: put.updatedAt, updatedBy: config.device },
          });
          // anything typed while the request was out goes next
          if (fingerprint(stateRef.current) !== fingerprint(snapshot)) again.current = true;
          return setStatus('synced');
        case 'conflict':
          // someone wrote between the check and the save; the next pass asks
          again.current = true;
          return;
        case 'read-only':
          update({ readOnly: true });
          return setStatus('read-only');
        case 'unauthorised':
          return setStatus('unauthorised');
        case 'too-big':
          return setStatus('too-big');
        case 'rejected':
          return setStatus('refused');
        case 'later':
          return later();
      }
    } finally {
      busy.current = false;
      if (again.current) {
        again.current = false;
        void sync();
      }
    }
  }, [apply, update]);

  /* When to check: opening, coming back to the front, coming back online. */
  useEffect(() => {
    if (!record.config) return;
    void sync();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    const onOnline = () => void sync();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      clearTimeout(retry.current);
    };
    // only when sync is switched on or off, not on every record change
  }, [!!record.config, sync]);

  /* …and a moment after each change, so a burst of typing is one save. */
  const current = useMemo(() => fingerprint(state), [state]);
  const unsent = !!record.config && current !== record.synced;
  useEffect(() => {
    if (!recordRef.current.config || !unsent) return;
    if (recordRef.current.readOnly) {
      setStatus('read-only');
      return;
    }
    const timer = setTimeout(() => void sync(), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [current, unsent, sync]);

  const connect = useCallback(
    async (config: SyncConfig): Promise<string | undefined> => {
      if (blockedAsMixedContent(config.url)) {
        return 'this page is https, so the box needs an https address too.';
      }
      const got = await pull(config);
      if (got.kind === 'unauthorised') return 'the box did not accept that token.';
      if (got.kind === 'unreachable') return 'could not reach the box at that address.';
      // a fresh start: whatever is on the box is compared with this device
      update({ config, version: 0, synced: undefined, last: undefined, readOnly: false });
      setConflict(undefined);
      setStatus('checking');
      await sync();
      return undefined;
    },
    [sync, update],
  );

  const join = useCallback(
    async (config: SyncConfig): Promise<string | undefined> => {
      if (blockedAsMixedContent(config.url)) {
        return 'this page is https, so the box needs an https address too.';
      }
      const got = await pull(config);
      if (got.kind === 'unauthorised') return 'the box did not accept that token.';
      if (got.kind === 'unreachable') return 'could not reach the box.';
      if (got.kind === 'empty') {
        return 'there is no family on the box yet. set one up on the phone that does the editing first.';
      }
      const read = readBackup(got.remote.document);
      if (!read.ok) return 'the box has a family this version of the app cannot read. try reloading.';
      update({ config, version: 0, synced: undefined, last: undefined, readOnly: false });
      apply(got.remote, read.state);
      return undefined;
    },
    [apply, update],
  );

  const disconnect = useCallback(() => {
    clearTimeout(retry.current);
    update({ config: undefined, version: 0, synced: undefined, last: undefined, readOnly: false });
    setConflict(undefined);
    setStatus('off');
  }, [update]);

  const takeTheirs = useCallback(() => {
    const c = conflictRef.current;
    if (c) apply(c.remote, c.state);
  }, [apply]);

  const keepMine = useCallback(() => {
    const c = conflictRef.current;
    if (!c) return;
    // this device now builds on the box's version, so its save will be
    // accepted — and replaces what the other phone wrote
    update({ version: c.remote.version });
    setConflict(undefined);
    void sync();
  }, [sync, update]);

  const seed = useCallback(() => {
    seeding.current = true;
    void sync();
  }, [sync]);

  const value = useMemo<Sync>(
    () => ({ record, status, conflict, unsent, connect, join, disconnect, takeTheirs, keepMine, seed }),
    [record, status, conflict, unsent, connect, join, disconnect, takeTheirs, keepMine, seed],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSync(): Sync {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSync must be used inside SyncProvider');
  return ctx;
}

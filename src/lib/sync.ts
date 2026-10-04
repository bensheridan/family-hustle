/** Talking to the family's sync box — an ESP32 at home or a Pi behind a
 *  tunnel. Both speak the contract in docs/pi-sync.md, so nothing here knows
 *  or cares which one is on the other end.
 *
 * This file is the wire: requests, results, and what is remembered on this
 * device. When to call it, and what to do with a conflict, is in
 * state/sync.tsx.
 */

import { makeBackup } from '../domain/backup';
import type { Settings, State } from '../types';

declare const __HUB__: boolean;

/** True in the build the box serves itself (npm run build:hub). The API is
 *  then on the same origin, so there is no address to type — only a token. */
export const IS_HUB = typeof __HUB__ === 'boolean' && __HUB__;

export interface SyncConfig {
  /** empty on a hub build: same origin */
  url: string;
  token: string;
  /** shown to the family as "changed by …" */
  device: string;
}

export interface RemoteMeta {
  version: number;
  updatedAt: string;
  updatedBy: string;
}

export interface Remote extends RemoteMeta {
  document: unknown;
}

export type GetResult =
  | { kind: 'state'; remote: Remote }
  | { kind: 'empty' }
  | { kind: 'unauthorised' }
  | { kind: 'unreachable' };

export type PutResult =
  | { kind: 'saved'; version: number; updatedAt: string }
  | { kind: 'conflict'; remote: Partial<RemoteMeta> }
  | { kind: 'read-only' }
  | { kind: 'unauthorised' }
  /** too big for the box, or the box is full — retrying will not help */
  | { kind: 'too-big' }
  | { kind: 'rejected' }
  /** offline, busy, or the box has no clock yet — try again later */
  | { kind: 'later' };

function endpoint(config: SyncConfig): string {
  return `${config.url.replace(/\/+$/, '')}/api/state`;
}

/** An https page cannot call an http address — the browser blocks it before
 *  it leaves. Worth saying before someone spends an evening on it. */
export function blockedAsMixedContent(url: string): boolean {
  return (
    typeof location !== 'undefined' &&
    location.protocol === 'https:' &&
    /^http:\/\//i.test(url.trim())
  );
}

export async function pull(config: SyncConfig): Promise<GetResult> {
  try {
    const res = await fetch(endpoint(config), {
      headers: { Authorization: `Bearer ${config.token}` },
      cache: 'no-store',
    });
    if (res.status === 204) return { kind: 'empty' };
    if (res.status === 401) return { kind: 'unauthorised' };
    if (!res.ok) return { kind: 'unreachable' };
    return { kind: 'state', remote: (await res.json()) as Remote };
  } catch {
    return { kind: 'unreachable' };
  }
}

export async function push(
  config: SyncConfig,
  state: State,
  expectedVersion: number,
): Promise<PutResult> {
  let res: Response;
  try {
    res = await fetch(endpoint(config), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedVersion,
        updatedBy: config.device,
        document: makeBackup(shared(state)),
      }),
    });
  } catch {
    return { kind: 'later' };
  }
  switch (res.status) {
    case 200: {
      const body = (await res.json()) as { version: number; updatedAt: string };
      return { kind: 'saved', ...body };
    }
    case 409:
      return { kind: 'conflict', remote: (await res.json().catch(() => ({}))) as Partial<RemoteMeta> };
    case 400:
      return { kind: 'rejected' };
    case 401:
      return { kind: 'unauthorised' };
    case 403:
      return { kind: 'read-only' };
    case 413:
    case 507:
      return { kind: 'too-big' };
    default:
      return { kind: 'later' };
  }
}

/* ---------------- what belongs to this device ---------------- */

/** Settings that describe the device, not the family. Emma's phone lives at
 *  her house and her partner's at his; syncing these would move one phone
 *  into the other's household. */
const DEVICE_SETTINGS = ['homeHouseholdId', 'viewingAsHouseholdId'] as const satisfies readonly (keyof Settings)[];

/** The family's state with this device's own settings taken out. */
export function shared(state: State): State {
  const settings = { ...state.settings };
  for (const key of DEVICE_SETTINGS) delete settings[key];
  return { ...state, settings };
}

/** Take the family's state from the box, keeping this device's own settings. */
export function adopt(remote: State, local: State): State {
  const settings = { ...remote.settings, onboarded: true };
  for (const key of DEVICE_SETTINGS) {
    if (local.settings[key] !== undefined) settings[key] = local.settings[key] as never;
    else delete settings[key];
  }
  return { ...remote, settings };
}

/** A fingerprint of the shared state, to tell whether anything has changed
 *  since the last sync without keeping a second copy of it. FNV-1a: not
 *  cryptographic, and does not need to be. */
export function fingerprint(state: State): string {
  const text = JSON.stringify(shared(state));
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/* ---------------- remembered on this device ---------------- */

const KEY = 'family-hustle:sync';

export interface SyncRecord {
  config?: SyncConfig;
  /** the box's version this device last matched; 0 before the first sync */
  version: number;
  /** fingerprint of the state at that version */
  synced?: string;
  last?: RemoteMeta;
  /** learnt from a 403: this token can read but not write */
  readOnly?: boolean;
}

/* Kept apart from the family's state on purpose: the state is exported,
 * backed up and synced, and a token must go in none of those. */
export function loadRecord(): SyncRecord {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as SyncRecord;
  } catch {
    // blocked storage — sync is simply off
  }
  return { version: 0 };
}

export function saveRecord(record: SyncRecord) {
  try {
    if (record.config) localStorage.setItem(KEY, JSON.stringify(record));
    else localStorage.removeItem(KEY);
  } catch {
    // not fatal — this session still syncs
  }
}

export function defaultDeviceName(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iPhone/.test(ua)) return 'iphone';
  if (/iPad/.test(ua)) return 'ipad';
  if (/Android/.test(ua)) return 'android phone';
  if (/Mac/.test(ua)) return 'mac';
  if (/Windows/.test(ua)) return 'windows pc';
  return 'this device';
}

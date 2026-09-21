/** Noticing that the app itself has moved on.
 *
 * From user testing: a bug was reported that had been fixed and deployed a
 * day earlier. Nothing was wrong with the fix — her phone was still running
 * the build it had loaded the morning before. A tab on a phone is never
 * closed and never reloaded, so without something telling it, it stays on
 * whatever it first fetched, indefinitely.
 *
 * There is no service worker here on purpose, so this is the small honest
 * version: the build stamps its own id in, a matching file sits next to it
 * on the server, and we compare the two when the app comes back to the
 * front. It never reloads by itself — a reload in the middle of typing an
 * appointment would be its own bug — it just says so and offers.
 */

declare const __BUILD_ID__: string;
declare const __BASE_URL__: string;

export const BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

/** Ask the server which build it is serving now. Undefined means we could
 *  not tell — offline, or a dev server with no version file — which is not
 *  the same as "up to date" and must not be treated as a mismatch. */
export async function deployedBuildId(): Promise<string | undefined> {
  try {
    const res = await fetch(`${__BASE_URL__}version.json`, { cache: 'no-store' });
    if (!res.ok) return undefined;
    const data: unknown = await res.json();
    const id = (data as { build?: unknown }).build;
    return typeof id === 'string' ? id : undefined;
  } catch {
    return undefined;
  }
}

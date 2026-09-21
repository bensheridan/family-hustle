import { useEffect, useState } from 'react';
import { BUILD_ID, deployedBuildId } from '../lib/version';

/** "there's a newer version" — shown, never acted on by itself.
 *
 * Checked when the app is opened and each time it comes back to the front,
 * which on a phone is the moment someone actually looks at it. Nothing is
 * polled on a timer: a family calendar left open on the bench does not need
 * to ask a server anything every minute.
 */
export function UpdateBar() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (BUILD_ID === 'dev') return;

    let cancelled = false;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      const deployed = await deployedBuildId();
      // undefined means we could not reach it — offline is not out of date
      if (!cancelled && deployed && deployed !== BUILD_ID) setStale(true);
    };

    void check();
    document.addEventListener('visibilitychange', check);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  if (!stale) return null;

  return (
    <div className="updatebar">
      <span>there’s a newer version of Family hustle.</span>
      <button type="button" onClick={() => window.location.reload()}>
        reload
      </button>
    </div>
  );
}

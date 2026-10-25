import { useEffect, useState } from 'react';

/**
 * A shared second-hand.
 *
 * Every timer in Flow derives its digits from wall-clock timestamps, which is
 * right — it survives sleep, throttling and a reload. What was missing is a
 * reason to re-render: the store only notifies when the *data* changes, so a
 * running countdown sat on the same number until something unrelated touched
 * the database. Measured on the timers tab: `02:00` for two seconds, then a
 * jump to `01:57`, then frozen again.
 *
 * The tick is aligned to the next whole second, so the digits flip when the
 * second does instead of drifting a little later on every tick.
 */
export function useClock(active = true) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    let id = 0;
    const step = () => {
      setNow(Date.now());
      // +12 ms of slack: repeated timeouts land just after the boundary rather
      // than just before it, which would repeat a stale second.
      id = window.setTimeout(step, 1000 - (Date.now() % 1000) + 12);
    };
    id = window.setTimeout(step, 1000 - (Date.now() % 1000) + 12);
    return () => window.clearTimeout(id);
  }, [active]);

  return now;
}

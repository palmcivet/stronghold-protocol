import { useEffect, useState } from 'react';
import { useMatch } from '../infra/store/hook.js';
import { secondsLeft } from '../infra/store/match.js';
import { useText } from '../infra/text/index.js';

/** Seconds left of the phase, read out at most every ten seconds. */
export function Countdown() {
  const t = useText();
  const state = useMatch((match) => ({
    public: match.public,
    clockOffset: match.clockOffset,
  }));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const seconds = secondsLeft(state, now);
  if (seconds === null) {
    return null;
  }
  return (
    <span aria-live={seconds % 10 === 0 ? 'polite' : 'off'}>
      {t('core:common.seconds', { seconds })}
    </span>
  );
}

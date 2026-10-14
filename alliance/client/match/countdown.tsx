import { useEffect, useState } from 'react';
import { useMatch } from '#infra/store/hook.js';
import { secondsLeft } from '#infra/store/match.js';
import { useText } from '#infra/text/index.js';
import { Countdown as CountdownView, SevenSeg } from '#ui/index.js';

/** Seconds left of the phase, ticking twice a second; null while the phase is untimed. */
export function usePhaseSeconds(deadline?: number): number | null {
  const state = useMatch((match) => ({
    public: match.public,
    clockOffset: match.clockOffset,
  }));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  if (deadline !== undefined) {
    return deadline
      ? Math.max(0, Math.ceil((deadline - (now + state.clockOffset)) / 1000))
      : null;
  }
  return secondsLeft(state, now);
}

/** Seconds left of the phase as text, read out at most every ten seconds. */
export function Countdown({ deadline }: { readonly deadline?: number } = {}) {
  const t = useText();
  const seconds = usePhaseSeconds(deadline);
  return (
    <CountdownView
      seconds={seconds}
      text={(value) => t('core:common.seconds', { seconds: value })}
    />
  );
}

/** Seconds left as `mm:ss` on the seven-segment face. */
export function ClockFace({ warnAt = 5 }: { readonly warnAt?: number }) {
  const t = useText();
  const seconds = usePhaseSeconds();
  if (seconds === null) {
    return null;
  }
  const text = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <SevenSeg
      value={text}
      warn={seconds <= warnAt}
      label={t('core:common.seconds', { seconds })}
    />
  );
}

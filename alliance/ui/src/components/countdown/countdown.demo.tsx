'use client';

import { useEffect, useState } from 'react';
import { Countdown } from '#ui/index.js';

export function CountdownDemo() {
  const [seconds, setSeconds] = useState<number | null>(12);
  useEffect(() => {
    if (seconds === null || seconds <= 0) {
      return;
    }
    const timer = setTimeout(() => setSeconds(seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);
  return (
    <Countdown seconds={seconds} text={(value) => `${value} 秒`} warnAt={5} />
  );
}

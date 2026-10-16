'use client';

import { useState } from 'react';
import { Slider } from '#ui/index.js';

export function SliderDemo() {
  const [volume, setVolume] = useState(60);
  return (
    <Slider
      label="音量"
      value={volume}
      onChange={setVolume}
      minValue={0}
      maxValue={100}
      step={5}
    />
  );
}

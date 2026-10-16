'use client';

import { useState } from 'react';
import {
  Button,
  FeedbackProvider,
  type PlayFeedback,
  useFeedback,
} from '#ui/index.js';

function PlayButton() {
  const play = useFeedback();
  return <Button onPress={() => play('ui.click')}>播放点击音效</Button>;
}

export function FeedbackDemo() {
  const [last, setLast] = useState('无');
  const play: PlayFeedback = (role) => setLast(role);
  return (
    <FeedbackProvider play={play}>
      <div style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
        <PlayButton />
        <p>最近一次音效：{last}</p>
      </div>
    </FeedbackProvider>
  );
}

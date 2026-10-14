// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { playCue, setCueSink } from '#infra/audio/feedback.js';
import { DEFAULT_AUDIO, settingsStore } from '#infra/store/settings.js';
import { renderPart } from '#test/support/part.js';

afterEach(() => {
  cleanup();
  settingsStore.setState({ audio: DEFAULT_AUDIO });
});

describe('audio settings', () => {
  it('sets the volume of a channel and mutes it, keeping the others', () => {
    const cues: string[] = [];
    const unset = setCueSink((role) => cues.push(role));
    renderPart('core:profile.audio', { play: playCue });
    const music = screen.getByRole('slider', { name: '音乐' });
    fireEvent.change(music, { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: '音效 静音' }));
    unset();
    const { audio } = settingsStore.getState();
    expect(audio.music).toEqual({ volume: 25, muted: false });
    expect(audio.sfx).toEqual({
      volume: DEFAULT_AUDIO.sfx.volume,
      muted: true,
    });
    expect(audio.master).toEqual(DEFAULT_AUDIO.master);
    expect(
      (screen.getByRole('slider', { name: '音效' }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(cues).toEqual(['ui.tab']);
  });
});

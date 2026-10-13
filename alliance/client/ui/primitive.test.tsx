// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button, Meter } from './index.js';

afterEach(cleanup);

describe('primitive', () => {
  it('presses a button by its accessible name', () => {
    const onPress = vi.fn();
    render(<Button onPress={onPress}>Ready</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Ready' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reads a meter out as value over max', () => {
    render(<Meter label="Funds" value={3} max={10} />);
    const meter = screen.getByRole('meter', { name: 'Funds' });
    expect(meter.getAttribute('aria-valuetext')).toBe('3/10');
  });
});

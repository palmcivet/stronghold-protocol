// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Button,
  Card,
  FeedbackProvider,
  Grid,
  ListBox,
  type PlayFeedback,
  Segmented,
  Slider,
  Switch,
  TextField,
  ToggleButton,
} from '#ui/index.js';

afterEach(cleanup);

describe('button', () => {
  it('presses by its accessible name and plays the click', () => {
    const onPress = vi.fn();
    const play = vi.fn<PlayFeedback>();
    render(
      <FeedbackProvider play={play}>
        <Button onPress={onPress}>Ready</Button>
      </FeedbackProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ready' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith('ui.click');
  });

  it('carries its look as data attributes, and a variant takes its tone', () => {
    render(
      <Button variant="danger" size="lg" block>
        Leave
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Leave' });
    expect(button.getAttribute('data-variant')).toBe('danger');
    expect(button.getAttribute('data-size')).toBe('lg');
    expect(button.getAttribute('data-tone')).toBe('danger');
    expect(button.getAttribute('data-block')).toBe('true');
  });

  it('puts icons around the label, and a square one stands on its aria-label', () => {
    const { container } = render(
      <>
        <Button icon="users" iconEnd="chevron-right">
          Join
        </Button>
        <Button square icon="close" aria-label="Close" />
      </>,
    );
    const join = screen.getByRole('button', { name: 'Join' });
    expect(join.querySelectorAll('svg')).toHaveLength(2);
    expect(join.firstElementChild?.getAttribute('data-icon')).toBe('users');
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close.getAttribute('data-square')).toBe('true');
    expect(container.querySelectorAll('[data-icon="close"]')).toHaveLength(1);
  });

  it('ignores presses while busy and says so', () => {
    const onPress = vi.fn();
    render(
      <Button busy onPress={onPress}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });

  it('keeps a toggle pressed', () => {
    const onChange = vi.fn();
    render(
      <ToggleButton onChange={onChange} isSelected={false}>
        Mute
      </ToggleButton>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('segmented', () => {
  const options = [
    { value: 'a', label: 'Easy' },
    { value: 'b', label: 'Hard' },
    { value: 'c', label: 'Abyss', disabled: true },
  ];

  it('chooses one of the segments and skips a disabled one', () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="Difficulty"
        value="a"
        onChange={onChange}
        options={options}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Difficulty' })).toBeTruthy();
    expect(
      screen.getByRole('radio', { name: 'Easy' }).getAttribute('aria-checked'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Hard' }));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(
      screen.getByRole('radio', { name: 'Abyss' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('moves the focus with the arrow keys without choosing', () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="Difficulty"
        value="a"
        onChange={onChange}
        options={options}
      />,
    );
    const easy = screen.getByRole('radio', { name: 'Easy' });
    easy.focus();
    fireEvent.keyDown(easy, { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps a hidden label for assistive technology', () => {
    render(
      <Segmented
        label="Difficulty"
        labelHidden
        value="a"
        onChange={() => {}}
        options={options}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Difficulty' })).toBeTruthy();
  });

  it('chooses one card of its cards, named by the option rather than its content', () => {
    function Cards({ onChange }: { readonly onChange: (id: string) => void }) {
      const [value, setValue] = useState('solo');
      return (
        <Segmented
          variant="cards"
          label="Mode"
          value={value}
          onChange={(id) => {
            setValue(id);
            onChange(id);
          }}
          options={[
            { value: 'solo', label: 'Solo', content: <b>Solo mode</b> },
            { value: 'coop', label: 'Coop', content: <b>Coop mode</b> },
          ]}
        />
      );
    }
    const onChange = vi.fn();
    render(<Cards onChange={onChange} />);
    const solo = screen.getByRole('radio', { name: 'Solo' });
    const coop = screen.getByRole('radio', { name: 'Coop' });
    expect(solo.classList.contains('wsde-brackets')).toBe(true);
    expect(solo.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(coop);
    expect(onChange).toHaveBeenCalledWith('coop');
    expect(coop.getAttribute('aria-checked')).toBe('true');
    expect(solo.getAttribute('aria-checked')).toBe('false');
  });
});

describe('switch', () => {
  it('toggles and shows the word of its state', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Switch isSelected={false} onChange={onChange} onText="On" offText="Off">
        Safe area
      </Switch>,
    );
    const toggle = screen.getByRole('switch', { name: 'Safe area' });
    expect(screen.getByText('Off')).toBeTruthy();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(
      <Switch isSelected onChange={onChange} onText="On" offText="Off">
        Safe area
      </Switch>,
    );
    expect(screen.getByText('On')).toBeTruthy();
  });
});

describe('text field', () => {
  it('labels the box and carries typing', () => {
    const onChange = vi.fn();
    render(
      <TextField
        label="Name"
        micro="NICKNAME"
        icon="user"
        hint="Up to 16 letters"
        onChange={onChange}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Name' });
    fireEvent.change(input, { target: { value: 'Amiya' } });
    expect(onChange).toHaveBeenCalledWith('Amiya');
    expect(
      screen.getByRole('textbox', { description: 'Up to 16 letters' }),
    ).toBe(input);
  });
});

describe('search box', () => {
  it('is a search box with a hidden name, and clears from its button', () => {
    const onChange = vi.fn();
    render(
      <TextField
        type="search"
        label="Find"
        labelHidden
        clearLabel="Clear"
        value="ami"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('searchbox', { name: 'Find' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('has no clear button while empty', () => {
    render(
      <TextField
        type="search"
        label="Find"
        clearLabel="Clear"
        value=""
        onChange={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });
});

describe('slider', () => {
  it('shows its value and reports a new one', () => {
    const onChange = vi.fn();
    render(<Slider label="Music" value={40} onChange={onChange} />);
    const thumb = screen.getByRole<HTMLInputElement>('slider', {
      name: 'Music',
    });
    expect(thumb.value).toBe('40');
    expect(screen.getByRole('group', { name: 'Music' }).textContent).toContain(
      '40',
    );
    fireEvent.change(thumb, { target: { value: '41' } });
    expect(onChange).toHaveBeenCalledWith(41);
  });
});

describe('list box', () => {
  const items = [
    { id: 'a', label: 'Guard' },
    { id: 'b', label: 'Sniper' },
    { id: 'c', label: 'Medic', disabled: true },
  ];

  it('picks one item by its id', () => {
    const onSelect = vi.fn();
    render(
      <ListBox
        label="Operators"
        variant="cards"
        selected="a"
        onSelect={onSelect}
        items={items}
      />,
    );
    expect(
      screen
        .getByRole('option', { name: 'Guard' })
        .getAttribute('aria-selected'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('option', { name: 'Sniper' }));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('picks several when asked to', () => {
    const onSelect = vi.fn();
    render(
      <ListBox
        multiple
        label="Operators"
        selected={['a']}
        onSelect={onSelect}
        items={items}
      />,
    );
    fireEvent.click(screen.getByRole('option', { name: 'Sniper' }));
    expect(onSelect).toHaveBeenCalledWith(['a', 'b']);
  });

  it('only acts on a press without a selection', () => {
    const onAction = vi.fn();
    render(<ListBox label="Operators" onAction={onAction} items={items} />);
    fireEvent.click(screen.getByRole('option', { name: 'Guard' }));
    expect(onAction).toHaveBeenCalledWith('a');
  });
});

describe('card', () => {
  it('lays a line out as a row', () => {
    render(
      <Card as="li" layout="row">
        <span>Zoom</span>
      </Card>,
    );
    expect(screen.getByRole('listitem').getAttribute('data-layout')).toBe(
      'row',
    );
  });
});

describe('layout', () => {
  it('sizes grid cells in design pixels', () => {
    const { container } = render(
      <Grid min={200}>
        <span>cell</span>
      </Grid>,
    );
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.style.getPropertyValue('--min')).toBe(
      'calc(var(--wsde-dp) * 200)',
    );
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AvatarFrame,
  Badge,
  Capsule,
  Card,
  HexBadge,
  Notice,
  Panel,
  ProgressBar,
  RichText,
  SectionHeading,
  Text,
  Thumb,
  ToastStack,
} from '#ui/index.js';

afterEach(cleanup);

describe('panel', () => {
  it('is a region named by its title, with the micro label and actions beside it', () => {
    render(
      <Panel
        title="Leader"
        micro="LEADER"
        tone="orange"
        actions={<button type="button">Reroll</button>}
      >
        <p>Body</p>
      </Panel>,
    );
    const region = screen.getByRole('region', { name: 'Leader' });
    expect(region.getAttribute('data-tone')).toBe('orange');
    expect(
      screen.getByRole('heading', { name: 'Leader', level: 2 }),
    ).toBeTruthy();
    expect(screen.getByText('LEADER')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reroll' })).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
  });

  it('takes the heading level and drops the body padding when flush', () => {
    render(
      <Panel title="Bench" level={3} flush glow>
        <p>Rows</p>
      </Panel>,
    );
    expect(
      screen.getByRole('heading', { name: 'Bench', level: 3 }),
    ).toBeTruthy();
    expect(
      screen.getByText('Rows').parentElement?.getAttribute('data-flush'),
    ).toBe('true');
    expect(
      screen.getByRole('region', { name: 'Bench' }).getAttribute('data-glow'),
    ).toBe('true');
  });
});

describe('labels', () => {
  it('sets a micro label in a tone', () => {
    render(
      <Text variant="micro" tone="gold">
        PRICE
      </Text>,
    );
    const label = screen.getByText('PRICE');
    expect(label.getAttribute('data-variant')).toBe('micro');
    expect(label.getAttribute('data-tone')).toBe('gold');
  });

  it('marks a figure and the emphasis of a text apart from its tone', () => {
    render(
      <>
        <Text variant="number" kind="good">
          +12
        </Text>
        <Text kind="muted">Hint</Text>
      </>,
    );
    const figure = screen.getByText('+12');
    expect(figure.getAttribute('data-variant')).toBe('number');
    expect(figure.getAttribute('data-kind')).toBe('good');
    expect(figure.hasAttribute('data-tone')).toBe(false);
    expect(screen.getByText('Hint').getAttribute('data-kind')).toBe('muted');
  });

  it('heads a block with a numbered tag, a title and its English label', () => {
    render(<SectionHeading index="01" title="Mode" micro="MODE" level={2} />);
    expect(
      screen.getByRole('heading', { name: 'Mode', level: 2 }),
    ).toBeTruthy();
    expect(screen.getByText('MODE')).toBeTruthy();
    expect(screen.getByText('01').getAttribute('aria-hidden')).toBe('true');
  });
});

describe('hex badge', () => {
  it('shows its content, and reads out as one image when named', () => {
    render(
      <>
        <HexBadge>12</HexBadge>
        <HexBadge tone="neutral" label="Price 5">
          5
        </HexBadge>
      </>,
    );
    expect(screen.getByText('12')).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'Price 5' }).getAttribute('data-tone'),
    ).toBe('neutral');
  });
});

describe('badge', () => {
  it('takes a tone, or any color that wins over it', () => {
    render(
      <>
        <Badge>Plain</Badge>
        <Badge tone="gold" shape="pill" icon="star" glow>
          Gold
        </Badge>
        <Badge color="var(--wsde-color-tier-4)" tone="danger">
          Colored
        </Badge>
      </>,
    );
    const plain = screen.getByText('Plain');
    expect(plain.getAttribute('data-tone')).toBe('neutral');
    expect(plain.getAttribute('data-shape')).toBe('tag');
    const gold = screen.getByText('Gold');
    expect(gold.getAttribute('data-tone')).toBe('gold');
    expect(gold.getAttribute('data-shape')).toBe('pill');
    expect(gold.getAttribute('data-glow')).toBe('true');
    const colored = screen.getByText('Colored');
    expect(colored.hasAttribute('data-tone')).toBe(false);
    expect(colored.style.getPropertyValue('--badge')).toBe(
      'var(--wsde-color-tier-4)',
    );
  });

  it('reads out as one image when named', () => {
    render(
      <Badge shape="square" label="Tier 3">
        3
      </Badge>,
    );
    expect(screen.getByRole('img', { name: 'Tier 3' }).textContent).toBe('3');
  });
});

describe('notice', () => {
  it('stands in for an empty list with an icon, without an alert', () => {
    const { container } = render(
      <Notice title="No allies" icon="users">
        Invite someone.
      </Notice>,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('No allies')).toBeTruthy();
    expect(container.querySelector('[data-icon="users"]')).toBeTruthy();
  });

  it('announces an error with its actions, unless its container already does', () => {
    const { rerender } = render(
      <Notice
        variant="error"
        title="Disconnected"
        actions={<button type="button">Retry</button>}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Disconnected');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    rerender(<Notice variant="error" title="Disconnected" announce={false} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('progress bar', () => {
  it('reads out the text it is given as the value', () => {
    render(<ProgressBar label="Kills" value={3} max={10} valueText="3/10" />);
    expect(
      screen
        .getByRole('progressbar', { name: 'Kills' })
        .getAttribute('aria-valuetext'),
    ).toBe('3/10');
  });
});

describe('avatar frame', () => {
  it('is an image named by the player, with the first letter for a missing picture', () => {
    render(<AvatarFrame name="Amiya" />);
    expect(screen.getByRole('img', { name: 'Amiya' }).textContent).toBe('A');
  });

  it('uses the picture when there is one and an own label when given', () => {
    const { container } = render(
      <AvatarFrame name="Amiya" src="/amiya.png" label="Amiya, ready" />,
    );
    expect(screen.getByRole('img', { name: 'Amiya, ready' })).toBeTruthy();
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/amiya.png',
    );
  });

  it('puts marks on its corners and a tag, and a given icon in place of the letter', () => {
    const { container } = render(
      <AvatarFrame
        name="Doctor"
        icon="bot"
        startMark={{ icon: 'crown', tone: 'gold' }}
        endMark={{ icon: 'user', tone: 'accent' }}
        tag="AI"
        active
      />,
    );
    const start = container.querySelector('[data-side="start"]');
    expect(start?.getAttribute('data-tone')).toBe('gold');
    expect(container.querySelector('[data-side="end"]')).toBeTruthy();
    expect(screen.getByText('AI')).toBeTruthy();
    expect(container.querySelector('[data-icon="bot"]')).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'Doctor' }).getAttribute('data-tone'),
    ).toBe('accent');
  });

  it('shows an open slot as a plus without the marks', () => {
    const { container } = render(
      <AvatarFrame
        name="Slot 2"
        empty
        startMark={{ icon: 'crown' }}
        tag="AI"
      />,
    );
    const frame = screen.getByRole('img', { name: 'Slot 2' });
    expect(frame.getAttribute('data-empty')).toBe('true');
    expect(container.querySelector('[data-icon="plus"]')).toBeTruthy();
    expect(container.querySelector('[data-side]')).toBeNull();
    expect(screen.queryByText('AI')).toBeNull();
  });

  it('greys out a frame that is dimmed', () => {
    render(<AvatarFrame name="Doctor" dimmed />);
    expect(
      screen.getByRole('img', { name: 'Doctor' }).getAttribute('data-dimmed'),
    ).toBe('true');
  });
});

describe('thumb', () => {
  it('is an image named by its name, with its first two letters for a missing picture', () => {
    render(<Thumb name="Amiya" />);
    expect(screen.getByRole('img', { name: 'Amiya' }).textContent).toBe('Am');
  });

  it('takes the color of its frame and a halo', () => {
    render(<Thumb name="Amiya" color="var(--wsde-color-tier-4)" glow />);
    const thumb = screen.getByRole('img', { name: 'Amiya' });
    expect(thumb.style.getPropertyValue('--thumb')).toBe(
      'var(--wsde-color-tier-4)',
    );
    expect(thumb.getAttribute('data-glow')).toBe('true');
  });
});

describe('capsule', () => {
  it('shows its figure and a progress bar clamped to the capsule', () => {
    const { container } = render(
      <Capsule label="Combat" tone="orange" detail="12/20" progress={3} />,
    );
    expect(screen.getByText('12/20')).toBeTruthy();
    const capsule = container.firstElementChild as HTMLElement;
    expect(capsule.getAttribute('data-tone')).toBe('orange');
    expect(
      (container.querySelector('[aria-hidden] > span') as HTMLElement).style
        .width,
    ).toBe('100%');
  });
});

describe('tone vocabulary', () => {
  it('colors a badge, a card bar and a progress fill by tone names', () => {
    const { container } = render(
      <>
        <Badge tone="amber">Auto</Badge>
        <Card tone="danger" title="Lost" />
        <ProgressBar label="Boss" value={3} max={10} tone="danger" />
      </>,
    );
    expect(screen.getByText('Auto').getAttribute('data-tone')).toBe('amber');
    expect(container.querySelector('article')?.getAttribute('data-tone')).toBe(
      'danger',
    );
    expect(
      screen
        .getByRole('progressbar', { name: 'Boss' })
        .getAttribute('data-tone'),
    ).toBe('danger');
  });

  it('shows a toast in a neutral tone unless it names one', () => {
    render(
      <ToastStack
        label="Toasts"
        toasts={[
          { id: 1, text: 'Saved' },
          { id: 2, text: 'Failed', tone: 'danger' },
        ]}
      />,
    );
    expect(screen.getByText('Saved').getAttribute('data-tone')).toBe('neutral');
    expect(screen.getByText('Failed').getAttribute('data-tone')).toBe('danger');
  });

  it('keeps kinds off the tone attribute', () => {
    render(
      <>
        <RichText source="<@ba.vup>+10%</>" />
        <Text kind="muted">Hint</Text>
      </>,
    );
    const run = screen.getByText('+10%');
    expect(run.getAttribute('data-kind')).toBe('positive');
    expect(run.hasAttribute('data-tone')).toBe(false);
    expect(screen.getByText('Hint').hasAttribute('data-tone')).toBe(false);
  });
});

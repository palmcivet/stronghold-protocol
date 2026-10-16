/** Paths of the built-in icons on a 24 × 24 grid, stroked with the current color. */
const PATHS = {
  close: 'M6 6l12 12M18 6L6 18',
  crown: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z',
  back: 'M15 5l-7 7 7 7',
  'chevron-right': 'M9 5l7 7-7 7',
  'chevron-down': 'M5 9l7 7 7-7',
  settings:
    'M12 9a3 3 0 100 6 3 3 0 000-6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4',
  search: 'M10.5 4a6.5 6.5 0 110 13 6.5 6.5 0 010-13zM15.5 15.5L20 20',
  check: 'M5 12l5 5 9-10',
  lock: 'M7 11V8a5 5 0 0110 0v3M5 11h14v9H5z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  refresh: 'M20 12a8 8 0 11-2.3-5.7M20 4v5h-5',
  freeze: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9',
  exit: 'M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  info: 'M12 3a9 9 0 110 18 9 9 0 010-18zM12 11v6M12 7.5v.5',
  warning: 'M12 3l10 18H2zM12 10v5M12 18v.01',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
  sound: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 010 6',
  mute: 'M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 5l12 7-12 7z',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  copy: 'M8 8h11v11H8zM5 16V5h11',
  user: 'M12 4a4 4 0 110 8 4 4 0 010-8zM4 20a8 8 0 0116 0',
  users:
    'M9 5a3.5 3.5 0 110 7 3.5 3.5 0 010-7zM2 20a7 7 0 0114 0M16 5.5a3 3 0 010 6M18 14a6 6 0 014 6',
  'chevron-left': 'M15 5l-7 7 7 7',
  bot: 'M6 9h12v10H6zM12 5v4M9 13h.01M15 13h.01',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  bolt: 'M13 2L4 13.5h6.2L9 22l11-12.5h-6.4z',
  book: 'M5 4h11a2 2 0 012 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 012-2zM8 8h6M8 12h6',
  rook: 'M5 3h3v3h2V3h4v3h2V3h3v5l-2 2v8H7v-8L5 8V3zm4 17h6v2H9v-2z',
  signal: 'M5 20v-4M10 20v-8M15 20V8M20 20V4',
  hourglass:
    'M6 4h12M6 20h12M7 4c0 5 5 5 5 8s-5 3-5 8M17 4c0 5-5 5-5 8s5 3 5 8',
} as const;

export type IconName = keyof typeof PATHS;

export const ICON_NAMES = Object.keys(PATHS) as readonly IconName[];

/** A built-in icon. Decorative unless it has a label. */
export function Icon({
  name,
  label,
  size,
}: {
  readonly name: IconName;
  readonly label?: string;
  /** A CSS length. Without it the icon is `1em`, and a rule may size it. */
  readonly size?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      {...(size === undefined ? {} : { style: { width: size, height: size } })}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-icon={name}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

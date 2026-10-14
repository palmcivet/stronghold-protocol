import { color, dimension, shadow, type TokenGroup } from './token.js';

const CJK = [
  'Noto Sans SC',
  'PingFang SC',
  'Hiragino Sans GB',
  'Microsoft YaHei',
  'Source Han Sans SC',
  'Noto Sans CJK SC',
];

/** Default tokens of the host. A theme is a set of overrides of these. */
export const TOKENS: TokenGroup = {
  color: {
    bg: {
      0: color('#0c0f0e'),
      1: color('#141816'),
      2: color('#1e2421'),
      3: color('#252c29'),
      4: color('#2d3632'),
      glass: color('#101412', 0.82),
    },
    line: {
      1: color('#2f3a35'),
      2: color('#3e4b45'),
      3: color('#58675f'),
    },
    accent: {
      400: color('#59f4ca'),
      500: color('#4ed8af'),
      600: color('#35d8b4'),
      700: color('#2a9e7f'),
      800: color('#145443'),
      900: color('#0d2c24'),
      a10: color('#4ed8af', 0.1),
      a20: color('#4ed8af', 0.2),
      a35: color('#4ed8af', 0.35),
    },
    gold: color('#ffc600'),
    amber: color('#f6a329'),
    orange: color('#e85a1a'),
    danger: color('#e73118'),
    ice: color('#9fd4ff'),
    text: {
      hi: color('#f2f2f2'),
      md: color('#c3cbc7'),
      lo: color('#8a948f'),
      dim: color('#5d6863'),
      'on-accent': color('#06110d'),
    },
    difficulty: {
      funny: color('#f6a329'),
      normal: color('#e85a1a'),
      hard: color('#e73118'),
      abyss: color('#ff0024'),
    },
    status: {
      info: color('#9fd4ff'),
      success: color('#4ed8af'),
      warn: color('#f6a329'),
      error: color('#e73118'),
    },
    bond: {
      off: color('#5d6863'),
      on: color('#4ed8af'),
      max: color('#ffc600'),
    },
    rich: {
      keyword: color('#00b0ff'),
      positive: color('#0098dc'),
      negative: color('#ff6237'),
      value: color('#ffc600'),
      name: color('#f2f2f2'),
    },
    surface: {
      hud: color('#0c0f0e', 0.72),
      scrim: color('#000000', 0.55),
    },
    tier: {
      1: color('#a8a8a8'),
      2: color('#f2f2f2'),
      3: color('#34e6b2'),
      4: color('#34b8d8'),
      5: color('#f8bf00'),
      6: color('#f88000'),
    },
  },
  font: {
    body: { $type: 'fontFamily', $value: [...CJK, 'sans-serif'] },
    number: {
      $type: 'fontFamily',
      $value: ['Bender', 'Rajdhani', 'Oxanium', ...CJK, 'sans-serif'],
    },
    display: {
      $type: 'fontFamily',
      $value: ['Novecento', 'Oxanium', 'Rajdhani', ...CJK, 'sans-serif'],
    },
  },
  'font-size': {
    /* Semantic font roles at design baseline (px); applyViewport scales by layout.scale. */
    caption: dimension(11, 'px'),
    label: dimension(12, 'px'),
    body: dimension(14, 'px'),
    title: dimension(18, 'px'),
    display: dimension(24, 'px'),
    /* Short aliases for the same role bases. */
    xs: dimension(11, 'px'),
    sm: dimension(12, 'px'),
    md: dimension(14, 'px'),
    lg: dimension(18, 'px'),
    xl: dimension(24, 'px'),
    '2xl': dimension(24, 'px'),
  },
  ease: {
    out: { $type: 'cubicBezier', $value: [0.2, 0.8, 0.2, 1] },
    'in-out': { $type: 'cubicBezier', $value: [0.6, 0, 0.3, 1] },
  },
  duration: {
    fast: { $type: 'duration', $value: { value: 150, unit: 'ms' } },
    medium: { $type: 'duration', $value: { value: 200, unit: 'ms' } },
    slow: { $type: 'duration', $value: { value: 250, unit: 'ms' } },
  },
  /** Factor applied to every duration; the reduced-motion layer sets it to 0. */
  motion: { $type: 'number', $value: 1 },
  space: {
    /* Spacing ladder bases (px) at design baseline; keys 6/8 alias steps 5/6. */
    1: dimension(4, 'px'),
    2: dimension(8, 'px'),
    3: dimension(12, 'px'),
    4: dimension(16, 'px'),
    5: dimension(24, 'px'),
    6: dimension(24, 'px'),
    8: dimension(32, 'px'),
  },
  radius: {
    1: { $type: 'dimension', $value: { value: 2, unit: 'px' } },
    2: { $type: 'dimension', $value: { value: 4, unit: 'px' } },
    3: dimension(8, 'px'),
    round: dimension(999, 'px'),
  },
  shadow: {
    panel: shadow({ at: [0, 4, 16, 0], color: color('#000000', 0.45) }),
    float: shadow({ at: [0, 8, 32, 0], color: color('#000000', 0.6) }),
    glow: shadow({ at: [0, 0, 12, 0], color: color('#4ed8af', 0.35) }),
    danger: shadow({ at: [0, 0, 12, 0], color: color('#e73118', 0.45) }),
  },
  stroke: {
    thin: dimension(1, 'px'),
    thick: dimension(2, 'px'),
    accent: dimension(3, 'px'),
  },
  size: {
    'hud-bar': dimension(3),
    card: dimension(10),
    'card-wide': dimension(14),
    avatar: dimension(2.5),
    'avatar-lg': dimension(4),
    thumb: dimension(3.5),
    touch: dimension(44, 'px'),
    page: dimension(72),
  },
  /**
   * Material 3 window size class floors (CSS px) for script / debug mirror.
   * A media query cannot read a custom property; `infra/theme/viewport` owns the live class.
   */
  breakpoint: {
    compact: dimension(0, 'px'),
    medium: dimension(600, 'px'),
    expanded: dimension(840, 'px'),
    large: dimension(1200, 'px'),
    xlarge: dimension(1600, 'px'),
  },
  layer: {
    backdrop: { $type: 'number', $value: 0 },
    screen: { $type: 'number', $value: 1 },
    hud: { $type: 'number', $value: 10 },
    banner: { $type: 'number', $value: 40 },
    overlay: { $type: 'number', $value: 60 },
    connection: { $type: 'number', $value: 75 },
    modal: { $type: 'number', $value: 80 },
    toast: { $type: 'number', $value: 90 },
    tooltip: { $type: 'number', $value: 95 },
  },
};

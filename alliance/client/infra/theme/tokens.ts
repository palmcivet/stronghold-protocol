import { color, type TokenGroup } from './token.js';

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
  ease: {
    out: { $type: 'cubicBezier', $value: [0.2, 0.8, 0.2, 1] },
    'in-out': { $type: 'cubicBezier', $value: [0.6, 0, 0.3, 1] },
  },
  duration: {
    fast: { $type: 'duration', $value: { value: 150, unit: 'ms' } },
    medium: { $type: 'duration', $value: { value: 200, unit: 'ms' } },
    slow: { $type: 'duration', $value: { value: 250, unit: 'ms' } },
  },
  space: {
    1: { $type: 'dimension', $value: { value: 0.25, unit: 'rem' } },
    2: { $type: 'dimension', $value: { value: 0.5, unit: 'rem' } },
    3: { $type: 'dimension', $value: { value: 0.75, unit: 'rem' } },
    4: { $type: 'dimension', $value: { value: 1, unit: 'rem' } },
    6: { $type: 'dimension', $value: { value: 1.5, unit: 'rem' } },
    8: { $type: 'dimension', $value: { value: 2, unit: 'rem' } },
  },
  radius: {
    1: { $type: 'dimension', $value: { value: 2, unit: 'px' } },
    2: { $type: 'dimension', $value: { value: 4, unit: 'px' } },
  },
  layer: {
    screen: { $type: 'number', $value: 1 },
    banner: { $type: 'number', $value: 40 },
    connection: { $type: 'number', $value: 75 },
    modal: { $type: 'number', $value: 80 },
    toast: { $type: 'number', $value: 90 },
  },
};

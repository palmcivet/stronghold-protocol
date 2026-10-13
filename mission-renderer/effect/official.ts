import type { MissionCue, MissionEffectKindId } from '#contract/cue.js';
import type { MissionTileRect } from '#contract/view.js';
import type { MissionCueBindings } from '#effect/binding.js';
import {
  actorPoint,
  createBeamKind,
  createBurstKind,
  createSlashKind,
  createSnowKind,
  createTilesKind,
  createVeilKind,
  createZoneKind,
  type MissionEffectPoint,
} from '#effect/shape.js';
import type {
  MissionEffectContext,
  MissionEffectTable,
} from '#effect/table.js';

/** How master draws an official fx kind; `none` draws nothing. */
export type OfficialFxArchetype =
  | 'blast'
  | 'shell'
  | 'qi'
  | 'volley'
  | 'counter'
  | 'element'
  | 'zone'
  | 'wall'
  | 'telegraph'
  | 'chill'
  | 'heal'
  | 'healAoe'
  | 'summon'
  | 'sp'
  | 'shield'
  | 'shatter'
  | 'vanish'
  | 'blink'
  | 'none'
  | 'move'
  | 'wave'
  | 'mark'
  | 'reticle'
  | 'buff'
  | 'flame'
  | 'lift'
  | 'sleep'
  | 'crit'
  | 'dodge'
  | 'down'
  | 'dp'
  | 'coin'
  | 'crate'
  | 'lp'
  | 'strike'
  | 'bolt'
  | 'beam'
  | 'pillar';

/**
 * One official fx kind, as master's `FX_KINDS`: its archetype, colour, and defaults: `radius` in tiles, `seconds` in
 * game seconds, `point` always at the cue's x and y, `heavy` and `smoke` for blasts.
 */
export interface OfficialFxSpec {
  readonly archetype: OfficialFxArchetype;
  readonly color: number;
  readonly radius?: number;
  readonly seconds?: number;
  readonly point?: boolean;
  readonly heavy?: boolean;
  readonly smoke?: number;
}

/** Every fx kind master's content emits, by cue kind: master's camelCase name in kebab-case. */
export const OFFICIAL_FX: Readonly<Record<string, OfficialFxSpec>> =
  Object.freeze({
    blast: { archetype: 'blast', color: 0xffb35c },
    aoe: { archetype: 'blast', color: 0xffb35c },
    explode: { archetype: 'blast', color: 0xff7a33 },
    explosion: { archetype: 'blast', color: 0xff7a33 },
    bombard: {
      archetype: 'blast',
      color: 0xffa04a,
      radius: 1.5,
      point: true,
      heavy: true,
    },
    'bombard-shell': {
      archetype: 'shell',
      color: 0xff5a3a,
      radius: 1.5,
      point: true,
    },
    airstrike: {
      archetype: 'blast',
      color: 0xff8a3d,
      radius: 1.5,
      heavy: true,
    },
    splash: { archetype: 'blast', color: 0xffc27a },
    'scorch-burst': { archetype: 'blast', color: 0xff6a2a },
    'champagne-bomb': { archetype: 'blast', color: 0xffd27a },
    'shock-blast': { archetype: 'blast', color: 0x9fd4ff, smoke: 0x1c2630 },
    'frost-nova': { archetype: 'blast', color: 0x9fe6ff, smoke: 0x1c2630 },
    'sun-burst': { archetype: 'blast', color: 0xffe28a },
    meltdown: { archetype: 'blast', color: 0xff5a2a, radius: 1.5, heavy: true },
    'ice-spike': { archetype: 'blast', color: 0xbfeeff, smoke: 0x1c2630 },
    rockfall: { archetype: 'blast', color: 0xc8a878, smoke: 0x4a3f33 },
    rockslide: { archetype: 'blast', color: 0xc8a878, smoke: 0x4a3f33 },
    finale: { archetype: 'blast', color: 0xffd45a, radius: 1.5 },
    'sword-storm': { archetype: 'blast', color: 0xdfe8ff },
    'sword-rain': { archetype: 'blast', color: 0xdfe8ff },
    liberate: { archetype: 'blast', color: 0xffffff },
    'chen3-wave': { archetype: 'qi', color: 0xdfe8ff, point: true },
    'quad-shot': { archetype: 'volley', color: 0xfff2d0 },
    'feather-arrow': { archetype: 'counter', color: 0xfff2d0 },
    burst: { archetype: 'element', color: 0xd0a0ff },
    zone: { archetype: 'zone', color: 0xffb35c, seconds: 3 },
    'heal-field': { archetype: 'zone', color: 0x62f08a, seconds: 4 },
    firewall: { archetype: 'wall', color: 0xff6a2a, seconds: 4 },
    'firewall-block': { archetype: 'counter', color: 0xff6a2a },
    tide: { archetype: 'zone', color: 0x5fe0ff, radius: 2, seconds: 3 },
    storm: { archetype: 'zone', color: 0xd8c8a0, seconds: 3 },
    tornado: { archetype: 'zone', color: 0xd8e8ff, seconds: 3 },
    snow: { archetype: 'zone', color: 0xe8f6ff, seconds: 3 },
    telegraph: { archetype: 'telegraph', color: 0xff3b30, seconds: 1.2 },
    'cold-wind': { archetype: 'chill', color: 0x9fd4ff },
    heal: { archetype: 'heal', color: 0x62f08a },
    'heal-aoe': { archetype: 'healAoe', color: 0x62f08a, radius: 1.5 },
    bandage: { archetype: 'heal', color: 0x62f08a },
    blessing: { archetype: 'healAoe', color: 0xfff0a8 },
    cleanse: { archetype: 'healAoe', color: 0xdfffff, radius: 0.9 },
    revive: { archetype: 'summon', color: 0xfff0a8 },
    reborn: { archetype: 'summon', color: 0xffd45a },
    'hp-share': { archetype: 'heal', color: 0xff9aa6 },
    'sp-gift': { archetype: 'sp', color: 0x6fd3ff },
    'sp-gain': { archetype: 'sp', color: 0x6fd3ff },
    reload: { archetype: 'sp', color: 0xffe066 },
    shield: { archetype: 'shield', color: 0xdfe8ff },
    'cat-shield': { archetype: 'shield', color: 0xffe0a8 },
    'salt-ward': { archetype: 'shield', color: 0xbfeeff },
    shell: { archetype: 'shield', color: 0xc8b890 },
    vest: { archetype: 'shield', color: 0xdfe8ff },
    'sleep-guard': { archetype: 'shield', color: 0xa8b6ff },
    truesilver: { archetype: 'shield', color: 0xfff3b8 },
    'shield-break': { archetype: 'shatter', color: 0xdfe8ff },
    summon: { archetype: 'summon', color: 0x9ff0dc },
    drones: { archetype: 'summon', color: 0x8fe6ff },
    drone: { archetype: 'summon', color: 0x8fe6ff },
    sentry: { archetype: 'summon', color: 0x9ff0dc },
    'turret-online': { archetype: 'summon', color: 0xff8a6a },
    'yanyou-summon': { archetype: 'summon', color: 0xffb347 },
    device: { archetype: 'summon', color: 0xc0c8cc },
    appear: { archetype: 'summon', color: 0xb36bff },
    copy: { archetype: 'summon', color: 0xd8b0ff },
    'manifold-copy': { archetype: 'summon', color: 0xd8b0ff },
    split: { archetype: 'summon', color: 0xff9a6a },
    disappear: { archetype: 'vanish', color: 0xb36bff },
    stealth: { archetype: 'vanish', color: 0x8fa0b0 },
    camouflage: { archetype: 'vanish', color: 0x8fb08f },
    phase: { archetype: 'vanish', color: 0xb36bff },
    substitute: { archetype: 'vanish', color: 0xd8b0ff },
    swap: { archetype: 'blink', color: 0xd8b0ff },
    blink: { archetype: 'blink', color: 0xb36bff },
    teleport: { archetype: 'blink', color: 0xb36bff },
    'doll-end': { archetype: 'none', color: 0xd8b0ff },
    'ulpia-return': { archetype: 'blink', color: 0x9ff0dc },
    'manifold-split': { archetype: 'blink', color: 0xd8b0ff },
    pull: { archetype: 'move', color: 0x9fd4ff },
    push: { archetype: 'move', color: 0xffd9a0 },
    displace: { archetype: 'move', color: 0xd0c0a0 },
    lure: { archetype: 'move', color: 0xffb3ec },
    charge: { archetype: 'move', color: 0xff9c33 },
    dash: { archetype: 'move', color: 0xffd9a0 },
    slippery: { archetype: 'move', color: 0x9fe6ff },
    sonic: { archetype: 'wave', color: 0xc9a2ff, radius: 1.5 },
    pulse: { archetype: 'wave', color: 0x9ff0dc },
    sermon: { archetype: 'wave', color: 0xffe28a, radius: 1.5 },
    ripple: { archetype: 'wave', color: 0x5fe0ff },
    'tornado-pulse': { archetype: 'wave', color: 0xd8e8ff },
    wake: { archetype: 'wave', color: 0x5fe0ff },
    'wolf-shadow': { archetype: 'wave', color: 0x8fa0b0 },
    'wolf-shadow-lost': { archetype: 'vanish', color: 0x8fa0b0 },
    redistribute: { archetype: 'wave', color: 0x62f08a },
    dilemma: { archetype: 'wave', color: 0xc9a2ff },
    taunt: { archetype: 'mark', color: 0xff9c33 },
    palsy: { archetype: 'mark', color: 0xc77dff },
    emergency: { archetype: 'mark', color: 0xff5a4a },
    lock: { archetype: 'reticle', color: 0xff5a4a },
    'drone-lock': { archetype: 'reticle', color: 0x8fe6ff },
    wanted: { archetype: 'reticle', color: 0xffc600 },
    expose: { archetype: 'reticle', color: 0xff7b8a },
    reveal: { archetype: 'reticle', color: 0x9fd4ff },
    anchor: { archetype: 'reticle', color: 0x9fd4ff },
    buff: { archetype: 'buff', color: 0xffd45a },
    overload: { archetype: 'buff', color: 0xff7a33 },
    overclock: { archetype: 'buff', color: 0xff9c33 },
    talent: { archetype: 'buff', color: 0xffd45a },
    knack: { archetype: 'buff', color: 0xffd45a },
    'blood-battle': { archetype: 'buff', color: 0xff4b3e },
    sword: { archetype: 'buff', color: 0xdfe8ff },
    equip: { archetype: 'buff', color: 0x4ed8af },
    'garrison-grant': { archetype: 'buff', color: 0x4ed8af },
    'extra-attack': { archetype: 'buff', color: 0xffe066 },
    soul: { archetype: 'buff', color: 0xb36bff },
    'jungle-soul': { archetype: 'buff', color: 0x7fd37a },
    candle: { archetype: 'buff', color: 0xffb347 },
    mote: { archetype: 'buff', color: 0xfff0a8 },
    ember: { archetype: 'buff', color: 0xff7a33 },
    ignite: { archetype: 'buff', color: 0xff6a2a },
    flame: { archetype: 'buff', color: 0xff6a2a },
    grow: { archetype: 'buff', color: 0x7fd37a },
    'weightless-buff': { archetype: 'buff', color: 0xcfe0ff },
    'yanyou-flame': { archetype: 'flame', color: 0xff8a3d, radius: 1 },
    takeoff: { archetype: 'lift', color: 0xcfe0ff },
    levitate: { archetype: 'lift', color: 0xcfe0ff },
    weightless: { archetype: 'lift', color: 0xcfe0ff },
    sleep: { archetype: 'sleep', color: 0xa8b6ff },
    crit: { archetype: 'crit', color: 0xffe066 },
    dodge: { archetype: 'dodge', color: 0xffffff },
    riposte: { archetype: 'counter', color: 0xffd9a0 },
    counter: { archetype: 'counter', color: 0xffd9a0 },
    block: { archetype: 'counter', color: 0xdfe8ff },
    thorns: { archetype: 'counter', color: 0xff9aa6 },
    downed: { archetype: 'down', color: 0xbfeee2 },
    stone: { archetype: 'down', color: 0xc0b8a8, smoke: 0x5a5448 },
    dp: { archetype: 'dp', color: 0x9fd4ff },
    coin: { archetype: 'coin', color: 0xffc600 },
    steal: { archetype: 'coin', color: 0xffc600 },
    'crate-break': { archetype: 'crate', color: 0xc89a5a },
    'lp-loss': { archetype: 'lp', color: 0xff3b30 },
    'hit-cap': { archetype: 'none', color: 0xffffff },
    'bullet-clear': { archetype: 'wave', color: 0xd8b0ff },
    'logos-lexicon': { archetype: 'mark', color: 0xc9a2ff },
    'logos-execute': { archetype: 'strike', color: 0xb07dff },
    'mantra-arc': { archetype: 'bolt', color: 0xc77dff },
    'mantra-grant': { archetype: 'mark', color: 0xc77dff },
    'mantra-gate': { archetype: 'reticle', color: 0xc77dff },
    'veen-bounce': { archetype: 'counter', color: 0xffd27a },
    'veen-volley': { archetype: 'volley', color: 0xffd27a },
    harpoon: { archetype: 'beam', color: 0xd0c0a0 },
    'arrow-rain': { archetype: 'volley', color: 0xfff2d0 },
    mark: { archetype: 'reticle', color: 0xff7b8a },
    bounce: { archetype: 'counter', color: 0xffd9a0 },
    dying: { archetype: 'mark', color: 0xff5a4a },
    beam: { archetype: 'beam', color: 0xff7a5a },
    link: { archetype: 'beam', color: 0x9ff0dc },
    lightning: { archetype: 'bolt', color: 0xc9a2ff },
    tentacle: { archetype: 'beam', color: 0x5fe0ff },
    'sand-chains': { archetype: 'beam', color: 0xd8c8a0 },
    'sand-chains-charged': { archetype: 'beam', color: 0xffd45a },
    strike: { archetype: 'strike', color: 0xffe6a8 },
    volley: { archetype: 'volley', color: 0xfff2d0 },
    column: { archetype: 'pillar', color: 0x9ff0dc },
    obelisk: { archetype: 'pillar', color: 0xc9a2ff },
    'dusk-dragon': { archetype: 'blast', color: 0x9dff6a, radius: 1.5 },
    'shadow-weave': { archetype: 'vanish', color: 0x8f7bff },
    reweave: { archetype: 'summon', color: 0x8f7bff },
    slash: { archetype: 'counter', color: 0xfff0d0 },
    devour: { archetype: 'vanish', color: 0xff4b3e },
    undying: { archetype: 'shield', color: 0xffd45a },
    'summon-burst': { archetype: 'blast', color: 0xe8c878, smoke: 0x4a3f33 },
    'summon-stun': { archetype: 'blast', color: 0xcfe0ff, smoke: 0x2a2e36 },
    'radiant-sword': { archetype: 'pillar', color: 0xffe8a0 },
    'paper-doll': { archetype: 'blast', color: 0xc9a2ff, smoke: 0x2c2436 },
    'bond-milestone': { archetype: 'buff', color: 0xffc600 },
    'bond-proc': { archetype: 'buff', color: 0x4ed8af },
    'bond-share': { archetype: 'wave', color: 0x4ed8af },
    garrison: { archetype: 'buff', color: 0x4ed8af },
    layer: { archetype: 'buff', color: 0xffe066 },
    sp: { archetype: 'sp', color: 0x6fd3ff },
  });

/** Particles of an archetype: count, life in seconds, speeds in tiles per second, and the lift above the feet. */
export interface OfficialFxBurst {
  readonly count: number;
  readonly life: number;
  readonly speed: number;
  readonly rise?: number;
  readonly gravity?: number;
  readonly size?: number;
  readonly additive?: boolean;
  readonly lift: number;
  /** Drawn only when the beam of the archetype has no two units to join. */
  readonly fallback?: boolean;
}

/** Ground mark of an archetype: real seconds without a cue duration, and a floor for one; radius in tiles. */
export interface OfficialFxZone {
  readonly seconds: number;
  readonly minSeconds?: number;
  readonly radius?: number;
  readonly ring?: boolean;
  readonly blink?: boolean;
}

/** What an archetype draws: particles, a ground mark, a beam between two units, or a mix. */
export interface OfficialFxRecipe {
  readonly burst?: OfficialFxBurst;
  readonly zone?: OfficialFxZone;
  /** Real seconds of the beam. */
  readonly beam?: number;
  /** A screen flash; for a blast or a warning only at `OFFICIAL_FX_SCREEN.radius` and wider, drawn instead of the rest. */
  readonly veil?: { readonly opacity: number; readonly seconds?: number };
  /** Lit tiles: a warning's `tiles`, or a wall's line. */
  readonly tiles?: true;
  /** A blade flying to the point. */
  readonly slash?: true;
  /** Snow over the field, or around its unit. */
  readonly snow?: true;
}

/**
 * Field-wide fx, as master: the radius from which a blast or a warning flashes the screen instead, the cold flash with
 * and without a unit, how far snow spreads, and how far a wall reaches each way without a field to clip it to.
 */
export const OFFICIAL_FX_SCREEN = Object.freeze({
  radius: 12,
  seconds: 0.6,
  chillField: Object.freeze({ opacity: 0.45, seconds: 1 }),
  chillUnit: Object.freeze({ opacity: 0.35, seconds: 0.8 }),
  snowField: 8,
  snowUnit: 3,
  wallReach: 4,
  rows: 18,
  columns: 20,
});

const CHEST = 0.5;
const HEAD = 1.4;

/** The shape each archetype draws, after master's `simFx`. */
export const OFFICIAL_FX_RECIPES: Readonly<
  Record<Exclude<OfficialFxArchetype, 'none'>, OfficialFxRecipe>
> = Object.freeze({
  blast: {
    veil: { opacity: 0.5 },
    zone: { seconds: 0.45 },
    burst: { count: 14, life: 0.5, speed: 2.5, rise: 0.6, lift: 0.3 },
  },
  shell: { zone: { seconds: 1, ring: true, blink: true } },
  qi: { slash: true },
  volley: { burst: { count: 6, life: 0.35, speed: 2.4, lift: CHEST } },
  counter: { burst: { count: 4, life: 0.25, speed: 2.4, lift: CHEST } },
  element: {
    zone: { seconds: 0.55, radius: 1.5, ring: true },
    burst: { count: 12, life: 0.5, speed: 3, lift: CHEST },
  },
  zone: { zone: { seconds: 1.5, minSeconds: 0.6 } },
  wall: { tiles: true, zone: { seconds: 1.5, minSeconds: 0.6, radius: 0.6 } },
  telegraph: {
    veil: { opacity: 0.45 },
    tiles: true,
    zone: { seconds: 1, minSeconds: 0.4, ring: true, blink: true },
  },
  chill: { veil: { opacity: 0.45 }, snow: true },
  heal: { burst: { count: 5, life: 0.7, speed: 0.2, rise: 0.9, lift: CHEST } },
  healAoe: {
    zone: { seconds: 0.6, ring: true },
    burst: { count: 9, life: 0.8, speed: 0.4, rise: 0.9, lift: 0.2 },
  },
  summon: {
    zone: { seconds: 0.5, radius: 0.9, ring: true },
    burst: { count: 8, life: 0.5, speed: 1.4, rise: 0.8, lift: 0.3 },
  },
  sp: { burst: { count: 7, life: 0.7, speed: 0.3, rise: 0.9, lift: CHEST } },
  shield: { burst: { count: 6, life: 0.55, speed: 0.6, lift: CHEST } },
  shatter: {
    burst: {
      count: 12,
      life: 0.55,
      speed: 1.6,
      rise: 0.3,
      gravity: 3,
      lift: CHEST,
    },
  },
  vanish: { burst: { count: 7, life: 0.45, speed: 1.5, lift: CHEST } },
  blink: { burst: { count: 6, life: 0.4, speed: 1.4, lift: CHEST } },
  move: {
    burst: {
      count: 5,
      life: 0.5,
      speed: 0.6,
      rise: 0.2,
      additive: false,
      lift: 0.05,
    },
  },
  wave: { zone: { seconds: 0.7, ring: true } },
  mark: { burst: { count: 3, life: 0.6, speed: 0.2, lift: HEAD } },
  reticle: { zone: { seconds: 0.6, radius: 0.65, ring: true } },
  buff: {
    zone: { seconds: 0.4, radius: 0.75, ring: true },
    burst: { count: 6, life: 0.65, speed: 0.2, rise: 1.2, lift: 0.05 },
  },
  flame: { zone: { seconds: 0.5, minSeconds: 0.2 }, beam: 0.5 },
  lift: {
    zone: { seconds: 0.5, radius: 0.8, ring: true },
    burst: { count: 7, life: 0.4, speed: 0.1, rise: 1.8, lift: 0 },
  },
  sleep: { burst: { count: 3, life: 1, speed: 0.1, rise: 0.5, lift: 1.2 } },
  crit: { burst: { count: 8, life: 0.3, speed: 3.2, lift: CHEST } },
  dodge: { burst: { count: 3, life: 0.22, speed: 1, lift: CHEST } },
  down: { burst: { count: 5, life: 0.5, speed: 1.2, gravity: 2, lift: CHEST } },
  dp: {
    burst: {
      count: 1,
      life: 0.9,
      speed: 0,
      rise: 0.6,
      size: 0.14,
      lift: CHEST,
    },
  },
  coin: {
    burst: {
      count: 4,
      life: 0.7,
      speed: 0.5,
      rise: 1.5,
      gravity: 4,
      additive: false,
      lift: CHEST,
    },
  },
  crate: {
    burst: {
      count: 10,
      life: 0.6,
      speed: 1.1,
      rise: 1.2,
      gravity: 4,
      size: 0.1,
      additive: false,
      lift: 0.35,
    },
  },
  lp: { burst: { count: 6, life: 0.4, speed: 1.5, lift: CHEST } },
  strike: { burst: { count: 8, life: 0.4, speed: 0.2, rise: 2.5, lift: 0 } },
  pillar: { burst: { count: 8, life: 0.4, speed: 0.2, rise: 2.5, lift: 0 } },
  bolt: {
    beam: 0.28,
    burst: {
      count: 8,
      life: 0.4,
      speed: 0.2,
      rise: 2.5,
      lift: 0,
      fallback: true,
    },
  },
  beam: {
    beam: 0.4,
    burst: {
      count: 8,
      life: 0.4,
      speed: 0.2,
      rise: 2.5,
      lift: 0,
      fallback: true,
    },
  },
});

/** An fx anchored on a unit happens there while the cue's x and y are this close to it, as master. */
export const OFFICIAL_FX_ANCHOR_TILES = 0.75;

type OfficialCueKey = `cue:${string}`;
type OfficialCue = MissionCue<OfficialCueKey>;

const numberOf = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const stringOf = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

function specOf(cue: OfficialCue): OfficialFxSpec | undefined {
  const spec = OFFICIAL_FX[cue.key.slice('cue:'.length)];
  return spec && spec.archetype !== 'none' ? spec : undefined;
}

function recipeOf(spec: OfficialFxSpec): OfficialFxRecipe {
  return OFFICIAL_FX_RECIPES[
    spec.archetype as Exclude<OfficialFxArchetype, 'none'>
  ];
}

/** Where a cue's fx happens: on its unit when the cue's point is that unit's spot or missing, else at the point. */
export function officialFxPoint(
  cue: OfficialCue,
  context: MissionEffectContext,
  spec: OfficialFxSpec,
): MissionEffectPoint | undefined {
  const x = numberOf(cue.data.x);
  const y = numberOf(cue.data.y);
  const unit = spec.point ? undefined : actorPoint(context, cue.data.unitId);
  if (
    unit &&
    (x === undefined ||
      y === undefined ||
      Math.hypot(unit.x - x, unit.y - y) <= OFFICIAL_FX_ANCHOR_TILES)
  ) {
    return unit;
  }
  return x !== undefined && y !== undefined ? { x, y, height: 0 } : undefined;
}

const ELEMENT_COLORS: Readonly<Record<string, number>> = {
  burn: 0xff7a33,
  neural: 0xff5ad0,
  necrosis: 0x9dff6a,
  apoptosis: 0x9dff6a,
  erosion: 0x6fe0ff,
};

/** The colour of a cue's fx: the kind's, an element's for a blast, zone or element, and arts purple for an arts blast. */
export function officialFxColor(
  cue: OfficialCue,
  spec: OfficialFxSpec,
): number {
  const element = stringOf(cue.data.element);
  const tinted =
    spec.archetype === 'blast' ||
    spec.archetype === 'zone' ||
    spec.archetype === 'element';
  let color = spec.color;
  if (tinted && element && ELEMENT_COLORS[element] !== undefined) {
    color = ELEMENT_COLORS[element];
  }
  const arts =
    cue.data.dmgType === 'arts' ||
    /arts|magic/i.test(stringOf(cue.data.damageKind) ?? '');
  return arts && spec.archetype === 'blast' ? 0xc77dff : color;
}

const BURST_ID: MissionEffectKindId = 'official-fx:burst';
const TILES_ID: MissionEffectKindId = 'official-fx:tiles';
const VEIL_ID: MissionEffectKindId = 'official-fx:veil';
const SNOW_ID: MissionEffectKindId = 'official-fx:snow';
const SLASH_ID: MissionEffectKindId = 'official-fx:slash';

const radiusOf = (cue: OfficialCue, spec: OfficialFxSpec): number =>
  Math.min(
    30,
    Math.max(
      0.3,
      numberOf(cue.data.r) ?? numberOf(cue.data.radius) ?? spec.radius ?? 1,
    ),
  );

/** Whether a blast or a warning is wide enough to flash the screen instead of drawing on the board. */
const screenWide = (cue: OfficialCue, spec: OfficialFxSpec): boolean =>
  (spec.archetype === 'blast' || spec.archetype === 'telegraph') &&
  radiusOf(cue, spec) >= OFFICIAL_FX_SCREEN.radius;

/** A cold cue without a unit is the field-wide wind. */
const fieldWide = (cue: OfficialCue): boolean =>
  cue.data.unitId === undefined && cue.data.id === undefined;

const gameSeconds = (
  cue: OfficialCue,
  spec: OfficialFxSpec,
): number | undefined =>
  numberOf(cue.data.dur) ??
  numberOf(cue.data.duration) ??
  numberOf(cue.data.t) ??
  spec.seconds;

const realSeconds = (
  cue: OfficialCue,
  spec: OfficialFxSpec,
  context: MissionEffectContext,
  floor: number,
  fallback: number,
): number => {
  const game = gameSeconds(cue, spec);
  return game !== undefined && game > 0
    ? Math.max(floor, game / Math.max(0.25, context.speed))
    : fallback;
};

type Tile = readonly [number, number];

/** The tiles of a warning: its own list, a square for 'box', or a disc of its radius (at most 6 tiles), as master. */
export function officialTilesAround(
  x: number,
  y: number,
  r: number,
  tiles: unknown,
): Tile[] {
  if (Array.isArray(tiles)) {
    return tiles
      .filter(
        (tile): tile is [number, number] =>
          Array.isArray(tile) &&
          Number.isInteger(tile[0]) &&
          Number.isInteger(tile[1]),
      )
      .map((tile): Tile => [tile[0], tile[1]]);
  }
  const row = Math.round(y);
  const column = Math.round(x);
  const reach = Math.max(0, Math.min(6, Math.floor(r)));
  const out: Tile[] = [];
  for (let dr = -reach; dr <= reach; dr += 1) {
    for (let dc = -reach; dc <= reach; dc += 1) {
      if (tiles === 'box' || dr * dr + dc * dc <= r * r + 0.25) {
        out.push([row + dr, column + dc]);
      }
    }
  }
  return out;
}

/**
 * The tiles of a wall through tile (round(y), round(x)) along 'col' or 'row', across the whole `field`; without one,
 * `OFFICIAL_FX_SCREEN.wallReach` each way on the board.
 */
export function officialWallTiles(
  x: number,
  y: number,
  axis: string,
  field: MissionTileRect | null = null,
): Tile[] {
  const row = Math.round(y);
  const column = Math.round(x);
  if (!Number.isFinite(row) || !Number.isFinite(column)) {
    return [];
  }
  const reach = OFFICIAL_FX_SCREEN.wallReach;
  const [first, last] = field
    ? axis === 'row'
      ? [Math.ceil(field.x), Math.ceil(field.x + field.width) - 1]
      : [Math.ceil(field.y), Math.ceil(field.y + field.height) - 1]
    : axis === 'row'
      ? [column - reach, column + reach]
      : [row - reach, row + reach];
  const out: Tile[] = [];
  for (let step = first; step <= last; step += 1) {
    out.push(axis === 'row' ? [row, step] : [step, column]);
  }
  return out.filter(
    ([r, c]) =>
      r >= 0 &&
      r <= OFFICIAL_FX_SCREEN.rows &&
      c >= 0 &&
      c <= OFFICIAL_FX_SCREEN.columns,
  );
}

/** Where snow without a unit falls: the cue's point, the middle of the field, or the middle of the units. */
const fieldPoint = (
  cue: OfficialCue,
  context: MissionEffectContext,
): MissionEffectPoint | undefined => {
  const x = numberOf(cue.data.x);
  const y = numberOf(cue.data.y);
  if (x !== undefined && y !== undefined) {
    return { x, y, height: 0 };
  }
  const field = context.field;
  if (field) {
    return {
      x: field.x + (field.width - 1) / 2,
      y: field.y + (field.height - 1) / 2,
      height: 0,
    };
  }
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const actor of context.actors.values()) {
    sumX += actor.position.x;
    sumY += actor.position.y;
    count += 1;
  }
  return count > 0
    ? { x: sumX / count, y: sumY / count, height: 0 }
    : undefined;
};
const ZONE_ID: MissionEffectKindId = 'official-fx:zone';
const BEAM_ID: MissionEffectKindId = 'official-fx:beam';

const beamEnds = (cue: OfficialCue): { from: string; to: string } | null => {
  const from =
    stringOf(cue.data.from) ?? stringOf(cue.data.src) ?? cue.data.unitId;
  const to = stringOf(cue.data.to) ?? stringOf(cue.data.target);
  return from && to && from !== to ? { from, to } : null;
};

/** The official fx kind ids a cue kind binds to, in drawing order; empty for a kind master draws nothing for. */
export function officialFxEffects(
  kind: string,
): readonly MissionEffectKindId[] {
  const spec = OFFICIAL_FX[kind];
  if (!spec || spec.archetype === 'none') {
    return [];
  }
  const recipe = recipeOf(spec);
  return [
    ...(recipe.zone ? [ZONE_ID] : []),
    ...(recipe.tiles ? [TILES_ID] : []),
    ...(recipe.beam !== undefined ? [BEAM_ID] : []),
    ...(recipe.slash ? [SLASH_ID] : []),
    ...(recipe.burst ? [BURST_ID] : []),
    ...(recipe.snow ? [SNOW_ID] : []),
    ...(recipe.veil ? [VEIL_ID] : []),
  ];
}

/**
 * Registers the official fx kinds in `table`, declares every cue kind of `OFFICIAL_FX` in `bindings` and binds each
 * `cue:<kind>` to the shapes of its archetype, or to nothing for a kind master draws nothing for.
 */
export function installOfficialFx(
  table: MissionEffectTable,
  bindings: MissionCueBindings,
): void {
  const keys = Object.keys(OFFICIAL_FX).map(
    (kind): OfficialCueKey => `cue:${kind}`,
  );
  table.register(
    createZoneKind<OfficialCueKey>({
      id: ZONE_ID,
      accepts: keys,
      zone: (cue, context) => {
        const spec = specOf(cue);
        const zone = spec ? recipeOf(spec).zone : undefined;
        const at =
          spec && zone ? officialFxPoint(cue, context, spec) : undefined;
        if (
          !spec ||
          !zone ||
          !at ||
          screenWide(cue, spec) ||
          (spec.archetype === 'telegraph' && cue.data.tiles)
        ) {
          return null;
        }
        const radius = Math.min(
          30,
          Math.max(
            0.3,
            numberOf(cue.data.r) ??
              numberOf(cue.data.radius) ??
              zone.radius ??
              spec.radius ??
              1,
          ),
        );
        const seconds = realSeconds(
          cue,
          spec,
          context,
          zone.minSeconds ?? 0,
          zone.seconds,
        );
        return {
          at,
          color: officialFxColor(cue, spec),
          radius,
          seconds,
          ...(zone.ring ? { ring: true } : {}),
          ...(zone.blink ? { blink: true } : {}),
        };
      },
    }),
  );
  table.register(
    createBeamKind<OfficialCueKey>({
      id: BEAM_ID,
      accepts: keys,
      beam: (cue) => {
        const spec = specOf(cue);
        const seconds = spec ? recipeOf(spec).beam : undefined;
        const ends = beamEnds(cue);
        return spec && seconds !== undefined && ends
          ? { ...ends, color: spec.color, seconds }
          : null;
      },
    }),
  );
  table.register(
    createBurstKind<OfficialCueKey>({
      id: BURST_ID,
      accepts: keys,
      burst: (cue, context) => {
        const spec = specOf(cue);
        const burst = spec ? recipeOf(spec).burst : undefined;
        if (!spec || !burst || screenWide(cue, spec)) {
          return null;
        }
        if (burst.fallback) {
          const ends = beamEnds(cue);
          if (
            ends &&
            context.actors.has(ends.from) &&
            context.actors.has(ends.to)
          ) {
            return null;
          }
        }
        const at = officialFxPoint(cue, context, spec);
        if (!at) {
          return null;
        }
        return {
          at: { ...at, height: at.height + burst.lift },
          color: officialFxColor(cue, spec),
          count: burst.count,
          life: burst.life,
          speed: burst.speed,
          ...(burst.rise !== undefined ? { rise: burst.rise } : {}),
          ...(burst.gravity !== undefined ? { gravity: burst.gravity } : {}),
          ...(burst.size !== undefined ? { size: burst.size } : {}),
          ...(burst.additive !== undefined ? { additive: burst.additive } : {}),
        };
      },
    }),
  );
  table.register(
    createTilesKind<OfficialCueKey>({
      id: TILES_ID,
      accepts: keys,
      tiles: (cue, context) => {
        const spec = specOf(cue);
        if (!spec || !recipeOf(spec).tiles) {
          return null;
        }
        const color = officialFxColor(cue, spec);
        if (spec.archetype === 'wall') {
          const x = numberOf(cue.data.x);
          const y = numberOf(cue.data.y);
          if (x === undefined || y === undefined) {
            return null;
          }
          return {
            tiles: officialWallTiles(
              x,
              y,
              stringOf(cue.data.axis) ?? 'col',
              context.field,
            ),
            color,
            seconds: realSeconds(cue, spec, context, 0.6, 1.5),
          };
        }
        const at = officialFxPoint(cue, context, spec);
        if (!at || !cue.data.tiles || screenWide(cue, spec)) {
          return null;
        }
        return {
          tiles: officialTilesAround(
            at.x,
            at.y,
            radiusOf(cue, spec),
            cue.data.tiles,
          ),
          color,
          seconds: realSeconds(cue, spec, context, 0.4, 1),
          warn: true,
          height: at.height,
        };
      },
    }),
  );
  table.register(
    createVeilKind<OfficialCueKey>({
      id: VEIL_ID,
      accepts: keys,
      veil: (cue, context) => {
        const spec = specOf(cue);
        const veil = spec ? recipeOf(spec).veil : undefined;
        if (!spec || !veil) {
          return null;
        }
        if (spec.archetype === 'chill') {
          const look = fieldWide(cue)
            ? OFFICIAL_FX_SCREEN.chillField
            : OFFICIAL_FX_SCREEN.chillUnit;
          return { color: spec.color, ...look };
        }
        if (!screenWide(cue, spec)) {
          return null;
        }
        return {
          color: officialFxColor(cue, spec),
          opacity: veil.opacity,
          seconds:
            spec.archetype === 'telegraph'
              ? realSeconds(cue, spec, context, 0.4, 1)
              : OFFICIAL_FX_SCREEN.seconds,
        };
      },
    }),
  );
  table.register(
    createSnowKind<OfficialCueKey>({
      id: SNOW_ID,
      accepts: keys,
      snow: (cue, context) => {
        const spec = specOf(cue);
        if (!spec || !recipeOf(spec).snow) {
          return null;
        }
        const gust = fieldWide(cue);
        const at = gust
          ? fieldPoint(cue, context)
          : (officialFxPoint(cue, context, spec) ??
            actorPoint(context, stringOf(cue.data.id)));
        if (!at) {
          return null;
        }
        return {
          at,
          spread: gust
            ? OFFICIAL_FX_SCREEN.snowField
            : OFFICIAL_FX_SCREEN.snowUnit,
          color: spec.color,
          gust,
        };
      },
    }),
  );
  table.register(
    createSlashKind<OfficialCueKey>({
      id: SLASH_ID,
      accepts: keys,
      slash: (cue, context) => {
        const spec = specOf(cue);
        const at =
          spec?.archetype === 'qi'
            ? officialFxPoint(cue, context, spec)
            : undefined;
        if (!spec || !at) {
          return null;
        }
        const height = at.height + 0.35;
        const fromX = numberOf(cue.data.fromX);
        const fromY = numberOf(cue.data.fromY);
        const dr = numberOf(cue.data.dr);
        const dc = numberOf(cue.data.dc);
        return {
          to: { ...at, height },
          ...(fromX !== undefined && fromY !== undefined
            ? { from: { x: fromX, y: fromY, height } }
            : {}),
          ...(dr !== undefined && dc !== undefined && (dr !== 0 || dc !== 0)
            ? { direction: { x: dc, y: dr } }
            : {}),
          color: officialFxColor(cue, spec),
        };
      },
    }),
  );
  bindings.declare(...Object.keys(OFFICIAL_FX));
  for (const kind of Object.keys(OFFICIAL_FX)) {
    const effects = officialFxEffects(kind);
    bindings.bind(`cue:${kind}`, {
      effect: effects.length > 0 ? effects : null,
      sound: null,
    });
  }
}

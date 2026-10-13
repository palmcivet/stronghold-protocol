import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  RingGeometry,
  Sprite,
  SpriteMaterial,
} from 'three';
import type {
  MissionCue,
  MissionCueKey,
  MissionEffectKindId,
} from '#contract/cue.js';
import type { MissionEffectContext, MissionEffectKind } from '#effect/table.js';

/** A point in board space: column, row and height above the ground, in tiles. */
export interface MissionEffectPoint {
  readonly x: number;
  readonly y: number;
  readonly height: number;
}

/** Height above a unit's feet that effects on its body aim at, in tiles. */
export const MISSION_EFFECT_CHEST = 0.5;

/** Where a unit's model stands, lifted by its hover; undefined when the unit has no actor. */
export function actorPoint(
  context: MissionEffectContext,
  unitId: string | undefined,
  lift = 0,
): MissionEffectPoint | undefined {
  const actor = unitId === undefined ? undefined : context.actors.get(unitId);
  if (!actor) {
    return undefined;
  }
  return {
    x: actor.position.x,
    y: actor.position.y,
    height: actor.position.height + (actor.appearance?.hover ?? 0) + lift,
  };
}

const place = (
  object: { position: { set(x: number, y: number, z: number): unknown } },
  point: MissionEffectPoint,
): void => {
  object.position.set(point.x, point.height, -point.y);
};

// MARK: burst

/** A burst of particles flying out of a point. */
export interface MissionBurst {
  readonly at: MissionEffectPoint;
  readonly color: number;
  readonly count: number;
  /** Seconds each particle lives. */
  readonly life: number;
  /** Tiles per second outwards. */
  readonly speed: number;
  /** Tiles per second upwards at the start. */
  readonly rise?: number;
  /** Tiles per second squared downwards. */
  readonly gravity?: number;
  /** Particle size, in tiles. */
  readonly size?: number;
  /** Draws over what is behind it, adding light; false for solid debris and smoke. */
  readonly additive?: boolean;
}

export interface MissionBurstOptions<K extends MissionCueKey> {
  readonly id: MissionEffectKindId;
  readonly accepts: readonly K[];
  /** The burst a cue starts, or null when it draws nothing. */
  readonly burst: (
    cue: MissionCue<K>,
    context: MissionEffectContext,
  ) => MissionBurst | null;
  /** Most particles one burst draws. Defaults to 16. */
  readonly max?: number;
}

interface Particle {
  readonly sprite: Sprite;
  vx: number;
  vy: number;
  vz: number;
}

interface BurstInstance {
  readonly group: Group;
  readonly particles: Particle[];
  used: number;
  age: number;
  life: number;
  gravity: number;
}

/** An effect kind throwing particles out of a point; they fall under gravity and fade over their life. */
export function createBurstKind<K extends MissionCueKey>(
  options: MissionBurstOptions<K>,
): MissionEffectKind<K, BurstInstance> {
  const max = options.max ?? 16;
  return {
    id: options.id,
    accepts: options.accepts,
    create() {
      const group = new Group();
      group.renderOrder = 6;
      return { group, particles: [], used: 0, age: 0, life: 1, gravity: 0 };
    },
    start(burst, cue, context) {
      const spec = options.burst(cue, context);
      if (!spec || !(spec.count > 0) || !(spec.life > 0)) {
        return false;
      }
      burst.used = Math.min(max, Math.round(spec.count));
      burst.age = 0;
      burst.life = spec.life;
      burst.gravity = spec.gravity ?? 0;
      while (burst.particles.length < burst.used) {
        const sprite = new Sprite(
          new SpriteMaterial({ transparent: true, depthWrite: false }),
        );
        burst.group.add(sprite);
        burst.particles.push({ sprite, vx: 0, vy: 0, vz: 0 });
      }
      const size = spec.size ?? 0.08;
      burst.particles.forEach((particle, index) => {
        const shown = index < burst.used;
        particle.sprite.visible = shown;
        if (!shown) {
          return;
        }
        const angle = (index / burst.used) * Math.PI * 2 + Math.random() * 0.6;
        const speed = spec.speed * (0.6 + Math.random() * 0.4);
        particle.vx = Math.cos(angle) * speed;
        particle.vz = Math.sin(angle) * speed;
        particle.vy = (spec.rise ?? 0) + Math.random() * spec.speed * 0.3;
        const material = particle.sprite.material;
        material.color.setHex(spec.color);
        material.opacity = 1;
        material.blending =
          spec.additive === false ? NormalBlending : AdditiveBlending;
        particle.sprite.position.set(0, 0, 0);
        particle.sprite.scale.set(size, size, 1);
      });
      place(burst.group, spec.at);
      context.layer.add(burst.group);
      return true;
    },
    update(burst, deltaSeconds) {
      burst.age += deltaSeconds;
      const fade = Math.max(0, 1 - burst.age / burst.life);
      for (let index = 0; index < burst.used; index += 1) {
        const particle = burst.particles[index];
        if (!particle) {
          continue;
        }
        particle.vy -= burst.gravity * deltaSeconds;
        const position = particle.sprite.position;
        position.x += particle.vx * deltaSeconds;
        position.y += particle.vy * deltaSeconds;
        position.z += particle.vz * deltaSeconds;
        particle.sprite.material.opacity = fade;
      }
      return burst.age < burst.life;
    },
    end(burst, context) {
      context.layer.remove(burst.group);
    },
    dispose(burst) {
      for (const particle of burst.particles) {
        particle.sprite.material.dispose();
      }
    },
  };
}

// MARK: zone

/** A disc or ring on the ground, held for its seconds. */
export interface MissionZone {
  readonly at: MissionEffectPoint;
  readonly color: number;
  /** Tiles. */
  readonly radius: number;
  /** Real seconds it shows, its fade in and out included. */
  readonly seconds: number;
  /** A ring outline instead of a filled disc. */
  readonly ring?: boolean;
  /** Blinks four times a second, as a warning. */
  readonly blink?: boolean;
}

export interface MissionZoneOptions<K extends MissionCueKey> {
  readonly id: MissionEffectKindId;
  readonly accepts: readonly K[];
  readonly zone: (
    cue: MissionCue<K>,
    context: MissionEffectContext,
  ) => MissionZone | null;
}

interface ZoneInstance {
  readonly disc: Mesh<CircleGeometry, MeshBasicMaterial>;
  readonly ring: Mesh<RingGeometry, MeshBasicMaterial>;
  shown: Mesh<CircleGeometry | RingGeometry, MeshBasicMaterial>;
  age: number;
  seconds: number;
  blink: boolean;
}

/** Seconds a zone takes to fade in, and again to fade out. */
export const MISSION_ZONE_FADE_SECONDS = 0.2;

/** Opacity of a zone at full strength. */
export const MISSION_ZONE_OPACITY = 0.35;

const DISC = new CircleGeometry(1, 40);
const RING = new RingGeometry(0.9, 1, 48);

/** An effect kind laying a disc or a ring on the ground for a while, as master's zones and warnings. */
export function createZoneKind<K extends MissionCueKey>(
  options: MissionZoneOptions<K>,
): MissionEffectKind<K, ZoneInstance> {
  const material = (): MeshBasicMaterial =>
    new MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
  const strength = (zone: ZoneInstance): number => {
    const fade = MISSION_ZONE_FADE_SECONDS;
    const edge = Math.min(1, zone.age / fade, (zone.seconds - zone.age) / fade);
    const blink = zone.blink ? 0.5 + 0.5 * Math.cos(zone.age * Math.PI * 8) : 1;
    return Math.max(0, edge) * blink * MISSION_ZONE_OPACITY;
  };
  return {
    id: options.id,
    accepts: options.accepts,
    create() {
      const disc = new Mesh(DISC, material());
      const ring = new Mesh(RING, material());
      for (const mesh of [disc, ring]) {
        mesh.rotation.x = -Math.PI / 2;
        mesh.renderOrder = 4;
      }
      return { disc, ring, shown: disc, age: 0, seconds: 1, blink: false };
    },
    start(zone, cue, context) {
      const spec = options.zone(cue, context);
      if (!spec || !(spec.seconds > 0) || !(spec.radius > 0)) {
        return false;
      }
      zone.shown = spec.ring ? zone.ring : zone.disc;
      zone.age = 0;
      zone.seconds = spec.seconds;
      zone.blink = spec.blink === true;
      zone.shown.material.color.setHex(spec.color);
      zone.shown.scale.set(spec.radius, spec.radius, 1);
      place(zone.shown, { ...spec.at, height: spec.at.height + 0.015 });
      zone.shown.material.opacity = strength(zone);
      context.layer.add(zone.shown);
      return true;
    },
    update(zone, deltaSeconds) {
      zone.age += deltaSeconds;
      zone.shown.material.opacity = strength(zone);
      return zone.age < zone.seconds;
    },
    end(zone, context) {
      context.layer.remove(zone.shown);
    },
    dispose(zone) {
      zone.disc.material.dispose();
      zone.ring.material.dispose();
    },
  };
}

// MARK: beam

/** A beam between two units, following them while it shows. */
export interface MissionBeam {
  readonly from: string;
  readonly to: string;
  readonly color: number;
  /** Real seconds; it fades over the whole of them. */
  readonly seconds: number;
  /** Tiles. Defaults to 0.06. */
  readonly width?: number;
}

export interface MissionBeamOptions<K extends MissionCueKey> {
  readonly id: MissionEffectKindId;
  readonly accepts: readonly K[];
  readonly beam: (
    cue: MissionCue<K>,
    context: MissionEffectContext,
  ) => MissionBeam | null;
}

interface BeamInstance {
  readonly mesh: Mesh<BoxGeometry, MeshBasicMaterial>;
  from: string;
  to: string;
  width: number;
  age: number;
  seconds: number;
}

const BOX = new BoxGeometry(1, 1, 1);

function stretch(beam: BeamInstance, context: MissionEffectContext): boolean {
  const a = actorPoint(context, beam.from, MISSION_EFFECT_CHEST);
  const b = actorPoint(context, beam.to, MISSION_EFFECT_CHEST);
  if (!a || !b) {
    return false;
  }
  const dx = b.x - a.x;
  const dy = b.height - a.height;
  const dz = -(b.y - a.y);
  const length = Math.hypot(dx, dy, dz);
  if (!(length > 0)) {
    return false;
  }
  beam.mesh.position.set(
    (a.x + b.x) / 2,
    (a.height + b.height) / 2,
    -(a.y + b.y) / 2,
  );
  beam.mesh.scale.set(length, beam.width, beam.width);
  beam.mesh.rotation.set(
    0,
    Math.atan2(-dz, dx),
    Math.atan2(dy, Math.hypot(dx, dz)),
  );
  return true;
}

/** An effect kind drawing a beam from one unit to another, as master's beams, chains and bolts. */
export function createBeamKind<K extends MissionCueKey>(
  options: MissionBeamOptions<K>,
): MissionEffectKind<K, BeamInstance> {
  return {
    id: options.id,
    accepts: options.accepts,
    create() {
      const mesh = new Mesh(
        BOX,
        new MeshBasicMaterial({
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
        }),
      );
      mesh.renderOrder = 7;
      return { mesh, from: '', to: '', width: 0.06, age: 0, seconds: 1 };
    },
    start(beam, cue, context) {
      const spec = options.beam(cue, context);
      if (!spec || !(spec.seconds > 0) || spec.from === spec.to) {
        return false;
      }
      beam.from = spec.from;
      beam.to = spec.to;
      beam.width = spec.width ?? 0.06;
      beam.age = 0;
      beam.seconds = spec.seconds;
      beam.mesh.material.color.setHex(spec.color);
      beam.mesh.material.opacity = 1;
      if (!stretch(beam, context)) {
        return false;
      }
      context.layer.add(beam.mesh);
      return true;
    },
    update(beam, deltaSeconds, context) {
      beam.age += deltaSeconds;
      beam.mesh.material.opacity = Math.max(0, 1 - beam.age / beam.seconds);
      return beam.age < beam.seconds && stretch(beam, context);
    },
    end(beam, context) {
      context.layer.remove(beam.mesh);
    },
    dispose(beam) {
      beam.mesh.material.dispose();
    },
  };
}

// MARK: projectile

/** Projectile flight, as master's default: tiles per game second, and the size and life of the glowing head. */
export const MISSION_PROJECTILE = Object.freeze({
  speed: 12,
  size: 0.14,
  maxSeconds: 3,
});

export interface MissionProjectileOptions {
  readonly id?: MissionEffectKindId;
  readonly color?: number;
  /** Tiles per game second. Defaults to `MISSION_PROJECTILE.speed`. */
  readonly speed?: number;
}

interface ProjectileInstance {
  readonly head: Sprite;
  readonly trail: Sprite;
  sourceX: number;
  sourceY: number;
  sourceHeight: number;
  target: string;
  age: number;
  travelled: number;
  speed: number;
}

/**
 * An effect kind flying a glowing shot from the shooter's chest to its target's, as master's tracers. It follows a
 * moving target and lands when it reaches it, or when the target is gone.
 */
export function createProjectileKind(
  options: MissionProjectileOptions = {},
): MissionEffectKind<'projectile', ProjectileInstance> {
  const color = options.color ?? 0xfff2d0;
  const sprite = (size: number, opacity: number): Sprite => {
    const made = new Sprite(
      new SpriteMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    made.scale.set(size, size, 1);
    made.renderOrder = 8;
    return made;
  };
  const fly = (
    shot: ProjectileInstance,
    context: MissionEffectContext,
  ): boolean => {
    const to = actorPoint(context, shot.target, MISSION_EFFECT_CHEST);
    if (!to) {
      return false;
    }
    const dx = to.x - shot.sourceX;
    const dy = to.y - shot.sourceY;
    const dh = to.height - shot.sourceHeight;
    const length = Math.hypot(dx, dy, dh);
    const t = length > 0 ? Math.min(1, shot.travelled / length) : 1;
    const at = (u: number): MissionEffectPoint => ({
      x: shot.sourceX + dx * u,
      y: shot.sourceY + dy * u,
      height: shot.sourceHeight + dh * u,
    });
    place(shot.head, at(t));
    place(shot.trail, at(Math.max(0, t - 0.08)));
    return t < 1;
  };
  return {
    id: options.id ?? 'mission:projectile',
    accepts: ['projectile'],
    create() {
      return {
        head: sprite(MISSION_PROJECTILE.size, 1),
        trail: sprite(MISSION_PROJECTILE.size * 0.7, 0.5),
        sourceX: 0,
        sourceY: 0,
        sourceHeight: 0,
        target: '',
        age: 0,
        travelled: 0,
        speed: options.speed ?? MISSION_PROJECTILE.speed,
      };
    },
    start(shot, cue, context) {
      const from = actorPoint(context, cue.data.sourceId, MISSION_EFFECT_CHEST);
      if (!from) {
        return false;
      }
      shot.sourceX = from.x;
      shot.sourceY = from.y;
      shot.sourceHeight = from.height;
      shot.target = cue.data.targetId;
      shot.age = 0;
      shot.travelled = 0;
      if (!fly(shot, context)) {
        return false;
      }
      context.layer.add(shot.head, shot.trail);
      return true;
    },
    update(shot, deltaSeconds, context) {
      shot.age += deltaSeconds;
      shot.travelled += shot.speed * context.speed * deltaSeconds;
      return shot.age < MISSION_PROJECTILE.maxSeconds && fly(shot, context);
    },
    end(shot, context) {
      context.layer.remove(shot.head, shot.trail);
    },
    dispose(shot) {
      shot.head.material.dispose();
      shot.trail.material.dispose();
    },
  };
}

// MARK: tiles

/** Board tiles lit up for a while, as master's fire walls and tile warnings. */
export interface MissionTiles {
  /** [row, column] pairs. */
  readonly tiles: readonly (readonly [number, number])[];
  readonly color: number;
  /** Real seconds, at least `MISSION_TILES.minSeconds`. */
  readonly seconds: number;
  /** Pulses as a warning instead of fading out. */
  readonly warn?: boolean;
  /** Height of the tiles' tops, in tiles. Defaults to 0. */
  readonly height?: number;
}

export interface MissionTilesOptions<K extends MissionCueKey> {
  readonly id: MissionEffectKindId;
  readonly accepts: readonly K[];
  readonly tiles: (
    cue: MissionCue<K>,
    context: MissionEffectContext,
  ) => MissionTiles | null;
}

/** Tile flashes, as master: most tiles one flash lights, the shortest flash, the tile size and the opacities. */
export const MISSION_TILES = Object.freeze({
  max: 80,
  minSeconds: 0.2,
  size: 0.92,
  fade: 0.55,
  warnBase: 0.35,
  warnPulse: 0.35,
  warnRate: 7,
  tail: 0.15,
});

interface TilesInstance {
  readonly group: Group;
  readonly meshes: Mesh<PlaneGeometry, MeshBasicMaterial>[];
  readonly material: MeshBasicMaterial;
  age: number;
  seconds: number;
  warn: boolean;
}

const TILE = new PlaneGeometry(MISSION_TILES.size, MISSION_TILES.size);

/** Opacity of a tile flash `age` seconds into its `seconds`, as master's tile flashes. */
export function tilesOpacity(
  age: number,
  seconds: number,
  warn: boolean,
): number {
  const k = age / seconds;
  if (k >= 1) {
    return 0;
  }
  const base = warn
    ? MISSION_TILES.warnBase +
      MISSION_TILES.warnPulse * Math.abs(Math.sin(age * MISSION_TILES.warnRate))
    : MISSION_TILES.fade * (1 - k);
  const tail = 1 - MISSION_TILES.tail;
  return base * (k > tail ? (1 - k) / MISSION_TILES.tail : 1);
}

/** An effect kind lighting a set of board tiles, fading out or pulsing as a warning. */
export function createTilesKind<K extends MissionCueKey>(
  options: MissionTilesOptions<K>,
): MissionEffectKind<K, TilesInstance> {
  return {
    id: options.id,
    accepts: options.accepts,
    create() {
      const group = new Group();
      group.renderOrder = 4;
      const material = new MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      return { group, meshes: [], material, age: 0, seconds: 1, warn: false };
    },
    start(flash, cue, context) {
      const spec = options.tiles(cue, context);
      const tiles = spec ? spec.tiles.slice(0, MISSION_TILES.max) : [];
      if (!spec || tiles.length === 0 || !(spec.seconds > 0)) {
        return false;
      }
      flash.age = 0;
      flash.seconds = Math.max(MISSION_TILES.minSeconds, spec.seconds);
      flash.warn = spec.warn === true;
      flash.material.color.setHex(spec.color);
      flash.material.opacity = tilesOpacity(0, flash.seconds, flash.warn);
      while (flash.meshes.length < tiles.length) {
        const mesh = new Mesh(TILE, flash.material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.renderOrder = 4;
        flash.group.add(mesh);
        flash.meshes.push(mesh);
      }
      flash.meshes.forEach((mesh, index) => {
        const tile = tiles[index];
        mesh.visible = tile !== undefined;
        if (tile) {
          mesh.position.set(tile[1], (spec.height ?? 0) + 0.015, -tile[0]);
        }
      });
      context.layer.add(flash.group);
      return true;
    },
    update(flash, deltaSeconds) {
      flash.age += deltaSeconds;
      flash.material.opacity = tilesOpacity(
        flash.age,
        flash.seconds,
        flash.warn,
      );
      return flash.age < flash.seconds;
    },
    end(flash, context) {
      context.layer.remove(flash.group);
    },
    dispose(flash) {
      flash.material.dispose();
    },
  };
}

// MARK: veil

/** A tint over the whole view that fades out, as master's screen flashes. */
export interface MissionVeil {
  readonly color: number;
  /** Opacity at the start. */
  readonly opacity: number;
  /** Real seconds it fades over. */
  readonly seconds: number;
}

export interface MissionVeilOptions<K extends MissionCueKey> {
  readonly id: MissionEffectKindId;
  readonly accepts: readonly K[];
  readonly veil: (
    cue: MissionCue<K>,
    context: MissionEffectContext,
  ) => MissionVeil | null;
}

/** Tiles the veil reaches from the board's middle; far past any board, so it covers the view. */
export const MISSION_VEIL_RADIUS = 200;

interface VeilInstance {
  readonly mesh: Mesh<CircleGeometry, MeshBasicMaterial>;
  opacity: number;
  age: number;
  seconds: number;
}

/** An effect kind tinting everything in view, drawn over the board and the actors, fading out over its seconds. */
export function createVeilKind<K extends MissionCueKey>(
  options: MissionVeilOptions<K>,
): MissionEffectKind<K, VeilInstance> {
  return {
    id: options.id,
    accepts: options.accepts,
    create() {
      const mesh = new Mesh(
        DISC,
        new MeshBasicMaterial({
          transparent: true,
          depthWrite: false,
          depthTest: false,
          blending: AdditiveBlending,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(MISSION_VEIL_RADIUS, MISSION_VEIL_RADIUS, 1);
      mesh.renderOrder = 20;
      return { mesh, opacity: 0, age: 0, seconds: 1 };
    },
    start(veil, cue, context) {
      const spec = options.veil(cue, context);
      if (!spec || !(spec.seconds > 0) || !(spec.opacity > 0)) {
        return false;
      }
      veil.age = 0;
      veil.seconds = spec.seconds;
      veil.opacity = Math.min(1, spec.opacity);
      veil.mesh.material.color.setHex(spec.color);
      veil.mesh.material.opacity = veil.opacity;
      context.layer.add(veil.mesh);
      return true;
    },
    update(veil, deltaSeconds) {
      veil.age += deltaSeconds;
      veil.mesh.material.opacity =
        veil.opacity * Math.max(0, 1 - veil.age / veil.seconds);
      return veil.age < veil.seconds;
    },
    end(veil, context) {
      context.layer.remove(veil.mesh);
    },
    dispose(veil) {
      veil.mesh.material.dispose();
    },
  };
}

// MARK: snow

/** Snow over an area: a light flurry drifting down, or a gust of flakes blown up the board. */
export interface MissionSnow {
  readonly at: MissionEffectPoint;
  /** Tiles from `at` the flakes start within. */
  readonly spread: number;
  readonly color: number;
  /** Blown up the board, towards higher rows, instead of drifting down. */
  readonly gust?: boolean;
}

export interface MissionSnowOptions<K extends MissionCueKey> {
  readonly id: MissionEffectKindId;
  readonly accepts: readonly K[];
  readonly snow: (
    cue: MissionCue<K>,
    context: MissionEffectContext,
  ) => MissionSnow | null;
}

/** Snow, as master's flurry and gust: flake counts, lives in seconds, speeds in tiles per second, and sizes in tiles. */
export const MISSION_SNOW = Object.freeze({
  flurry: Object.freeze({
    count: 26,
    life: 1.3,
    fall: 0.9,
    drift: 0.5,
    size: 0.06,
    height: 2.5,
  }),
  gust: Object.freeze({
    count: 48,
    life: 1.8,
    rise: 7,
    drift: 1.2,
    size: 0.06,
    height: 0.8,
  }),
});

interface Flake {
  readonly sprite: Sprite;
  vx: number;
  vh: number;
  vz: number;
  life: number;
}

interface SnowInstance {
  readonly group: Group;
  readonly flakes: Flake[];
  used: number;
  age: number;
}

/** An effect kind blowing snowflakes over an area; each fades over its own life. */
export function createSnowKind<K extends MissionCueKey>(
  options: MissionSnowOptions<K>,
): MissionEffectKind<K, SnowInstance> {
  return {
    id: options.id,
    accepts: options.accepts,
    create() {
      const group = new Group();
      group.renderOrder = 9;
      return { group, flakes: [], used: 0, age: 0 };
    },
    start(snow, cue, context) {
      const spec = options.snow(cue, context);
      if (!spec || !(spec.spread > 0)) {
        return false;
      }
      const look = spec.gust ? MISSION_SNOW.gust : MISSION_SNOW.flurry;
      snow.used = look.count;
      snow.age = 0;
      while (snow.flakes.length < snow.used) {
        const sprite = new Sprite(
          new SpriteMaterial({
            transparent: true,
            depthWrite: false,
            blending: AdditiveBlending,
          }),
        );
        snow.group.add(sprite);
        snow.flakes.push({ sprite, vx: 0, vh: 0, vz: 0, life: 1 });
      }
      snow.flakes.forEach((flake, index) => {
        const shown = index < snow.used;
        flake.sprite.visible = shown;
        if (!shown) {
          return;
        }
        const x = (Math.random() * 2 - 1) * spec.spread;
        const y = (Math.random() * 2 - 1) * spec.spread;
        const height = Math.random() * look.height;
        flake.sprite.position.set(x, height, -y);
        flake.life = look.life * (0.7 + Math.random() * 0.6);
        flake.vx = look.drift * (0.5 + Math.random());
        if (spec.gust) {
          flake.vh = 0;
          flake.vz = -MISSION_SNOW.gust.rise * (0.6 + Math.random() * 0.6);
        } else {
          flake.vh = -MISSION_SNOW.flurry.fall * (0.7 + Math.random() * 0.6);
          flake.vz = 0;
        }
        const size = look.size * (0.6 + Math.random() * 0.8);
        flake.sprite.scale.set(size, size, 1);
        flake.sprite.material.color.setHex(spec.color);
        flake.sprite.material.opacity = 0.9;
      });
      place(snow.group, spec.at);
      context.layer.add(snow.group);
      return true;
    },
    update(snow, deltaSeconds) {
      snow.age += deltaSeconds;
      let alive = false;
      for (let index = 0; index < snow.used; index += 1) {
        const flake = snow.flakes[index];
        if (!flake) {
          continue;
        }
        const position = flake.sprite.position;
        position.x += flake.vx * deltaSeconds;
        position.y = Math.max(0, position.y + flake.vh * deltaSeconds);
        position.z += flake.vz * deltaSeconds;
        const left = 1 - snow.age / flake.life;
        flake.sprite.material.opacity = 0.9 * Math.max(0, left);
        alive ||= left > 0;
      }
      return alive;
    },
    end(snow, context) {
      context.layer.remove(snow.group);
    },
    dispose(snow) {
      for (const flake of snow.flakes) {
        flake.sprite.material.dispose();
      }
    },
  };
}

// MARK: slash

/** A blade flying to a point: a streak from where it started and a crescent at its head, turned along its travel. */
export interface MissionSlash {
  readonly to: MissionEffectPoint;
  /** Where the streak starts; no streak without it. */
  readonly from?: MissionEffectPoint;
  /** Board direction (columns, rows) the crescent bulges towards; facing +x without it. */
  readonly direction?: { readonly x: number; readonly y: number };
  readonly color: number;
}

export interface MissionSlashOptions<K extends MissionCueKey> {
  readonly id: MissionEffectKindId;
  readonly accepts: readonly K[];
  readonly slash: (
    cue: MissionCue<K>,
    context: MissionEffectContext,
  ) => MissionSlash | null;
}

/** A slash, as master's qi: lives in seconds, the crescent's radius growing from `from` to `to`, widths in tiles. */
export const MISSION_SLASH = Object.freeze({
  streakSeconds: 0.34,
  headSeconds: 0.3,
  from: 0.5,
  to: 0.78,
  streakWidth: 0.08,
});

interface SlashInstance {
  readonly streak: Mesh<BoxGeometry, MeshBasicMaterial>;
  readonly head: Mesh<RingGeometry, MeshBasicMaterial>;
  streaked: boolean;
  age: number;
}

const CRESCENT = new RingGeometry(0.7, 1, 24, 1, -Math.PI / 2, Math.PI);

/** An effect kind flying a blade to a point: a fading streak behind it and a growing crescent at its head. */
export function createSlashKind<K extends MissionCueKey>(
  options: MissionSlashOptions<K>,
): MissionEffectKind<K, SlashInstance> {
  const material = (): MeshBasicMaterial =>
    new MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
  return {
    id: options.id,
    accepts: options.accepts,
    create() {
      const streak = new Mesh(BOX, material());
      const head = new Mesh(CRESCENT, material());
      head.renderOrder = 7;
      streak.renderOrder = 7;
      return { streak, head, streaked: false, age: 0 };
    },
    start(slash, cue, context) {
      const spec = options.slash(cue, context);
      if (!spec) {
        return false;
      }
      slash.age = 0;
      slash.head.material.color.setHex(spec.color);
      slash.head.material.opacity = 0.9;
      place(slash.head, spec.to);
      const direction = spec.direction ?? { x: 1, y: 0 };
      slash.head.rotation.set(
        -Math.PI / 2,
        0,
        Math.atan2(direction.y, direction.x),
      );
      slash.head.scale.setScalar(MISSION_SLASH.from);
      context.layer.add(slash.head);
      const from = spec.from;
      const length = from
        ? Math.hypot(spec.to.x - from.x, spec.to.y - from.y)
        : 0;
      slash.streaked = from !== undefined && length > 0;
      if (from && slash.streaked) {
        slash.streak.material.color.setHex(spec.color);
        slash.streak.material.opacity = 0.8;
        place(slash.streak, {
          x: (from.x + spec.to.x) / 2,
          y: (from.y + spec.to.y) / 2,
          height: spec.to.height,
        });
        slash.streak.scale.set(length, 0.01, MISSION_SLASH.streakWidth);
        slash.streak.rotation.set(
          0,
          Math.atan2(spec.to.y - from.y, spec.to.x - from.x),
          0,
        );
        context.layer.add(slash.streak);
      }
      return true;
    },
    update(slash, deltaSeconds) {
      slash.age += deltaSeconds;
      const head = Math.min(1, slash.age / MISSION_SLASH.headSeconds);
      slash.head.scale.setScalar(
        MISSION_SLASH.from + (MISSION_SLASH.to - MISSION_SLASH.from) * head,
      );
      slash.head.material.opacity = 0.9 * (1 - head);
      const streak = Math.min(1, slash.age / MISSION_SLASH.streakSeconds);
      slash.streak.material.opacity = 0.8 * (1 - streak);
      slash.streak.scale.z = MISSION_SLASH.streakWidth * (1 - 0.5 * streak);
      return head < 1 || (slash.streaked && streak < 1);
    },
    end(slash, context) {
      context.layer.remove(slash.head, slash.streak);
    },
    dispose(slash) {
      slash.head.material.dispose();
      slash.streak.material.dispose();
    },
  };
}

import type { UnitSnapshot } from 'arknights-mission-core';
import {
  AdditiveBlending,
  type BufferGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  type Texture,
} from 'three';
import type { ActorFrame, MissionActorWorld } from '#actor/entity/index.js';
import {
  hudReadoutsOf,
  type MissionHudReaderTable,
  type MissionHudReadouts,
} from '#actor/hud/readout.js';
import {
  defaultDigitTexture,
  MISSION_HUD_FRAMES,
  MISSION_HUD_ICONS,
  type MissionHudStyle,
} from '#actor/hud/style.js';
import type { ViewSystem } from '#runtime/stage/loop.js';

/** Bar size and height above the unit's position, in tiles. */
export const MISSION_HUD_BAR = Object.freeze({
  width: 0.8,
  height: 0.08,
  lift: 1.25,
});

const COLORS = Object.freeze({
  back: 0x1a1a1a,
  ally: 0x3fa9f5,
  enemy: 0xe5484d,
  shield: 0xf2f2f2,
  negative: 0xd02020,
  magazine: 0xf5c542,
  pip: 0xb48cff,
  ghost: 0xf5e6c8,
  ringTrack: 0x202020,
  ring: 0x4ed8af,
  sp: 0x6fd3ff,
  spReady: 0xffe066,
  spActive: 0xffb347,
});

/**
 * Skill bar under the health bar, as master draws it: height and gap in bar heights, and the ready glow's side in SP
 * bar heights with its pulse, opacity = base + swing · sin(speed · t).
 */
export const MISSION_HUD_SP = Object.freeze({
  height: 0.6,
  gap: 0.2,
  glow: 5,
  pulse: Object.freeze({ base: 0.55, swing: 0.35, speed: 6 }),
});

/**
 * Bar shake after a health loss: offset = sin(speed · t) · seconds left · amplitude, in tiles. Master shakes by 10 px
 * per second left; the tile amplitude assumes master's bar of a 64 px tile.
 */
export const MISSION_HUD_SHAKE = Object.freeze({ speed: 90, amplitude: 0.16 });

/** State of a unit's skill bar: charging, full and waiting, or running. */
export type MissionHudSpState = 'charging' | 'ready' | 'active';

/** Share of the maximum health the ghost bar drains per second. */
export const MISSION_HUD_GHOST_DRAIN = 0.9;

/** Redeploy ring: radii and height above the unit, in tiles, and the arc's steps around the circle. */
export const MISSION_HUD_RING = Object.freeze({
  inner: 0.16,
  outer: 0.22,
  lift: 1.02,
  steps: 64,
  digit: 0.12,
});

/** Status icon side and gap, in tiles. */
const ICON = Object.freeze({ size: 0.14, gap: 0.03 });
/** Frame border around the bar, in bar heights. */
const FRAME = 0.6;

/** Pip size and gap, in bar heights; dim pips are spent. */
const PIP = Object.freeze({ size: 1.2, gap: 0.5, dim: 0.3 });

interface Bar {
  readonly group: Group;
  readonly back: Mesh;
  readonly frame: Mesh;
  readonly ghost: Mesh;
  readonly icons: Group;
  readonly hp: Mesh;
  readonly shield: Mesh;
  readonly negative: Mesh;
  readonly magazine: Mesh;
  readonly sp: Mesh;
  readonly glow: Mesh;
  readonly pips: Group;
}

export interface MissionHudLayer {
  /** Parent of every bar, in scene space; not scaled or mirrored with the models. */
  readonly layer: Group;
  readonly system: ViewSystem<ActorFrame>;
  /** Ratios drawn for a unit: health and shield of the effective maximum health. Null when the unit shows no bar. */
  readonly bar: (
    unitId: string,
  ) => { readonly hp: number; readonly shield: number } | null;
  /** Magazine, pips and negative health pool drawn for a unit. Null when the unit shows no bar. */
  readonly readouts: (unitId: string) => MissionHudReadouts | null;
  /** Health ratio the ghost bar shows: it drops to the health bar at `MISSION_HUD_GHOST_DRAIN` per second. */
  readonly ghost: (unitId: string) => number | null;
  /** Icon keys shown over a unit's bar, in drawing order. */
  readonly icons: (unitId: string) => readonly string[];
  /** Tag of the frame around a unit's bar, or null. */
  readonly frame: (unitId: string) => string | null;
  /**
   * Skill bar of an allied unit with a skill that costs SP: the first such skill's charge, its state and the ready
   * glow's opacity, 0 unless ready. Null without one, or while a magazine takes its place.
   */
  readonly sp: (unitId: string) => {
    readonly ratio: number;
    readonly state: MissionHudSpState;
    readonly glow: number;
  } | null;
  /** Columns the bar is pushed sideways by its shake, 0 when still. */
  readonly shake: (unitId: string) => number;
  /** Redeploy ring of a downed unit: the share of the wait left and the whole seconds left. Null without a ring. */
  readonly ring: (
    unitId: string,
  ) => { readonly left: number; readonly seconds: number } | null;
  /** The digit textures every ring shares, built on first use. */
  readonly digits: () => readonly Texture[];
  clear(): void;
}

interface Ring {
  readonly group: Group;
  readonly track: Mesh;
  readonly arc: Mesh;
  readonly digits: Group;
}

const unit = new PlaneGeometry(1, 1);

function plane(color: number, z: number): Mesh {
  const mesh = new Mesh(
    unit,
    new MeshBasicMaterial({ color, depthTest: false, transparent: true }),
  );
  mesh.position.z = z;
  mesh.renderOrder = 10;
  return mesh;
}

function ratio(value: number | undefined, max: number): number {
  if (!(max > 0) || value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value / max));
}

function disposeAll(group: Group): void {
  group.traverse((child) => {
    if (child instanceof Mesh) {
      (child.material as MeshBasicMaterial).dispose();
    }
  });
}

/**
 * Health and shield bars over standing actors, hidden where the appearance turns `hpBar` off, with the readouts:
 * the negative pool over the health bar, the magazine strip under it and the pips above it. Seals the reader table.
 */
export function createHudLayer(
  world: MissionActorWorld,
  readerTable?: MissionHudReaderTable,
  style: MissionHudStyle = {},
): MissionHudLayer {
  readerTable?.seal();
  const readers = readerTable?.values() ?? [];
  const iconList = style.icons ?? MISSION_HUD_ICONS;
  const frameList = style.frames ?? MISSION_HUD_FRAMES;
  const ghosts = new Map<string, number>();
  const shownIcons = new Map<string, readonly string[]>();
  const shownFrames = new Map<string, string>();
  const rings = new Map<string, Ring>();
  const ringValues = new Map<string, { left: number; seconds: number }>();
  let digitTextures: Texture[] | null = null;
  const digits = (): Texture[] => {
    digitTextures ??= Array.from({ length: 10 }, (_, digit) =>
      (style.digitTexture ?? defaultDigitTexture)(digit),
    );
    return digitTextures;
  };
  /** Arc geometries by step, shared by every ring. */
  const arcs = new Map<number, BufferGeometry>();
  const arcOf = (step: number): BufferGeometry => {
    let geometry = arcs.get(step);
    if (!geometry) {
      geometry = new RingGeometry(
        MISSION_HUD_RING.inner,
        MISSION_HUD_RING.outer,
        Math.max(3, step),
        1,
        Math.PI / 2,
        (2 * Math.PI * step) / MISSION_HUD_RING.steps,
      );
      arcs.set(step, geometry);
    }
    return geometry;
  };
  const trackGeometry = new RingGeometry(
    MISSION_HUD_RING.inner,
    MISSION_HUD_RING.outer,
    MISSION_HUD_RING.steps,
  );
  const digitMaterials = new Map<number, MeshBasicMaterial>();
  const digitMaterial = (digit: number): MeshBasicMaterial => {
    let material = digitMaterials.get(digit);
    if (!material) {
      material = new MeshBasicMaterial({
        map: digits()[digit] ?? null,
        transparent: true,
        depthTest: false,
      });
      digitMaterials.set(digit, material);
    }
    return material;
  };
  const layer = new Group();
  layer.name = 'hud';
  const bars = new Map<string, Bar>();
  const shown = new Map<string, { hp: number; shield: number }>();
  const readouts = new Map<string, MissionHudReadouts>();
  const spShown = new Map<
    string,
    { ratio: number; state: MissionHudSpState; glow: number }
  >();
  const shakes = new Map<
    string,
    { left: number; hp: number; offset: number }
  >();
  let clock = 0;

  const barOf = (unitId: string, side: string): Bar => {
    const existing = bars.get(unitId);
    if (existing) {
      return existing;
    }
    const group = new Group();
    group.rotation.x = world.lean;
    const frame = plane(COLORS.back, -0.001);
    frame.visible = false;
    const back = plane(COLORS.back, 0);
    back.scale.set(MISSION_HUD_BAR.width, MISSION_HUD_BAR.height, 1);
    const ghost = plane(COLORS.ghost, 0.0005);
    const icons = new Group();
    const hp = plane(side === 'enemy' ? COLORS.enemy : COLORS.ally, 0.001);
    const negative = plane(COLORS.negative, 0.002);
    const shield = plane(COLORS.shield, 0.003);
    const magazine = plane(COLORS.magazine, 0.001);
    const sp = plane(COLORS.sp, 0.001);
    const glow = plane(COLORS.spReady, 0.002);
    const glowMaterial = glow.material as MeshBasicMaterial;
    glowMaterial.blending = AdditiveBlending;
    glow.visible = false;
    const pips = new Group();
    group.add(
      frame,
      back,
      ghost,
      hp,
      negative,
      shield,
      magazine,
      sp,
      glow,
      pips,
      icons,
    );
    layer.add(group);
    const bar = {
      group,
      back,
      frame,
      ghost,
      icons,
      hp,
      shield,
      negative,
      magazine,
      sp,
      glow,
      pips,
    };
    bars.set(unitId, bar);
    return bar;
  };

  const drop = (unitId: string): void => {
    const bar = bars.get(unitId);
    if (!bar) {
      return;
    }
    layer.remove(bar.group);
    disposeAll(bar.group);
    bars.delete(unitId);
    shown.delete(unitId);
    readouts.delete(unitId);
    spShown.delete(unitId);
    shakes.delete(unitId);
    ghosts.delete(unitId);
    shownIcons.delete(unitId);
    shownFrames.delete(unitId);
  };

  const dropRing = (unitId: string): void => {
    const ring = rings.get(unitId);
    if (!ring) {
      return;
    }
    layer.remove(ring.group);
    (ring.track.material as MeshBasicMaterial).dispose();
    (ring.arc.material as MeshBasicMaterial).dispose();
    rings.delete(unitId);
    ringValues.delete(unitId);
  };

  const ringOf = (unitId: string): Ring => {
    const existing = rings.get(unitId);
    if (existing) {
      return existing;
    }
    const group = new Group();
    group.rotation.x = world.lean;
    const track = new Mesh(
      trackGeometry,
      new MeshBasicMaterial({
        color: COLORS.ringTrack,
        depthTest: false,
        transparent: true,
      }),
    );
    const arc = new Mesh(
      arcOf(MISSION_HUD_RING.steps),
      new MeshBasicMaterial({
        color: COLORS.ring,
        depthTest: false,
        transparent: true,
      }),
    );
    arc.position.z = 0.001;
    const digitGroup = new Group();
    digitGroup.position.z = 0.002;
    for (const mesh of [track, arc]) {
      mesh.renderOrder = 10;
    }
    group.add(track, arc, digitGroup);
    layer.add(group);
    const ring = { group, track, arc, digits: digitGroup };
    rings.set(unitId, ring);
    return ring;
  };

  /** The countdown digits, centred; each digit plane uses the shared texture of its digit. */
  const drawDigits = (group: Group, seconds: number): void => {
    const text = String(seconds);
    while (group.children.length < text.length) {
      const mesh = new Mesh(unit, digitMaterial(0));
      mesh.renderOrder = 11;
      group.add(mesh);
    }
    const size = MISSION_HUD_RING.digit;
    group.children.forEach((child, index) => {
      const mesh = child as Mesh;
      mesh.visible = index < text.length;
      if (!mesh.visible) {
        return;
      }
      mesh.material = digitMaterial(Number(text[index]));
      mesh.scale.set(size * 0.66, size, 1);
      mesh.position.set((index - (text.length - 1) / 2) * size * 0.66, 0, 0);
    });
  };

  const drawRing = (
    actor: MissionActorWorld['actors'] extends ReadonlyMap<string, infer A>
      ? A
      : never,
  ): void => {
    const redeploy = actor.unit.redeploy;
    if (actor.phase !== 'downed' || !redeploy || !(redeploy.duration > 0)) {
      dropRing(actor.id);
      return;
    }
    const rest = Math.max(0, redeploy.duration - redeploy.elapsed);
    const left = Math.min(1, rest / redeploy.duration);
    const seconds = Math.ceil(rest - 1e-9);
    const ring = ringOf(actor.id);
    const step = Math.round(left * MISSION_HUD_RING.steps);
    ring.arc.visible = step > 0;
    if (step > 0) {
      ring.arc.geometry = arcOf(step);
    }
    drawDigits(ring.digits, seconds);
    ring.group.position.set(
      actor.position.x,
      actor.position.height + MISSION_HUD_RING.lift,
      -actor.position.y,
    );
    ringValues.set(actor.id, { left, seconds });
  };

  const drawIcons = (group: Group, keys: readonly string[]): void => {
    while (group.children.length < keys.length) {
      group.add(plane(0xffffff, 0.001));
    }
    const step = ICON.size + ICON.gap;
    group.children.forEach((child, index) => {
      const mesh = child as Mesh;
      const key = keys[index];
      mesh.visible = key !== undefined;
      if (key === undefined) {
        return;
      }
      const icon = iconList.find((item) => item.icon === key);
      const material = mesh.material as MeshBasicMaterial;
      const texture = style.iconTexture?.(key) ?? null;
      material.map = texture;
      material.color.setHex(texture ? 0xffffff : (icon?.color ?? 0xffffff));
      material.needsUpdate = true;
      mesh.scale.set(ICON.size, ICON.size, 1);
      mesh.position.set(
        (index - (keys.length - 1) / 2) * step,
        MISSION_HUD_BAR.height * 2 + ICON.size / 2,
        0.001,
      );
    });
  };

  const fill = (mesh: Mesh, value: number, lift: number): void => {
    mesh.visible = value > 0;
    mesh.scale.set(
      MISSION_HUD_BAR.width * value,
      MISSION_HUD_BAR.height * lift,
      1,
    );
    mesh.position.x = (MISSION_HUD_BAR.width * (value - 1)) / 2;
  };

  const drawPips = (group: Group, pips: MissionHudReadouts['pips']): void => {
    const max = pips?.max ?? 0;
    while (group.children.length < max) {
      group.add(plane(COLORS.pip, 0.001));
    }
    const size = MISSION_HUD_BAR.height * PIP.size;
    const step = size + MISSION_HUD_BAR.height * PIP.gap;
    group.children.forEach((child, index) => {
      const pip = child as Mesh;
      pip.visible = index < max;
      if (!pip.visible) {
        return;
      }
      pip.scale.set(size, size, 1);
      pip.position.set(
        -MISSION_HUD_BAR.width / 2 + size / 2 + index * step,
        MISSION_HUD_BAR.height + size / 2,
        0.001,
      );
      (pip.material as MeshBasicMaterial).opacity =
        index < (pips?.left ?? 0) ? 1 : PIP.dim;
    });
  };

  /** The skill bar in the magazine's place, coloured by state, with the pulsing glow at its right end when ready. */
  const drawSp = (
    unitId: string,
    bar: Bar,
    unit: UnitSnapshot,
    magazine: boolean,
  ): void => {
    const skill =
      unit.side === 'enemy' || magazine
        ? undefined
        : unit.skills.find((item) => item.spCost > 0);
    if (!skill) {
      bar.sp.visible = false;
      bar.glow.visible = false;
      spShown.delete(unitId);
      return;
    }
    const value = ratio(skill.sp, skill.spCost);
    const state: MissionHudSpState = skill.active
      ? 'active'
      : value >= 0.999
        ? 'ready'
        : 'charging';
    fill(bar.sp, value, MISSION_HUD_SP.height);
    const y =
      -MISSION_HUD_BAR.height *
      (0.5 + MISSION_HUD_SP.gap + MISSION_HUD_SP.height / 2);
    bar.sp.position.y = y;
    (bar.sp.material as MeshBasicMaterial).color.setHex(
      state === 'active'
        ? COLORS.spActive
        : state === 'ready'
          ? COLORS.spReady
          : COLORS.sp,
    );
    const { pulse } = MISSION_HUD_SP;
    const glow =
      state === 'ready'
        ? pulse.base + pulse.swing * Math.sin(clock * pulse.speed)
        : 0;
    bar.glow.visible = state === 'ready';
    if (bar.glow.visible) {
      const side =
        MISSION_HUD_BAR.height * MISSION_HUD_SP.height * MISSION_HUD_SP.glow;
      bar.glow.scale.set(side, side, 1);
      bar.glow.position.set(MISSION_HUD_BAR.width / 2, y, 0.002);
      (bar.glow.material as MeshBasicMaterial).opacity = glow;
    }
    spShown.set(unitId, { ratio: value, state, glow });
  };

  /** Starts the shake when health drops by more than half a point; returns the sideways offset this frame. */
  const shakeOf = (
    unitId: string,
    hp: number,
    seconds: number | undefined,
    delta: number,
  ): number => {
    const before = shakes.get(unitId);
    let left = Math.max(0, (before?.left ?? 0) - delta);
    if (seconds !== undefined && before !== undefined && hp < before.hp - 0.5) {
      left = seconds;
    }
    const offset =
      left > 0
        ? Math.sin(clock * MISSION_HUD_SHAKE.speed) *
          left *
          MISSION_HUD_SHAKE.amplitude
        : 0;
    shakes.set(unitId, { left, hp, offset });
    return offset;
  };

  return {
    layer,
    system: {
      id: 'hud',
      run(frame) {
        clock += frame.deltaSeconds;
        for (const id of [...bars.keys()]) {
          if (!world.actors.has(id)) {
            drop(id);
          }
        }
        for (const id of [...rings.keys()]) {
          if (!world.actors.has(id)) {
            dropRing(id);
          }
        }
        for (const actor of world.actors.values()) {
          drawRing(actor);
          if (actor.phase !== 'standing' || actor.appearance?.hpBar === false) {
            drop(actor.id);
            continue;
          }
          const max = actor.unit.maxHp;
          const values = {
            hp: ratio(actor.unit.attributes.hp, max),
            shield: ratio(actor.unit.shield, max),
          };
          const read = hudReadoutsOf(actor.unit, readers);
          const bar = barOf(actor.id, actor.unit.side);
          const rank =
            frameList.find((item) => actor.unit.tags.includes(item.tag)) ??
            null;
          bar.group.scale.x = rank?.width ?? 1;
          bar.frame.visible = rank !== null;
          if (rank) {
            (bar.frame.material as MeshBasicMaterial).color.setHex(rank.color);
            bar.frame.scale.set(
              MISSION_HUD_BAR.width + MISSION_HUD_BAR.height * FRAME,
              MISSION_HUD_BAR.height * (1 + FRAME),
              1,
            );
            shownFrames.set(actor.id, rank.tag);
          } else {
            shownFrames.delete(actor.id);
          }
          const before = ghosts.get(actor.id);
          const ghost =
            before === undefined || before < values.hp
              ? values.hp
              : Math.max(
                  values.hp,
                  before - MISSION_HUD_GHOST_DRAIN * frame.deltaSeconds,
                );
          ghosts.set(actor.id, ghost);
          fill(bar.ghost, ghost, 1);
          const keys = iconList
            .filter((item) => actor.unit.tags.includes(item.tag))
            .map((item) => item.icon);
          drawIcons(bar.icons, keys);
          shownIcons.set(actor.id, keys);
          fill(bar.hp, values.hp, 1);
          fill(bar.negative, read.negative, 1);
          fill(bar.shield, values.shield, 0.4);
          bar.shield.position.y = -MISSION_HUD_BAR.height * 0.3;
          fill(
            bar.magazine,
            read.magazine ? read.magazine.left / read.magazine.max : 0,
            0.5,
          );
          bar.magazine.position.y = -MISSION_HUD_BAR.height * 0.9;
          drawPips(bar.pips, read.pips);
          drawSp(actor.id, bar, actor.unit, read.magazine !== null);
          const offset = shakeOf(
            actor.id,
            actor.unit.attributes.hp ?? 0,
            rank?.shake,
            frame.deltaSeconds,
          );
          bar.group.position.set(
            actor.position.x + offset,
            actor.position.height + MISSION_HUD_BAR.lift,
            -actor.position.y,
          );
          shown.set(actor.id, values);
          readouts.set(actor.id, read);
        }
      },
    },
    bar: (unitId) => shown.get(unitId) ?? null,
    readouts: (unitId) => readouts.get(unitId) ?? null,
    ghost: (unitId) => ghosts.get(unitId) ?? null,
    icons: (unitId) => shownIcons.get(unitId) ?? [],
    frame: (unitId) => shownFrames.get(unitId) ?? null,
    sp: (unitId) => spShown.get(unitId) ?? null,
    shake: (unitId) => shakes.get(unitId)?.offset ?? 0,
    ring: (unitId) => ringValues.get(unitId) ?? null,
    digits,
    clear() {
      for (const id of [...bars.keys()]) {
        drop(id);
      }
      for (const id of [...rings.keys()]) {
        dropRing(id);
      }
    },
  };
}

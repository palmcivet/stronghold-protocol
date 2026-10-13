import type { AssetKey } from 'arknights-assets-catalog';
import type {
  AttackStandView,
  BattleEvent,
  UnitKind,
  UnitSnapshot,
} from 'arknights-mission-core';
import { Group, type Material } from 'three';
import { createObjectPool, type ObjectPool } from '#actor/entity/pool.js';
import {
  type ActorImpostor,
  dropImpostor,
  type MissionActorImpostor,
  stepImpostor,
} from '#actor/impostor/actor.js';
import type {
  MissionAnimClip,
  MissionAnimRoles,
  MissionAppearance,
  MissionAppearanceForm,
  MissionAppearances,
} from '#contract/appearance.js';
import type { MissionTileRect } from '#contract/view.js';
import type { MissionResourcePort } from '#port/resource.js';
import type {
  MissionSkeletonData,
  MissionSkeletonInstance,
  MissionSkeletonRuntime,
} from '#port/skeleton.js';
import { MISSION_PROJECTION } from '#runtime/camera/projection.js';
import type { ViewSystem } from '#runtime/stage/loop.js';

/** Seconds an actor takes to fade out once its unit is removed. */
export const MISSION_ACTOR_FADE_SECONDS = 0.6;

/** What the view systems read each frame. */
export interface ActorFrame {
  readonly deltaSeconds: number;
  /** Game seconds per real second. Defaults to 1. */
  readonly speed?: number;
  /** The playing field in tiles; null or missing when there is no map. */
  readonly field?: MissionTileRect | null;
  readonly units: readonly UnitSnapshot[];
  /** Ids of units whose position changes between the frames around the render clock. */
  readonly moving: ReadonlySet<string>;
  readonly events: readonly BattleEvent[];
}

/** `standing` on the field, `downed` in its fallen pose, `fading` out after removal, `released` back to the pool. */
export type MissionActorPhase = 'standing' | 'downed' | 'fading' | 'released';

/** The role an actor's skeleton plays. */
export type MissionActorRole = 'idle' | 'deploy' | 'move' | 'attack' | 'die';

/** Attack stand window of the unit, from the `attack:stand` component view, in ticks. */
export type ActorStand = AttackStandView;

export interface ActorPosition {
  x: number;
  y: number;
  height: number;
  moving: boolean;
  stand: ActorStand | null;
}

export interface ActorSkeleton {
  key: AssetKey | null;
  instance: MissionSkeletonInstance | null;
  role: MissionActorRole | null;
  /** One-shot role waiting to play: set by `deploy` and `attack` events. An attack takes the place of a deploy. */
  pending: 'deploy' | 'attack' | null;
  /** World clock, in real seconds, of the last `deploy` event: a model loaded later continues its entrance from there. */
  deployAt: number | null;
  /** Seconds left of the one-shot clip playing, or 0. */
  clipLeft: number;
  /** The pose is final (a finished death clip): the skeleton is neither advanced nor redrawn. */
  held: boolean;
  /** Index of the appearance form in force, or -1 for the base roles. */
  form: number;
}

/** A push or pull slide: from where the model was towards the unit's position, decelerating to a stop in `seconds`. */
export interface ActorSlide {
  readonly fromX: number;
  readonly fromY: number;
  readonly seconds: number;
  elapsed: number;
  /** Facing kept for the slide, or null when the model turns as the unit does. */
  readonly left: boolean | null;
}

export interface MissionActor {
  readonly id: string;
  readonly kind: UnitKind;
  readonly root: Group;
  unit: UnitSnapshot;
  phase: MissionActorPhase;
  /** Opacity left while fading, 1 to 0. */
  fade: number;
  /** Whether the unit appears in the current frame. */
  seen: boolean;
  /** Outside the camera's view as of the last `cull`: hidden, and its skeleton does not advance. */
  culled: boolean;
  readonly position: ActorPosition;
  /** True when the model looks towards smaller columns. */
  left: boolean;
  appearance: MissionAppearance | null;
  readonly skeleton: ActorSkeleton;
  /** The impostor showing the skeleton, or null when the skeleton draws directly. */
  impostor: ActorImpostor | null;
  /** Seconds of hit shake left. Only devices shake, along the columns. */
  shake: number;
  /** The push or pull slide in progress, or null. */
  slide: ActorSlide | null;
  /** Real seconds of the death clip left before the fade starts. */
  dying: number;
  /** Turret recoil left, 1 to 0, and the direction of the shot, in tiles. */
  recoil: { amount: number; x: number; y: number };
}

/** A removed unit plays its death clip, at most this many real seconds, before it fades, as master. */
export const MISSION_ACTOR_DIE_SECONDS = 8;

/**
 * Push and pull slides, as master: the slide runs the event's `duration` in game seconds. A displace without a
 * duration slides `perRootTile` real seconds per square root of the tiles moved, clamped to `min`–`max`.
 */
export const MISSION_ACTOR_SLIDE = Object.freeze({
  perRootTile: 0.14,
  min: 0.12,
  max: 0.45,
});

/** A device that attacks recoils `tiles` against the shot, and the recoil decays at `decay` per second, as master's turret. */
export const MISSION_ACTOR_RECOIL = Object.freeze({ tiles: 0.06, decay: 5 });

/** Hit shake of a device, as master draws crates and turrets: seconds per hit, angular speed, tiles per second left. */
export const MISSION_ACTOR_SHAKE = Object.freeze({
  seconds: 0.2,
  speed: 80,
  amplitude: 0.05,
});

export interface MissionActorWorldOptions {
  /** Height of the drawn board at a position, in tiles. Without it actors stand at the snapshot's `height`. */
  readonly surface?: (x: number, y: number) => number;
  readonly skeleton?: MissionSkeletonRuntime;
  readonly resources?: Pick<
    MissionResourcePort<unknown, MissionSkeletonData>,
    'spine' | 'release'
  >;
  /** Draws skeletons through an impostor atlas. Without it every skeleton draws directly. */
  readonly impostor?: MissionActorImpostor;
  /**
   * Degrees the board camera is pitched from straight down. Actors and their bars lean back by 90° minus it, so
   * they face the camera upright as master draws them. Defaults to `MISSION_PROJECTION.pitch`.
   */
  readonly pitch?: number;
}

export interface MissionActorWorld {
  /** Parent of every actor's root, in scene space (x = column, y = height, z = −row). */
  readonly layer: Group;
  readonly actors: ReadonlyMap<string, MissionActor>;
  readonly pool: ObjectPool<UnitKind, Group>;
  /** Rotation about the x axis, in radians, that turns an actor's plane to face the camera. */
  readonly lean: number;
  setAppearances(appearances: MissionAppearances): void;
  /** Starts or stops drawing skeletons through an impostor atlas; null draws every skeleton directly again. */
  setImpostor(impostor: MissionActorImpostor | null): void;
  /** The lifecycle, position, facing, skeleton, impostor and release systems. */
  readonly systems: readonly ViewSystem<ActorFrame>[];
  clear(): void;
}

/** The lean that turns a plane facing +z (towards the low rows) to face a camera pitched `pitch` degrees. */
export function leanFor(pitch: number): number {
  return -(Math.PI / 2 - (pitch * Math.PI) / 180);
}

function standOf(unit: UnitSnapshot): ActorStand | null {
  return (
    (unit.components['attack:stand'] as AttackStandView | undefined) ?? null
  );
}

function clipName(clip: MissionAnimClip | null): string | null {
  return clip?.loop ?? null;
}

function formHolds(form: MissionAppearanceForm, unit: UnitSnapshot): boolean {
  return (
    form.tags.every((tag) => unit.tags.includes(tag)) &&
    !(form.without ?? []).some((tag) => unit.tags.includes(tag)) &&
    (form.blocked === undefined || form.blocked === (unit.blockedBy !== null))
  );
}

/** Index of the first form of the appearance in force for the unit, or -1. */
export function formOf(
  appearance: MissionAppearance,
  unit: UnitSnapshot,
): number {
  return (appearance.forms ?? []).findIndex((form) => formHolds(form, unit));
}

/** The animation a role plays in a set of clips, and whether it loops. */
function animationOf(
  roles: MissionAnimRoles,
  role: MissionActorRole,
): { readonly name: string; readonly loop: boolean } | null {
  switch (role) {
    case 'idle':
      return roles.idle ? { name: roles.idle, loop: true } : null;
    case 'deploy':
      return roles.deploy ? { name: roles.deploy, loop: false } : null;
    case 'move': {
      const name = clipName(roles.move);
      return name ? { name, loop: true } : null;
    }
    case 'attack': {
      const name = clipName(roles.attack);
      return name ? { name, loop: false } : null;
    }
    case 'die':
      return roles.die ? { name: roles.die, loop: false } : null;
  }
}

/** Actor entities for the units of the snapshots, with their view systems. */
export function createActorWorld(
  options: MissionActorWorldOptions = {},
): MissionActorWorld {
  const layer = new Group();
  layer.name = 'actors';
  const actors = new Map<string, MissionActor>();
  let appearances: MissionAppearances = {};
  let impostorOptions: MissionActorImpostor | null = options.impostor ?? null;
  let frameIndex = 0;
  const lean = leanFor(options.pitch ?? MISSION_PROJECTION.pitch);
  const pool = createObjectPool<UnitKind, Group>({
    create: (kind) => {
      const group = new Group();
      group.name = `actor:${kind}`;
      group.rotation.x = lean;
      return group;
    },
    reset: (group) => {
      group.clear();
      group.position.set(0, 0, 0);
      group.scale.set(1, 1, 1);
      group.visible = true;
    },
  });

  const spawn = (unit: UnitSnapshot): MissionActor => {
    const root = pool.acquire(unit.kind);
    root.name = unit.id;
    layer.add(root);
    const actor: MissionActor = {
      id: unit.id,
      kind: unit.kind,
      root,
      unit,
      phase: unit.downed ? 'downed' : 'standing',
      fade: 1,
      seen: true,
      culled: false,
      position: {
        x: unit.x,
        y: unit.y,
        height: unit.height,
        moving: false,
        stand: standOf(unit),
      },
      left: unit.facing === 'LEFT',
      appearance: appearances[unit.id] ?? null,
      skeleton: {
        key: null,
        instance: null,
        role: null,
        pending: null,
        deployAt: null,
        clipLeft: 0,
        held: false,
        form: -1,
      },
      impostor: null,
      shake: 0,
      slide: null,
      dying: 0,
      recoil: { amount: 0, x: 0, y: 0 },
    };
    actors.set(unit.id, actor);
    return actor;
  };

  /** Shows the skeleton directly again. */
  const unImpostor = (
    actor: MissionActor,
    atlasOf: MissionActorImpostor | null,
  ): void => {
    if (actor.impostor && atlasOf) {
      dropImpostor(atlasOf.atlas, actor.impostor);
    }
    actor.impostor = null;
    const instance = actor.skeleton.instance;
    if (instance && instance.object3d.parent !== actor.root) {
      actor.root.add(instance.object3d);
    }
  };

  const dropSkeleton = (actor: MissionActor): void => {
    unImpostor(actor, impostorOptions);
    const skeleton = actor.skeleton;
    if (skeleton.instance) {
      actor.root.remove(skeleton.instance.object3d);
      skeleton.instance.dispose();
    }
    if (skeleton.key) {
      options.resources?.release(skeleton.key);
    }
    skeleton.key = null;
    skeleton.instance = null;
    skeleton.role = null;
    skeleton.held = false;
    skeleton.clipLeft = 0;
  };

  const release = (actor: MissionActor): void => {
    dropSkeleton(actor);
    actor.phase = 'released';
    layer.remove(actor.root);
    pool.release(actor.kind, actor.root);
    actors.delete(actor.id);
  };

  const loadSkeleton = (actor: MissionActor): void => {
    const appearance = actor.appearance;
    const { skeleton: runtime, resources } = options;
    if (
      !appearance ||
      !runtime ||
      !resources ||
      actor.skeleton.key === appearance.spine
    ) {
      return;
    }
    dropSkeleton(actor);
    const key = appearance.spine;
    actor.skeleton.key = key;
    resources.spine(key).then(
      (data) => {
        if (actor.skeleton.key !== key || actor.phase === 'released') {
          return;
        }
        const instance = runtime.create(data);
        if (appearance.tint !== undefined) {
          instance.setTint(appearance.tint);
        }
        actor.skeleton.instance = instance;
        actor.root.add(instance.object3d);
      },
      () => undefined,
    );
  };

  let clock = 0;
  const dieSeconds = (actor: MissionActor): number => {
    const instance = actor.skeleton.instance;
    const name = actor.appearance?.roles.die;
    const seconds = instance && name ? (instance.data.durations[name] ?? 0) : 0;
    return Math.min(MISSION_ACTOR_DIE_SECONDS, Math.max(0, seconds));
  };
  const lifecycle: ViewSystem<ActorFrame> = {
    id: 'lifecycle',
    run(frame) {
      clock += frame.deltaSeconds;
      for (const actor of actors.values()) {
        actor.seen = false;
      }
      for (const unit of frame.units) {
        const actor = actors.get(unit.id) ?? spawn(unit);
        actor.seen = true;
        actor.unit = unit;
        if (actor.phase === 'fading') {
          continue;
        }
        actor.phase = unit.downed ? 'downed' : 'standing';
      }
      for (const event of frame.events) {
        const actor =
          'unitId' in event.data ? actors.get(event.data.unitId) : undefined;
        if (!actor) {
          continue;
        }
        if (event.type === 'removed') {
          if (actor.phase !== 'fading') {
            actor.dying = actor.phase === 'standing' ? dieSeconds(actor) : 0;
          }
          actor.phase = 'fading';
        } else if (event.type === 'downed' && actor.phase === 'standing') {
          actor.phase = 'downed';
        } else if (event.type === 'deploy') {
          actor.skeleton.pending = 'deploy';
          actor.skeleton.deployAt = clock;
        } else if (event.type === 'attack') {
          actor.skeleton.pending = 'attack';
          if (actor.kind === 'device') {
            aimRecoil(actor, event.data.targetIds[0]);
          }
        }
      }
      for (const actor of actors.values()) {
        if (!actor.seen && actor.phase !== 'fading') {
          actor.phase = 'fading';
        }
      }
    },
  };

  const aimRecoil = (
    actor: MissionActor,
    targetId: string | undefined,
  ): void => {
    const target = targetId ? actors.get(targetId) : undefined;
    let x = target ? target.position.x - actor.position.x : actor.left ? -1 : 1;
    let y = target ? target.position.y - actor.position.y : 0;
    const length = Math.hypot(x, y);
    if (length > 0) {
      x /= length;
      y /= length;
    } else {
      x = actor.left ? -1 : 1;
      y = 0;
    }
    actor.recoil = { amount: 1, x, y };
  };
  const startSlide = (
    actor: MissionActor,
    duration: number,
    keepFacing: boolean,
    toX: number,
    toY: number,
    speed: number,
  ): void => {
    const fromX = actor.position.x;
    const fromY = actor.position.y;
    const tiles = Math.hypot(toX - fromX, toY - fromY);
    if (!(tiles > 0)) {
      return;
    }
    const seconds =
      duration > 0
        ? duration / speed
        : Math.min(
            MISSION_ACTOR_SLIDE.max,
            Math.max(
              MISSION_ACTOR_SLIDE.min,
              MISSION_ACTOR_SLIDE.perRootTile * Math.sqrt(tiles),
            ),
          );
    actor.slide = {
      fromX,
      fromY,
      seconds,
      elapsed: 0,
      left: keepFacing ? actor.left : null,
    };
  };
  const position: ViewSystem<ActorFrame> = {
    id: 'position',
    run(frame) {
      const speed = frame.speed ?? 1;
      for (const event of frame.events) {
        if (event.type === 'displace') {
          const actor = actors.get(event.data.unitId);
          if (actor) {
            startSlide(
              actor,
              event.data.duration,
              event.data.keepFacing,
              event.data.x,
              event.data.y,
              speed,
            );
          }
          continue;
        }
        if (event.type !== 'damaged') {
          continue;
        }
        const target = actors.get(event.data.targetId);
        if (target?.kind === 'device') {
          target.shake = MISSION_ACTOR_SHAKE.seconds;
        }
      }
      for (const actor of actors.values()) {
        const sway =
          actor.shake > 0
            ? Math.sin(clock * MISSION_ACTOR_SHAKE.speed) *
              actor.shake *
              MISSION_ACTOR_SHAKE.amplitude
            : 0;
        actor.shake = Math.max(0, actor.shake - frame.deltaSeconds);
        const recoil = actor.recoil;
        recoil.amount = Math.max(
          0,
          recoil.amount - frame.deltaSeconds * MISSION_ACTOR_RECOIL.decay,
        );
        const kick = recoil.amount * MISSION_ACTOR_RECOIL.tiles;
        const place = actor.position;
        place.x = actor.unit.x;
        place.y = actor.unit.y;
        const slide = actor.slide;
        if (slide) {
          slide.elapsed += frame.deltaSeconds;
          const u = Math.min(1, slide.elapsed / slide.seconds);
          const along = 2 * u - u * u;
          place.x = slide.fromX + (actor.unit.x - slide.fromX) * along;
          place.y = slide.fromY + (actor.unit.y - slide.fromY) * along;
          if (u >= 1) {
            actor.slide = null;
          }
        }
        place.height = options.surface
          ? options.surface(place.x, place.y)
          : actor.unit.height;
        place.moving = frame.moving.has(actor.id) || actor.slide !== null;
        place.stand = standOf(actor.unit);
        const offset = actor.appearance?.offset;
        const lifted =
          actor.phase === 'standing' ||
          (actor.phase === 'fading' && actor.dying > 0);
        const hover =
          (actor.appearance?.hover ?? 0) *
          (lifted ? 1 : actor.phase === 'fading' ? actor.fade : 0);
        actor.root.position.set(
          place.x + (offset?.x ?? 0) + sway - recoil.x * kick,
          place.height + (offset?.z ?? 0) + hover,
          -(place.y + (offset?.y ?? 0) - recoil.y * kick),
        );
      }
    },
  };

  const facing: ViewSystem<ActorFrame> = {
    id: 'facing',
    run() {
      for (const actor of actors.values()) {
        actor.left = actor.slide?.left ?? actor.unit.facing === 'LEFT';
        const appearance = actor.appearance;
        const scale = appearance?.scale ?? 1;
        const mirror = appearance?.mirrorX === true ? -1 : 1;
        const sign = (actor.left ? -1 : 1) * mirror;
        actor.root.scale.set(
          sign * scale,
          scale * (appearance?.scaleY ?? 1),
          scale,
        );
      }
    },
  };

  const skeleton: ViewSystem<ActorFrame> = {
    id: 'skeleton',
    run(frame) {
      for (const actor of actors.values()) {
        loadSkeleton(actor);
        const instance = actor.skeleton.instance;
        const appearance = actor.appearance;
        if (!instance || !appearance) {
          continue;
        }
        const state = actor.skeleton;
        const form = formOf(appearance, actor.unit);
        const roles = appearance.forms?.[form]?.roles ?? appearance.roles;
        let role: MissionActorRole;
        let start = 0;
        if (actor.phase !== 'standing') {
          role = 'die';
        } else if (state.pending) {
          role = state.pending;
        } else if (actor.position.moving) {
          role = 'move';
        } else {
          role =
            state.role === 'deploy' || state.role === 'attack'
              ? state.role
              : 'idle';
        }
        if (role === 'deploy' && state.pending === 'deploy') {
          // a model loaded after the deploy continues the entrance; past its end there is none to show
          start = clock - (state.deployAt ?? clock);
          const name = roles.deploy;
          const seconds = name ? (instance.data.durations[name] ?? 0) : 0;
          if (seconds > 0 && start >= seconds) {
            role = 'idle';
            start = 0;
          }
        }
        if (
          state.pending !== null ||
          role !== state.role ||
          form !== state.form
        ) {
          const animation =
            animationOf(roles, role) ?? animationOf(roles, 'idle');
          if (animation) {
            instance.play(0, animation.name, animation.loop, start);
            const idle = animationOf(roles, 'idle');
            if (!animation.loop && role !== 'die' && idle) {
              instance.queue(0, idle.name, true);
            }
            state.clipLeft = animation.loop
              ? 0
              : Math.max(
                  0,
                  (instance.data.durations[animation.name] ?? 0) - start,
                );
          } else {
            state.clipLeft = 0;
          }
          state.role = role;
          state.form = form;
          state.held = false;
        }
        state.pending = null;
        if (!actor.culled && !state.held) {
          instance.update(frame.deltaSeconds);
          state.clipLeft = Math.max(0, state.clipLeft - frame.deltaSeconds);
          // the death clip has played out: the pose is final until the unit stands again
          state.held = role === 'die' && state.clipLeft <= 0;
        }
      }
    },
  };

  /**
   * Draws each skeleton through its impostor. Actors take turns in update order, counted from 0 every frame, so the
   * redraws spread over the interval; a culled actor takes no turn and keeps its image.
   */
  const impostorSystem: ViewSystem<ActorFrame> = {
    id: 'impostor',
    run() {
      const impostor = impostorOptions;
      if (!impostor) {
        return;
      }
      frameIndex += 1;
      let turn = 0;
      for (const actor of actors.values()) {
        const instance = actor.skeleton.instance;
        if (!instance || actor.culled) {
          continue;
        }
        // detached before it is queued: the atlas draws it alone, and the quad shows it in the scene
        if (instance.object3d.parent === actor.root) {
          actor.root.remove(instance.object3d);
        }
        const step = stepImpostor(
          impostor,
          actor.impostor,
          instance,
          actor.root.scale.y,
          frameIndex,
          turn,
          actor.skeleton.held,
        );
        turn += 1;
        actor.impostor = step.impostor;
        if (!step.impostor) {
          if (instance.object3d.parent !== actor.root) {
            actor.root.add(instance.object3d);
          }
          continue;
        }
        if (step.impostor.mesh.parent !== actor.root) {
          actor.root.add(step.impostor.mesh);
        }
      }
    },
  };

  const releaseSystem: ViewSystem<ActorFrame> = {
    id: 'release',
    run(frame) {
      for (const actor of [...actors.values()]) {
        if (actor.phase !== 'fading') {
          continue;
        }
        if (actor.dying > 0) {
          actor.dying = Math.max(0, actor.dying - frame.deltaSeconds);
          continue;
        }
        actor.fade = Math.max(
          0,
          actor.fade - frame.deltaSeconds / MISSION_ACTOR_FADE_SECONDS,
        );
        actor.root.traverse((object) => {
          const material = (
            object as { material?: Material | readonly Material[] }
          ).material;
          for (const item of material === undefined
            ? []
            : Array.isArray(material)
              ? material
              : [material]) {
            item.transparent = true;
            item.opacity = actor.fade;
          }
        });
        if (actor.fade <= 0) {
          release(actor);
        }
      }
    },
  };

  return {
    layer,
    lean,
    actors,
    pool,
    setAppearances(next) {
      appearances = { ...appearances, ...next };
      for (const actor of actors.values()) {
        actor.appearance = appearances[actor.id] ?? null;
      }
    },
    setImpostor(next) {
      for (const actor of actors.values()) {
        unImpostor(actor, impostorOptions);
      }
      impostorOptions = next;
      frameIndex = 0;
    },
    systems: [
      lifecycle,
      position,
      facing,
      skeleton,
      impostorSystem,
      releaseSystem,
    ],
    clear() {
      for (const actor of [...actors.values()]) {
        release(actor);
      }
      appearances = {};
    },
  };
}

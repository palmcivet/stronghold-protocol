import { Group, type Material } from "three"
import type { AttackStandView, BattleEvent, UnitKind, UnitSnapshot } from "arknights-mission-core"
import type { AssetKey } from "arknights-assets-catalog"
import type { MissionAnimClip, MissionAppearance, MissionAppearances } from "#contract/appearance.js"
import type { MissionResourcePort } from "#port/resource.js"
import type { MissionSkeletonData, MissionSkeletonInstance, MissionSkeletonRuntime } from "#port/skeleton.js"
import type { ViewSystem } from "#runtime/stage/loop.js"
import { createObjectPool, type ObjectPool } from "#actor/entity/pool.js"

/** Seconds an actor takes to fade out once its unit is removed. */
export const MISSION_ACTOR_FADE_SECONDS = 0.6

/** What the view systems read each frame. */
export interface ActorFrame {
  readonly deltaSeconds: number
  readonly units: readonly UnitSnapshot[]
  /** Ids of units whose position changes between the frames around the render clock. */
  readonly moving: ReadonlySet<string>
  readonly events: readonly BattleEvent[]
}

/** `standing` on the field, `downed` in its fallen pose, `fading` out after removal, `released` back to the pool. */
export type MissionActorPhase = "standing" | "downed" | "fading" | "released"

/** The role an actor's skeleton plays. */
export type MissionActorRole = "idle" | "deploy" | "move" | "attack" | "die"

/** Attack stand window of the unit, from the `attack:stand` component view, in ticks. */
export type ActorStand = AttackStandView

export interface ActorPosition {
  x: number
  y: number
  height: number
  moving: boolean
  stand: ActorStand | null
}

export interface ActorSkeleton {
  key: AssetKey | null
  instance: MissionSkeletonInstance | null
  role: MissionActorRole | null
  /** One-shot role waiting to play: set by `deploy` and `attack` events. */
  pending: "deploy" | "attack" | null
}

export interface MissionActor {
  readonly id: string
  readonly kind: UnitKind
  readonly root: Group
  unit: UnitSnapshot
  phase: MissionActorPhase
  /** Opacity left while fading, 1 to 0. */
  fade: number
  /** Whether the unit appears in the current frame. */
  seen: boolean
  readonly position: ActorPosition
  /** True when the model looks towards smaller columns. */
  left: boolean
  appearance: MissionAppearance | null
  readonly skeleton: ActorSkeleton
}

export interface MissionActorWorldOptions {
  /** Height of the drawn board at a position, in tiles. Without it actors stand at the snapshot's `height`. */
  readonly surface?: (x: number, y: number) => number
  readonly skeleton?: MissionSkeletonRuntime
  readonly resources?: Pick<MissionResourcePort<unknown, MissionSkeletonData>, "spine" | "release">
}

export interface MissionActorWorld {
  /** Parent of every actor's root, in scene space (x = column, y = height, z = −row). */
  readonly layer: Group
  readonly actors: ReadonlyMap<string, MissionActor>
  readonly pool: ObjectPool<UnitKind, Group>
  setAppearances(appearances: MissionAppearances): void
  /** The lifecycle, position, facing, skeleton and release systems. */
  readonly systems: readonly ViewSystem<ActorFrame>[]
  clear(): void
}

function standOf(unit: UnitSnapshot): ActorStand | null {
  return (unit.components["attack:stand"] as AttackStandView | undefined) ?? null
}

function clipName(clip: MissionAnimClip | null): string | null {
  return clip?.loop ?? null
}

/** The animation an actor's role plays, and whether it loops. */
function animationOf(appearance: MissionAppearance, role: MissionActorRole): { readonly name: string; readonly loop: boolean } | null {
  const roles = appearance.roles
  switch (role) {
    case "idle":
      return roles.idle ? { name: roles.idle, loop: true } : null
    case "deploy":
      return roles.deploy ? { name: roles.deploy, loop: false } : null
    case "move": {
      const name = clipName(roles.move)
      return name ? { name, loop: true } : null
    }
    case "attack": {
      const name = clipName(roles.attack)
      return name ? { name, loop: false } : null
    }
    case "die":
      return roles.die ? { name: roles.die, loop: false } : null
  }
}

/** Actor entities for the units of the snapshots, with their view systems. */
export function createActorWorld(options: MissionActorWorldOptions = {}): MissionActorWorld {
  const layer = new Group()
  layer.name = "actors"
  const actors = new Map<string, MissionActor>()
  let appearances: MissionAppearances = {}
  const pool = createObjectPool<UnitKind, Group>({
    create: (kind) => {
      const group = new Group()
      group.name = `actor:${kind}`
      return group
    },
    reset: (group) => {
      group.clear()
      group.position.set(0, 0, 0)
      group.scale.set(1, 1, 1)
      group.visible = true
    },
  })

  const spawn = (unit: UnitSnapshot): MissionActor => {
    const root = pool.acquire(unit.kind)
    root.name = unit.id
    layer.add(root)
    const actor: MissionActor = {
      id: unit.id,
      kind: unit.kind,
      root,
      unit,
      phase: unit.downed ? "downed" : "standing",
      fade: 1,
      seen: true,
      position: { x: unit.x, y: unit.y, height: unit.height, moving: false, stand: standOf(unit) },
      left: unit.facing === "LEFT",
      appearance: appearances[unit.id] ?? null,
      skeleton: { key: null, instance: null, role: null, pending: null },
    }
    actors.set(unit.id, actor)
    return actor
  }

  const dropSkeleton = (actor: MissionActor): void => {
    const skeleton = actor.skeleton
    if (skeleton.instance) {
      actor.root.remove(skeleton.instance.object3d)
      skeleton.instance.dispose()
    }
    if (skeleton.key) options.resources?.release(skeleton.key)
    skeleton.key = null
    skeleton.instance = null
    skeleton.role = null
  }

  const release = (actor: MissionActor): void => {
    dropSkeleton(actor)
    actor.phase = "released"
    layer.remove(actor.root)
    pool.release(actor.kind, actor.root)
    actors.delete(actor.id)
  }

  const loadSkeleton = (actor: MissionActor): void => {
    const appearance = actor.appearance
    const { skeleton: runtime, resources } = options
    if (!appearance || !runtime || !resources || actor.skeleton.key === appearance.spine) return
    dropSkeleton(actor)
    const key = appearance.spine
    actor.skeleton.key = key
    resources.spine(key).then(
      (data) => {
        if (actor.skeleton.key !== key || actor.phase === "released") return
        const instance = runtime.create(data)
        if (appearance.tint !== undefined) instance.setTint(appearance.tint)
        actor.skeleton.instance = instance
        actor.root.add(instance.object3d)
      },
      () => undefined,
    )
  }

  const lifecycle: ViewSystem<ActorFrame> = {
    id: "lifecycle",
    run(frame) {
      for (const actor of actors.values()) actor.seen = false
      for (const unit of frame.units) {
        const actor = actors.get(unit.id) ?? spawn(unit)
        actor.seen = true
        actor.unit = unit
        if (actor.phase === "fading") continue
        actor.phase = unit.downed ? "downed" : "standing"
      }
      for (const event of frame.events) {
        const actor = "unitId" in event.data ? actors.get(event.data.unitId) : undefined
        if (!actor) continue
        if (event.type === "removed") actor.phase = "fading"
        else if (event.type === "downed" && actor.phase === "standing") actor.phase = "downed"
        else if (event.type === "deploy") actor.skeleton.pending = "deploy"
        else if (event.type === "attack" && actor.skeleton.pending === null) actor.skeleton.pending = "attack"
      }
      for (const actor of actors.values()) if (!actor.seen && actor.phase !== "fading") actor.phase = "fading"
    },
  }

  const position: ViewSystem<ActorFrame> = {
    id: "position",
    run(frame) {
      for (const actor of actors.values()) {
        const place = actor.position
        place.x = actor.unit.x
        place.y = actor.unit.y
        place.height = options.surface ? options.surface(place.x, place.y) : actor.unit.height
        place.moving = frame.moving.has(actor.id)
        place.stand = standOf(actor.unit)
        const offset = actor.appearance?.offset
        actor.root.position.set(place.x + (offset?.x ?? 0), place.height + (offset?.z ?? 0), -(place.y + (offset?.y ?? 0)))
      }
    },
  }

  const facing: ViewSystem<ActorFrame> = {
    id: "facing",
    run() {
      for (const actor of actors.values()) {
        actor.left = actor.unit.facing === "LEFT"
        const appearance = actor.appearance
        const scale = appearance?.scale ?? 1
        const mirror = appearance?.mirrorX === true ? -1 : 1
        const sign = (actor.left ? -1 : 1) * mirror
        actor.root.scale.set(sign * scale, scale * (appearance?.scaleY ?? 1), scale)
      }
    },
  }

  const skeleton: ViewSystem<ActorFrame> = {
    id: "skeleton",
    run(frame) {
      for (const actor of actors.values()) {
        loadSkeleton(actor)
        const instance = actor.skeleton.instance
        const appearance = actor.appearance
        if (!instance || !appearance) continue
        const state = actor.skeleton
        let role: MissionActorRole
        if (actor.phase !== "standing") role = "die"
        else if (state.pending) role = state.pending
        else if (actor.position.moving) role = "move"
        else role = state.role === "deploy" || state.role === "attack" ? state.role : "idle"
        if (state.pending !== null || role !== state.role) {
          const animation = animationOf(appearance, role) ?? animationOf(appearance, "idle")
          if (animation) {
            instance.play(0, animation.name, animation.loop)
            const idle = animationOf(appearance, "idle")
            if (!animation.loop && role !== "die" && idle) instance.queue(0, idle.name, true)
          }
          state.role = role
        }
        state.pending = null
        instance.update(frame.deltaSeconds)
      }
    },
  }

  const releaseSystem: ViewSystem<ActorFrame> = {
    id: "release",
    run(frame) {
      for (const actor of [...actors.values()]) {
        if (actor.phase !== "fading") continue
        actor.fade = Math.max(0, actor.fade - frame.deltaSeconds / MISSION_ACTOR_FADE_SECONDS)
        actor.root.traverse((object) => {
          const material = (object as { material?: Material | readonly Material[] }).material
          for (const item of material === undefined ? [] : Array.isArray(material) ? material : [material]) {
            item.transparent = true
            item.opacity = actor.fade
          }
        })
        if (actor.fade <= 0) release(actor)
      }
    },
  }

  return {
    layer,
    actors,
    pool,
    setAppearances(next) {
      appearances = { ...appearances, ...next }
      for (const actor of actors.values()) actor.appearance = appearances[actor.id] ?? null
    },
    systems: [lifecycle, position, facing, skeleton, releaseSystem],
    clear() {
      for (const actor of [...actors.values()]) release(actor)
      appearances = {}
    },
  }
}

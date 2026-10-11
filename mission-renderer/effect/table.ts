import type { Group } from "three"
import type { UnitSnapshot } from "arknights-mission-core"
import type { MissionCue, MissionCueKey, MissionEffectKindId } from "#contract/cue.js"
import type { MissionActor } from "#actor/entity/index.js"
import { createSealedRegistry } from "#runtime/registry/index.js"
import { MISSION_EFFECT_KINDS } from "#effect/builtin.js"

/** What an effect reads and draws into while it plays. */
export interface MissionEffectContext {
  /** Parent of every effect's objects, in scene space (x = column, y = height, z = −row). */
  readonly layer: Group
  readonly actors: ReadonlyMap<string, MissionActor>
  readonly units: readonly UnitSnapshot[]
}

/**
 * A kind of effect, started by the cues whose keys it accepts. Instances are pooled per kind: `create` builds one
 * when the pool has none idle, `start` sets it up for a cue, `update` advances it every frame until it reports the
 * end, `end` takes it off the field before it goes back to the pool, and `dispose` frees an instance the pool drops.
 */
export interface MissionEffectKind<K extends MissionCueKey = MissionCueKey, TInstance = unknown> {
  readonly id: MissionEffectKindId
  /** Cue keys this kind can draw; a binding to any other key fails when the stage is created. */
  readonly accepts: readonly K[]
  create(context: MissionEffectContext): TInstance
  /** Returns false when the cue has nothing to draw, such as an anchor unit that is gone; the instance is ended at once. */
  start(instance: TInstance, cue: MissionCue<K>, context: MissionEffectContext): boolean
  /** Returns false once the effect has finished. */
  update(instance: TInstance, deltaSeconds: number, context: MissionEffectContext): boolean
  end(instance: TInstance, context: MissionEffectContext): void
  dispose(instance: TInstance): void
}

/** Effect kinds by id, starting with the engine's kinds. Fixed once sealed; creating a stage seals it. */
export interface MissionEffectTable {
  /** Adds a kind under a new id. */
  register<K extends MissionCueKey, TInstance>(kind: MissionEffectKind<K, TInstance>): void
  /** Puts a kind in place of the one registered under the same id. */
  replace<K extends MissionCueKey, TInstance>(kind: MissionEffectKind<K, TInstance>): void
  has(id: string): boolean
  get(id: string): MissionEffectKind | undefined
  ids(): readonly MissionEffectKindId[]
  seal(): void
  readonly sealed: boolean
}

export function createMissionEffectTable(): MissionEffectTable {
  const kinds = createSealedRegistry<MissionEffectKind>("Effect kind")
  for (const kind of MISSION_EFFECT_KINDS) kinds.register(kind)
  return {
    register: (kind) => kinds.register(kind as unknown as MissionEffectKind),
    replace: (kind) => kinds.replace(kind as unknown as MissionEffectKind),
    has: (id) => kinds.has(id),
    get: (id) => kinds.get(id),
    ids: () => kinds.ids() as MissionEffectKindId[],
    seal: () => kinds.seal(),
    get sealed() {
      return kinds.sealed
    },
  }
}

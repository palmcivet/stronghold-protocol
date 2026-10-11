import { Group } from 'three';
import type { ActorFrame, MissionActorWorld } from '#actor/entity/index.js';
import { createObjectPool, type ObjectPool } from '#actor/entity/pool.js';
import type { MissionEffectKindId } from '#contract/cue.js';
import { type MissionCueBindings, sealMissionCues } from '#effect/binding.js';
import { cueFor } from '#effect/cue.js';
import type {
  MissionEffectContext,
  MissionEffectKind,
  MissionEffectTable,
} from '#effect/table.js';
import type { ViewSystem } from '#runtime/stage/loop.js';

export interface MissionEffectLayerOptions {
  readonly table: MissionEffectTable;
  readonly bindings: MissionCueBindings;
  /** Called once per key when a cue key is neither bound nor declared, such as an undeclared kind; such cues draw nothing. */
  readonly onUnboundCue?: (key: string) => void;
}

export interface MissionEffectLayer {
  /** Parent of every effect's objects, in scene space. */
  readonly layer: Group;
  readonly system: ViewSystem<ActorFrame>;
  /** Effects playing now, by kind id. */
  live(): ReadonlyMap<MissionEffectKindId, number>;
  /** Instances waiting in the pool of a kind. */
  idle(id: MissionEffectKindId): number;
  /** Ends every playing effect and empties the pools. */
  clear(): void;
}

interface Playing {
  readonly kind: MissionEffectKind;
  readonly instance: unknown;
}

/**
 * Plays the effects the frame's cues start, and returns finished instances to their kind's pool. Seals the table and
 * the bindings, and throws when a binding names an effect kind that is missing or does not accept its key.
 */
export function createEffectLayer(
  world: MissionActorWorld,
  options: MissionEffectLayerOptions,
): MissionEffectLayer {
  sealMissionCues(options.table, options.bindings);
  const layer = new Group();
  layer.name = 'effects';
  const reported = new Set<string>();
  const pools = new Map<
    MissionEffectKindId,
    ObjectPool<MissionEffectKindId, unknown>
  >();
  let playing: Playing[] = [];
  let context: MissionEffectContext = {
    layer,
    actors: world.actors,
    units: [],
  };

  const poolOf = (
    kind: MissionEffectKind,
  ): ObjectPool<MissionEffectKindId, unknown> => {
    const existing = pools.get(kind.id);
    if (existing) {
      return existing;
    }
    const pool = createObjectPool<MissionEffectKindId, unknown>({
      create: () => kind.create(context),
      reset: () => undefined,
      dispose: (instance) => kind.dispose(instance),
    });
    pools.set(kind.id, pool);
    return pool;
  };

  const finish = (entry: Playing): void => {
    entry.kind.end(entry.instance, context);
    poolOf(entry.kind).release(entry.kind.id, entry.instance);
  };

  return {
    layer,
    system: {
      id: 'effect',
      run(frame) {
        context = { layer, actors: world.actors, units: frame.units };
        const next: Playing[] = [];
        for (const entry of playing) {
          if (entry.kind.update(entry.instance, frame.deltaSeconds, context)) {
            next.push(entry);
          } else {
            finish(entry);
          }
        }
        for (const event of frame.events) {
          const cue = cueFor(event);
          const binding = options.bindings.get(cue.key);
          if (!binding) {
            if (!reported.has(cue.key)) {
              reported.add(cue.key);
              options.onUnboundCue?.(cue.key);
            }
            continue;
          }
          const kind = binding.effect
            ? options.table.get(binding.effect)
            : undefined;
          if (!kind) {
            continue;
          }
          const entry = { kind, instance: poolOf(kind).acquire(kind.id) };
          if (kind.start(entry.instance, cue, context)) {
            next.push(entry);
          } else {
            finish(entry);
          }
        }
        playing = next;
      },
    },
    live() {
      const counts = new Map<MissionEffectKindId, number>();
      for (const entry of playing) {
        counts.set(entry.kind.id, (counts.get(entry.kind.id) ?? 0) + 1);
      }
      return counts;
    },
    idle: (id) => pools.get(id)?.idle(id) ?? 0,
    clear() {
      for (const entry of playing) {
        finish(entry);
      }
      playing = [];
      for (const pool of pools.values()) {
        pool.clear();
      }
    },
  };
}

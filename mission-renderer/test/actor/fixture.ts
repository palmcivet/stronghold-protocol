import type { AssetKey } from 'arknights-assets-catalog';
import {
  type BattleEvent,
  type BattleSnapshot,
  createBattle,
  type MissionModule,
  type UnitSpec,
} from 'arknights-mission-core';
import { Group } from 'three';
import type {
  MissionAnimRoles,
  MissionAppearance,
} from '#contract/appearance.js';
import type {
  MissionSkeletonData,
  MissionSkeletonEvent,
  MissionSkeletonInstance,
  MissionSkeletonRuntime,
} from '#port/skeleton.js';

export interface RecordedTick {
  readonly snapshot: BattleSnapshot;
  readonly events: readonly BattleEvent[];
}

const unit = (id: string, patch: Partial<UnitSpec>): UnitSpec => ({
  id,
  side: 'ally',
  attributes: { hp: 100, maxHp: 100, atk: 10, def: 0 },
  skills: [],
  attackRange: [{ x: 1, y: 0 }],
  tags: [],
  deployPositions: ['ground'],
  x: 0,
  y: 0,
  facing: 'RIGHT',
  hitArea: null,
  motion: 'WALK',
  route: null,
  ...patch,
});

/** A guard that strikes down an enemy in three blows; the enemy leaves the field at `removeAt`. Every tick is recorded. */
export function recordDuel(
  ticks: number,
  removeAt: number,
): readonly RecordedTick[] {
  const remover: MissionModule = {
    id: 'remover',
    install(ctx) {
      ctx.registerSystem({
        id: 'remove',
        slot: 'schedule',
        priority: 1,
        run: (run) =>
          run.tick() === removeAt ? run.removeUnit('e') : undefined,
      });
    },
  };
  const battle = createBattle(
    {
      seed: 1,
      modules: ['remover'],
      spawns: [],
      deployStrategy: null,
      tiles: [0, 1, 2].map((x) => ({
        x,
        y: 0,
        height: 0,
        deployable: true,
        walkableBy: ['ground'],
      })),
      units: [
        unit('g', {
          timers: ['attack'],
          attributes: { hp: 1000, maxHp: 1000, atk: 500, def: 0, bat: 1 },
        }),
        unit('e', {
          side: 'enemy',
          x: 1,
          facing: 'LEFT',
          attackRange: [],
          attributes: { hp: 1400, maxHp: 1400, atk: 0, def: 0 },
        }),
      ],
      cost: {
        ally: { initial: 0, regen: 0, cap: 0 },
        enemy: { initial: 0, regen: 0, cap: 0 },
      },
    },
    [remover],
  );
  const recorded: RecordedTick[] = [
    { snapshot: battle.snapshot(), events: battle.drainEvents() },
  ];
  for (let tick = 0; tick < ticks; tick += 1) {
    battle.step();
    recorded.push({
      snapshot: battle.snapshot(),
      events: battle.drainEvents(),
    });
  }
  return recorded;
}

export const ROLES: MissionAnimRoles = {
  idle: 'Idle',
  deploy: 'Start',
  attack: { begin: null, loop: 'Attack', end: null },
  attackDown: null,
  skill: null,
  die: 'Die',
  move: { begin: null, loop: 'Move', end: null },
  stun: null,
};

export function appearance(
  spine: string,
  patch: Partial<MissionAppearance> = {},
): MissionAppearance {
  return {
    spine: spine as AssetKey,
    roles: ROLES,
    scale: 1,
    scaleY: 1,
    mirrorX: false,
    offset: { x: 0, y: 0, z: 0 },
    ...patch,
  };
}

export interface FakeInstance extends MissionSkeletonInstance {
  readonly calls: string[];
  elapsed: number;
  disposed: boolean;
}

/** A skeleton runtime that records what the actors ask of it. */
export function fakeSkeleton() {
  const instances: FakeInstance[] = [];
  const runtime: MissionSkeletonRuntime = {
    load: () => ({
      animations: Object.values(ROLES).flatMap((role) =>
        typeof role === 'string' ? [role] : [],
      ),
      durations: {},
    }),
    create(data: MissionSkeletonData) {
      const listeners = new Set<(event: MissionSkeletonEvent) => void>();
      const instance: FakeInstance = {
        data,
        object3d: new Group(),
        calls: [],
        elapsed: 0,
        disposed: false,
        play: (track, animation, loop) =>
          void instance.calls.push(
            `play ${track} ${animation}${loop ? ' loop' : ''}`,
          ),
        queue: (track, animation, loop) =>
          void instance.calls.push(
            `queue ${track} ${animation}${loop ? ' loop' : ''}`,
          ),
        clear: (track) => void instance.calls.push(`clear ${track}`),
        update: (seconds) => {
          instance.elapsed += seconds;
        },
        onEvent: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        bounds: () => ({ x: 0, y: 0, width: 1, height: 1 }),
        setTint: (color) =>
          void instance.calls.push(`tint ${color.toString(16)}`),
        dispose: () => {
          instance.disposed = true;
        },
      };
      instances.push(instance);
      return instance;
    },
    dispose: () => undefined,
  };
  const released: string[] = [];
  const data = runtime.load({ skeleton: '', atlas: '', pages: {} });
  const resources = {
    spine: async (_key: AssetKey) => data,
    release: (key: AssetKey) => void released.push(key),
  };
  return { runtime, resources, instances, released };
}

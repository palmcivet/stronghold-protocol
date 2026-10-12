import {
  type BattleEvent,
  type BattleSpec,
  createBattle,
  defineTerrain,
  type MissionModule,
  OFFICIAL_TERRAIN_DEFAULTS,
  OFFICIAL_TERRAINS,
  officialTerrainModule,
  STEALTH,
  type TileSpec,
  type UnitSpec,
} from 'arknights-mission-core';
import { describe, expect, test } from 'vitest';
import { ally, spec } from '#test/fixture.js';

function tile(x: number, y: number, patch: Partial<TileSpec> = {}): TileSpec {
  return {
    x,
    y,
    height: 0,
    deployable: true,
    walkableBy: ['ground'],
    ...patch,
  };
}

interface Sample {
  readonly aspd: number;
  readonly moveSpeed: number;
  readonly atk: number;
  readonly hp: number;
  readonly stealth: boolean;
}

/** 每拍终局记下 u 的属性；at 拍把 u 挪到 (1, 0)。 */
function probe(
  samples: Sample[],
  moves: Readonly<Record<number, readonly [number, number]>> = {},
  setup?: MissionModule['install'],
): MissionModule {
  return {
    id: 'probe',
    install(ctx) {
      setup?.(ctx);
      ctx.registerSystem({
        id: 'probe',
        slot: 'finale',
        priority: 0,
        run(run) {
          const move = moves[run.tick()];
          if (move) {
            run.displace('u', move[0], move[1]);
          }
          samples.push({
            aspd: run.attribute('u', 'aspd'),
            moveSpeed: run.attribute('u', 'moveSpeed'),
            atk: run.attribute('u', 'atk'),
            hp: run.attribute('u', 'hp'),
            stealth: run.hasTag('u', STEALTH),
          });
        },
      });
    },
  };
}

function unit(patch: Partial<UnitSpec> = {}): UnitSpec {
  return ally('u', {
    attributes: { hp: 10000, atk: 100, def: 0, aspd: 100, moveSpeed: 1 },
    ...patch,
  });
}

function battleSpec(
  terrain: string,
  patch: Partial<UnitSpec> = {},
  notes?: BattleSpec['notes'],
): BattleSpec {
  const base = spec({
    modules: ['official-terrain', 'probe'],
    tiles: [tile(0, 0, { terrain }), tile(1, 0), tile(2, 0)],
    units: [unit(patch)],
  });
  return notes ? { ...base, notes } : base;
}

function run(
  spec: BattleSpec,
  ticks: number,
  moves: Readonly<Record<number, readonly [number, number]>> = {},
  setup?: MissionModule['install'],
): { samples: Sample[]; events: BattleEvent[] } {
  const samples: Sample[] = [];
  const battle = createBattle(spec, [
    officialTerrainModule,
    probe(samples, moves, setup),
  ]);
  const events: BattleEvent[] = [];
  for (let index = 0; index < ticks; index += 1) {
    battle.step();
    events.push(...battle.drainEvents());
  }
  return { samples, events };
}

const at = (samples: readonly Sample[], tick: number): Sample => {
  const sample = samples[tick];
  if (!sample) {
    throw new Error(`no sample at ${tick}`);
  }
  return sample;
};

describe('沼泽', () => {
  test('敌人进入时得一层，每秒再得一层：每层攻速 -5、移速 -5%，至多 10 层；离开时解除', () => {
    const { samples } = run(battleSpec('mire', { side: 'enemy' }), 400, {
      390: [1, 0],
    });
    expect(at(samples, 0)).toMatchObject({ aspd: 95, moveSpeed: 0.95 });
    expect(at(samples, 29).aspd).toBe(95);
    expect(at(samples, 30)).toMatchObject({ aspd: 90, moveSpeed: 0.9 });
    expect(at(samples, 269).aspd).toBe(55);
    expect(at(samples, 270)).toMatchObject({ aspd: 50, moveSpeed: 0.5 });
    expect(at(samples, 389)).toMatchObject({ aspd: 50, moveSpeed: 0.5 });
    expect(at(samples, 391)).toMatchObject({ aspd: 100, moveSpeed: 1 });
  });

  test('重量达到 3 的敌人每次得两层', () => {
    const { samples } = run(
      battleSpec('mire', {
        side: 'enemy',
        attributes: {
          hp: 10000,
          atk: 100,
          aspd: 100,
          moveSpeed: 1,
          massLevel: 3,
        },
      }),
      150,
    );
    expect(at(samples, 0)).toMatchObject({ aspd: 90, moveSpeed: 0.9 });
    expect(at(samples, 30).aspd).toBe(80);
    expect(at(samples, 120)).toMatchObject({ aspd: 50, moveSpeed: 0.5 });
    expect(at(samples, 149).aspd).toBe(50);
  });

  test('干员只减攻速', () => {
    const { samples } = run(battleSpec('mire'), 31);
    expect(at(samples, 30)).toMatchObject({ aspd: 90, moveSpeed: 1 });
  });

  test('notes 的 special.mire 盖过缺省数值', () => {
    const { samples } = run(
      battleSpec(
        'mire',
        { side: 'enemy' },
        {
          special: {
            mire: { intervalSec: 2, aspdPerStack: -0.1, maxStacks: 2 },
          },
        },
      ),
      200,
    );
    expect(at(samples, 0).aspd).toBe(90);
    expect(at(samples, 59).aspd).toBe(90);
    expect(at(samples, 60).aspd).toBe(80);
    expect(at(samples, 199).aspd).toBe(80);
  });
});

describe('排气格栅', () => {
  test('其上的干员隐匿，离开即解除；敌人不受影响', () => {
    const { samples } = run(battleSpec('smog'), 12, { 10: [1, 0] });
    expect(at(samples, 0).stealth).toBe(true);
    expect(at(samples, 10).stealth).toBe(true);
    expect(at(samples, 11).stealth).toBe(false);
    const enemy = run(battleSpec('smog', { side: 'enemy' }), 2);
    expect(at(enemy.samples, 1).stealth).toBe(false);
  });

  test('离开只取下格栅挂的那条，自己身上的隐匿留着', () => {
    const { samples } = run(battleSpec('smog'), 12, { 10: [1, 0] }, (ctx) => {
      ctx.subscribe('terrain-enter', (_event, run) =>
        run.applyEffect('u', 'stealth'),
      );
    });
    expect(at(samples, 11).stealth).toBe(true);
  });
});

describe('深水区', () => {
  test('地面敌人攻速 -60、移速 ×0.6，每秒受 40 点无来源真实伤害且不触发受击回复', () => {
    const { samples, events } = run(
      battleSpec('deepsea', { side: 'enemy' }),
      61,
    );
    expect(at(samples, 0)).toMatchObject({
      aspd: 40,
      moveSpeed: 0.6,
      hp: 10000,
    });
    expect(at(samples, 29).hp).toBe(10000);
    expect(at(samples, 30).hp).toBe(9960);
    expect(at(samples, 60).hp).toBe(9920);
    const damaged = events.filter((event) => event.type === 'damaged');
    expect(damaged).toHaveLength(2);
    expect(damaged[0]?.data).toMatchObject({
      sourceless: true,
      kind: 'true',
      noSp: true,
      amount: 40,
    });
  });

  test('干员与空中敌人不受影响', () => {
    const allies = run(battleSpec('deepsea'), 31);
    expect(at(allies.samples, 30)).toMatchObject({ aspd: 100, hp: 10000 });
    const flyer = run(
      battleSpec('deepsea', { side: 'enemy', motion: 'FLY' }),
      31,
    );
    expect(at(flyer.samples, 30)).toMatchObject({ aspd: 100, hp: 10000 });
  });

  test('#1 近地悬浮的敌人站在深水区上不受影响', () => {
    const { samples } = run(
      battleSpec('deepsea', { side: 'enemy', tags: ['float'] }),
      31,
    );
    expect(at(samples, 30)).toMatchObject({
      aspd: 100,
      moveSpeed: 1,
      hp: 10000,
    });
  });

  test('notes 的 special.deepsea.bb 盖过缺省数值', () => {
    const { samples } = run(
      battleSpec(
        'deepsea',
        { side: 'enemy' },
        {
          special: {
            deepsea: {
              bb: {
                'sea_drown[enemy].damage': 100,
                'sea_drown[enemy].attack_speed': -0.3,
                'sea_drown[enemy].move_speed': 0.5,
              },
            },
          },
        },
      ),
      31,
    );
    expect(at(samples, 30)).toMatchObject({
      aspd: 70,
      moveSpeed: 0.5,
      hp: 9900,
    });
  });
});

describe('活性源石', () => {
  test('攻击力 +20%、攻速 +20，每秒受 70 点真实伤害；站着不会再发 status', () => {
    const { samples, events } = run(battleSpec('infection'), 61);
    expect(at(samples, 0)).toMatchObject({ atk: 120, aspd: 120 });
    expect(at(samples, 30).hp).toBe(9930);
    expect(at(samples, 60).hp).toBe(9860);
    const status = events.filter(
      (event) => event.type === 'status' && event.data.statusId === 'infection',
    );
    expect(status).toHaveLength(1);
  });

  test('离开后继续计时到期；站着时一直补满时长', () => {
    const notes = { special: { infection: { bb: { duration: 1 } } } };
    const left = run(battleSpec('infection', {}, notes), 60, { 10: [1, 0] });
    expect(at(left.samples, 20).atk).toBe(120);
    expect(at(left.samples, 59).atk).toBe(100);
    const stay = run(battleSpec('infection', {}, notes), 90);
    expect(at(stay.samples, 89).atk).toBe(120);
  });

  test('缺省数值与官方一致', () => {
    expect(OFFICIAL_TERRAIN_DEFAULTS.infection).toEqual({
      damage: 70,
      atk: 0.2,
      attackSpeed: 20,
      duration: 300,
    });
  });
});

describe('扩展', () => {
  test('内容模块可以换掉官方地形', () => {
    const { samples } = run(
      battleSpec('mire', { side: 'enemy' }),
      2,
      {},
      (ctx) => ctx.replace(OFFICIAL_TERRAINS.mire, defineTerrain('mire', {})),
    );
    expect(at(samples, 1).aspd).toBe(100);
  });
});

describe('风机气流', () => {
  const board = {
    'blower_s_character[equal].atk': 0.1,
    'blower_s_character[opposite].atk': -0.1,
    'blower_s_character[vertical].atk': 0.05,
    'blower_s_enemy[equal].move_speed': 0.5,
    'blower_s_enemy[opposite].move_speed': -0.3,
  };
  /** 风机在 (0, 2) 朝下，吹 (0, 1) 与 (0, 0)。 */
  function fanSpec(
    patch: Partial<UnitSpec>,
    script: UnitSpec['script'] = board,
    notes?: BattleSpec['notes'],
  ): BattleSpec {
    const base = spec({
      modules: ['official-terrain', 'probe'],
      tiles: [tile(0, 0), tile(0, 1), tile(0, 2), tile(1, 0)],
      units: [
        {
          ...ally('fan', {
            kind: 'device',
            tags: ['blower'],
            x: 0,
            y: 2,
            facing: 'DOWN',
            attackRange: [
              { x: 1, y: 0 },
              { x: 2, y: 0 },
            ],
          }),
          ...(script ? { script } : {}),
        },
        unit(patch),
      ],
    });
    return notes ? { ...base, notes } : base;
  }

  test('干员按朝向与气流的关系改攻击力：同向、反向、垂直', () => {
    const atk = (facing: NonNullable<UnitSpec['facing']>): number =>
      at(run(fanSpec({ facing }), 2).samples, 1).atk;
    expect(atk('DOWN')).toBeCloseTo(110, 9);
    expect(atk('UP')).toBeCloseTo(90, 9);
    expect(atk('RIGHT')).toBeCloseTo(105, 9);
    expect(at(run(fanSpec({ motion: 'FLY' }), 2).samples, 1).atk).toBe(100);
  });

  test('干员离开作用格时解除', () => {
    const { samples } = run(fanSpec({ facing: 'DOWN' }), 4, { 2: [1, 0] });
    expect(at(samples, 1).atk).toBeCloseTo(110, 9);
    expect(at(samples, 3).atk).toBe(100);
  });

  test('敌人顺风加速、逆风减速，停下时保持上一次的推力，横穿时不变', () => {
    const moves: Record<number, readonly [number, number]> = {
      1: [0, 0.9],
      2: [0, 0.8],
      5: [0.1, 0.8],
      6: [0.1, 0.9],
    };
    const { samples } = run(fanSpec({ side: 'enemy', y: 1 }), 8, moves);
    expect(at(samples, 1).moveSpeed).toBe(1);
    expect(at(samples, 2).moveSpeed).toBe(1.5);
    expect(at(samples, 4).moveSpeed).toBe(1.5);
    expect(at(samples, 6).moveSpeed).toBe(1);
    expect(at(samples, 7).moveSpeed).toBe(0.7);
  });

  test('装置没写黑板时用 notes 的 special.blower.bb', () => {
    const { samples } = run(
      fanSpec({ facing: 'DOWN' }, undefined, {
        special: { blower: { bb: board } },
      }),
      2,
    );
    expect(at(samples, 1).atk).toBeCloseTo(110, 9);
  });
});

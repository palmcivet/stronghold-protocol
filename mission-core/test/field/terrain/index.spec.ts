import {
  type BattleEvent,
  type BattleSpec,
  createBattle,
  createGrid,
  defineEffect,
  defineTerrain,
  type MissionModule,
  type TerrainDefinition,
  type TileSpec,
  UnknownRegistrationError,
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

interface Probe {
  readonly log: string[];
  readonly atk: number[];
}

/** 注册效果与地形，并在终局记下 probe 单位的攻击力；at 拍把单位挪到 (1, 0)。 */
function terrainModule(
  terrain: Omit<TerrainDefinition, 'id'>,
  probe: Probe,
  moves: Readonly<Record<number, readonly [number, number]>> = {},
): MissionModule {
  return {
    id: 'zone',
    install(ctx) {
      ctx.registerEffect(
        defineEffect('zone-boost', {
          modifiers: [{ attribute: 'atk', op: 'add', value: 5 }],
        }),
      );
      ctx.registerTerrain(
        defineTerrain('zone', {
          ...terrain,
          onEnter: (unitId) => void probe.log.push(`enter ${unitId}`),
          onStay: (unitId, _ctx, count) =>
            void probe.log.push(`stay ${unitId} ${count}`),
          onLeave: (unitId) => void probe.log.push(`leave ${unitId}`),
        }),
      );
      ctx.registerSystem({
        id: 'zone-probe',
        slot: 'finale',
        priority: 0,
        run(run) {
          const move = moves[run.tick()];
          if (move) {
            run.displace('u', move[0], move[1]);
          }
          probe.atk.push(run.attribute('u', 'atk'));
        },
      });
    },
  };
}

function battleSpec(patch: Partial<BattleSpec> = {}): BattleSpec {
  return spec({
    modules: ['zone'],
    tiles: [tile(0, 0, { terrain: 'zone' }), tile(1, 0), tile(2, 0)],
    units: [ally('u', { side: 'enemy' })],
    ...patch,
  });
}

function terrainEvents(events: readonly BattleEvent[]): string[] {
  return events.flatMap((event) =>
    event.type === 'terrain-enter' || event.type === 'terrain-leave'
      ? [`${event.type} ${event.data.unitId} ${event.data.terrain}`]
      : [],
  );
}

function run(
  battle: ReturnType<typeof createBattle>,
  ticks: number,
): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (let index = 0; index < ticks; index += 1) {
    battle.step();
    events.push(...battle.drainEvents());
  }
  return events;
}

describe('地块地形', () => {
  test('站上去时进入并施加效果，按周期触发，离开时取下效果', () => {
    const probe: Probe = { log: [], atk: [] };
    const battle = createBattle(battleSpec(), [
      terrainModule({ effect: 'zone-boost', period: 1 }, probe, {
        40: [1, 0],
      }),
    ]);
    const events = run(battle, 45);
    expect(terrainEvents(events)).toEqual([
      'terrain-enter u zone',
      'terrain-leave u zone',
    ]);
    expect(probe.log).toEqual(['enter u', 'stay u 1', 'stay u 2', 'leave u']);
    expect(probe.atk[0]).toBe(15);
    expect(probe.atk[40]).toBe(15);
    expect(probe.atk[41]).toBe(10);
  });

  test('linger 的效果离开后继续计时到期', () => {
    const probe: Probe = { log: [], atk: [] };
    const battle = createBattle(battleSpec(), [
      terrainModule({ effect: 'zone-boost', linger: 1 }, probe, {
        10: [1, 0],
      }),
    ]);
    run(battle, 60);
    expect(probe.atk[11]).toBe(15);
    expect(probe.atk[59]).toBe(10);
  });

  test('条件 on-terrain 在单位受这种地形影响时成立', () => {
    const probe: Probe = { log: [], atk: [] };
    const battle = createBattle(
      battleSpec({
        units: [
          ally('u', {
            side: 'enemy',
            conditionalEffects: [
              {
                condition: 'on-terrain',
                params: { terrain: 'zone' },
                effect: 'zone-boost',
              },
            ],
          }),
        ],
      }),
      [terrainModule({}, probe, { 5: [1, 0] })],
    );
    run(battle, 8);
    expect(probe.atk[0]).toBe(15);
    expect(probe.atk[5]).toBe(15);
    expect(probe.atk[6]).toBe(10);
  });

  test('缺省不影响空中单位；affects 按阵营筛选', () => {
    const flying: Probe = { log: [], atk: [] };
    run(
      createBattle(
        battleSpec({ units: [ally('u', { side: 'enemy', motion: 'FLY' })] }),
        [terrainModule({ effect: 'zone-boost' }, flying)],
      ),
      3,
    );
    expect(flying.log).toEqual([]);
    const allies: Probe = { log: [], atk: [] };
    run(
      createBattle(battleSpec(), [
        terrainModule(
          { effect: 'zone-boost', affects: { sides: ['ally'] } },
          allies,
        ),
      ]),
      3,
    );
    expect(allies.log).toEqual([]);
    const air: Probe = { log: [], atk: [] };
    run(
      createBattle(
        battleSpec({ units: [ally('u', { side: 'enemy', motion: 'FLY' })] }),
        [terrainModule({ affects: { airborne: true } }, air)],
      ),
      3,
    );
    expect(air.log).toEqual(['enter u']);
  });

  test('地形的 deployable 与地块规格取「与」', () => {
    const tiles: TileSpec[] = [];
    const battle = createBattle(battleSpec(), [
      {
        id: 'zone',
        install(ctx) {
          ctx.registerTerrain(defineTerrain('zone', { deployable: false }));
          ctx.registerSystem({
            id: 'zone-read',
            slot: 'finale',
            priority: 0,
            run(read) {
              for (const x of [0, 1]) {
                const found = read.tile(x, 0);
                if (found) {
                  tiles.push(found);
                }
              }
            },
          });
        },
      },
    ]);
    battle.step();
    expect(tiles.map((found) => [found.deployable, found.terrain])).toEqual([
      [false, 'zone'],
      [true, undefined],
    ]);
  });

  test('规格或 setTerrain 写了未注册的地形时报错', () => {
    expect(() => createBattle(battleSpec({ modules: [] }), [])).toThrow(
      UnknownRegistrationError,
    );
    const battle = createBattle(battleSpec({ tiles: [tile(0, 0)] }), [
      {
        id: 'zone',
        install(ctx) {
          ctx.registerSystem({
            id: 'zone-set',
            slot: 'finale',
            priority: 0,
            run(set) {
              set.setTerrain(0, 0, 'nowhere');
            },
          });
        },
      },
    ]);
    expect(() => battle.step()).toThrow(UnknownRegistrationError);
  });

  test('setTerrain 改地形：网格版本加一，站在上面的单位离开旧地形；导出导入后接着推进', () => {
    const probe: Probe = { log: [], atk: [] };
    const module = (): MissionModule => {
      const base = terrainModule({ effect: 'zone-boost' }, probe);
      return {
        id: base.id,
        install(ctx) {
          base.install(ctx);
          ctx.registerSystem({
            id: 'zone-set',
            slot: 'finale',
            priority: 1,
            run(set) {
              if (set.tick() === 2) {
                set.setTerrain(0, 0, null);
              }
              if (set.tick() === 4) {
                set.setTerrain(0, 0, 'zone');
              }
            },
          });
        },
      };
    };
    const battle = createBattle(battleSpec(), [module()]);
    expect(terrainEvents(run(battle, 4))).toEqual([
      'terrain-enter u zone',
      'terrain-leave u zone',
    ]);
    const archive = battle.export();
    const resumed = createBattle(battleSpec(), [module()], archive);
    const original = run(battle, 4);
    const replayed = run(resumed, 4);
    expect(terrainEvents(replayed)).toEqual(terrainEvents(original));
    expect(terrainEvents(replayed)).toEqual(['terrain-enter u zone']);
    expect(resumed.snapshot()).toEqual(battle.snapshot());
    expect(JSON.stringify(resumed.export())).toBe(
      JSON.stringify(battle.export()),
    );
  });

  test('导出导入后站位不重复进入', () => {
    const probe: Probe = { log: [], atk: [] };
    const battle = createBattle(battleSpec(), [
      terrainModule({ period: 1 }, probe),
    ]);
    run(battle, 5);
    const resumed = createBattle(
      battleSpec(),
      [terrainModule({ period: 1 }, probe)],
      battle.export(),
    );
    probe.log.length = 0;
    expect(terrainEvents(run(resumed, 30))).toEqual([]);
    expect(probe.log).toEqual(['stay u 2']);
  });
});

describe('地形与寻路', () => {
  const corridor = (
    center: TerrainDefinition | null,
  ): ReturnType<typeof createGrid> => {
    const tiles: TileSpec[] = [];
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        tiles.push(
          tile(
            x,
            y,
            x === 1 && y === 1 && center ? { terrain: center.id } : {},
          ),
        );
      }
    }
    const grid = createGrid(tiles);
    if (center) {
      grid.attachTerrains(() => center);
    }
    return grid;
  };

  test('pathCost 抬高走进这一格的代价，路线绕开', () => {
    const plain = corridor(null);
    expect(plain.waypoints(0, 1, 2, 1)).toEqual([
      { x: 0, y: 1 },
      { x: 2, y: 1 },
    ]);
    const costly = corridor(defineTerrain('mud', { pathCost: 10 }));
    const field = costly.flowField(2, 1);
    expect(field.dist[costly.key(0, 1)]).toBe(4);
    expect(field.dist[plain.flowField(2, 1).dist.length - 1]).toBe(
      field.dist[costly.key(2, 2)],
    );
  });

  test('tieBreak：少踩不可阻挡格的捷径不能比官方路线多踩这种地形', () => {
    // (1,0) 不可阻挡；(0,1) 可阻挡，wet 时带 tieBreak。官方路线经 (1,0)，偏好路线绕开它走 (0,1)。
    const corner = (wet: boolean): ReturnType<typeof createGrid> => {
      const grid = createGrid([
        tile(0, 0),
        tile(1, 0, { deployable: false }),
        tile(0, 1, wet ? { terrain: 'wet' } : {}),
        tile(1, 1),
        tile(2, 1),
        tile(2, 0),
      ]);
      grid.attachTerrains(() => defineTerrain('wet', { tieBreak: 1 }));
      return grid;
    };
    const dry = corner(false);
    const dryField = dry.flowField(2, 1);
    const start = dry.key(0, 0);
    expect(dryField.official[start]).not.toBe(dryField.next[start]);
    const wet = corner(true);
    const wetField = wet.flowField(2, 1);
    expect(wetField.next[start]).toBe(wetField.official[start]);
    expect(wetField.dist).toEqual(dryField.dist);
  });

  test('setTerrain 让版本加一、流场作废；没有地块的格子不改', () => {
    const grid = corridor(defineTerrain('mud', { pathCost: 10 }));
    const before = grid.flowField(2, 1);
    grid.setTerrain(1, 1, null);
    expect(grid.version).toBe(1);
    const after = grid.flowField(2, 1);
    expect(after).not.toBe(before);
    expect(after.dist[grid.key(0, 1)]).toBe(2);
    grid.setTerrain(9, 9, 'mud');
    expect(grid.version).toBe(1);
    expect(grid.state().terrain).toEqual([[grid.key(1, 1), null]]);
  });

  test('没改过地形时 state 不带 terrain', () => {
    expect('terrain' in corridor(null).state()).toBe(false);
  });

  test('defineTerrain 拒绝不成立的数值', () => {
    expect(() => defineTerrain('bad', { pathCost: 0 })).toThrow(RangeError);
    expect(() => defineTerrain('bad', { tieBreak: -1 })).toThrow(RangeError);
    expect(() => defineTerrain('bad', { period: 0 })).toThrow(RangeError);
  });
});

describe('伤害标签', () => {
  test('dealDamage 的 tags 交给伤害步骤与修饰', () => {
    const seen: string[][] = [];
    const battle = createBattle(
      spec({ modules: ['tagged'], units: [ally('u', { side: 'enemy' })] }),
      [
        {
          id: 'tagged',
          install(ctx) {
            ctx.registerDamageModifier({
              id: 'read-tags',
              stage: 'hit',
              priority: 0,
              modify(change) {
                seen.push([...change.tags]);
                if (change.tags.includes('dot')) {
                  change.cancel = true;
                }
              },
            });
            ctx.registerSystem({
              id: 'tagged-hit',
              slot: 'finale',
              priority: 0,
              run(hit) {
                if (hit.tick() === 0) {
                  hit.dealDamage({
                    sourceId: '',
                    targetId: 'u',
                    amount: 30,
                    kind: 'true',
                    sourceless: true,
                    tags: ['terrain'],
                  });
                  hit.dealDamage({
                    sourceId: '',
                    targetId: 'u',
                    amount: 30,
                    kind: 'true',
                    sourceless: true,
                    tags: ['dot'],
                  });
                }
              },
            });
          },
        },
      ],
    );
    battle.step();
    expect(seen).toEqual([['terrain'], ['dot']]);
    expect(
      battle.snapshot().units.find((unit) => unit.id === 'u')?.attributes.hp,
    ).toBe(70);
  });
});

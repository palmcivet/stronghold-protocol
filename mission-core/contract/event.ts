import type { BattleInput } from '#contract/input.js';
import type { UnitSide } from '#contract/spec.js';

// MARK: payload

/** 普攻出手前。订阅者把 cancel 改成 true 时这一下不打出去。 */
export type AttackEvent = {
  readonly unitId: string;
  readonly targetIds: readonly string[];
  cancel: boolean;
  /** 改成 true 时这一下不用掉弹药、不送 ammo-used，照样算一次攻击。缺省没有。 */
  noAmmo?: boolean;
  /** 出手时正在生效的主动技能的下标（见 attack-hit）。 */
  readonly skillSlot?: number;
  /** 这一下没有普通目标，目标由登记的普攻替代给出：不结算伤害，只算一次攻击。 */
  readonly substitute?: true;
};

/** 一次普攻打了出去。noAmmo 为真时这一下不用掉弹药。 */
export type AttackHitEvent = {
  readonly unitId: string;
  readonly noAmmo?: true;
  /** 这一下的目标由普攻替代给出，没有结算伤害。只在这时带 targetIds。 */
  readonly substitute?: true;
  readonly targetIds?: readonly string[];
  /** 出手时正在生效的主动技能在单位技能列表里的下标，从 0 数起。没有生效的主动技能时没有这个字段。 */
  readonly skillSlot?: number;
};

/** 一次伤害进入减伤之前，hit 阶段的伤害修饰都已执行。数值的修改走伤害修饰。 */
export type HitEvent = {
  readonly sourceId: string;
  /** 记功的单位。sourceless 时 sourceId 是空串，creditId 仍是出手者。 */
  readonly creditId: string;
  readonly targetId: string;
  readonly amount: number;
  readonly kind: string;
  /** hit 阶段的修饰取消了这一击。 */
  readonly cancel: boolean;
  readonly sourceless: boolean;
  readonly element?: string;
  /** 来自普攻时，出手那一刻正在生效的主动技能的下标（见 attack-hit）。投射物到达时仍是出手时的值。 */
  readonly skillSlot?: number;
  /** 普攻带附加段时，本体与附加段共用的 id。 */
  readonly attackId?: string;
};

/** 元素损伤进槽之前，element-hit 阶段的伤害修饰都已执行。字段与 hit 相同，另带倍率。 */
export type ElementHitEvent = HitEvent & { readonly mul: number };

/** 麻痹打断敌人的一次普攻，用掉一层之前。订阅者把 keep 改成 true 时这一层留着；这次普攻照样被打断。 */
export type PalsyInterruptEvent = {
  readonly unitId: string;
  /** 用掉之前的层数。 */
  readonly stacks: number;
  keep: boolean;
};

/** 生命降到 0。订阅者把 prevented 改成 true 时留 1 点生命。 */
export type FatalEvent = {
  readonly sourceId: string;
  readonly creditId: string;
  readonly targetId: string;
  readonly amount: number;
  readonly kind: string;
  prevented: boolean;
  readonly sourceless: boolean;
};

export type DamagedEvent = {
  readonly sourceId: string;
  readonly creditId: string;
  readonly targetId: string;
  readonly amount: number;
  /** 实际扣掉的生命：结算前的生命减去结算后的生命，不含溢出。 */
  readonly applied: number;
  readonly kind: string;
  /** 结算之后的生命。 */
  readonly hp: number;
  readonly sourceless: boolean;
  readonly attack?: true;
  /** 这一击不触发受击回复。 */
  readonly noSp?: true;
  /** 官方红字：见 `DamageInfo.red`。 */
  readonly red?: true;
  /** 普攻带附加段时，本体与附加段共用的 id。 */
  readonly attackId?: string;
};

/** 闪避掉的一击。`miss` 表示这一击没闪开时会是红字，官方此时显示 MISS。 */
export type DodgedEvent = {
  readonly sourceId: string;
  readonly targetId: string;
  readonly kind: string;
  readonly miss?: true;
};

/** 流失：不经伤害步骤的扣血。 */
export type LossEvent = {
  readonly unitId: string;
  readonly amount: number;
  readonly hp: number;
};

export type HealEvent = {
  readonly unitId: string;
  /** 没有来源时是空串。 */
  readonly sourceId: string;
  /** 实际加上的生命。 */
  readonly amount: number;
  readonly hp: number;
};

export type UnitEvent = {
  readonly unitId: string;
};

/** 这一拍开始时接受的玩家输入。 */
export type InputEvent = {
  readonly input: BattleInput;
};

/** 这一拍开始时拒绝的玩家输入与原因，世界不变。 */
export type InputRefusedEvent = {
  readonly input: BattleInput;
  readonly reason: string;
};

/** 倒下。有部署策略时带上倒下的格子与能否站在那里。 */
export type DownedEvent = {
  readonly unitId: string;
  readonly x?: number;
  readonly y?: number;
  readonly canStand?: boolean;
};

/** 被移到 x、y。duration 是位移时长（秒），keepFacing 为真时画面保持原朝向。 */
export type DisplaceEvent = {
  readonly unitId: string;
  readonly x: number;
  readonly y: number;
  readonly duration: number;
  readonly keepFacing: boolean;
};

export type BlockEvent = {
  readonly blockerId: string;
  readonly enemyId: string;
};

export type CostEvent = {
  readonly side: UnitSide;
  readonly value: number;
};

export type ProjectileEvent = {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
};

export type SkillEvent = {
  readonly unitId: string;
  readonly skillId: string;
  readonly reason: string;
};

export type AmmoUsedEvent = {
  readonly unitId: string;
  readonly skillId: string;
  readonly left: number;
};

export type StatusEvent = {
  readonly unitId: string;
  readonly statusId: string;
  readonly stacks: number;
  /** 施加之前身上没有这个效果（条件效果挂上的也算有）：这次是新开始，不是刷新、加层或排进等待链。 */
  readonly entered: boolean;
};

export type ElementBurstEvent = {
  readonly sourceId: string;
  readonly targetId: string;
  readonly element: string;
};

// MARK: terrain

/** 单位进入或离开一格地形。x、y 是站位系统判定时所站的格子。 */
export type TerrainEvent = {
  readonly unitId: string;
  readonly terrain: string;
  readonly x: number;
  readonly y: number;
};

// MARK: cue

/** 画面线索的种类到附带数据。内容与模组经声明合并加入自己的种类。 */
// biome-ignore lint/suspicious/noEmptyInterface: 声明合并的扩展点，模组经 interface 合并加入画面线索种类
export interface CueMap {}

/** 画面线索。只给画面与音效，不影响结算。 */
export type CueEvent = {
  [K in keyof CueMap & string]: {
    readonly kind: K;
    readonly unitId?: string;
    readonly x?: number;
    readonly y?: number;
  } & CueMap[K];
}[keyof CueMap & string];

// MARK: map

/** 把事件标成可拦截：订阅者同步、按订阅顺序拿到可写的数据，发出者在分发后读回。 */
export interface Intercept<T> {
  readonly intercept: T;
}

/** 核心自己声明的事件。封闭：模块不往这里合并，而是合并进 BattleEventMap。 */
interface CoreBattleEventMap {
  attack: Intercept<AttackEvent>;
  'attack-hit': AttackHitEvent;
  hit: HitEvent;
  'element-hit': ElementHitEvent;
  fatal: Intercept<FatalEvent>;
  'palsy-interrupt': Intercept<PalsyInterruptEvent>;
  damaged: DamagedEvent;
  dodged: DodgedEvent;
  loss: LossEvent;
  heal: HealEvent;
  downed: DownedEvent;
  /** 离场且不再回来：召唤物消失、装置被摧毁、敌人漏出或被移除。从下一次快照起不再出现。 */
  removed: UnitEvent;
  deploy: UnitEvent;
  /** 被撤下，等待再部署。不算倒下。 */
  retreat: UnitEvent;
  input: InputEvent;
  'input-refused': InputRefusedEvent;
  spawn: UnitEvent;
  displace: DisplaceEvent;
  blocked: BlockEvent;
  unblocked: BlockEvent;
  cost: CostEvent;
  leak: UnitEvent;
  projectile: ProjectileEvent;
  'skill-start': SkillEvent;
  'skill-end': SkillEvent;
  'ammo-used': AmmoUsedEvent;
  status: StatusEvent;
  'element-burst': ElementBurstEvent;
  'terrain-enter': TerrainEvent;
  'terrain-leave': TerrainEvent;
  cue: CueEvent;
}

/**
 * 事件名到事件数据。写成 Intercept<数据> 的事件可拦截，其余只读、排队分发。模块经声明合并加入自己的事件，事件名写成 `<namespace>:<event>`：
 *
 * ```ts
 * declare module "arknights-mission-core" {
 *   interface BattleEventMap {
 *     "my-mod:doll-swap": { readonly unitId: string }
 *     "my-mod:doll-guard": Intercept<{ readonly unitId: string; cancel: boolean }>
 *   }
 * }
 * ```
 */
export interface BattleEventMap extends CoreBattleEventMap {}

/** 列出的事件名恰好覆盖全部核心事件时才接受：漏列或列入非核心事件都编译不过。 */
function coreEventTypes<const T extends readonly (keyof CoreBattleEventMap)[]>(
  types: T &
    ([Exclude<keyof CoreBattleEventMap, T[number]>] extends [never]
      ? unknown
      : { readonly missing: Exclude<keyof CoreBattleEventMap, T[number]> }),
): T {
  return Object.freeze(types);
}

/** 核心声明的全部事件名，封闭。模块经声明合并加入的事件不在其中。 */
export const CORE_EVENT_TYPES = coreEventTypes([
  'attack',
  'attack-hit',
  'hit',
  'element-hit',
  'fatal',
  'palsy-interrupt',
  'damaged',
  'dodged',
  'loss',
  'heal',
  'downed',
  'removed',
  'deploy',
  'retreat',
  'input',
  'input-refused',
  'spawn',
  'displace',
  'blocked',
  'unblocked',
  'cost',
  'leak',
  'projectile',
  'skill-start',
  'skill-end',
  'ammo-used',
  'status',
  'element-burst',
  'terrain-enter',
  'terrain-leave',
  'cue',
] as const);

/** 核心事件名。 */
export type CoreEventType = (typeof CORE_EVENT_TYPES)[number];

export type BattleEventType = keyof BattleEventMap & string;

/** 可拦截的事件名。 */
export type InterceptEventType = {
  [K in BattleEventType]: BattleEventMap[K] extends Intercept<unknown>
    ? K
    : never;
}[BattleEventType];

/** 只读、排队分发的事件名。 */
export type NoticeEventType = Exclude<BattleEventType, InterceptEventType>;

/** 事件数据：可拦截的事件是可写的数据，其余是只读的数据。还没有声明任何种类的 cue 是 never。 */
export type EventData<K extends BattleEventType> = [BattleEventMap[K]] extends [
  never,
]
  ? never
  : BattleEventMap[K] extends Intercept<infer T>
    ? T
    : Readonly<BattleEventMap[K]>;

/** 一条事件。不写 K 时是全部事件的联合，按 type 收窄。 */
export type BattleEvent<K extends BattleEventType = BattleEventType> = {
  [P in K]: {
    readonly tick: number;
    readonly type: P;
    readonly data: EventData<P>;
  };
}[K];

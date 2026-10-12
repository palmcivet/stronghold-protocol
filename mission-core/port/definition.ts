import type { PhaseSlot } from '#contract/phase.js';
import type {
  AttackShape,
  Direction,
  SkillMoment,
  TileCoord,
  UnitSide,
} from '#contract/spec.js';
import type {
  ExtensibleKey,
  ExtensionRecord,
} from '#kernel/registry/extensible.js';
import type { TimerDefinition } from '#kernel/timer/index.js';
import type { TagKey } from '#kernel/world/tag.js';
import type { ContentContext } from '#port/context.js';

/**
 * 修饰的聚合阶段，按这个顺序算：基础值 → 加值（add）→ 百分比（percent）→ 直接乘算（mul）→ 独立乘区（independent）。
 * 独立乘区是官方写明与其他加成独立的系数，例如练度。
 */
export const MODIFIER_OPS = ['add', 'percent', 'mul', 'independent'] as const;

export type ModifierOp = (typeof MODIFIER_OPS)[number];

export interface AttributeModifier {
  readonly attribute: string;
  readonly op: ModifierOp;
  readonly value: number;
}

/** 属性的定义。单位规格没写这个属性时用 base。 */
export interface AttributeDefinition {
  readonly id: string;
  readonly base: number;
  /** 聚合后的值夹在这个范围里。 */
  readonly clamp?: { readonly min?: number; readonly max?: number };
}

/** 一次施加。缺省的持续时间用效果自己的时长。 */
export interface EffectApplication {
  /** 秒。缺省用效果定义上的时长。Infinity 表示一直持续。0 或负数这次施加不成立。 */
  readonly duration?: number;
  /** 这次的强度。缺省用效果定义上的默认强度。 */
  readonly value?: number;
  /** 取最高时拿来比较的强度，缺省用 value。效果本身仍按 value 生效。 */
  readonly stackAs?: number;
  /** 施加者，交给 effect 阶段的修饰。 */
  readonly sourceId?: string;
}

/** 叠加策略看到的这一次施加，时长已经换成效果计时器的拍数。 */
export interface EffectIncoming {
  readonly ticks: number;
  readonly permanent: boolean;
  readonly value: number;
  /** 取最高时比较的强度。没有时用 value。 */
  readonly stackAs: number | null;
  /** 施加时的战场拍数。 */
  readonly at: number;
}

/** 取最高的等待链上的一项：当前那一次结束后，按强度递减、到期递增依次接续。until 是战场拍数。 */
export interface EffectWait {
  readonly value: number;
  readonly stackAs: number | null;
  readonly until: number;
}

/** 单位身上的一条效果，叠加策略读写的就是它。 */
export interface EffectRecord {
  id: string;
  stacks: number;
  remaining: number;
  permanent: boolean;
  shield: number;
  shieldHits: number;
  runtimeModifiers: AttributeModifier[];
  pulse: number;
  /** 这次施加之前已经在身上。 */
  carried: boolean;
  /** 刷新前剩下的拍数。一直持续记成 Infinity。 */
  priorRemaining: number;
  /** 取最高、抵抗用的强度。没有时是 0。 */
  strength: number;
  /** 取最高时比较的强度。没有时用 strength。 */
  stackAs: number | null;
  dropped: boolean;
  /** 取最高的等待链。 */
  waits: EffectWait[];
  /** 条件效果挂上的这一条记的条件来源，其余是 null。 */
  source: string | null;
}

export interface EffectDefinition {
  readonly id: string;
  /** 效果在身上时授予的标签，来源记为这个效果。 */
  readonly grantsTags: readonly TagKey[];
  readonly modifiers: readonly AttributeModifier[];
  /** 身上已有这些效果时，挡住别的效果。名单用免疫名，例如冻结是 frozen。 */
  readonly immunity: readonly string[];
  /**
   * 这个效果自己被挡住时，单位免疫名单里对应的名字。
   * 与效果 id 可以不同，冻结的 id 是 freeze，免疫名是 frozen。
   */
  readonly immune?: string;
  readonly stackCap: number;
  /** 施加时取消的计时器。 */
  readonly cancels: readonly string[];
  /** 0 表示一直持续，直到被取下。正数是效果计时器推进的次数。 */
  readonly duration: number;
  /** 为真时只调用 onApply 并发 status，不留在身上。 */
  readonly instant: boolean;
  /** onTick 每隔这么多拍调用一次。缺省 1。 */
  readonly period: number;
  /** 叠加策略 id。 */
  readonly stacking: string;
  /** 缺省强度。慢速、脆弱这类同名取最高的效果用它。 */
  readonly valued?: number;
  /** 按这次的强度写出修饰。和 modifiers 同时存在时两边都会汇总。 */
  scale?(value: number): readonly AttributeModifier[];
  onApply?(unitId: string, stacks: number, ctx: ContentContext): void;
  onTick?(unitId: string, stacks: number, ctx: ContentContext): void;
  /** 到期、被取下或条件不再成立而离开单位时。 */
  onRemove?(unitId: string, ctx: ContentContext): void;
  /** 为真时友方倒下或撤下后仍留在身上，再部署时带着。缺省倒下时取下。特性、天赋这类常驻效果用它。 */
  readonly keepOnDown?: boolean;
  /** 这条效果带的数值护盾与次数护盾只挡这些伤害种类（physical、arts、true、element，按伤害的 kind）。缺省挡所有种类。 */
  readonly shieldType?: readonly string[];
}

/** 同名效果再施加时怎么叠。返回 undefined 表示这次不生效。 */
export interface StackingDefinition {
  readonly id: string;
  apply(
    effects: EffectRecord[],
    existing: EffectRecord | undefined,
    incoming: EffectIncoming,
    definition: EffectDefinition,
  ): EffectRecord | undefined;
}

/** 条件效果的条件。params 是规格里的纯数据。 */
export interface ConditionDefinition {
  readonly id: string;
  evaluate(
    unitId: string,
    params: Readonly<Record<string, unknown>>,
    ctx: ContentContext,
  ): boolean;
}

/** 技能规格 hooks 里按 id 引用的回调。 */
export interface SkillHookDefinition {
  readonly id: string;
  run(moment: SkillMoment, ctx: ContentContext): void;
}

export interface DamageInfo {
  sourceId: string;
  targetId: string;
  amount: number;
  kind: string;
  /** 这一击自带的乘数。缺省为 1。 */
  mul?: number;
  defIgnorePct?: number;
  defIgnoreFlat?: number;
  resIgnorePct?: number;
  resIgnoreFlat?: number;
  /** 元素标识。kind 为 element 时写入这个槽。 */
  element?: string;
  /** 缺省时物理和法术可以闪避，真实和元素不行。 */
  canDodge?: boolean;
  /** 无来源。不用来源的伤害乘算和穿透，击杀仍记在 sourceId。起飞挡不住它。 */
  sourceless?: boolean;
  /** 不触发受击回复。 */
  noSp?: boolean;
  /** 沉睡挡不住这一击。 */
  ignoreSleep?: boolean;
  /** 起飞的对地规避挡不住这一击。 */
  ignoreSelect?: boolean;
  /** 为 true 后，后面的步骤不再写生命。 */
  cancel?: boolean;
  /** 这一击来自攻击计时，而不是技能或流失。 */
  attack?: boolean;
  /** 伤害标签，kebab-case。伤害修饰与订阅者按它区分来路，例如环境伤害 `terrain`、持续伤害 `dot`。 */
  tags?: readonly string[];
}

/** 这一次伤害结算的方式。 */
export interface DamagePass {
  /** 减伤预览。算出护盾后的数字，不掷闪避，不写生命，不扣护盾，不填槽，不发事件。 */
  readonly preview: boolean;
}

export interface DamageStepDefinition {
  readonly id: string;
  /** 同一条伤害里的顺序。数字小的先执行，相同数字按注册先后。 */
  readonly priority: number;
  apply(info: DamageInfo, ctx: ContentContext, pass: DamagePass): void;
}

/**
 * 伤害修饰的阶段。每个阶段规定修饰能改什么：
 * - `hit`：进入减伤之前，可以改数额、倍率、类型或取消；
 * - `element-hit`：元素损伤进槽之前，可以改数额、倍率、类型或取消；
 * - `hp`：护盾之后、扣生命之前，只能调低数额。流失与被护盾整段吸收的伤害不经过这一阶段。
 * - `effect`：一次效果施加在免疫之后、叠加之前，可以改这次的拍数、是否一直持续、强度，或取消。
 *   内置的抵抗（priority 100）与重量超过 3 的浮空、缚地减半（priority 200）也是这一阶段的修饰。
 */
export const DAMAGE_STAGES = ['hit', 'element-hit', 'hp', 'effect'] as const;

export type DamageStage = (typeof DAMAGE_STAGES)[number];

/** 一次伤害的来龙去脉。 */
export interface DamageOrigin {
  readonly sourceId: string;
  /** 记功的单位。sourceless 时 sourceId 是空串，creditId 仍是出手者。 */
  readonly creditId: string;
  readonly targetId: string;
  readonly sourceless: boolean;
  readonly element?: string;
  /** 这一击来自攻击计时。 */
  readonly attack: boolean;
  /** 这一击的伤害标签，没写时是空名单。 */
  readonly tags: readonly string[];
}

/** hit 与 element-hit 阶段修饰可写的数据。非有限的数额或倍率不生效。 */
export interface HitChange extends DamageOrigin {
  amount: number;
  mul: number;
  kind: string;
  cancel: boolean;
}

/** hp 阶段修饰可写的数据。数额只能调低：调高、负数以下的部分与非有限值都不生效。 */
export interface HpChange extends DamageOrigin {
  readonly kind: string;
  amount: number;
}

interface DamageModifierBase {
  readonly id: string;
  /** 同一阶段里的顺序。数字小的先执行，相同数字按注册先后。 */
  readonly priority: number;
}

/**
 * effect 阶段修饰可写的数据。ticks 是效果计时器的拍数；permanent 为真时 ticks 不用。
 * 拍数不是正数且不一直持续时这次施加不成立；非有限的拍数或强度不生效。
 */
export interface EffectChange {
  readonly unitId: string;
  readonly effectId: string;
  /** 施加者。施加时没给出时是 null。 */
  readonly sourceId: string | null;
  ticks: number;
  permanent: boolean;
  value: number;
  cancel: boolean;
}

export type DamageModifierDefinition =
  | (DamageModifierBase & {
      readonly stage: 'hit' | 'element-hit';
      modify(change: HitChange, ctx: ContentContext): void;
    })
  | (DamageModifierBase & {
      readonly stage: 'hp';
      modify(change: HpChange, ctx: ContentContext): void;
    })
  | (DamageModifierBase & {
      readonly stage: 'effect';
      modify(change: EffectChange, ctx: ContentContext): void;
    });

export interface DamagePreview {
  readonly sourceId: string;
  readonly targetId: string;
  readonly amount: number;
  readonly kind: string;
  readonly steps: readonly string[];
}

export interface ElementDefinition {
  readonly id: string;
  /**
   * 元素槽显示值的先后：一样满时取 order 小的，order 也相同时按 id 的字典序。
   * 模块加的元素用它排进内置元素之间；不写时排在全部内置元素之后。
   */
  readonly order?: number;
  readonly cap: number;
  readonly resistance: number;
  onBurst?(unitId: string, ctx: ContentContext, sourceId?: string): void;
}

/** 一次选择器查询。 */
export interface SelectorQuery {
  /** 以谁为攻击者。按范围查询时是查询的单位，直接筛选一份名单时是 null。 */
  readonly origin: string | null;
}

export interface SelectorDefinition {
  readonly id: string;
  /** 筛选只缩小名单，排序只改顺序。缺省时两条都走。 */
  readonly kind?: 'filter' | 'sort';
  filter(unitId: string, ctx: ContentContext, query: SelectorQuery): boolean;
  compare(
    left: string,
    right: string,
    ctx: ContentContext,
    query: SelectorQuery,
  ): number;
}

export interface SkillTriggerDefinition {
  readonly id: string;
  shouldCast(unitId: string, skillId: string, ctx: ContentContext): boolean;
}

export interface SkillRuntime {
  active: boolean;
  remaining: number;
  ammo: number;
  toggled: boolean;
}

export interface SkillBodyDefinition {
  readonly id: string;
  cast(
    skill: SkillRuntime,
    spec: { readonly duration: number; readonly ammo: number },
  ): void;
  advance(skill: SkillRuntime, ctx: ContentContext): void;
  /** 释放、结束、每拍、命中。在技能规格 hooks 引用的技能钩子之后调用。 */
  onCast?(unitId: string, skillId: string, ctx: ContentContext): void;
  onEnd?(unitId: string, skillId: string, ctx: ContentContext): void;
  onTick?(unitId: string, skillId: string, ctx: ContentContext): void;
  onHit?(unitId: string, skillId: string, ctx: ContentContext): void;
}

export type ContentTimerDefinition = TimerDefinition<ContentContext>;

/** 推、拉、恐惧、诱导的输入。用到的字段由这个动作自己读。 */
export interface ShiftInput {
  readonly force?: number;
  readonly fromX?: number;
  readonly fromY?: number;
  readonly dirX?: number;
  readonly dirY?: number;
  readonly toX?: number;
  readonly toY?: number;
  readonly centerX?: number;
  readonly centerY?: number;
  readonly sourceX?: number;
  readonly sourceY?: number;
  readonly effect?: boolean;
  /** 定向推不做两项修正（离起点太近、夹角超过 45°）。 */
  readonly fixed?: boolean;
  /** 定向推只免去夹角修正，离起点太近照样修正。 */
  readonly fixedAngle?: boolean;
  readonly inward?: boolean;
  /** 立即完成的位移在画面上是否保持原朝向。缺省 true。 */
  readonly keepFacing?: boolean;
}

export interface ShiftPlan {
  readonly x: number;
  readonly y: number;
  readonly points?: readonly TileCoord[];
  /** 这次受力让目标失衡的秒数。落点可以就是当前坐标：只失衡、不移动。 */
  readonly unbalance?: number;
}

export interface ShiftDefinition {
  readonly id: string;
  /** 为真时这一拍就写到落点。为假时沿 points 走，倒地先落到 x、y。 */
  readonly instant: boolean;
  plan(
    unitId: string,
    input: ShiftInput,
    ctx: ContentContext,
  ): ShiftPlan | null;
}

/** 地形影响谁。缺省只影响两边的地面单位：飞行、空中与路线隐藏的单位不受影响。 */
export interface TerrainAffects {
  /** 受影响的阵营。缺省两边。 */
  readonly sides?: readonly UnitSide[];
  /** 为真时空中单位（飞行、浮空、近地悬浮）也受影响。 */
  readonly airborne?: boolean;
}

/** 一种地块地形。站上去时进入，离开时离开；数值由定义它的模块决定。 */
export interface TerrainDefinition {
  readonly id: string;
  /** 站在上面时施加的效果 id。没有 linger 时按来源 `terrain:<id>` 单独挂一条，离开只取下这一条。 */
  readonly effect?: string;
  /**
   * 秒，或在战斗里按 notes 算出秒数的函数。给了时站在上面每拍把效果的剩余时长补到这么长，离开后效果继续计时到期。
   * 补时不发 status，也不打断 onTick 的节奏。
   */
  readonly linger?: number | ((ctx: ContentContext) => number);
  /** 秒。给了时进入那一拍与之后每隔这么久调用一次 onStay。 */
  readonly period?: number;
  readonly affects?: TerrainAffects;
  /** 地面寻路走进这一格的代价，正整数。缺省 1。 */
  readonly pathCost?: number;
  /** 寻路权重，非负整数。少踩不可阻挡格的捷径沿途累计的权重不能比官方路线多。缺省 0。 */
  readonly tieBreak?: number;
  /** 为 false 时这一格拒绝部署，与地块规格的 deployable 取「与」。缺省 true。 */
  readonly deployable?: boolean;
  onEnter?(unitId: string, ctx: ContentContext): void;
  /** count 从 1 起，是这次停留里第几次触发。 */
  onStay?(unitId: string, ctx: ContentContext, count: number): void;
  onLeave?(unitId: string, ctx: ContentContext): void;
}

/** 单位这一拍所在的作用区：放出它的装置、装置的朝向、单位上一拍以来的位移。 */
export interface ZoneVisit {
  readonly deviceId: string;
  readonly facing: Direction;
  /** 上一拍以来的位移（格）。上一拍没有记录时为 null。 */
  readonly moved: { readonly dx: number; readonly dy: number } | null;
}

/**
 * 装置作用区。带 source 标签的在场单位按自己的攻击范围与朝向圈出一片格子；单位站在里面时每拍调 onStay，
 * 离开时调 onLeave。同一格被同一种作用区的几台装置覆盖时，入场晚的那台算数。
 */
export interface ZoneDefinition {
  readonly id: string;
  readonly source: TagKey;
  onStay(unitId: string, ctx: ContentContext, visit: ZoneVisit): void;
  onLeave?(unitId: string, ctx: ContentContext): void;
}

export interface DeployStrategyDefinition {
  readonly id: string;
  opening(ctx: ContentContext): readonly string[];
  downedTile(unitId: string, ctx: ContentContext): TileCoord;
  canStand(unitId: string, tile: TileCoord, ctx: ContentContext): boolean;
}

/** 系统执行顺序里的一项。 */
export interface SystemOrderEntry {
  readonly slot: PhaseSlot;
  readonly id: string;
}

export interface PhaseSystem {
  readonly id: string;
  readonly slot: PhaseSlot;
  /** 同一阶段槽里的顺序。数字小的先执行，相同数字按注册先后。 */
  readonly priority: number;
  /** 排在这些同槽系统之前。在 priority 与注册先后之上再满足。 */
  readonly before?: readonly string[];
  /** 排在这些同槽系统之后。 */
  readonly after?: readonly string[];
  run(ctx: ContentContext): void;
}

/** 到达后按攻击形状结算。没有这份数据时，到达只造成 amount 的 physical 伤害。 */
export interface ProjectileImpact {
  readonly shape: AttackShape;
  readonly hitCount: number;
  /** 飞出的一发。回到投掷者时是 back。 */
  readonly leg?: 'out' | 'back';
  /** 飞回的速度。有这个数时，飞出到达后朝来源再飞一发，回程不结算伤害。 */
  readonly returnSpeed?: number;
}

export interface ProjectileLaunch {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly amount: number;
  /** 格/秒。缺省用 PROJECTILE_SPEED。 */
  readonly speed?: number;
  /** 出发坐标。缺省用来源单位的当前位置。 */
  readonly x?: number;
  readonly y?: number;
  /** 目标离场后仍飞向最后看到的坐标并结算。 */
  readonly retain?: boolean;
  readonly attack?: ProjectileImpact;
}

/** 仍在飞的一发。到达或目标中途离场后不再出现。 */
export interface ProjectileView {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly amount: number;
  readonly speed: number;
  readonly x: number;
  readonly y: number;
}

/** 本场注册的全部定义。内容经 Registration 写入，引擎按 id 读取。 */
export interface BattleRegistry extends ExtensibleRegistry {
  registerAttribute(definition: AttributeDefinition): void;
  /** 没有注册的属性返回 undefined。 */
  findAttribute(id: string): AttributeDefinition | undefined;
  registerEffect(definition: EffectDefinition): void;
  requireEffect(id: string): EffectDefinition;
  hasEffect(id: string): boolean;
  registerStacking(definition: StackingDefinition): void;
  requireStacking(id: string): StackingDefinition;
  registerCondition(definition: ConditionDefinition): void;
  requireCondition(id: string): ConditionDefinition;
  registerSkillHook(definition: SkillHookDefinition): void;
  requireSkillHook(id: string): SkillHookDefinition;
  registerDamageStep(definition: DamageStepDefinition): void;
  damageSteps(): readonly DamageStepDefinition[];
  registerDamageModifier(definition: DamageModifierDefinition): void;
  /** 这一阶段的修饰，按 priority 再按注册先后。 */
  damageModifiers(stage: DamageStage): readonly DamageModifierDefinition[];
  registerElement(definition: ElementDefinition): void;
  requireElement(id: string): ElementDefinition;
  registerSelector(definition: SelectorDefinition): void;
  requireSelector(id: string): SelectorDefinition;
  registerSkillTrigger(definition: SkillTriggerDefinition): void;
  requireSkillTrigger(id: string): SkillTriggerDefinition;
  hasSkillTrigger(id: string): boolean;
  registerSkillBody(definition: SkillBodyDefinition): void;
  requireSkillBody(id: string): SkillBodyDefinition;
  hasSkillBody(id: string): boolean;
  registerTimer(definition: ContentTimerDefinition): void;
  requireTimer(id: string): ContentTimerDefinition;
  timersInSlot(slot: PhaseSlot): readonly ContentTimerDefinition[];
  registerDeployStrategy(definition: DeployStrategyDefinition): void;
  requireDeployStrategy(id: string): DeployStrategyDefinition;
  registerShift(definition: ShiftDefinition): void;
  requireShift(id: string): ShiftDefinition;
  registerTerrain(definition: TerrainDefinition): void;
  requireTerrain(id: string): TerrainDefinition;
  hasTerrain(id: string): boolean;
  registerZone(definition: ZoneDefinition): void;
  requireZone(id: string): ZoneDefinition;
  /** 按注册先后。 */
  zones(): readonly ZoneDefinition[];
  registerSystem(system: PhaseSystem): void;
  systemsIn(slot: PhaseSlot): readonly PhaseSystem[];
  /** 全部系统的执行顺序：按阶段槽，再按槽内顺序。 */
  systemOrder(): readonly SystemOrderEntry[];
  registerTag(key: TagKey): void;
  /** owner 写进未注册的报错，例如单位规格。 */
  requireTag(id: string, owner?: string): TagKey;
  /** 之后的 replace 与 wrap 记在这个模块名下。 */
  installing(moduleId: string): void;
}

// MARK: extensible

/** 第一批开放替换的注册表，到各自的定义。 */
export interface ExtensibleDefinitions {
  'skill-trigger': SkillTriggerDefinition;
  'skill-body': SkillBodyDefinition;
  selector: SelectorDefinition;
  'damage-step': DamageStepDefinition;
  stacking: StackingDefinition;
  condition: ConditionDefinition;
  deploy: DeployStrategyDefinition;
  element: ElementDefinition;
  terrain: TerrainDefinition;
  zone: ZoneDefinition;
}

export type ExtensibleContract = keyof ExtensibleDefinitions;

export const EXTENSIBLE_CONTRACTS = [
  'skill-trigger',
  'skill-body',
  'selector',
  'damage-step',
  'stacking',
  'condition',
  'deploy',
  'element',
  'terrain',
  'zone',
] as const satisfies readonly ExtensibleContract[];

/** 标记可扩展 id 并替换或包装它。只有标记过的 id 可以替换，版本要与标记时一致。 */
export interface ExtensibleRegistry {
  /** 标记一个已注册或将要注册的 id 可以替换。 */
  markExtensible(key: ExtensibleKey<ExtensibleContract>): void;
  /** 换掉 key 指向的注册项。definition.id 必须等于 key.id。 */
  replace<C extends ExtensibleContract>(
    key: ExtensibleKey<C>,
    definition: ExtensibleDefinitions[C],
  ): void;
  /** 用 wrap 的返回值换掉 key 指向的注册项，wrap 拿到原来那项。 */
  wrap<C extends ExtensibleContract>(
    key: ExtensibleKey<C>,
    wrap: (inner: ExtensibleDefinitions[C]) => ExtensibleDefinitions[C],
  ): void;
  /** 按发生顺序的替换链。 */
  extensions(): readonly ExtensionRecord[];
}

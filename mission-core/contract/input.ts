import type { Direction, TileCoord } from '#contract/spec.js';

/**
 * 玩家能提交的输入。每拍开始时按提交顺序生效，接受的送出 input，拒绝的送出 input-refused，世界里不留记录；
 * 输入日志由调用方保存。费用与冷却按规则算，输入里不能指定。
 */
export type BattleInput =
  /** 把还没上过场的友方单位部署到 tile，朝向缺省是规格里的朝向。格子能站、费用够时生效。 */
  | {
      readonly type: 'deploy';
      readonly unitId: string;
      readonly tile: TileCoord;
      readonly facing?: Direction;
    }
  /** 撤下在场的友方单位，开始再部署计时。不算倒下。 */
  | { readonly type: 'retreat'; readonly unitId: string }
  /** 让等待再部署的友方单位回到场上：计时走完、费用够、格子能站时生效。tile 缺省是它等待时的坐标。 */
  | {
      readonly type: 'redeploy';
      readonly unitId: string;
      readonly tile?: TileCoord;
    }
  /** 手动释放技能。 */
  | {
      readonly type: 'cast';
      readonly unitId: string;
      readonly skillId: string;
    };

export type BattleInputType = BattleInput['type'];

export const BATTLE_INPUT_TYPES: readonly BattleInputType[] = [
  'deploy',
  'retreat',
  'redeploy',
  'cast',
];

/** 内容下的再部署命令里可以改的规则。玩家输入不能带这些。 */
export interface RedeployOrder {
  /** 落在这一格。缺省是等待时的坐标。 */
  readonly tile?: TileCoord;
  /** 再等这么多秒。0 是立即；缺省按 respawnTime × redeployMul 的计时。 */
  readonly delay?: number;
  /** 回来时扣的费用。0 是免费；缺省是单位的 cost。 */
  readonly cost?: number;
  /** 回来时保留技力与充能。 */
  readonly keepSp?: boolean;
}

/** 命令没有生效时的原因。 */
export type CommandRefusal =
  | 'unknown-unit'
  | 'not-ally'
  | 'not-fielded'
  | 'not-waiting'
  | 'not-reserve'
  | 'not-ready'
  | 'no-cost'
  | 'tile-blocked'
  | 'bad-order'
  | 'no-redeploy';

/** 触发区域的判定时机：tick 每拍判定，attack 只在下一次普攻时点判定。 */
export type TriggerCadence = 'tick' | 'attack';

/** 内容登记的技能触发区域：绝对格子，或某个单位当前的攻击范围。 */
export type TriggerArea = readonly TileCoord[] | { readonly unitId: string };

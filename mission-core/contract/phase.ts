// 定时回调、刷怪、费用、状态、敌人行动、敌人索引、友方行动、投射物、再部署、终局。
export const phaseSlots = [
  "schedule",
  "spawn",
  "cost",
  "status",
  "enemy",
  "enemy-index",
  "ally",
  "projectile",
  "redeploy",
  "finale",
] as const

export type PhaseSlot = (typeof phaseSlots)[number]

export function isPhaseSlot(slot: string): slot is PhaseSlot {
  return (phaseSlots as readonly string[]).includes(slot)
}

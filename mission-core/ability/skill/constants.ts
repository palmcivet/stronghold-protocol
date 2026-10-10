import { SKILL_OPERATIONS, SP_TYPES, type SkillOperation, type SpType } from "#contract/spec.js"

/** 自动操作冷却，秒。开战部署和每次手动技能释放之后开始计算。 */
export const AUTO_OP_COOLDOWN = 3

export type { SkillOperation, SpType }

export const BUILTIN_SKILL_TRIGGERS = [
  "DEFAULT",
  "SKILL_RANGE",
  "TAKE_DAMAGE",
  "SP_FULL",
  "CUSTOM_RANGE",
  "SEARCH",
  "GDGLOW_SKILL_2",
  "NEVER",
] as const

const TICK_RULES = new Set<string>(["SP_FULL", "SEARCH", "CUSTOM_RANGE", "SKILL_RANGE", "GDGLOW_SKILL_2"])

export function isSpType(value: string): value is SpType {
  return (SP_TYPES as readonly string[]).includes(value)
}

export function isSkillOperation(value: string): value is SkillOperation {
  return (SKILL_OPERATIONS as readonly string[]).includes(value)
}

/** ALWAYS 记成 SP_FULL，MANUAL 记成 NEVER，带后缀的 CUSTOM_RANGE 记成 CUSTOM_RANGE。 */
export function normalizeTrigger(rule: string): string {
  const text = rule.toUpperCase()
  if (text === "ALWAYS") return "SP_FULL"
  if (text === "MANUAL") return "NEVER"
  if (text.startsWith("CUSTOM_RANGE")) return "CUSTOM_RANGE"
  return text
}

export function isTimedBody(body: string): boolean {
  return body === "duration" || body === "ammo" || body === "toggle"
}

export function isInstantBody(body: string): boolean {
  return body === "instant" || body === "charges"
}

export function isTickRule(rule: string): boolean {
  return TICK_RULES.has(rule)
}

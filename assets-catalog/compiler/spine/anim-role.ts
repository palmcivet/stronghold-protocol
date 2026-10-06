// 把骨架里的动画名收成 idle / deploy / attack / skill / die / move / stun。
// 先按原名匹配，再忽略大小写。带时长时，优先选时长大于 0 的 idle。

export interface AnimClip {
  readonly begin: string | null
  readonly loop: string
  readonly end: string | null
  readonly via?: string
}

export interface SkillClip extends AnimClip {
  readonly index: number
  readonly idle: string | null
}

export interface AnimRoles {
  readonly idle: string | null
  readonly deploy: string | null
  readonly attack: AnimClip | null
  readonly attackDown: AnimClip | null
  readonly skill: SkillClip | null
  readonly skills?: Readonly<Record<string, SkillClip>>
  readonly die: string | null
  readonly move: AnimClip | null
  readonly stun: AnimClip | null
}

export interface ResolveRolesOptions {
  readonly skillIndices?: readonly number[]
  readonly durations?: Readonly<Record<string, number>> | null
}

type Finder = (name: string | null | undefined) => string | null

function makeFinder(names: readonly string[]): Finder {
  const exact = new Set(names)
  const lower = new Map<string, string>()
  for (const name of names) {
    const key = name.toLowerCase()
    if (!lower.has(key)) lower.set(key, name)
  }
  return (name) => (name && exact.has(name) ? name : (lower.get(String(name).toLowerCase()) ?? null))
}

function clip(begin: string | null, loop: string, end: string | null, via?: string): AnimClip {
  const row: AnimClip = { begin: begin ?? null, loop, end: end ?? null }
  if (!via) return row
  return { ...row, via }
}

const isDown = (name: string): boolean => /down/i.test(name)
const isEdge = (name: string): boolean => /_(begin|start|end)$/i.test(name)

function firstLike(names: readonly string[], pattern: RegExp, ok: (name: string) => boolean = () => true): string | null {
  return names.filter((name) => pattern.test(name) && ok(name)).sort()[0] ?? null
}

function triple(find: Finder, prefix: string): AnimClip | null {
  const begin = find(`${prefix}_Begin`) ?? find(`${prefix}_Start`)
  const loop = find(`${prefix}_Loop`) ?? find(prefix)
  const end = find(`${prefix}_End`)
  if (loop) return clip(begin, loop, end)
  if (begin) return clip(null, begin, end)
  return null
}

interface DirectionalNames {
  readonly names: readonly string[]
  readonly real: (name: string | null) => string | null
}

function directionalAliases(names: readonly string[]): DirectionalNames {
  const have = new Set(names.map((name) => name.toLowerCase()))
  const alias = new Map<string, { readonly virtual: string; readonly real: string }>()
  for (const dir of ["Right", "Up"]) {
    const pattern = new RegExp(`_${dir}(?=_|$)`, "i")
    for (const name of names) {
      if (isDown(name) || !pattern.test(name)) continue
      const virtual = name.replace(pattern, "")
      const key = virtual.toLowerCase()
      if (!have.has(key) && !alias.has(key)) alias.set(key, { virtual, real: name })
    }
  }
  const virtuals = [...alias.values()].map((row) => row.virtual)
  return {
    names: [...names, ...virtuals],
    real: (name) => (name == null ? null : (alias.get(name.toLowerCase())?.real ?? name)),
  }
}

function formFinder(find: Finder, idle: string | null): (base: string) => string | null {
  if (!idle || /^idle$/i.test(idle)) return () => null
  const prefix = /^(.+)_idle$/i.exec(idle)
  if (prefix?.[1]) {
    const pre = prefix[1]
    return (base) => find(`${pre}_${base}`)
  }
  const suffix = /^idle(_?)(.+)$/i.exec(idle)
  if (suffix?.[2] !== undefined) {
    const sep = suffix[1] ?? ""
    const suf = suffix[2]
    return (base) => find(`${base}${sep}${suf}`)
  }
  return () => null
}

function resolveIdle(names: readonly string[], find: Finder, durations: Readonly<Record<string, number>> | null): string | null {
  const idleLike = (animated: boolean): string | null =>
    firstLike(names, /(^|_)idle/i, (name) => !/skill|stun|down/i.test(name) && (!animated || !(Number(durations?.[name]) <= 0)))
  return (
    find("Idle") ??
    (durations ? idleLike(true) : null) ??
    idleLike(false) ??
    find("Default") ??
    firstLike(names, /^default/i) ??
    names[0] ??
    null
  )
}

function resolveAttack(names: readonly string[], find: Finder, form: (base: string) => string | null, idle: string | null): AnimClip | null {
  const attack = find("Attack")
  if (attack) return clip(null, attack, null)
  const begin = find("Attack_Begin") ?? find("Attack_Start")
  const end = find("Attack_End")
  const loop = find("Attack_Loop")
  if (loop) return clip(begin, loop, end)
  const numbered = firstLike(names, /^attack/i, (name) => !isDown(name) && !isEdge(name))
  if (begin) return numbered ? clip(begin, numbered, end, "attackAny") : clip(null, begin, end)
  const combat = find("Combat")
  if (combat) return clip(null, combat, null, "combat")
  const formed = form("Attack") ?? form("Combat")
  if (formed) return clip(null, formed, null, "attackAny")
  const any = numbered ?? firstLike(names, /(^|_)attack/i, (name) => !isDown(name) && !isEdge(name) && !/skill/i.test(name))
  if (any) return clip(null, any, null, "attackAny")
  const skill =
    find("Skill_1_Loop") ??
    find("Skill1_Loop") ??
    find("Skill_Loop") ??
    firstLike(names, /^skill.*attack/i, (name) => !isDown(name) && !isEdge(name)) ??
    firstLike(names, /^skill.*_loop$/i, (name) => !isDown(name))
  if (skill) return clip(null, skill, null, "skill")
  return idle ? clip(null, idle, null, "idle") : null
}

function resolveAttackDown(names: readonly string[], find: Finder): AnimClip | null {
  const attack = find("Attack_Down")
  if (attack) return clip(null, attack, null)
  const down = triple(find, "Attack_Down")
  if (down) return down
  const combat = find("Combat_Down")
  if (combat) return clip(null, combat, null, "combat")
  const any = firstLike(names, /^attack.*down/i, (name) => !isEdge(name))
  if (any) return clip(null, any, null, "attackAny")
  return null
}

interface SkillFamily {
  readonly begin: string | null
  readonly loop: string
  readonly end: string | null
  readonly via?: string
  readonly idle: string | null
}

function skillFamily(names: readonly string[], find: Finder, prefix: string, numbered: boolean): SkillFamily | null {
  const begin = find(`${prefix}_Begin`) ?? find(`${prefix}_Start`)
  const end = find(`${prefix}_End`)
  const idle = find(`${prefix}_Idle`)
  const attack = find(`${prefix}_Attack`) ?? firstLike(names, new RegExp(`^${prefix}_Attack`, "i"), (name) => !isDown(name) && !isEdge(name))
  const single = find(prefix)
  const variant = numbered
    ? firstLike(names, new RegExp(`^${prefix}_`, "i"), (name) => !isDown(name) && !isEdge(name) && !/_idle$/i.test(name))
    : null
  const loop = find(`${prefix}_Loop`) ?? attack ?? single ?? variant ?? idle ?? begin
  if (!loop) return null
  return { ...clip(loop === begin ? null : begin, loop, loop === end ? null : end), idle: idle ?? null }
}

function resolveSkill(names: readonly string[], find: Finder, index: number, attack: AnimClip | null): SkillClip | null {
  const n = index + 1
  const pad = String(n).padStart(2, "0")
  const prefixes = [`Skill_${n}`, `Skill${n}`, `Skill_${pad}`, "Skill"]
  for (const prefix of prefixes) {
    const family = skillFamily(names, find, prefix, prefix !== "Skill")
    if (family) {
      const { idle, ...rest } = family
      return { ...rest, index, idle }
    }
  }
  const directional = directionalAliases(names)
  if (directional.names.length > names.length) {
    const findDir = makeFinder(directional.names)
    for (const prefix of prefixes) {
      const family = skillFamily(directional.names, findDir, prefix, prefix !== "Skill")
      if (family) {
        const loop = directional.real(family.loop)
        if (!loop) continue
        return {
          begin: directional.real(family.begin),
          loop,
          end: directional.real(family.end),
          index,
          idle: directional.real(family.idle),
        }
      }
    }
  }
  if (attack) return { ...attack, via: "attack", index, idle: null }
  return null
}

function resolveMove(names: readonly string[], find: Finder, form: (base: string) => string | null): AnimClip | null {
  const moving = triple(find, "Move")
  if (moving) return moving
  const move = find("Move") ?? form("Move")
  if (move) return clip(null, move, null)
  const running = triple(find, "Run")
  if (running) return running
  const run = find("Run") ?? form("Run")
  if (run) return clip(null, run, null)
  const any = firstLike(names, /^move/i, (name) => !isEdge(name)) ?? firstLike(names, /(^|_)move/i, (name) => !isEdge(name))
  return any ? clip(null, any, null) : null
}

function resolveStun(find: Finder): AnimClip | null {
  const stun = find("Stun")
  const begin = find("Stun_Begin")
  if (stun) return clip(begin, stun, find("Stun_End"))
  if (begin) return clip(null, begin, null)
  return null
}

function resolveDie(names: readonly string[], find: Finder, form: (base: string) => string | null): string | null {
  return find("Die") ?? form("Die") ?? firstLike(names, /^die/i) ?? firstLike(names, /_die$/i, (name) => !/stun/i.test(name)) ?? null
}

export function resolveRoles(animationNames: readonly string[], options: ResolveRolesOptions = {}): AnimRoles {
  const names = Array.isArray(animationNames) ? animationNames.filter((name) => typeof name === "string" && name.length > 0) : []
  const find = makeFinder(names)
  const durations = options.durations && typeof options.durations === "object" ? options.durations : null
  const idle = resolveIdle(names, find, durations)
  const form = formFinder(find, idle)
  const deploy = find("Start") ?? form("Start") ?? idle
  const attack = resolveAttack(names, find, form, idle)
  const attackDown = resolveAttackDown(names, find)
  const requested = options.skillIndices?.length ? options.skillIndices : [0]
  const indices = [...new Set(requested.filter((index) => Number.isInteger(index) && index >= 0 && index < 10))]
  if (!indices.length) indices.push(0)
  const skills: Record<string, SkillClip> = {}
  for (const index of indices) {
    const skill = resolveSkill(names, find, index, attack)
    if (skill) skills[String(index)] = skill
  }
  const primary = indices[0] ?? 0
  const roles: AnimRoles = {
    idle,
    deploy,
    attack,
    attackDown,
    skill: skills[String(primary)] ?? null,
    die: resolveDie(names, find, form),
    move: resolveMove(names, find, form),
    stun: resolveStun(find),
  }
  if (indices.length > 1) return { ...roles, skills }
  return roles
}

export function roleAnimationNames(roles: AnimRoles | null | undefined): string[] {
  const out = new Set<string>()
  const addClip = (row: { readonly begin?: string | null; readonly loop?: string | null; readonly end?: string | null; readonly idle?: string | null } | null | undefined): void => {
    if (!row) return
    for (const key of ["begin", "loop", "end", "idle"] as const) {
      const value = row[key]
      if (typeof value === "string") out.add(value)
    }
  }
  if (!roles) return []
  for (const key of ["idle", "deploy", "die"] as const) {
    const value = roles[key]
    if (typeof value === "string") out.add(value)
  }
  for (const key of ["attack", "attackDown", "skill", "move", "stun"] as const) addClip(roles[key])
  if (roles.skills) for (const row of Object.values(roles.skills)) addClip(row)
  return [...out]
}

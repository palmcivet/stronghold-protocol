import { buildSkill, interpolateAttrs, rangeGrid, statsFrom } from "#compiler/packet/character.js"
import type { SeasonContext } from "#compiler/packet/compile/context.js"
import { DEPLOY_REFUSED_TILES, findGroundPath, type GroundDevice } from "./ground-path.js"
import { flattenBB, phaseIdx, pointOf, textPair } from "#compiler/packet/text/parse.js"

const TILE_LEGEND: Readonly<Record<string, { readonly tileKey: string, readonly desc: string, readonly special?: string }>> = {
  "#": { tileKey: "tile_forbidden", desc: "禁区：不可部署，地面不可通行（飞行可越过）" },
  X: { tileKey: "tile_forbidden", desc: "硬分隔（第6/13行）：任何单位不可通行" },
  r: { tileKey: "tile_road", desc: "道路：近战/远程均可部署，地面可通行" },
  R: { tileKey: "tile_road", desc: "道路（不可部署）" },
  f: { tileKey: "tile_floor", desc: "地板：不可部署，地面可通行（第9列通道/敌人预览区）" },
  p: { tileKey: "tile_floor", desc: "地板（预览区 previewNotAlloed）" },
  h: { tileKey: "tile_wall", desc: "高台：仅远程可部署，地面不可通行" },
  b: { tileKey: "tile_fence_bound", desc: "围栏低地：可部署，地面敌人不可通行" },
  a: { tileKey: "tile_achand", desc: "整备区格（isValidHand）" },
  A: { tileKey: "tile_achand", desc: "临时整备区/非整备手牌格" },
  S: { tileKey: "tile_start", desc: "敌人出生点（红门）" },
  E: { tileKey: "tile_end", desc: "保护目标（蓝门）" },
  I: { tileKey: "tile_telin", desc: "传送入口（敌人消失）" },
  O: { tileKey: "tile_telout", desc: "传送出口/领袖区出生点" },
  m: { tileKey: "tile_mire", special: "mire", desc: "沼泽：停留叠加减速减攻速" },
  g: { tileKey: "tile_smog", special: "smog", desc: "排气格栅：其上干员不会成为敌方远程攻击目标" },
  d: { tileKey: "tile_deepsea", special: "deepsea", desc: "深水区：不可部署（拒绝部署），敌人持续受伤、减速、减攻速" },
  i: { tileKey: "tile_infection", special: "infection", desc: "活性源石：单位受持续真实伤害，攻击力与攻速提升" },
}

const DEVICE_ROLES: Readonly<Record<string, string>> = {
  trap_1105_accrate: "crate",
  trap_1106_achplat: "platform",
  trap_032_mound: "mound",
  trap_013_blower: "blower",
  trap_098_mire: "mireController",
  trap_042_tidectrl: "tideController",
  trap_1104_aclasert: "turret",
  trap_1112_acblzd: "coldWind",
  trap_036_storm: "sandstorm",
  trap_040_canoe: "waterPlatform",
  trap_1107_acblock: "sealedFloor",
  trap_218_fttree: "bush",
  trap_039_dstnta: "bossSpawn",
}
const BLOCKING_ROLES: ReadonlySet<string> = new Set(["crate", "platform", "mound"])

function tileGlyph(tile: any): string {
  const keys = new Set((tile.blackboard || []).map((entry: any) => entry.key))
  switch (tile.tileKey) {
    case "tile_forbidden": return tile.passableMask === "NONE" ? "X" : "#"
    case "tile_road": return tile.buildableType === "NONE" ? "R" : "r"
    case "tile_floor": return keys.has("previewNotAlloed") ? "p" : "f"
    case "tile_wall": return "h"
    case "tile_fence_bound":
    case "tile_fence": return "b"
    case "tile_achand": return keys.has("isValidHand") ? "a" : "A"
    case "tile_start": return "S"
    case "tile_end": return "E"
    case "tile_telin": return "I"
    case "tile_telout": return "O"
    case "tile_mire": return "m"
    case "tile_smog": return "g"
    case "tile_deepsea": return "d"
    case "tile_infection": return "i"
    default: return "?"
  }
}

function effectiveBuildable(tile: any): any {
  return DEPLOY_REFUSED_TILES.has(tile.tileKey) ? "NONE" : tile.buildableType
}

function rotateGrid(grid: readonly (readonly number[])[], dir: string): number[][] {
  const turn = dir === "UP" ? (row: number, col: number): [number, number] => [col, -row]
    : dir === "LEFT" ? (row: number, col: number): [number, number] => [-row, -col]
    : dir === "DOWN" ? (row: number, col: number): [number, number] => [-col, row]
    : null
  return grid.map((point) => {
    const row = point[0] ?? Number.NaN
    const col = point[1] ?? Number.NaN
    const turned = turn ? turn(row, col) : [row, col]
    return turned.map((value) => value + 0)
  })
}

function deviceRecord(ctx: SeasonContext, token: any): any {
  const key = token.inst?.characterKey
  const char = ctx.charTable[key]
  const rec: Record<string, any> = {
    key,
    name: char?.name || key,
    alias: token.alias || null,
    pos: pointOf(token.position),
    dir: token.direction,
    hidden: !!token.hidden,
    role: DEVICE_ROLES[key] || null,
  }
  if (!rec.role) ctx.notes.warn(`device ${key} has no known role`)
  if (!char) {
    ctx.notes.warn(`device ${key} missing from character_table`)
    return rec
  }
  const phase = phaseIdx(token.inst.phase)
  const level = token.inst.level || 1
  const clamped = Math.max(0, Math.min(phase, (char.phases?.length || 1) - 1))
  const attrs = interpolateAttrs(char, clamped, level)
  const stats = statsFrom(attrs, ctx.notes)
  rec.stats = stats ? { maxHp: stats.maxHp, atk: stats.atk, def: stats.def, res: stats.res, bat: stats.bat, aspd: stats.aspd, blockCnt: stats.blockCnt } : null
  rec.rangeGrid = rangeGrid(ctx, char.phases?.[clamped]?.rangeId)
  rec.rangeTiles = rec.rangeGrid && rec.pos
    ? rotateGrid(rec.rangeGrid, rec.dir).map(([dRow, dCol]) => [rec.pos[0] + dRow, rec.pos[1] + dCol]).filter(([row, col]) => row >= 0 && row < 19 && col >= 0 && col < 21)
    : null
  const skillEntry = char.skills?.[token.skillIndex ?? 0]
  const skill = skillEntry?.skillId ? buildSkill(ctx, skillEntry.skillId, token.mainSkillLvl || 1, null, `device ${key}`) : null
  rec.skill = skill ? { skillId: skill.skillId, name: skill.name, level: skill.level, desc: skill.desc, descRaw: skill.descRaw, bb: skill.bb, bbStr: skill.bbStr } : null
  rec.desc = textPair(char.description, ctx.notes).desc
  return rec
}

function stageDisplayName(stageId: string, raw: unknown, notes: SeasonContext["notes"]): string {
  if (typeof raw !== "string" || !raw.trim()) return stageId
  const name = raw.replace(/\s*[(（][^()（）]*[A-Za-z][^()（）]*[)）]/g, "").replace(/\s+/g, " ").trim()
  if (!name) {
    notes.warn(`stage ${stageId}: research name "${raw}" is only an annotation; using the stage id`)
    return stageId
  }
  if (name !== raw.trim()) notes.warn(`stage ${stageId}: dropped research annotation from name "${raw}" -> "${name}"`)
  return name
}

export function buildStages(ctx: SeasonContext, modesById: any): Record<string, any> {
  const researchStages = ctx.research.maps?.stages || {}
  const out: Record<string, any> = {}
  for (const stageId of ctx.stageIds) {
    const stage = ctx.act.stageDatasDict[stageId]
    const level = ctx.levels[stageId]
    const map = level.mapData?.map || []
    const tiles = level.mapData?.tiles || []
    const height = map.length
    const width = map[0]?.length || 0
    if (height !== 19 || width !== 21) ctx.notes.warn(`stage ${stageId}: unexpected size ${height}x${width}`)
    const tileAt = (row: number, col: number): any => tiles[map[height - 1 - row]?.[col]]
    const rows: string[] = []
    const glyphTiles: Record<string, any> = {}
    for (let row = 0; row < height; row++) {
      let line = ""
      for (let col = 0; col < width; col++) {
        const tile = tileAt(row, col)
        const glyph = tile ? tileGlyph(tile) : "?"
        if (glyph === "?") ctx.notes.warn(`stage ${stageId}: unknown tile at (${row},${col}) ${tile?.tileKey}`)
        line += glyph
        if (tile && !glyphTiles[glyph]) {
          const { bb } = flattenBB(tile.blackboard, "", ctx.notes)
          const buildable = effectiveBuildable(tile)
          glyphTiles[glyph] = {
            tileKey: tile.tileKey,
            height: tile.heightType === "HIGHLAND" ? "HIGH" : "LOW",
            buildable,
            ...(buildable !== tile.buildableType ? { buildableType: tile.buildableType } : {}),
            passable: tile.passableMask,
            groundPassable: tile.passableMask === "ALL",
            flyPassable: tile.passableMask !== "NONE",
            special: TILE_LEGEND[glyph]?.special || null,
            bb,
          }
        }
      }
      rows.push(line)
    }
    const devices = (level.predefines?.tokenInsts || []).map((token: any) => deviceRecord(ctx, token))
    for (const device of devices) device.active = !device.hidden
    const mapChars = (level.predefines?.characterInsts || []).map((inst: any) => ({
      key: inst.inst?.characterKey,
      alias: inst.alias || null,
      pos: pointOf(inst.position),
      dir: inst.direction,
      hidden: !!inst.hidden,
    }))
    const special: Record<string, any> = {}
    const byKey = (key: string): any => devices.find((device: any) => device.key === key)
    if (rows.some((line) => line.includes("m"))) {
      const device = byKey("trap_098_mire")
      const mireSkill = device?.skill ? ctx.skillTable[device.skill.skillId]?.levels?.[Math.max(0, (device.skill.level || 1) - 1)] : null
      const charge = mireSkill?.spData?.maxChargeTime
      special.mire = {
        source: device ? device.key : null,
        intervalSec: typeof charge === "number" && charge > 0 ? charge : 1,
        aspdPerStack: device?.skill?.bb?.attack_speed ?? -0.05,
        moveMulPerStack: device?.skill?.bb?.move_speed ?? -0.05,
        maxStacks: device?.skill?.bb?.max_stack_cnt ?? 10,
        heavyWeight: device?.skill?.bb?.value ?? 3,
        clearedOnLeave: true,
      }
    }
    if (rows.some((line) => line.includes("d"))) {
      const device = byKey("trap_042_tidectrl")
      special.deepsea = { source: device ? device.key : null, skillId: device?.skill?.skillId || null, bb: device?.skill?.bb || {} }
    }
    if (rows.some((line) => line.includes("i"))) special.infection = { bb: glyphTiles.i?.bb || {} }
    if (rows.some((line) => line.includes("g"))) special.smog = { rule: "operatorsNotTargetableByEnemyRanged" }
    const blower = byKey("trap_013_blower")
    if (blower) special.blower = { rangeGrid: blower.rangeGrid, bb: blower.skill?.bb || {}, desc: blower.skill?.desc || null }
    const runes = (level.runes || []).map((rune: any) => ({ key: rune.key, ...flattenBB(rune.blackboard, "", ctx.notes) }))
    const globalBuffs = (level.globalBuffs || []).map((buff: any) => ({ key: buff.key, ...flattenBB(buff.blackboard, "", ctx.notes) }))
    const activeBlocking = devices.filter((device: any) => device.active && BLOCKING_ROLES.has(device.role))
    const blocked = new Set(activeBlocking.map((device: any) => device.pos.join(",")))
    const platformAt = new Set(activeBlocking.filter((device: any) => device.role === "platform").map((device: any) => device.pos.join(",")))
    const waterPlatformAt = new Set(devices.filter((device: any) => device.active && device.role === "waterPlatform").map((device: any) => device.pos.join(",")))
    const deployIn = (row0: number, row1: number, col0: number, col1: number): any => {
      const melee: number[][] = []
      const rangedOnly: number[][] = []
      const byDevice: number[][] = []
      for (let row = row0; row <= row1; row++) for (let col = col0; col <= col1; col++) {
        const tile = tileAt(row, col)
        if (!tile) continue
        const key = `${row},${col}`
        const buildableType = effectiveBuildable(tile)
        const buildable = buildableType !== "NONE"
        if (platformAt.has(key)) {
          rangedOnly.push([row, col])
          if (buildable) byDevice.push([row, col])
          continue
        }
        if (blocked.has(key)) {
          if (buildable) byDevice.push([row, col])
          continue
        }
        if (waterPlatformAt.has(key)) {
          melee.push([row, col])
          if (!buildable) byDevice.push([row, col])
          continue
        }
        if (tile.heightType === "LOWLAND" && (buildableType === "ALL" || buildableType === "MELEE")) melee.push([row, col])
        else if (buildableType === "RANGED" || (tile.heightType === "HIGHLAND" && buildableType === "ALL" && tile.tileKey !== "tile_achand")) rangedOnly.push([row, col])
      }
      return { melee, rangedOnly, changedByDevices: byDevice }
    }
    const gridStage = { rows, legend: glyphTiles }
    const pairs: readonly (readonly [readonly number[], readonly number[]])[] = [
      [[9, 10], [9, 2]], [[12, 10], [9, 2]], [[9, 18], [9, 2]], [[12, 18], [9, 2]],
      [[2, 10], [2, 2]], [[5, 10], [2, 2]], [[2, 10], [1, 3]], [[5, 10], [1, 3]],
      [[2, 10], [2, 18]], [[5, 10], [2, 18]], [[2, 10], [1, 17]], [[5, 10], [1, 17]],
    ]
    const groundPaths: Record<string, any> = {}
    const groundPathsWithDevices: Record<string, any> = {}
    const blocking: GroundDevice[] = activeBlocking.map((device: any) => ({ pos: device.pos, role: device.role }))
    for (const [start, end] of pairs) {
      const key = `${start.join(",")}->${end.join(",")}`
      const passable = (point: readonly number[]): boolean => {
        const row = point[0]
        const col = point[1]
        if (typeof row !== "number" || typeof col !== "number") return false
        return tileAt(row, col)?.passableMask === "ALL"
      }
      if (!passable(start) || !passable(end)) continue
      const open = findGroundPath(gridStage, [], start, end)
      if (open) groundPaths[key] = open
      const withDevices = findGroundPath(gridStage, blocking, start, end)
      if (withDevices) groundPathsWithDevices[key] = withDevices
    }
    const modes = [...(stage.mode || [])]
    const options = level.options || {}
    out[stageId] = {
      id: stageId,
      name: stageDisplayName(stageId, researchStages[stageId]?.name, ctx.notes),
      weight: stage.weight,
      active: stage.weight > 0,
      modes,
      size: [height, width],
      rows,
      tiles: glyphTiles,
      devices,
      mapChars,
      special,
      runes,
      globalBuffs,
      deployTiles: { normal: deployIn(9, 12, 2, 10), bossLeft: deployIn(1, 5, 2, 10), bossRight: deployIn(1, 5, 10, 18) },
      groundPaths,
      groundPathsWithDevices,
      options: { characterLimit: options.characterLimit ?? 8, moveMultiplier: options.moveMultiplier ?? 0.5 },
      config: flattenBB(options.configBlackBoard, "", ctx.notes).bbStr,
    }
    for (const mode of modes) if (modesById && !modesById[mode]) ctx.notes.warn(`stage ${stageId}: unknown mode ${mode}`)
  }
  return out
}

import { TRIGGER_DEVIATIONS } from "#compiler/packet/character.js"
import { SHOP_EXCLUDED_ITEMS } from "#compiler/packet/record/item.js"
import { TOKEN_ABNORMAL } from "#compiler/packet/record/token.js"

function findNonFinite(value: any, path: string, out: string[]): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) out.push(path)
    return
  }
  if (!value || typeof value !== "object") return
  if (Array.isArray(value)) {
    value.forEach((item, index) => findNonFinite(item, `${path}[${index}]`, out))
    return
  }
  for (const [key, item] of Object.entries(value)) findNonFinite(item, `${path}.${key}`, out)
}

export interface SeasonFiles {
  config: any
  chess: any
  bonds: any
  garrisons: any
  items: any
  bands: any
  effects: any
  choices: any
  enemies: any
  factions: any
  waves: any
  stages: any
  bosses: any
  tokens: any
}

export function validateAll(files: SeasonFiles): string[] {
  const errors: string[] = []
  const err = (message: string): void => {
    errors.push(message)
  }
  const { config, chess, bonds, garrisons, items, bands, effects, choices, enemies, factions, waves, stages, bosses, tokens } = files
  for (const [name, obj] of Object.entries(files)) {
    const bad: string[] = []
    findNonFinite(obj, name, bad)
    bad.slice(0, 5).forEach((path) => err(`non-finite number at ${path}`))
  }
  const visible = Object.values(chess).filter((piece: any) => !piece.isGolden && piece.visible)
  if (Object.keys(bonds).length !== 23) err(`expected 23 bonds, got ${Object.keys(bonds).length}`)
  if (Object.keys(bands).length !== 40) err(`expected 40 bands, got ${Object.keys(bands).length}`)
  if (visible.length !== 112) err(`expected 112 visible non-DIY chess, got ${visible.length}`)
  for (const piece of Object.values(chess) as any[]) {
    if (!chess[piece.baseId]) err(`chess ${piece.chessId}: baseId missing`)
    if (piece.goldenId && !chess[piece.goldenId]) err(`chess ${piece.chessId}: goldenId missing`)
    for (const bond of piece.bonds) if (!bonds[bond]) err(`chess ${piece.chessId}: bond ${bond} missing`)
    for (const garrison of piece.garrisonIds) if (!garrisons[garrison]) err(`chess ${piece.chessId}: garrison ${garrison} missing`)
    for (const token of piece.tokens) if (!tokens[token]) err(`chess ${piece.chessId}: token ${token} missing`)
    for (const talent of piece.talents || []) if (talent.tokenKey && !piece.tokens.includes(talent.tokenKey)) err(`chess ${piece.chessId}: talent token ${talent.tokenKey} not in tokens`)
    if (piece.isDiy) continue
    if (!piece.stats) err(`chess ${piece.chessId}: no stats`)
    if (!piece.skill) err(`chess ${piece.chessId}: no resolvable skill`)
    if (!Array.isArray(piece.rangeGrid)) err(`chess ${piece.chessId}: no range grid`)
    if (!Array.isArray(piece.skills) || piece.skills.filter((skill: any) => skill.isDefault).length !== 1 || piece.skills.find((skill: any) => skill.isDefault)?.skillId !== piece.skill?.skillId) err(`chess ${piece.chessId}: skills[] without exactly one default = skill`)
    if (piece.modules && (piece.modules.filter((mod: any) => mod.isDefault).length !== (piece.module?.active ? 1 : 0) || !piece.statsBase || !piece.traitBase || !piece.talentsBase)) err(`chess ${piece.chessId}: inconsistent module choices`)
    if (piece.placement !== undefined) err(`chess ${piece.chessId}: placement is not a data field`)
  }
  for (const [baseId, skillsOf] of Object.entries(TRIGGER_DEVIATIONS)) {
    const records = Object.values(chess).filter((piece: any) => piece.baseId === baseId)
    if (records.length !== 2) err(`trigger deviation ${baseId}: expected the normal and the elite record, got ${records.length}`)
    for (const [skillId, rule] of Object.entries(skillsOf)) {
      for (const piece of records as any[]) {
        const skill = (piece.skills || []).find((row: any) => row.skillId === skillId)
        if (!skill) err(`trigger deviation ${piece.chessId}: no skill ${skillId}`)
        else if (skill.trigger.rawRule !== "TAKE_DAMAGE" || skill.trigger.rule !== rule) err(`trigger deviation ${piece.chessId} ${skillId}: ${skill.trigger.rawRule} → ${skill.trigger.rule}, expected TAKE_DAMAGE → ${rule}`)
        else if (rule === "SKILL_RANGE" && (!skill.rangeGrid?.length || JSON.stringify(skill.trigger.customRangeGrid) !== JSON.stringify(skill.rangeGrid))) err(`trigger deviation ${piece.chessId} ${skillId}: SKILL_RANGE needs the skill's own range as customRangeGrid`)
      }
    }
  }
  for (const bond of Object.values(bonds) as any[]) {
    for (const member of bond.members) if (!chess[member]) err(`bond ${bond.bondId}: member ${member} missing`)
    if (!bond.thresholds.length) err(`bond ${bond.bondId}: no thresholds`)
    if (!effects[bond.effectId]) err(`bond ${bond.effectId}: effect ${bond.effectId} missing`)
  }
  for (const item of Object.values(items) as any[]) {
    if (!effects[item.effectId]) err(`item ${item.id}: effect missing`)
    if (item.goldenId && !items[item.goldenId]) err(`item ${item.id}: golden missing`)
    if (item.giveBondId && !bonds[item.giveBondId]) err(`item ${item.id}: giveBond ${item.giveBondId} missing`)
    if (item.requiresBondId && !bonds[item.requiresBondId]) err(`item ${item.id}: requiresBond ${item.requiresBondId} missing`)
  }
  for (const band of Object.values(bands) as any[]) if (!effects[band.effectId]) err(`band ${band.bandId}: effect missing`)
  for (const band of Object.values(bands) as any[]) for (const id of band.bondIds || []) if (!bonds[id]) err(`band ${band.bandId}: bond ${id} missing`)
  for (const wave of Object.values(waves) as any[]) {
    for (const spawn of wave.spawns) {
      if (spawn.action) continue
      if (!enemies[spawn.key]) err(`wave ${wave.id}: enemy ${spawn.key} missing`)
      if (!wave.routes[spawn.routeIndex]) err(`wave ${wave.id}: route ${spawn.routeIndex} missing`)
    }
    for (const [name, phases] of Object.entries(wave.branches)) for (const spawn of (phases as any[]).flat()) {
      if (spawn.action) continue
      if (!enemies[spawn.key]) err(`wave ${wave.id} branch ${name}: enemy ${spawn.key} missing`)
      if (!wave.extraRoutes[spawn.routeIndex]) err(`wave ${wave.id} branch ${name}: extraRoute ${spawn.routeIndex} missing`)
    }
    for (const key of Object.keys(wave.overrides)) if (!enemies[key]) err(`wave ${wave.id}: override for unknown enemy ${key}`)
  }
  for (const stage of Object.values(stages) as any[]) {
    if (stage.rows.length !== 19 || stage.rows.some((row: string) => row.length !== 21)) err(`stage ${stage.id}: not 19x21`)
    if (stage.rows.some((row: string) => row.includes("?"))) err(`stage ${stage.id}: unknown tile glyph`)
    if (stage.name !== stage.id && /[A-Za-z]/.test(stage.name)) err(`stage ${stage.id}: Latin text in player-facing name "${stage.name}"`)
  }
  for (const mode of Object.values(config.modes) as any[]) {
    for (const [round, row] of Object.entries(mode.rounds) as [string, any][]) {
      const templates = row.template ? [row.template] : Object.values(row.bossTemplates || {})
      if (!templates.length) err(`mode ${mode.modeId} round ${round}: no template`)
      for (const template of templates) if (!waves[template as string]) err(`mode ${mode.modeId} round ${round}: template ${template} missing`)
    }
    for (const stage of mode.stages) if (!stages[stage]) err(`mode ${mode.modeId}: stage ${stage} missing`)
    for (const bond of [...mode.activeBondIds, ...mode.inactiveBondIds]) if (!bonds[bond]) err(`mode ${mode.modeId}: bond ${bond} missing`)
  }
  for (const boss of Object.values(bosses) as any[]) if (!enemies[boss.enemyKey]) err(`boss ${boss.bossId}: enemy missing`)
  for (const entry of Object.values(factions.entries) as any[]) {
    for (const key of [entry.key, ...entry.N.map((row: any) => row.key), ...entry.E.map((row: any) => row.key)]) if (!enemies[key]) err(`faction ${entry.key}: enemy ${key} missing`)
  }
  for (const card of choices.cards.bounty) for (const add of card.adds) if (add.enemyKey && !enemies[add.enemyKey]) err(`bounty ${card.effectId}: enemy ${add.enemyKey} missing`)
  for (const [poolId, pool] of Object.entries(choices.pools) as [string, any][]) {
    for (const id of [...(pool.items || []), ...(pool.weighted || []).map((row: any) => row[0])]) if (!id || !(items[id] || chess[id])) err(`pool ${poolId}: unresolved entry ${id}`)
  }
  for (const id of Object.keys(SHOP_EXCLUDED_ITEMS)) if (!items[id] || items[id].itemType !== "EQUIP" || items[id].isGolden) err(`SHOP_EXCLUDED_ITEMS: ${id} is not a normal EQUIP item`)
  for (const [id, flags] of Object.entries(TOKEN_ABNORMAL)) {
    if (!tokens[id]) err(`TOKEN_ABNORMAL: ${id} is not a token`)
    for (const flag of flags) if (flag !== "healFree" && flag !== "isolated") err(`TOKEN_ABNORMAL: ${id}: unknown effect ${flag}`)
  }
  for (const token of Object.values(tokens) as any[]) {
    if (!token.stats) err(`token ${token.tokenId}: no stats`)
    for (const [owner, variant] of Object.entries(token.variants || {}) as [string, any][]) if (!Array.isArray(variant.sources) || !variant.sources.length) err(`token ${token.tokenId}@${owner}: no sources`)
  }
  for (const enemy of Object.values(enemies) as any[]) {
    const stats = enemy.stats
    if (!(stats.rangeRadius >= 0) || (enemy.applyWay === "MELEE" && stats.rangeRadius !== 0)) err(`enemy ${enemy.key}: rangeRadius ${stats.rangeRadius} (${enemy.applyWay})`)
    if (!(stats.maxHp > 0) || !(stats.bat > 0) || !(stats.aspd >= 0) || !(stats.moveSpeed >= 0) || !(stats.lpr >= 0)) err(`enemy ${enemy.key}: bad core stats ${JSON.stringify({ maxHp: stats.maxHp, bat: stats.bat, aspd: stats.aspd, moveSpeed: stats.moveSpeed, lpr: stats.lpr })}`)
  }
  return errors
}

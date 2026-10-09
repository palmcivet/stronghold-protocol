import { Buffer } from "node:buffer"
import { join } from "node:path"
import { BuildReadError, type BuildFiles, type BuildHttp } from "arknights-assets-extractor"
import { seasonPacketDirectory } from "#schema/packet-file.js"
import { bandBondIds, buildBands } from "#compiler/packet/record/band.js"
import { buildBonds } from "#compiler/packet/record/bond.js"
import { buildBosses } from "#compiler/packet/record/boss.js"
import { buildChess } from "#compiler/packet/record/chess.js"
import { buildChoices } from "#compiler/packet/record/choice.js"
import { buildConfig } from "#compiler/packet/record/config.js"
import { loadContext, type SeasonContext } from "./context.js"
import { buildEffects } from "#compiler/packet/record/effect.js"
import { buildEnemies } from "#compiler/packet/record/enemy.js"
import { buildFactions } from "#compiler/packet/record/faction.js"
import { buildGarrisons } from "#compiler/packet/record/garrison.js"
import { buildItems } from "#compiler/packet/record/item.js"
import { BuildNotes } from "#compiler/packet/text/notes.js"
import { buildStages } from "#compiler/packet/record/stage/record.js"
import { buildTokens } from "#compiler/packet/record/token.js"
import { validateAll, type SeasonFiles } from "./validate.js"
import { buildWaves } from "#compiler/packet/record/wave.js"

export interface CompileOptions {
  readonly seasonId: string
  readonly refresh: boolean
  readonly offline: boolean
  readonly quiet: boolean
  readonly noResearch: boolean
  readonly force: boolean
  readonly outDir: string
  readonly cacheDir: string
  readonly reportPath: string
  readonly researchDir: string
  readonly tuningPath: string
}

export interface CompileResult {
  readonly written: boolean
  readonly exitCode: 0 | 1
  readonly warnings: readonly string[]
  readonly errors: readonly string[]
}

const PACKET_NAMES: readonly (keyof SeasonFiles)[] = [
  "config", "chess", "bonds", "garrisons", "items", "bands", "effects", "choices", "enemies", "factions", "waves", "stages", "bosses", "tokens",
]

export async function compileSeason(catalog: BuildFiles, http: BuildHttp, options: CompileOptions): Promise<CompileResult> {
    try {
      seasonPacketDirectory(options.seasonId)
    } catch (cause) {
      throw new BuildReadError(options.seasonId, cause instanceof Error ? cause.message : String(cause))
    }
    const notes = new BuildNotes()
    notes.quiet = options.quiet
    const started = Date.now()
    const ctx: SeasonContext = await loadContext(catalog, http, {
      seasonId: options.seasonId,
      refresh: options.refresh,
      offline: options.offline,
      noResearch: options.noResearch,
      cacheDir: options.cacheDir,
      researchDir: options.researchDir,
      assetsManifest: join(options.outDir, "assets.json"),
      notes,
    })
    notes.log("building…")
    const { chess, tokenOwners } = buildChess(ctx)
    const effects = buildEffects(ctx)
    const bonds = buildBonds(ctx, chess, effects)
    const garrisons = buildGarrisons(ctx, chess)
    const items = buildItems(ctx, effects)
    const bands = buildBands(ctx, effects)
    const enemies = buildEnemies(ctx)
    const tokens = buildTokens(ctx, tokenOwners, enemies)
    const waves = buildWaves(ctx, enemies)
    const stages = buildStages(ctx, ctx.act.modeDataDict)
    const factions = buildFactions(ctx, enemies)
    const bosses = buildBosses(ctx, enemies, waves)
    const choices = buildChoices(ctx, effects, items, chess)
    for (const band of Object.values(bands)) band.bondIds = bandBondIds(band, { bonds, pools: choices.pools })
    const config = buildConfig(ctx, waves, stages, bands)
    const files: SeasonFiles = { config, chess, bonds, garrisons, items, bands, effects, choices, enemies, factions, waves, stages, bosses, tokens }
    const errors = validateAll(files)
    let total = 0
    const sizes: Record<string, number> = {}
    const texts: Record<string, string> = {}
    for (const name of PACKET_NAMES) {
      const text = JSON.stringify(files[name])
      texts[name] = text
      sizes[name] = Buffer.byteLength(text)
      total += sizes[name]
    }
    if (total > 6 * 1024 * 1024) errors.push(`total data size ${total} exceeds 6 MB`)
    const write = errors.length === 0 || options.force
    if (write) {
      for (const name of PACKET_NAMES) {
        const text = texts[name]
        if (text === undefined) continue
        await catalog.writeTextAtomic(join(options.outDir, `${name}.json`), text)
      }
      if (await catalog.exists(options.tuningPath)) {
        const tuning = await catalog.readText(options.tuningPath)
        await catalog.writeTextAtomic(join(options.outDir, "tuning.json"), tuning)
      }
    }
    const report = {
      counts: {
        chess: Object.keys(chess).length,
        visibleChess: Object.values(chess).filter((piece) => !piece.isGolden && piece.visible).length,
        bonds: Object.keys(bonds).length,
        garrisons: Object.keys(garrisons).length,
        items: Object.keys(items).length,
        bands: Object.keys(bands).length,
        effects: Object.keys(effects).length,
        enemies: Object.keys(enemies).length,
        waves: Object.keys(waves).length,
        stages: Object.keys(stages).length,
        bosses: Object.keys(bosses).length,
        tokens: Object.keys(tokens).length,
        factionEntries: Object.keys(factions.entries).length,
      },
      sizes,
      totalBytes: total,
      out: options.outDir,
      written: write,
      warnings: notes.messages,
      errors,
    }
    await catalog.writeTextAtomic(options.reportPath, JSON.stringify(report, null, 2))
    if (write) notes.log(`wrote ${PACKET_NAMES.length} files to ${options.outDir} (${(total / 1024 / 1024).toFixed(2)} MB) in ${Date.now() - started} ms`)
    else console.error(`integrity errors: ${options.outDir} left unchanged (re-run with --force to write anyway)`)
    notes.log(Object.entries(report.counts).map(([key, value]) => `${key}=${value}`).join(" "))
    if (notes.messages.length) {
      notes.log(`${notes.messages.length} warning(s):`)
      for (const warning of notes.messages) notes.log(`  - ${warning}`)
    }
    if (errors.length) {
      console.error(`${errors.length} error(s):`)
      for (const error of errors) console.error(`  x ${error}`)
    }
    return { written: write, exitCode: errors.length ? 1 : 0, warnings: notes.messages, errors }
}

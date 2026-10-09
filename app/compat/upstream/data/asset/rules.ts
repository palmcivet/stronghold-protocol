export type JsonRecord = Readonly<Record<string, unknown>>

/** Path segment that matches one record name or one array index of the master file. */
export const ANY = "*"

/** What a leaf of the master file holds: one address string, a list of address strings, or a Spine record. */
export type MasterValueType = "text" | "texts" | "spine"

export interface RuleContext {
  /** Values of the `*` segments of the rule location, in order. */
  readonly params: readonly string[]
  /** Capture groups of the address pattern; empty for a Spine record. */
  readonly captures: readonly string[]
  /** The text of a `text` leaf. */
  readonly text: string
  /** The record that holds the leaf, e.g. the token record for its `spine`. */
  readonly parent: JsonRecord
  readonly seasonId: string
}

interface RuleBase {
  readonly name: string
  /** Path of the leaf in the master file. `*` matches one record name or array index. */
  readonly location: readonly string[]
  readonly value: MasterValueType
  /** The rule applies only when this returns true. */
  readonly when?: (parent: JsonRecord) => boolean
}

/** Maps the leaf to an asset key and to a `refs` path. */
export interface MappedRule extends RuleBase {
  readonly action: "map"
  /** Address pattern of a `text` or `texts` leaf. Its capture groups feed `key` and `ref`. */
  readonly pattern?: RegExp
  /** Raw key, `kind:path`; the builder checks it. */
  readonly key: (context: RuleContext) => string
  /** `refs` path of the key, or null when the domain has no id for it. For a `texts` leaf the path holds the list of keys. */
  readonly ref: ((context: RuleContext) => readonly string[]) | null
}

/** Excludes the leaf from the manifest and reports the reason. */
export interface RefusedRule extends RuleBase {
  readonly action: "refuse"
  readonly reason: string
}

/** Points a `refs` path at the key that another `refs` path already holds. The leaf holds a name, not an address. */
export interface AliasRule extends RuleBase {
  readonly action: "alias"
  readonly value: "text"
  readonly ref: (context: RuleContext) => readonly string[]
  readonly target: (context: RuleContext) => readonly string[]
}

export type AssetRule = MappedRule | RefusedRule | AliasRule

export function captureOf(captures: readonly string[], index: number): string {
  return captures[index - 1] ?? ""
}

function paramOf(context: RuleContext, index: number): string {
  return context.params[index] ?? ""
}

/** Pattern of an address under `/assets/` whose file name is the whole capture. */
function assetFile(directory: string): RegExp {
  return new RegExp(`^/assets/${directory}/([^/]+)\\.png$`)
}

const CHAR_AVATAR = assetFile("char/avatar")
const CHAR_PORTRAIT = assetFile("char/portrait")
const ENEMY_ICON = assetFile("enemy/icon")
const TOKEN_AVATAR = assetFile("token/avatar")
const SKILL_ICON = assetFile("skill")

/** A Spine pose of a character, `front` or `back`. */
function operatorSpine(pose: "front" | "back"): AssetRule {
  return {
    action: "map",
    name: `chars.spine.${pose}`,
    location: ["chars", ANY, "spine", pose],
    value: "spine",
    key: (context) => `spine:char/${paramOf(context, 0)}/${pose}`,
    ref: (context) => ["chars", paramOf(context, 0), "spine", pose],
  }
}

/** Audio file of a music track. The `refs` name is the file name without extension. */
const BGM_FILE = /^\/assets\/audio\/bgm\/([^/]+)\.mp3$/

function bgmRule(name: string, location: readonly string[]): AssetRule {
  return {
    action: "map",
    name,
    location,
    value: "text",
    pattern: BGM_FILE,
    key: (context) => `audio:bgm/${captureOf(context.captures, 1)}`,
    ref: (context) => ["bgm", captureOf(context.captures, 1)],
  }
}

/** Sound effects of units and battles. Every directory under player, enemy or battle maps to `sfx/battle/<file>`. */
const UNIT_SFX = /^\/assets\/audio\/sfx\/(?:player|enemy|battle)\/(?:[^/]+\/)?([^/]+)\.mp3$/

/** Rules that turn master leaves into keys and `refs` paths. Order decides when two rules match one leaf. */
export const ASSET_RULES: readonly AssetRule[] = [
  // MARK: operators
  {
    action: "map",
    name: "chars.avatar",
    location: ["chars", ANY, "avatar"],
    value: "text",
    pattern: CHAR_AVATAR,
    key: (context) => `image:char/avatar/${captureOf(context.captures, 1)}`,
    ref: (context) => ["chars", paramOf(context, 0), "avatar"],
  },
  {
    action: "map",
    name: "chars.avatarE2",
    location: ["chars", ANY, "avatarE2"],
    value: "text",
    pattern: /^\/assets\/char\/avatar\/([^/]+_2)\.png$/,
    key: (context) => `image:char/avatar/${captureOf(context.captures, 1)}`,
    ref: (context) => ["chars", paramOf(context, 0), "avatarElite"],
  },
  {
    action: "map",
    name: "chars.portrait",
    location: ["chars", ANY, "portrait"],
    value: "text",
    pattern: CHAR_PORTRAIT,
    key: (context) => `image:char/portrait/${captureOf(context.captures, 1)}`,
    ref: (context) => ["chars", paramOf(context, 0), "portrait"],
  },
  {
    action: "map",
    name: "chars.portraitE2",
    location: ["chars", ANY, "portraitE2"],
    value: "text",
    pattern: /^\/assets\/char\/portrait\/([^/]+_2)\.png$/,
    key: (context) => `image:char/portrait/${captureOf(context.captures, 1)}`,
    ref: (context) => ["chars", paramOf(context, 0), "portraitElite"],
  },
  operatorSpine("front"),
  operatorSpine("back"),

  // MARK: enemies
  {
    action: "map",
    name: "enemies.icon",
    location: ["enemies", ANY, "icon"],
    value: "text",
    pattern: ENEMY_ICON,
    key: (context) => `image:enemy/icon/${captureOf(context.captures, 1)}`,
    ref: (context) => ["enemies", paramOf(context, 0), "icon"],
  },
  {
    action: "map",
    name: "enemies.spine",
    location: ["enemies", ANY, "spine"],
    value: "spine",
    key: (context) => `spine:enemy/${paramOf(context, 0)}`,
    ref: (context) => ["enemies", paramOf(context, 0), "spine"],
  },
  {
    action: "refuse",
    name: "enemies.spineLocal",
    location: ["enemies", ANY, "spineLocal"],
    value: "spine",
    reason: "local-client Spine has no address; its files are listed by local-assets.json, which is not mapped",
  },

  // MARK: tokens
  {
    action: "map",
    name: "tokens.avatar",
    location: ["tokens", ANY, "avatar"],
    value: "text",
    pattern: TOKEN_AVATAR,
    key: (context) => `image:token/icon/${captureOf(context.captures, 1)}`,
    ref: (context) => ["tokens", paramOf(context, 0), "icon"],
  },
  {
    action: "map",
    name: "tokens.spine.variant",
    location: ["tokens", ANY, "spine"],
    value: "spine",
    when: (parent) => typeof parent["spineVariant"] === "string",
    key: (context) => `spine:token/${paramOf(context, 0)}/${String(context.parent["spineVariant"])}`,
    ref: (context) => ["tokens", paramOf(context, 0), "spineVariants", String(context.parent["spineVariant"])],
  },
  {
    action: "map",
    name: "tokens.spine",
    location: ["tokens", ANY, "spine"],
    value: "spine",
    key: (context) => `spine:token/${paramOf(context, 0)}/front`,
    ref: (context) => ["tokens", paramOf(context, 0), "spine"],
  },
  {
    action: "refuse",
    name: "tokens.spineLocal",
    location: ["tokens", ANY, "spineLocal"],
    value: "spine",
    reason: "local-client Spine has no address; its files are listed by local-assets.json, which is not mapped",
  },

  // MARK: bonds, bands, items, modules
  {
    action: "map",
    name: "bonds",
    location: ["bonds", ANY],
    value: "text",
    pattern: /^\/assets\/bond\/([^/]+)\.png$/,
    key: (context) => `image:bond/${captureOf(context.captures, 1)}`,
    ref: (context) => ["bonds", paramOf(context, 0)],
  },
  {
    action: "map",
    name: "bands",
    location: ["bands", ANY],
    value: "text",
    pattern: /^\/assets\/band\/([^/]+)\.png$/,
    key: (context) => `image:band/${captureOf(context.captures, 1)}`,
    ref: (context) => ["bands", paramOf(context, 0)],
  },
  {
    action: "map",
    name: "items",
    location: ["items", ANY],
    value: "text",
    pattern: /^\/assets\/item\/([^/]+)\.png$/,
    key: (context) => `image:season/${context.seasonId}/trap/${captureOf(context.captures, 1)}`,
    ref: (context) => ["items", paramOf(context, 0)],
  },
  {
    action: "map",
    name: "modules",
    location: ["modules", ANY],
    value: "text",
    pattern: /^\/assets\/module\/([^/]+)\.png$/,
    key: (context) => `image:module/${captureOf(context.captures, 1).toLowerCase()}`,
    ref: null,
  },

  // MARK: skills
  {
    action: "map",
    name: "skills",
    location: ["skills", ANY],
    value: "text",
    pattern: SKILL_ICON,
    key: (context) => `image:skill/${captureOf(context.captures, 1)}`,
    ref: (context) => ["skills", paramOf(context, 0)],
  },
  {
    action: "alias",
    name: "skillsById",
    location: ["skillsById", ANY],
    value: "text",
    ref: (context) => ["skills", paramOf(context, 0)],
    target: (context) => ["skills", context.text],
  },

  // MARK: ui
  {
    action: "map",
    name: "ui",
    location: ["ui", ANY],
    value: "text",
    pattern: /^\/assets\/ui\/(.+)\.png$/,
    key: (context) => `image:ui/${captureOf(context.captures, 1)}`,
    ref: null,
  },

  // MARK: professions
  {
    action: "map",
    name: "prof.icon",
    location: ["prof", "icon", ANY],
    value: "text",
    pattern: /^\/assets\/prof\/icon_([^/]+)\.png$/,
    key: (context) => `image:prof/${captureOf(context.captures, 1)}`,
    ref: (context) => ["prof", "icon", paramOf(context, 0)],
  },
  {
    action: "map",
    name: "prof.large",
    location: ["prof", "large", ANY],
    value: "text",
    pattern: /^\/assets\/prof\/large_([^/]+)\.png$/,
    key: (context) => `image:prof/large/${captureOf(context.captures, 1)}`,
    ref: (context) => ["prof", "large", paramOf(context, 0)],
  },
  {
    action: "map",
    name: "prof.battlecard",
    location: ["prof", "battlecard", ANY],
    value: "text",
    pattern: /^\/assets\/prof\/battlecard_([^/]+)\.png$/,
    key: (context) => `image:prof/card/${captureOf(context.captures, 1)}`,
    ref: (context) => ["prof", "card", paramOf(context, 0)],
  },
  {
    action: "map",
    name: "prof.sub",
    location: ["prof", "sub", ANY],
    value: "text",
    pattern: /^\/assets\/prof\/sub\/([^/]+)\.png$/,
    key: (context) => `image:prof/sub/${captureOf(context.captures, 1)}`,
    ref: (context) => ["prof", "sub", paramOf(context, 0)],
  },

  // MARK: audio
  bgmRule("audio.bgm", ["audio", "bgm", ANY, ANY]),
  bgmRule("audio.bgm.combatAlts", ["audio", "bgm", "combatAlts", ANY, ANY]),
  bgmRule("audio.bossBgm", ["audio", "bossBgm", ANY, ANY]),
  {
    action: "map",
    name: "audio.voice",
    location: ["audio", "voice", ANY, ANY],
    value: "text",
    pattern: /^\/assets\/audio\/voice\/cn\/([^/]+)\/([^/]+)\.mp3$/,
    key: (context) => `audio:voice/cn/${captureOf(context.captures, 1)}/${captureOf(context.captures, 2)}`,
    ref: (context) => ["voice", paramOf(context, 0), paramOf(context, 1)],
  },
  {
    action: "map",
    name: "audio.voice.list",
    location: ["audio", "voice", ANY, ANY],
    value: "texts",
    pattern: /^\/assets\/audio\/voice\/cn\/([^/]+)\/([^/]+)\.mp3$/,
    key: (context) => `audio:voice/cn/${captureOf(context.captures, 1)}/${captureOf(context.captures, 2)}`,
    ref: (context) => ["voice", paramOf(context, 0), paramOf(context, 1)],
  },
  {
    action: "map",
    name: "audio.sfx.ui",
    location: ["audio", "sfx", "ui", ANY],
    value: "text",
    pattern: /^\/assets\/audio\/sfx\/general\/g_ui\/([^/]+)\.mp3$/,
    key: (context) => `audio:sfx/ui/${captureOf(context.captures, 1)}`,
    ref: (context) => ["sfx", "ui", captureOf(context.captures, 1)],
  },
  {
    action: "map",
    name: "audio.sfx.battle",
    location: ["audio", "sfx", "battle", ANY],
    value: "text",
    pattern: /^\/assets\/audio\/sfx\/battle\/[^/]+\/([^/]+)\.mp3$/,
    key: (context) => `audio:sfx/battle/${captureOf(context.captures, 1)}`,
    ref: (context) => ["sfx", "battle", captureOf(context.captures, 1)],
  },
  {
    action: "map",
    name: "audio.sfx.units",
    location: ["audio", "sfx", "units", ANY, ANY],
    value: "text",
    pattern: UNIT_SFX,
    key: (context) => `audio:sfx/battle/${captureOf(context.captures, 1)}`,
    ref: null,
  },
  {
    action: "map",
    name: "audio.sfx.units.skills",
    location: ["audio", "sfx", "units", ANY, "skills", ANY],
    value: "text",
    pattern: UNIT_SFX,
    key: (context) => `audio:sfx/battle/${captureOf(context.captures, 1)}`,
    ref: null,
  },

  // MARK: fonts
  {
    action: "map",
    name: "fonts.faces",
    location: ["fonts", "faces", ANY, "woff2"],
    value: "text",
    pattern: /^\/fonts\/(.+)-([^-/]+)\.woff2$/,
    key: (context) => `font:${captureOf(context.captures, 1)}/${captureOf(context.captures, 2)}`,
    ref: (context) => ["fonts", captureOf(context.captures, 1), captureOf(context.captures, 2)],
  },
]

/**
 * Paths that carry no asset: metadata, numbers, font declarations and names that another rule reads. Prefix match.
 * `audio.sfx.units.<unit>.mix` holds the volume and pitch of a unit's sound slots.
 */
export const IGNORED_PATHS: readonly (readonly string[])[] = [
  ["version"],
  ["hash"],
  ["generator"],
  ["stats"],
  ["source"],
  ["count"],
  ["fonts", "css"],
  ["fonts", "faces", ANY, "family"],
  ["fonts", "faces", ANY, "weight"],
  ["fonts", "faces", ANY, "original"],
  ["enemies", ANY, "spineAliasOf"],
  ["tokens", ANY, "owner"],
  ["tokens", ANY, "spineVariant"],
  ["audio", "sfx", "units", ANY, "mix"],
]

/** Returns the values of the `*` segments when `path` matches `location`, or null. */
export function matchLocation(location: readonly string[], path: readonly string[]): string[] | null {
  if (location.length !== path.length) return null
  const params: string[] = []
  for (let index = 0; index < location.length; index += 1) {
    const expected = location[index]
    const actual = path[index] ?? ""
    if (expected === ANY) params.push(actual)
    else if (expected !== actual) return null
  }
  return params
}

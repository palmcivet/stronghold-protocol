import { UnknownRegistrationError } from "#kernel/registry/error.js"

/** defineTag 返回的带类型的键。查询按键，不按字符串。 */
export interface TagKey {
  readonly id: string
  readonly meaning: string
  /** 持有这个标签就等于也持有这些标签。只用于查询，不出现在持有列表里。 */
  readonly implies: readonly TagKey[]
  /** implies 连同它们各自蕴含的标签展开后的 id，定义时算好，不含自己。 */
  readonly expanded: readonly string[]
}

export interface TagOptions {
  readonly meaning: string
  readonly implies?: readonly TagKey[]
}

export function defineTag(id: string, options: TagOptions): TagKey {
  if (id.length === 0) throw new Error("tag id must not be empty")
  const implies = options.implies ?? []
  const expanded = new Set<string>()
  for (const key of implies) {
    expanded.add(key.id)
    for (const deeper of key.expanded) expanded.add(deeper)
  }
  expanded.delete(id)
  return Object.freeze({ id, meaning: options.meaning, implies: Object.freeze([...implies]), expanded: Object.freeze([...expanded]) })
}

interface Held {
  readonly key: TagKey
  /** 来源 id 到授予次数。 */
  readonly sources: Map<string, number>
}

/** 一个实体按来源持有的标签。顺序是标签第一次被授予的顺序。 */
export interface TagGrants {
  readonly held: Map<string, Held>
  /** 被持有的标签蕴含的 id 到蕴含它的持有标签个数。 */
  readonly implied: Map<string, number>
  /** 授予或撤销一次加 1。按它判断由持有列表与来源推出的结果是否还能用。 */
  version: number
}

export interface TagHolder {
  readonly tags: TagGrants
}

export function createTagGrants(): TagGrants {
  return { held: new Map(), implied: new Map(), version: 0 }
}

function addImplied(grants: TagGrants, key: TagKey): void {
  for (const id of key.expanded) grants.implied.set(id, (grants.implied.get(id) ?? 0) + 1)
}

function dropHeld(grants: TagGrants, key: TagKey): void {
  grants.held.delete(key.id)
  for (const id of key.expanded) {
    const count = grants.implied.get(id) ?? 0
    if (count > 1) grants.implied.set(id, count - 1)
    else grants.implied.delete(id)
  }
}

export function grantTag(holder: TagHolder, key: TagKey, sourceId: string): void {
  const held = holder.tags.held
  const existing = held.get(key.id)
  if (existing && existing.key !== key) throw new Error(`tag id is defined twice: ${key.id}`)
  const entry = existing ?? { key, sources: new Map<string, number>() }
  entry.sources.set(sourceId, (entry.sources.get(sourceId) ?? 0) + 1)
  holder.tags.version += 1
  if (existing) return
  held.set(key.id, entry)
  addImplied(holder.tags, key)
}

/** 撤销这个来源的一次授予。所有来源都撤销后标签消失。 */
export function revokeTag(holder: TagHolder, key: TagKey, sourceId: string): void {
  const entry = holder.tags.held.get(key.id)
  if (!entry) return
  const count = entry.sources.get(sourceId)
  if (count === undefined) return
  holder.tags.version += 1
  if (count > 1) entry.sources.set(sourceId, count - 1)
  else entry.sources.delete(sourceId)
  if (entry.sources.size === 0) dropHeld(holder.tags, entry.key)
}

/** 撤销所有满足条件的来源授予的全部次数。 */
export function revokeSources(holder: TagHolder, matches: (sourceId: string) => boolean): void {
  for (const entry of holder.tags.held.values()) {
    for (const sourceId of entry.sources.keys()) {
      if (!matches(sourceId)) continue
      entry.sources.delete(sourceId)
      holder.tags.version += 1
    }
    if (entry.sources.size === 0) dropHeld(holder.tags, entry.key)
  }
}

/** 持有这个标签，或持有的某个标签蕴含它。 */
export function hasTag(holder: TagHolder, key: TagKey): boolean {
  return holder.tags.held.has(key.id) || holder.tags.implied.has(key.id)
}


/** 直接授予这个标签的来源，按第一次授予的顺序。蕴含得到的没有来源。 */
export function tagSources(holder: TagHolder, key: TagKey): readonly string[] {
  return [...(holder.tags.held.get(key.id)?.sources.keys() ?? [])]
}

/** 至少有一个来源满足条件的持有标签的 id，按第一次授予的顺序。 */
export function heldTagIds(holder: TagHolder, from: (sourceId: string) => boolean): string[] {
  const ids: string[] = []
  for (const entry of holder.tags.held.values()) {
    for (const sourceId of entry.sources.keys()) {
      if (!from(sourceId)) continue
      ids.push(entry.key.id)
      break
    }
  }
  return ids
}

/** 至少有一个来源满足条件的持有标签，按第一次授予的顺序。 */
export function heldTags(holder: TagHolder, from: (sourceId: string) => boolean = () => true): readonly TagKey[] {
  const keys: TagKey[] = []
  for (const entry of holder.tags.held.values()) {
    for (const sourceId of entry.sources.keys()) {
      if (!from(sourceId)) continue
      keys.push(entry.key)
      break
    }
  }
  return keys
}

/** 本场注册过的标签。规格里的标签字符串按 id 在这里找到键。 */
export interface TagCatalog {
  register(key: TagKey): void
  has(id: string): boolean
  /** owner 写进报错，说明这个标签出自哪里。 */
  require(id: string, owner?: string): TagKey
}

export function createTagCatalog(): TagCatalog {
  const keys = new Map<string, TagKey>()
  return {
    register(key) {
      const existing = keys.get(key.id)
      if (existing && existing !== key) throw new Error(`tag id is defined twice: ${key.id}`)
      keys.set(key.id, key)
    },
    has: (id) => keys.has(id),
    require(id, owner) {
      const key = keys.get(id)
      if (!key) throw new UnknownRegistrationError("tag", id, owner)
      return key
    },
  }
}


/** Namespaced id, `<namespace>:<name>`, kebab-case, with optional `/` segments in the name. */
export type MissionNamespacedId = `${string}:${string}`

const NAMESPACED = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/

export function isNamespacedId(id: string): id is MissionNamespacedId {
  return NAMESPACED.test(id)
}

/** Entries by id that are fixed once sealed. */
export interface SealedRegistry<TEntry extends { readonly id: string }> {
  register(entry: TEntry): void
  replace(entry: TEntry): void
  has(id: string): boolean
  get(id: string): TEntry | undefined
  /** Ids in registration order; a replaced entry keeps its place. */
  ids(): readonly string[]
  values(): readonly TEntry[]
  seal(): void
  readonly sealed: boolean
}

/** A registry of namespaced ids; `name` names the entries in error messages. */
export function createSealedRegistry<TEntry extends { readonly id: string }>(name: string): SealedRegistry<TEntry> {
  const entries = new Map<string, TEntry>()
  let sealed = false
  const open = (): void => {
    if (sealed) throw new Error(`The ${name} table is sealed; register and replace before creating the stage`)
  }
  return {
    register(entry) {
      open()
      if (!isNamespacedId(entry.id)) throw new RangeError(`${name} id "${entry.id}" is not "<namespace>:<name>" in kebab-case`)
      if (entries.has(entry.id)) throw new RangeError(`${name} "${entry.id}" is registered twice; use replace`)
      entries.set(entry.id, entry)
    },
    replace(entry) {
      open()
      if (!entries.has(entry.id)) throw new RangeError(`${name} "${entry.id}" is not registered`)
      entries.set(entry.id, entry)
    },
    has: (id) => entries.has(id),
    get: (id) => entries.get(id),
    ids: () => [...entries.keys()],
    values: () => [...entries.values()],
    seal() {
      sealed = true
    },
    get sealed() {
      return sealed
    },
  }
}

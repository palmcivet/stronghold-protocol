import type { BattleSpec } from "#contract/spec.js"

/** defineResource 返回的带类型的键。一场战斗里只有一份值。 */
export interface ResourceKey<T> {
  readonly id: string
  /** ensure 第一次取时按本场规格建出来。 */
  create(spec: BattleSpec): T
}

export interface ResourceAccess<T> {
  get(): T | undefined
  ensure(): T
  set(value: T): void
  delete(): void
}

export interface ResourceStore {
  access<T>(key: ResourceKey<T>): ResourceAccess<T>
}

const KEY_PATTERN = /^[^:\s]+:[^:\s]+$/

export function defineResource<T>(id: string, create: (spec: BattleSpec) => T): ResourceKey<T> {
  if (!KEY_PATTERN.test(id)) throw new Error(`resource id must look like "module:name": ${id}`)
  return Object.freeze({ id, create })
}

export function createResourceStore(spec: BattleSpec): ResourceStore {
  const accessors = new Map<string, { readonly key: ResourceKey<unknown>; readonly access: ResourceAccess<unknown> }>()
  const values = new Map<string, unknown>()

  return {
    access<T>(key: ResourceKey<T>): ResourceAccess<T> {
      const existing = accessors.get(key.id)
      if (existing) {
        if (existing.key !== key) throw new Error(`resource id is defined twice: ${key.id}`)
        return existing.access as ResourceAccess<T>
      }
      const access: ResourceAccess<T> = {
        get: () => values.get(key.id) as T | undefined,
        ensure() {
          const found = values.get(key.id)
          if (found !== undefined || values.has(key.id)) return found as T
          const created = key.create(spec)
          values.set(key.id, created)
          return created
        },
        set(value) {
          values.set(key.id, value)
        },
        delete() {
          values.delete(key.id)
        },
      }
      accessors.set(key.id, { key: key as ResourceKey<unknown>, access: access as ResourceAccess<unknown> })
      return access
    },
  }
}

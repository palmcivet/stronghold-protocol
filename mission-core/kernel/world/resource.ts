import type { BattleSpec } from "#contract/spec.js"
/** 资源值与纯数据之间的转换。decode 拿到本场规格，可以先按规格建出再写回状态。 */
export interface ResourceCodec<T> {
  encode(value: T): unknown
  decode(data: unknown, spec: BattleSpec): T
}

export interface ResourceOptions<T> {
  /** 缺省时值本身就是纯数据。 */
  readonly codec?: ResourceCodec<T>
  /** 为真时不导出也不导入：值在建战斗时重新放好，例如指回本场对象的引用。 */
  readonly transient?: boolean
}

/** defineResource 返回的带类型的键。一场战斗里只有一份值。 */
export interface ResourceKey<T> {
  readonly id: string
  /** ensure 第一次取时按本场规格建出来。 */
  create(spec: BattleSpec): T
  readonly options: ResourceOptions<T>
}

export interface ResourceAccess<T> {
  get(): T | undefined
  ensure(): T
  set(value: T): void
  delete(): void
}

/** 导出的资源：资源 id 到值，按第一次写入的顺序。 */
export type ResourceValues = Readonly<Record<string, unknown>>

export interface ResourceStore {
  access<T>(key: ResourceKey<T>): ResourceAccess<T>
  /** 不是 transient 的资源；有 codec 的值先 encode。 */
  export(): ResourceValues
  /** 去掉不是 transient 的资源，再按导出的数据放回；有 codec 的值先 decode。未定义的资源 id 报错。 */
  import(values: ResourceValues): void
}

const KEY_PATTERN = /^[^:\s]+:[^:\s]+$/
/** 已定义的资源，按 id。导入时按 id 找回键。同一 id 再定义时记最后一次。 */
const defined = new Map<string, ResourceKey<unknown>>()

export function defineResource<T>(id: string, create: (spec: BattleSpec) => T, options: ResourceOptions<T> = {}): ResourceKey<T> {
  if (!KEY_PATTERN.test(id)) throw new Error(`resource id must look like "module:name": ${id}`)
  const key: ResourceKey<T> = Object.freeze({ id, create, options })
  defined.set(id, key as ResourceKey<unknown>)
  return key
}

export function createResourceStore(spec: BattleSpec): ResourceStore {
  const accessors = new Map<string, { readonly key: ResourceKey<unknown>; readonly access: ResourceAccess<unknown> }>()
  const values = new Map<string, unknown>()
  const keyOf = (id: string): ResourceKey<unknown> | undefined => accessors.get(id)?.key ?? defined.get(id)

  const store: ResourceStore = {
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
    export() {
      const out: Record<string, unknown> = {}
      for (const [id, value] of values) {
        const key = keyOf(id)
        if (!key) throw new Error(`resource is not defined: ${id}`)
        if (key.options.transient) continue
        out[id] = key.options.codec ? key.options.codec.encode(value) : value
      }
      return out
    },
    import(data) {
      for (const id of [...values.keys()]) {
        if (!keyOf(id)?.options.transient) values.delete(id)
      }
      for (const [id, value] of Object.entries(data)) {
        const key = keyOf(id)
        if (!key) throw new Error(`resource is not defined: ${id}`)
        if (key.options.transient) throw new Error(`resource is transient: ${id}`)
        store.access(key)
        values.set(id, key.options.codec ? key.options.codec.decode(value, spec) : value)
      }
    },
  }
  return store
}

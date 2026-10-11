/** 组件值与纯数据之间的转换。缺省时组件值本身就是纯数据。 */
export interface ComponentCodec<T> {
  encode(value: T): unknown
  decode(data: unknown): T
}

export interface ComponentOptions<T> {
  /** ensure 第一次取某个实体的值时用它建出来。 */
  create(entityId: string): T
  /** 给画面看的显示值。不计入状态。 */
  view?(value: T): unknown
  /** 再部署时 keep 保留原值，clear 删掉，下次 ensure 重新建。缺省 keep。 */
  readonly reset?: "keep" | "clear"
  readonly codec?: ComponentCodec<T>
}

/** defineComponent 返回的带类型的键。id 写成 `模块id:名字`。 */
export interface ComponentKey<T> {
  readonly id: string
  readonly options: ComponentOptions<T>
  /** defineComponent 发的序号。存储按它直接找到表，不参与状态。 */
  readonly slot: number
}

/** 一张组件表。entries 按第一次写入的顺序。 */
export interface ComponentAccess<T> {
  get(entityId: string): T | undefined
  ensure(entityId: string): T
  set(entityId: string, value: T): void
  delete(entityId: string): void
  entries(): readonly (readonly [string, T])[]
}

export interface ComponentStore {
  access<T>(key: ComponentKey<T>): ComponentAccess<T>
  /** 按各组件的 reset 处理一个再部署的实体。 */
  reset(entityId: string): void
  /** 这个实体上带 view 的组件的显示值，按组件第一次使用的顺序。 */
  views(entityId: string): Readonly<Record<string, unknown>>
  /** 全部组件表，按组件第一次使用的顺序；有 codec 的值先 encode。 */
  export(): ComponentTables
  /** 清空现有的表，再按导出的数据重建；有 codec 的值先 decode。未定义的组件 id 报错。 */
  import(tables: ComponentTables): void
}

/** 导出的组件表：组件 id 到按写入顺序的 [实体 id, 值]。 */
export type ComponentTables = Readonly<Record<string, readonly (readonly [string, unknown])[]>>

const KEY_PATTERN = /^[^:\s]+:[^:\s]+$/
let nextSlot = 0
/** 已定义的组件，按 id。导入时按 id 找回键。同一 id 再定义时记最后一次。 */
const defined = new Map<string, ComponentKey<unknown>>()

export function defineComponent<T>(id: string, options: ComponentOptions<T>): ComponentKey<T> {
  if (!KEY_PATTERN.test(id)) throw new Error(`component id must look like "module:name": ${id}`)
  const key: ComponentKey<T> = Object.freeze({ id, options, slot: nextSlot++ })
  defined.set(id, key as ComponentKey<unknown>)
  return key
}

interface Table {
  readonly key: ComponentKey<unknown>
  readonly values: Map<string, unknown>
  readonly access: ComponentAccess<unknown>
}

export function createComponentStore(): ComponentStore {
  const tables = new Map<string, Table>()
  const bySlot: (Table | undefined)[] = []

  const accessOf = <T>(key: ComponentKey<T>, values: Map<string, T>): ComponentAccess<T> => ({
    get: (entityId) => values.get(entityId),
    ensure(entityId) {
      if (values.has(entityId)) return values.get(entityId) as T
      const created = key.options.create(entityId)
      values.set(entityId, created)
      return created
    },
    set(entityId, value) {
      values.set(entityId, value)
    },
    delete(entityId) {
      values.delete(entityId)
    },
    entries: () => [...values.entries()],
  })

  const store: ComponentStore = {
    access<T>(key: ComponentKey<T>): ComponentAccess<T> {
      const known = bySlot[key.slot]
      if (known) return known.access as ComponentAccess<T>
      const existing = tables.get(key.id)
      if (existing) {
        if (existing.key !== key) throw new Error(`component id is defined twice: ${key.id}`)
        return existing.access as ComponentAccess<T>
      }
      const values = new Map<string, T>()
      const access = accessOf(key, values)
      const table: Table = {
        key: key as ComponentKey<unknown>,
        values: values as Map<string, unknown>,
        access: access as ComponentAccess<unknown>,
      }
      tables.set(key.id, table)
      bySlot[key.slot] = table
      return access
    },
    reset(entityId) {
      for (const table of tables.values()) {
        if (table.key.options.reset === "clear") table.values.delete(entityId)
      }
    },
    views(entityId) {
      const shown: Record<string, unknown> = {}
      for (const table of tables.values()) {
        const view = table.key.options.view
        if (!view || !table.values.has(entityId)) continue
        shown[table.key.id] = view(table.values.get(entityId))
      }
      return shown
    },
    export() {
      const out: Record<string, (readonly [string, unknown])[]> = {}
      for (const table of tables.values()) {
        const codec = table.key.options.codec
        const rows: (readonly [string, unknown])[] = []
        for (const [entityId, value] of table.values) rows.push([entityId, codec ? codec.encode(value) : value])
        out[table.key.id] = rows
      }
      return out
    },
    import(data) {
      for (const table of tables.values()) table.values.clear()
      for (const [id, rows] of Object.entries(data)) {
        const key = tables.get(id)?.key ?? defined.get(id)
        if (!key) throw new Error(`component is not defined: ${id}`)
        const access = store.access(key)
        const codec = key.options.codec
        for (const [entityId, value] of rows) access.set(entityId, codec ? codec.decode(value) : value)
      }
    },
  }
  return store
}

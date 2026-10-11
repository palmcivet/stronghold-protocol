/** The view systems in the order they run every frame. */
export const MISSION_VIEW_SYSTEM_ORDER = [
  "ingest",
  "lifecycle",
  "position",
  "facing",
  "skeleton",
  "hud",
  "effect",
  "audio",
  "cull",
  "release",
] as const

export type MissionViewSystemId = (typeof MISSION_VIEW_SYSTEM_ORDER)[number]

export interface ViewSystem<TFrame> {
  readonly id: MissionViewSystemId
  run(frame: TFrame): void
}

export interface ViewLoop<TFrame> {
  /** Ids of the registered systems, in running order. */
  readonly order: readonly MissionViewSystemId[]
  run(frame: TFrame): void
}

/** Runs the given systems every frame in `MISSION_VIEW_SYSTEM_ORDER`, whatever order they are given in. */
export function createViewLoop<TFrame>(systems: readonly ViewSystem<TFrame>[]): ViewLoop<TFrame> {
  const byId = new Map<MissionViewSystemId, ViewSystem<TFrame>>()
  for (const system of systems) {
    if (!MISSION_VIEW_SYSTEM_ORDER.includes(system.id)) throw new RangeError(`Unknown view system "${String(system.id)}"`)
    if (byId.has(system.id)) throw new RangeError(`View system "${system.id}" is registered twice`)
    byId.set(system.id, system)
  }
  const ordered = MISSION_VIEW_SYSTEM_ORDER.flatMap((id) => {
    const system = byId.get(id)
    return system ? [system] : []
  })
  return {
    order: ordered.map((system) => system.id),
    run(frame) {
      for (const system of ordered) system.run(frame)
    },
  }
}

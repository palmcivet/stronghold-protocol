import { Group, Mesh, MeshBasicMaterial, PlaneGeometry } from "three"
import type { ActorFrame, MissionActorWorld } from "#actor/entity/index.js"
import type { ViewSystem } from "#runtime/stage/loop.js"
import { hudReadoutsOf, type MissionHudReaderTable, type MissionHudReadouts } from "#actor/hud/readout.js"

/** Bar size and height above the unit's position, in tiles. */
export const MISSION_HUD_BAR = Object.freeze({ width: 0.8, height: 0.08, lift: 1.25 })

const COLORS = Object.freeze({
  back: 0x1a1a1a,
  ally: 0x3fa9f5,
  enemy: 0xe5484d,
  shield: 0xf2f2f2,
  negative: 0xd02020,
  magazine: 0xf5c542,
  pip: 0xb48cff,
})

/** Pip size and gap, in bar heights; dim pips are spent. */
const PIP = Object.freeze({ size: 1.2, gap: 0.5, dim: 0.3 })

interface Bar {
  readonly group: Group
  readonly hp: Mesh
  readonly shield: Mesh
  readonly negative: Mesh
  readonly magazine: Mesh
  readonly pips: Group
}

export interface MissionHudLayer {
  /** Parent of every bar, in scene space; not scaled or mirrored with the models. */
  readonly layer: Group
  readonly system: ViewSystem<ActorFrame>
  /** Ratios drawn for a unit: health and shield of the effective maximum health. Null when the unit shows no bar. */
  readonly bar: (unitId: string) => { readonly hp: number; readonly shield: number } | null
  /** Magazine, pips and negative health pool drawn for a unit. Null when the unit shows no bar. */
  readonly readouts: (unitId: string) => MissionHudReadouts | null
  clear(): void
}

const unit = new PlaneGeometry(1, 1)

function plane(color: number, z: number): Mesh {
  const mesh = new Mesh(unit, new MeshBasicMaterial({ color, depthTest: false, transparent: true }))
  mesh.position.z = z
  mesh.renderOrder = 10
  return mesh
}

function ratio(value: number | undefined, max: number): number {
  if (!(max > 0) || value === undefined || !Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value / max))
}

function disposeAll(group: Group): void {
  group.traverse((child) => {
    if (child instanceof Mesh) (child.material as MeshBasicMaterial).dispose()
  })
}

/**
 * Health and shield bars over standing actors, hidden where the appearance turns `hpBar` off, with the readouts:
 * the negative pool over the health bar, the magazine strip under it and the pips above it. Seals the reader table.
 */
export function createHudLayer(world: MissionActorWorld, readerTable?: MissionHudReaderTable): MissionHudLayer {
  readerTable?.seal()
  const readers = readerTable?.values() ?? []
  const layer = new Group()
  layer.name = "hud"
  const bars = new Map<string, Bar>()
  const shown = new Map<string, { hp: number; shield: number }>()
  const readouts = new Map<string, MissionHudReadouts>()

  const barOf = (unitId: string, side: string): Bar => {
    const existing = bars.get(unitId)
    if (existing) return existing
    const group = new Group()
    const back = plane(COLORS.back, 0)
    back.scale.set(MISSION_HUD_BAR.width, MISSION_HUD_BAR.height, 1)
    const hp = plane(side === "enemy" ? COLORS.enemy : COLORS.ally, 0.001)
    const negative = plane(COLORS.negative, 0.002)
    const shield = plane(COLORS.shield, 0.003)
    const magazine = plane(COLORS.magazine, 0.001)
    const pips = new Group()
    group.add(back, hp, negative, shield, magazine, pips)
    layer.add(group)
    const bar = { group, hp, shield, negative, magazine, pips }
    bars.set(unitId, bar)
    return bar
  }

  const drop = (unitId: string): void => {
    const bar = bars.get(unitId)
    if (!bar) return
    layer.remove(bar.group)
    disposeAll(bar.group)
    bars.delete(unitId)
    shown.delete(unitId)
    readouts.delete(unitId)
  }

  const fill = (mesh: Mesh, value: number, lift: number): void => {
    mesh.visible = value > 0
    mesh.scale.set(MISSION_HUD_BAR.width * value, MISSION_HUD_BAR.height * lift, 1)
    mesh.position.x = (MISSION_HUD_BAR.width * (value - 1)) / 2
  }

  const drawPips = (group: Group, pips: MissionHudReadouts["pips"]): void => {
    const max = pips?.max ?? 0
    while (group.children.length < max) group.add(plane(COLORS.pip, 0.001))
    const size = MISSION_HUD_BAR.height * PIP.size
    const step = size + MISSION_HUD_BAR.height * PIP.gap
    group.children.forEach((child, index) => {
      const pip = child as Mesh
      pip.visible = index < max
      if (!pip.visible) return
      pip.scale.set(size, size, 1)
      pip.position.set(-MISSION_HUD_BAR.width / 2 + size / 2 + index * step, MISSION_HUD_BAR.height + size / 2, 0.001)
      ;(pip.material as MeshBasicMaterial).opacity = index < (pips?.left ?? 0) ? 1 : PIP.dim
    })
  }

  return {
    layer,
    system: {
      id: "hud",
      run() {
        for (const id of [...bars.keys()]) if (!world.actors.has(id)) drop(id)
        for (const actor of world.actors.values()) {
          if (actor.phase !== "standing" || actor.appearance?.hpBar === false) {
            drop(actor.id)
            continue
          }
          const max = actor.unit.maxHp
          const values = { hp: ratio(actor.unit.attributes.hp, max), shield: ratio(actor.unit.shield, max) }
          const read = hudReadoutsOf(actor.unit, readers)
          const bar = barOf(actor.id, actor.unit.side)
          fill(bar.hp, values.hp, 1)
          fill(bar.negative, read.negative, 1)
          fill(bar.shield, values.shield, 0.4)
          bar.shield.position.y = -MISSION_HUD_BAR.height * 0.3
          fill(bar.magazine, read.magazine ? read.magazine.left / read.magazine.max : 0, 0.5)
          bar.magazine.position.y = -MISSION_HUD_BAR.height * 0.9
          drawPips(bar.pips, read.pips)
          bar.group.position.set(actor.position.x, actor.position.height + MISSION_HUD_BAR.lift, -actor.position.y)
          shown.set(actor.id, values)
          readouts.set(actor.id, read)
        }
      },
    },
    bar: (unitId) => shown.get(unitId) ?? null,
    readouts: (unitId) => readouts.get(unitId) ?? null,
    clear() {
      for (const id of [...bars.keys()]) drop(id)
    },
  }
}

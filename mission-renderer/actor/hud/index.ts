import { Group, Mesh, MeshBasicMaterial, PlaneGeometry } from "three"
import type { ActorFrame, MissionActorWorld } from "#actor/entity/index.js"
import type { ViewSystem } from "#runtime/stage/loop.js"

/** Bar size and height above the unit's position, in tiles. */
export const MISSION_HUD_BAR = Object.freeze({ width: 0.8, height: 0.08, lift: 1.25 })

const COLORS = Object.freeze({ back: 0x1a1a1a, ally: 0x3fa9f5, enemy: 0xe5484d, shield: 0xf2f2f2 })

interface Bar {
  readonly group: Group
  readonly hp: Mesh
  readonly shield: Mesh
}

export interface MissionHudLayer {
  /** Parent of every bar, in scene space; not scaled or mirrored with the models. */
  readonly layer: Group
  readonly system: ViewSystem<ActorFrame>
  /** Ratios drawn for a unit: health and shield of the effective maximum health. Null when the unit shows no bar. */
  readonly bar: (unitId: string) => { readonly hp: number; readonly shield: number } | null
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

/** Health and shield bars over standing actors, hidden where the appearance turns `hpBar` off. */
export function createHudLayer(world: MissionActorWorld): MissionHudLayer {
  const layer = new Group()
  layer.name = "hud"
  const bars = new Map<string, Bar>()
  const shown = new Map<string, { hp: number; shield: number }>()

  const barOf = (unitId: string, side: string): Bar => {
    const existing = bars.get(unitId)
    if (existing) return existing
    const group = new Group()
    const back = plane(COLORS.back, 0)
    back.scale.set(MISSION_HUD_BAR.width, MISSION_HUD_BAR.height, 1)
    const hp = plane(side === "enemy" ? COLORS.enemy : COLORS.ally, 0.001)
    const shield = plane(COLORS.shield, 0.002)
    group.add(back, hp, shield)
    layer.add(group)
    const bar = { group, hp, shield }
    bars.set(unitId, bar)
    return bar
  }

  const drop = (unitId: string): void => {
    const bar = bars.get(unitId)
    if (!bar) return
    layer.remove(bar.group)
    for (const child of bar.group.children) ((child as Mesh).material as MeshBasicMaterial).dispose()
    bars.delete(unitId)
    shown.delete(unitId)
  }

  const fill = (mesh: Mesh, value: number, lift: number): void => {
    mesh.visible = value > 0
    mesh.scale.set(MISSION_HUD_BAR.width * value, MISSION_HUD_BAR.height * lift, 1)
    mesh.position.x = (MISSION_HUD_BAR.width * (value - 1)) / 2
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
          const bar = barOf(actor.id, actor.unit.side)
          fill(bar.hp, values.hp, 1)
          fill(bar.shield, values.shield, 0.4)
          bar.shield.position.y = -MISSION_HUD_BAR.height * 0.3
          bar.group.position.set(actor.position.x, actor.position.height + MISSION_HUD_BAR.lift, -actor.position.y)
          shown.set(actor.id, values)
        }
      },
    },
    bar: (unitId) => shown.get(unitId) ?? null,
    clear() {
      for (const id of [...bars.keys()]) drop(id)
    },
  }
}

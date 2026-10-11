import { AdditiveBlending, CircleGeometry, Mesh, MeshBasicMaterial, RingGeometry } from "three"
import type { MissionCue, MissionCueKey, MissionEffectKindId } from "#contract/cue.js"
import type { MissionEffectKind } from "#effect/table.js"

/** A flat shape on the ground under a unit that grows and fades out. */
export interface MissionPulseOptions<K extends MissionCueKey> {
  readonly id: MissionEffectKindId
  readonly accepts: readonly K[]
  /** The unit the pulse sits under, or null when the cue names none. */
  readonly anchor: (cue: MissionCue<K>) => string | null
  readonly shape: "disc" | "ring"
  readonly color: number
  readonly seconds: number
  /** Radius at the start and at the end, in tiles. */
  readonly radius: readonly [number, number]
  /** Height above the unit's ground, in tiles. */
  readonly lift: number
}

interface Pulse {
  readonly mesh: Mesh<CircleGeometry | RingGeometry, MeshBasicMaterial>
  age: number
}

const DISC = new CircleGeometry(1, 24)
const RING = new RingGeometry(0.82, 1, 32)

/** An effect kind drawing a growing, fading disc or ring under the cue's unit. */
export function createPulseKind<K extends MissionCueKey>(options: MissionPulseOptions<K>): MissionEffectKind<K, Pulse> {
  const scaleAt = (pulse: Pulse): void => {
    const t = Math.min(1, pulse.age / options.seconds)
    const radius = options.radius[0] + (options.radius[1] - options.radius[0]) * t
    pulse.mesh.scale.set(radius, radius, 1)
    pulse.mesh.material.opacity = 1 - t
  }
  return {
    id: options.id,
    accepts: options.accepts,
    create() {
      const material = new MeshBasicMaterial({
        color: options.color,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      })
      const mesh = new Mesh(options.shape === "disc" ? DISC : RING, material)
      mesh.rotation.x = -Math.PI / 2
      mesh.renderOrder = 5
      mesh.visible = false
      return { mesh, age: 0 }
    },
    start(pulse, cue, context) {
      const unitId = options.anchor(cue)
      const actor = unitId ? context.actors.get(unitId) : undefined
      if (!actor) return false
      pulse.age = 0
      pulse.mesh.position.set(actor.position.x, actor.position.height + options.lift, -actor.position.y)
      pulse.mesh.visible = true
      scaleAt(pulse)
      context.layer.add(pulse.mesh)
      return true
    },
    update(pulse, deltaSeconds) {
      pulse.age += deltaSeconds
      scaleAt(pulse)
      return pulse.age < options.seconds
    },
    end(pulse, context) {
      pulse.mesh.visible = false
      context.layer.remove(pulse.mesh)
    },
    dispose(pulse) {
      pulse.mesh.material.dispose()
    },
  }
}

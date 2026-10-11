import { Box3, Frustum, Matrix4, Sphere, type Camera, type Group, type Object3D } from "three"
import type { ActorFrame, MissionActorWorld } from "#actor/entity/index.js"
import type { ViewSystem } from "#runtime/stage/loop.js"

/** Radius of the sphere an actor is tested with, in tiles, before its appearance scale. */
export const MISSION_CULL_ACTOR_RADIUS = 1.5

export interface MissionCullOptions {
  /** The camera the stage is drawn with; nothing is culled without one. */
  readonly camera: () => Camera | null
  readonly actors: MissionActorWorld
  /** Parent of the effects' objects. */
  readonly effects: Group
}

/**
 * Hides actors and effect objects outside the camera's view. A culled actor's skeleton does not advance in the next
 * frames; effects keep their clock, only their drawing is skipped.
 */
export function createCullSystem(options: MissionCullOptions): ViewSystem<ActorFrame> {
  const frustum = new Frustum()
  const matrix = new Matrix4()
  const sphere = new Sphere()
  const box = new Box3()
  const hidden = new WeakSet<Object3D>()

  return {
    id: "cull",
    run() {
      const camera = options.camera()
      if (!camera) {
        for (const actor of options.actors.actors.values()) {
          if (actor.culled) actor.root.visible = true
          actor.culled = false
        }
        return
      }
      camera.updateMatrixWorld()
      frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
      for (const actor of options.actors.actors.values()) {
        const scale = Math.max(actor.appearance?.scale ?? 1, (actor.appearance?.scale ?? 1) * (actor.appearance?.scaleY ?? 1))
        const radius = MISSION_CULL_ACTOR_RADIUS * scale
        sphere.center.set(actor.position.x, actor.position.height + radius / 2, -actor.position.y)
        sphere.radius = radius
        const culled = !frustum.intersectsSphere(sphere)
        if (culled !== actor.culled) actor.root.visible = !culled
        actor.culled = culled
      }
      for (const object of options.effects.children) {
        object.updateWorldMatrix(true, true)
        box.setFromObject(object)
        const inside = box.isEmpty() || frustum.intersectsBox(box)
        if (!inside && object.visible) {
          object.visible = false
          hidden.add(object)
        } else if (inside && hidden.has(object)) {
          object.visible = true
          hidden.delete(object)
        }
      }
    },
  }
}

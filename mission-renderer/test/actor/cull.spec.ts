import { describe, expect, it } from "vitest"
import { BoxGeometry, Group, Mesh, OrthographicCamera } from "three"
import { TICK } from "arknights-mission-core"
import { createActorWorld, type ActorFrame } from "#actor/entity/index.js"
import { createCullSystem } from "#runtime/cull/index.js"
import { appearance, fakeSkeleton, recordDuel } from "#test/actor/fixture.js"

/** A camera looking straight down at column `x`, row 0, one tile either side. */
function cameraAt(x: number): OrthographicCamera {
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
  camera.up.set(0, 0, -1)
  camera.position.set(x, 40, 0)
  camera.lookAt(x, 0, 0)
  camera.updateProjectionMatrix()
  return camera
}

describe("cull", () => {
  const [first] = recordDuel(0, 1000)
  const frame: ActorFrame = { deltaSeconds: TICK, units: first!.snapshot.units, moving: new Set(), events: [] }

  async function staged() {
    const skeleton = fakeSkeleton()
    const world = createActorWorld({ skeleton: skeleton.runtime, resources: skeleton.resources })
    world.setAppearances({ g: appearance("spine:guard"), e: appearance("spine:enemy") })
    const effects = new Group()
    let camera: OrthographicCamera | null = cameraAt(0)
    const cull = createCullSystem({ camera: () => camera, actors: world, effects })
    const run = async () => {
      for (const system of world.systems) system.run(frame)
      cull.run(frame)
      await Promise.resolve()
    }
    await run()
    await run()
    return { world, effects, cull, skeleton, run, aim: (next: OrthographicCamera | null) => void (camera = next) }
  }

  it("hides actors outside the camera's view and stops their skeletons, then brings them back", async () => {
    const h = await staged()
    const guard = h.world.actors.get("g")!
    expect(guard.culled).toBe(false)
    h.aim(cameraAt(-10))
    await h.run()
    expect([guard.culled, guard.root.visible]).toEqual([true, false])
    const instance = h.skeleton.instances.find((candidate) => candidate === guard.skeleton.instance)!
    const elapsed = instance.elapsed
    await h.run()
    expect(instance.elapsed).toBe(elapsed)
    h.aim(cameraAt(0))
    await h.run()
    expect([guard.culled, guard.root.visible]).toEqual([false, true])
    await h.run()
    expect(instance.elapsed).toBeGreaterThan(elapsed)
  })

  it("hides effect objects outside the view and shows them again once inside", async () => {
    const h = await staged()
    const spark = new Mesh(new BoxGeometry(0.2, 0.2, 0.2))
    spark.position.set(10, 0, 0)
    h.effects.add(spark)
    await h.run()
    expect(spark.visible).toBe(false)
    spark.position.set(0, 0, 0)
    await h.run()
    expect(spark.visible).toBe(true)
  })

  it("culls nothing without a camera", async () => {
    const h = await staged()
    h.aim(cameraAt(-10))
    await h.run()
    h.aim(null)
    await h.run()
    expect([...h.world.actors.values()].map((actor) => [actor.culled, actor.root.visible])).toEqual([
      [false, true],
      [false, true],
    ])
  })
})

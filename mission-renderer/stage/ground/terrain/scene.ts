import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MirroredRepeatWrapping,
  Object3D,
  OrthographicCamera,
  PCFShadowMap,
  RepeatWrapping,
  Scene,
  Vector4,
  type Material,
  type Texture,
  type WebGLRenderer,
} from "three"
import type { MissionMap } from "#contract/view.js"
import { surfaceUV, type TerrainSurface, type TerrainUvTable } from "./atlas.js"

import {
  backdropGeometry,
  buildTerrainLayout,
  edgeStrips,
  overlayQuads,
  shadowCatcherGeometry,
  smogCards,
  type TerrainGeometry,
  type TerrainLayout,
} from "./layout.js"
import {
  boardMaterial,
  dashTexture,
  decalMaterial,
  environmentTexture,
  focusUniforms,
  gateMaterial,
  glassMaterial,
  glowMaterial,
  infectionMaterial,
  mireMaterial,
  pipeMaterial,
  shadowCatcherMaterial,
  smogMaterial,
  unlitMaterial,
  waterMaterial,
  type BoardTextures,
  type FocusUniforms,
} from "./materials.js"
import { boxGeometry, boxProjectUv, objToBoard, placeBoardMesh, terrainGeometryOf, type BoardPlacement, type ParsedMesh } from "./mesh.js"
import { BACKDROP, PLATFORM_DEVICE_HEIGHT } from "./palette.js"
import type { TerrainGateSlot, TerrainPack, TerrainProp } from "./pack.js"

/** Lighting rig tuned against the official screenshots: bright tops, darker sides, soft shadows. */
export const TERRAIN_LIGHTING = Object.freeze({
  key: Object.freeze({ color: 0xfff1df, intensity: 2.6, direction: Object.freeze([-5.2, -3.4, 10] as const) }),
  hemisphere: Object.freeze({ sky: 0xe4ecf4, ground: 0x4a5058, intensity: 0.6 }),
  environment: 1.0,
  emissive: 0.25,
  shadow: Object.freeze({ size: 2048, radius: 3, bias: -0.0004, normalBias: 0.025 }),
  clear: 0x0c1114,
  gateGain: 0.6,
})

/** The gate pulse: the official clip's intensity curve (2 s loop, 0.134 → 0.229 → 0.134). */
export function gatePulse(seconds: number, phase = 0): number {
  const k = 0.5 - 0.5 * Math.cos(((seconds / 2 + phase) % 1) * Math.PI * 2)
  return 0.134 + (0.229 - 0.134) * k
}

/** Quarter turns that point the wind device's outlet (−x in its mesh) along each direction. */
const BLOWER_TURNS = Object.freeze({ LEFT: 0, DOWN: 1, RIGHT: 2, UP: 3 })

const GATE_SLOTS: Readonly<Record<"start" | "end", readonly TerrainGateSlot[]>> = {
  start: ["startDown", "startUp", "startBack"],
  end: ["endDown", "endUp"],
}

const FLASH_SECONDS = 1.2
const FLASH_LIMIT = 8

export interface TerrainFocusRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface TerrainSceneOptions {
  readonly map: MissionMap
  readonly pack: TerrainPack
  /** When present, the scene gets image-based light and the key light's shadows. */
  readonly renderer?: WebGLRenderer | null
}

export interface TerrainScene {
  readonly scene: Scene
  readonly camera: OrthographicCamera
  readonly ground: Group
  readonly layout: TerrainLayout
  /** The lit rectangle in scene space: x0, z0, x1, z1 (the focus falloff eases towards it). */
  readonly litField: Vector4
  setFocus(rect: TerrainFocusRect | null): void
  flashObjective(): void
  update(deltaSeconds: number): void
  destroy(): void
}

/** Geometry already in the scene's coordinates (x = column, y = height, z = −row) as a buffer geometry. */
function toBuffer(geometry: TerrainGeometry): BufferGeometry {
  const buffer = new BufferGeometry()
  buffer.setAttribute("position", new BufferAttribute(geometry.position, 3))
  buffer.setAttribute("normal", new BufferAttribute(geometry.normal, 3))
  buffer.setAttribute("uv", new BufferAttribute(geometry.uv, 2))
  buffer.setAttribute("color", new BufferAttribute(geometry.color, 3))
  buffer.setIndex(new BufferAttribute(geometry.index, 1))
  return buffer
}

/** Board-space geometry placed at `placement` and converted to the scene's coordinates. */
function boardBuffer(geometry: TerrainGeometry, placement: BoardPlacement = { x: 0, y: 0, z: 0 }): BufferGeometry {
  return toBuffer(placeBoardMesh(geometry, placement))
}

/** A procedural box whose top takes the `mech` plate and whose sides the grey panel. */
function boxWithTop(uvTable: TerrainUvTable, height: number): TerrainGeometry {
  const box = boxGeometry(0.86, height)
  const top = uvTable.mech
  const side = uvTable.graySide
  if (!top || !side) return box
  const topUv = surfaceUV(top)
  const sideUv = surfaceUV(side)
  const uv = new Float32Array(box.uv.length)
  for (let face = 0; face < box.uv.length / 8; face += 1) {
    uv.set(face === 0 ? topUv : sideUv, face * 8)
  }
  return { ...box, uv }
}

function surfaceOrFallback(uvTable: TerrainUvTable, name: string): TerrainSurface {
  const found = uvTable[name] ?? uvTable.concrete
  if (!found) throw new Error(`terrain UV table has no surface ${name}`)
  return found
}

/** An OBJ prop placed on the board, in the scene's coordinates; null for a prop already built as an Object3D. */
function propGeometry(prop: TerrainProp, scale: number, placement: BoardPlacement): TerrainGeometry | null {
  if (prop instanceof Object3D) return null
  return placeBoardMesh(terrainGeometryOf(objToBoard(prop as ParsedMesh, scale)), placement)
}

/**
 * Build the official board as a three.js scene for a map: the board's tiles, decals, railings, gates, devices, animated
 * special terrain, the field border and the background, lit by a key light with soft shadows.
 */
export function createTerrainScene(options: TerrainSceneOptions): TerrainScene {
  const { map, pack } = options
  const renderer = options.renderer ?? null
  const layout = buildTerrainLayout(map, pack.uv)
  const focus: FocusUniforms = focusUniforms()
  const images = pack.images
  const textures: BoardTextures = {
    diffuse: images.D!,
    normal: images.N ?? null,
    roughness: images.R ?? null,
    emissive: images.E ?? null,
    common: images.common ?? null,
    commonEmissive: images.commonE ?? null,
    background: images.BG ?? null,
    wind: images.wind ?? null,
    gate: images.gate ?? null,
    water: images.waterN ?? null,
    caustics: images.caustics ?? null,
    noise: images.noise ?? null,
  }
  for (const texture of [textures.water, textures.caustics, textures.noise] as (Texture | null)[]) {
    if (!texture) continue
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
  }
  if (textures.background) {
    textures.background.wrapS = MirroredRepeatWrapping
    textures.background.wrapT = MirroredRepeatWrapping
  }

  const materials = {
    board: boardMaterial(textures, focus, TERRAIN_LIGHTING.emissive),
    glass: glassMaterial(textures, focus, TERRAIN_LIGHTING.emissive),
    decal: decalMaterial(textures, focus),
    pipe: pipeMaterial(focus),
    wind: unlitMaterial(textures.wind ?? null),
    gateStart: gateMaterial(textures.gate ?? null, true),
    gateEnd: gateMaterial(textures.gate ?? null, true),
    gateEndAlpha: gateMaterial(textures.gate ?? null, false),
    edge: glowMaterial(dashTexture()),
    water: waterMaterial(textures, focus),
    mire: mireMaterial(textures, focus),
    infection: infectionMaterial(textures, focus),
    smog: smogMaterial(textures, focus),
    background: unlitMaterial(textures.background ?? null, new Color().setScalar(BACKDROP.color * BACKDROP.dim)),
    shadow: shadowCatcherMaterial(),
  }
  const owned: { dispose(): void }[] = Object.values(materials)

  const scene = new Scene()
  const ground = new Group()
  ground.name = "terrain"
  scene.add(ground)

  const castsShadow = renderer !== null
  const addMesh = (
    name: string,
    geometry: BufferGeometry,
    material: Material,
    flags: { readonly cast?: boolean, readonly receive?: boolean, readonly order?: number } = {},
  ): Mesh => {
    owned.push(geometry)
    const mesh = new Mesh(geometry, material)
    mesh.name = name
    mesh.castShadow = castsShadow && (flags.cast ?? true)
    mesh.receiveShadow = castsShadow && (flags.receive ?? true)
    mesh.renderOrder = flags.order ?? 0
    ground.add(mesh)
    return mesh
  }

  addMesh("terrain-ground", boardBuffer(layout.buckets.board), materials.board)
  addMesh("terrain-decal", boardBuffer(layout.buckets.decal), materials.decal, { cast: false, receive: false })
  addMesh("terrain-pipe", boardBuffer(layout.buckets.pipe), materials.pipe)
  if (layout.buckets.glass.index.length > 0) addMesh("terrain-glass", boardBuffer(layout.buckets.glass), materials.glass)

  const blowerProp = pack.meshes.blower
  for (const device of layout.devices) {
    const placement: BoardPlacement = { x: device.x, y: device.y, z: device.z }
    if (device.kind === "blower") {
      const geometry = blowerProp ? propGeometry(blowerProp, 1, { ...placement, z: device.z + 0.078, quarterTurns: BLOWER_TURNS[device.direction] }) : null
      if (geometry) {
        addMesh("terrain-blower", toBuffer(geometry), materials.wind, { cast: false, receive: false })
      } else {
        addMesh("terrain-blower", boardBuffer(boxWithTop(pack.uv, PLATFORM_DEVICE_HEIGHT), placement), materials.board)
      }
    } else {
      const crate = pack.meshes.crate
      const top = surfaceOrFallback(pack.uv, "crateTop")
      const side = surfaceOrFallback(pack.uv, "crateSide")
      const base = crate && !(crate instanceof Object3D) ? terrainGeometryOf(objToBoard(crate, 0.01)) : boxGeometry(0.9, 0.675)
      addMesh("terrain-crate", boardBuffer(boxProjectUv(base, top, side), placement), materials.board)
    }
  }

  for (const gate of layout.gates) {
    const materialFor = (slot: TerrainGateSlot): Material => {
      if (gate.kind === "start") return materials.gateStart
      return slot === "endUp" ? materials.gateEndAlpha : materials.gateEnd
    }
    for (const slot of GATE_SLOTS[gate.kind]) {
      const prop = pack.gates[slot]
      if (!prop) continue
      const placement: BoardPlacement = { x: gate.x, y: gate.y, z: gate.z + 0.5 + 0.003, quarterTurns: 2 }
      if (prop instanceof Object3D) {
        const object = prop.clone(true)
        object.name = `terrain-gate-${slot}`
        object.position.set(gate.x, placement.z, -gate.y)
        object.rotation.y = Math.PI
        ground.add(object)
        continue
      }
      const geometry = propGeometry(prop, 0.01, placement)
      if (geometry) addMesh(`terrain-gate-${slot}`, toBuffer(geometry), materialFor(slot), { cast: false, receive: false, order: gate.kind === "start" ? 5 : 4 })
    }
  }

  const edges = edgeStrips(layout.edges)
  if (edges.index.length > 0) addMesh("terrain-edges", boardBuffer(edges), materials.edge, { cast: false, receive: false, order: 3 })

  const overlays: readonly [string, TerrainGeometry, Material, number][] = [
    ["terrain-water", overlayQuads(layout.water, -0.035), materials.water, 2],
    ["terrain-mire", overlayQuads(layout.mire, 0.006, 0.02), materials.mire, 2],
    ["terrain-infection", overlayQuads(layout.infection, 0.007, 0.02), materials.infection, 2],
    ["terrain-smog", smogCards(layout.smog), materials.smog, 6],
  ]
  for (const [name, data, material, order] of overlays) {
    if (data.index.length === 0) continue
    addMesh(name, boardBuffer(data), material, { cast: false, receive: false, order })
  }

  const planeMesh = pack.meshes.bgPlane
  const plane = planeMesh && !(planeMesh instanceof Object3D) ? terrainGeometryOf(objToBoard(planeMesh, BACKDROP.size / 100)) : null
  addMesh("terrain-background", boardBuffer(backdropGeometry(map, plane)), materials.background, { cast: false, receive: false, order: -2 })
  addMesh("terrain-shadow", boardBuffer(shadowCatcherGeometry(map)), materials.shadow, { cast: false, receive: true, order: -1 })

  const cx = (map.cols - 1) / 2
  const cy = (map.rows - 1) / 2
  const hemisphere = new HemisphereLight(TERRAIN_LIGHTING.hemisphere.sky, TERRAIN_LIGHTING.hemisphere.ground, TERRAIN_LIGHTING.hemisphere.intensity)
  hemisphere.position.set(0, 1, 0)
  scene.add(hemisphere)
  const key = new DirectionalLight(TERRAIN_LIGHTING.key.color, TERRAIN_LIGHTING.key.intensity)
  const [dx, dy, dz] = TERRAIN_LIGHTING.key.direction
  const length = Math.hypot(dx, dy, dz) || 1
  const distance = 30
  key.position.set(cx + (dx / length) * distance, dz / length * distance, -(cy + (dy / length) * distance))
  key.target.position.set(cx, 0, -cy)
  scene.add(key, key.target)
  key.castShadow = castsShadow
  key.shadow.mapSize.set(TERRAIN_LIGHTING.shadow.size, TERRAIN_LIGHTING.shadow.size)
  key.shadow.radius = TERRAIN_LIGHTING.shadow.radius
  key.shadow.bias = TERRAIN_LIGHTING.shadow.bias
  key.shadow.normalBias = TERRAIN_LIGHTING.shadow.normalBias
  const shadowHalf = Math.max(map.cols, map.rows) / 2 + 9
  key.shadow.camera.left = -shadowHalf
  key.shadow.camera.right = shadowHalf
  key.shadow.camera.top = shadowHalf
  key.shadow.camera.bottom = -shadowHalf
  key.shadow.camera.near = 1
  key.shadow.camera.far = distance + 30
  key.shadow.camera.updateProjectionMatrix()
  if (renderer) {
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = PCFShadowMap
    renderer.shadowMap.autoUpdate = false
    renderer.shadowMap.needsUpdate = true
    scene.environment = environmentTexture(renderer)
    scene.environmentIntensity = TERRAIN_LIGHTING.environment
  }

  const camera = new OrthographicCamera(-map.cols / 2, map.cols / 2, map.rows / 2, -map.rows / 2, 0.1, 200)
  camera.up.set(0, 0, -1)
  camera.position.set(cx, 40, -cy)
  camera.lookAt(cx, 0, -cy)
  camera.updateProjectionMatrix()

  const gateStart = materials.gateStart
  const gateEnd = materials.gateEnd
  const gateEndAlpha = materials.gateEndAlpha
  const flashes: { elapsed: number }[] = []
  let time = 0
  const target = [-50, -50, 70, 70]
  const focusVector = focus.uFocus.value

  const applyFocusTarget = (rect: TerrainFocusRect | null): void => {
    if (!rect) {
      target[0] = -50
      target[1] = -50
      target[2] = 70
      target[3] = 70
      return
    }
    const xMin = rect.x - 0.5
    const xMax = rect.x + rect.width - 0.5
    const yMin = rect.y - 0.5
    const yMax = rect.y + rect.height - 0.5
    target[0] = xMin
    target[1] = -yMax
    target[2] = xMax
    target[3] = -yMin
  }

  return {
    scene,
    camera,
    ground,
    layout,
    litField: focusVector,
    setFocus(rect) {
      applyFocusTarget(rect)
    },
    flashObjective() {
      flashes.push({ elapsed: 0 })
      if (flashes.length > FLASH_LIMIT) flashes.shift()
    },
    update(deltaSeconds) {
      const dt = Math.max(0, Math.min(0.1, deltaSeconds))
      time += dt
      const k = Math.min(1, dt * 5)
      const gap = Math.abs(focusVector.x - (target[0] ?? 0)) + Math.abs(focusVector.y - (target[1] ?? 0))
        + Math.abs(focusVector.z - (target[2] ?? 0)) + Math.abs(focusVector.w - (target[3] ?? 0))
      if (gap > 40) {
        focusVector.set(target[0] ?? 0, target[1] ?? 0, target[2] ?? 0, target[3] ?? 0)
      } else {
        focusVector.set(
          focusVector.x + ((target[0] ?? 0) - focusVector.x) * k,
          focusVector.y + ((target[1] ?? 0) - focusVector.y) * k,
          focusVector.z + ((target[2] ?? 0) - focusVector.z) * k,
          focusVector.w + ((target[3] ?? 0) - focusVector.w) * k,
        )
      }
      gateStart.uniforms.uPulse!.value = TERRAIN_LIGHTING.gateGain * gatePulse(time) / 0.18
      gateEnd.uniforms.uPulse!.value = TERRAIN_LIGHTING.gateGain * gatePulse(time, 0.5) / 0.18
      gateEndAlpha.uniforms.uPulse!.value = 0.9
      let flash = 0
      for (let index = flashes.length - 1; index >= 0; index -= 1) {
        const item = flashes[index]!
        item.elapsed += dt
        if (item.elapsed > FLASH_SECONDS) flashes.splice(index, 1)
        else flash = Math.max(flash, 1 - item.elapsed / FLASH_SECONDS)
      }
      for (const material of [gateEnd, gateEndAlpha]) {
        ;(material.uniforms.uFlash!.value as Color).setRGB(flash, flash * 0.12, flash * 0.1)
      }
      for (const material of [materials.water, materials.mire, materials.infection, materials.smog]) {
        material.uniforms.uTime!.value = time
      }
    },
    destroy() {
      for (const item of owned) item.dispose()
      ground.clear()
      scene.clear()
    },
  }
}

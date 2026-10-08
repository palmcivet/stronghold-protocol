import type { AssetRef } from "arknights-assets-catalog"
import type { Object3D, Texture } from "three"
import type { RendererAssetKind } from "#port/resource.js"
import { resolveUvTable, type TerrainUvTable } from "./atlas.js"
import { isParsedMesh, parseObj, type ParsedMesh } from "./mesh.js"

/** Official board atlas slots (master board3d/load.js PACK_IMAGES). The diffuse slot `D` is required. */
export const TERRAIN_IMAGE_SLOTS = [
  "D",
  "N",
  "R",
  "E",
  "common",
  "commonE",
  "BG",
  "wind",
  "gate",
  "waterN",
  "caustics",
  "noise",
] as const

export type TerrainImageSlot = (typeof TERRAIN_IMAGE_SLOTS)[number]

/** Official meshes (master board3d/load.js PACK_MESHES). */
export const TERRAIN_MESH_SLOTS = ["crate", "blower", "bgPlane"] as const

export type TerrainMeshSlot = (typeof TERRAIN_MESH_SLOTS)[number]

/** Gate and objective box pieces, by the prefab node name that holds them (master board3d/load.js GATE_NODES). */
export const TERRAIN_GATE_NODES = Object.freeze({
  startDown: "Start_down",
  startUp: "Start_up",
  startBack: "Start_back",
  endDown: "Start_down1",
  endUp: "Start_up1",
})

export type TerrainGateSlot = keyof typeof TERRAIN_GATE_NODES

export type TerrainProp = ParsedMesh | Object3D

export interface TerrainPackRequest {
  readonly images: Partial<Record<TerrainImageSlot, AssetRef>>
  readonly meshes?: Partial<Record<TerrainMeshSlot, AssetRef>>
  /** Explicit gate piece meshes; a slot missing here is looked up in `gatePrefab`. */
  readonly gates?: Partial<Record<TerrainGateSlot, AssetRef>>
  /** The prefab table (`map/fx/prefab.json`): node name → mesh name, used for the gate pieces not given explicitly. */
  readonly gatePrefab?: AssetRef
  /** Maps a mesh name from the prefab table to its catalog reference. */
  readonly resolveMesh?: (name: string) => AssetRef | null
  readonly tiles?: AssetRef
}

export interface TerrainPackPort {
  readonly image?: (ref: AssetRef) => Promise<unknown>
  readonly model?: (ref: AssetRef) => Promise<unknown>
  readonly json?: (ref: AssetRef) => Promise<unknown>
  readonly release: (ref: AssetRef, kind?: RendererAssetKind) => void
}

export interface TerrainPack {
  readonly images: Partial<Record<TerrainImageSlot, Texture>>
  readonly meshes: Partial<Record<TerrainMeshSlot, TerrainProp>>
  readonly gates: Partial<Record<TerrainGateSlot, TerrainProp>>
  readonly uv: TerrainUvTable
  release(): void
}

interface PrefabRecord {
  readonly name: string
  readonly parent?: string
  readonly mesh?: string
}

function isTexture(value: unknown): value is Texture {
  return Boolean(value && typeof value === "object" && "isTexture" in value && value.isTexture === true)
}

function propOf(value: unknown): TerrainProp | null {
  if (typeof value === "string") return parseObj(value)
  if (isParsedMesh(value)) return value
  if (value && typeof value === "object" && "isObject3D" in value && value.isObject3D === true) return value as Object3D
  return null
}

function prefabRecords(value: unknown): readonly PrefabRecord[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): PrefabRecord[] => {
    if (!item || typeof item !== "object") return []
    const record = item as { name?: unknown, parent?: unknown, mesh?: unknown }
    if (typeof record.name !== "string") return []
    return [{
      name: record.name,
      ...(typeof record.parent === "string" ? { parent: record.parent } : {}),
      ...(typeof record.mesh === "string" ? { mesh: record.mesh } : {}),
    }]
  })
}

/** The prefab record of a gate node (`Start_back` only counts under the `[opt]start_box` parent, like the client). */
function prefabFor(records: readonly PrefabRecord[], node: string): PrefabRecord | null {
  return records.find((record) => record.name === node && (node !== "Start_back" || record.parent === "[opt]start_box")) ?? null
}

/**
 * Load the board pack through the resource port. Every entry is optional except the diffuse atlas: without it the
 * pack is null and the ground stays hidden. A missing map or mesh drops only its own feature.
 */
export async function loadTerrainPack(port: TerrainPackPort, request: TerrainPackRequest): Promise<TerrainPack | null> {
  const held: { readonly ref: AssetRef, readonly kind: RendererAssetKind }[] = []
  const releaseHeld = (): void => {
    for (const item of held.splice(0)) port.release(item.ref, item.kind)
  }
  const take = async (
    ref: AssetRef | undefined,
    kind: RendererAssetKind,
    load: ((ref: AssetRef) => Promise<unknown>) | undefined,
  ): Promise<unknown> => {
    if (!ref || !load) return null
    try {
      const value = await load(ref)
      held.push({ ref, kind })
      return value
    } catch {
      port.release(ref, kind)
      return null
    }
  }

  const diffuse = await take(request.images.D, "image", port.image)
  if (!isTexture(diffuse)) {
    releaseHeld()
    return null
  }
  const images: Partial<Record<TerrainImageSlot, Texture>> = { D: diffuse }
  await Promise.all(TERRAIN_IMAGE_SLOTS.filter((slot) => slot !== "D").map(async (slot) => {
    const value = await take(request.images[slot], "image", port.image)
    if (isTexture(value)) images[slot] = value
  }))

  const meshes: Partial<Record<TerrainMeshSlot, TerrainProp>> = {}
  await Promise.all(TERRAIN_MESH_SLOTS.map(async (slot) => {
    const value = propOf(await take(request.meshes?.[slot], "model", port.model))
    if (value) meshes[slot] = value
  }))

  const prefab = request.gatePrefab
    ? prefabRecords(await take(request.gatePrefab, "model", port.json))
    : []
  const gates: Partial<Record<TerrainGateSlot, TerrainProp>> = {}
  await Promise.all((Object.keys(TERRAIN_GATE_NODES) as TerrainGateSlot[]).map(async (slot) => {
    const explicit = request.gates?.[slot]
    const node = TERRAIN_GATE_NODES[slot]
    const record = prefabFor(prefab, node)
    const meshName = record?.mesh ?? node
    const ref = explicit ?? (request.resolveMesh ? request.resolveMesh(meshName) : null)
    const value = propOf(await take(ref ?? undefined, "model", port.model))
    if (value) gates[slot] = value
  }))

  const tiles = await take(request.tiles, "model", port.json)
  let released = false
  return {
    images,
    meshes,
    gates,
    uv: resolveUvTable(tiles),
    release() {
      if (released) return
      released = true
      releaseHeld()
    },
  }
}

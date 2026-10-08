import { surfaceUV, uvAt, type TerrainSurface } from "./atlas.js"
import type { TerrainGeometry, Vec3 } from "./layout.js"

/** A parsed Wavefront OBJ: `v` / `vt` / `vn` corners de-duplicated into one index buffer. */
export interface ParsedMesh {
  readonly position: Float32Array
  readonly normal: Float32Array | null
  readonly uv: Float32Array | null
  readonly color: Float32Array | null
  readonly index: Uint16Array | Uint32Array
  readonly groups: readonly { readonly name: string, readonly start: number, readonly count: number }[]
  readonly bounds: { readonly min: readonly [number, number, number], readonly max: readonly [number, number, number] }
}

export function isParsedMesh(value: unknown): value is ParsedMesh {
  return Boolean(value && typeof value === "object" && "position" in value && value.position instanceof Float32Array && "index" in value)
}

/** Faces with more than three corners are fanned; relative (negative) indices are honoured. */
export function parseObj(text: string): ParsedMesh | null {
  if (!text) return null
  const positions: number[] = []
  const texcoords: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const outPosition: number[] = []
  const outNormal: number[] = []
  const outUv: number[] = []
  const outColor: number[] = []
  const indices: number[] = []
  const groups: { name: string, start: number, count: number }[] = []
  const corners = new Map<string, number>()
  let group = { name: "default", start: 0, count: 0 }
  let hasColor = false
  const ref = (token: string | undefined, length: number): number => {
    if (!token) return -1
    const value = Number.parseInt(token, 10)
    if (!Number.isFinite(value) || value === 0) return -1
    return value > 0 ? value - 1 : length + value
  }
  const corner = (token: string): number => {
    const [positionToken, uvToken, normalToken] = token.split("/")
    const positionIndex = ref(positionToken, positions.length / 3)
    const uvIndex = ref(uvToken, texcoords.length / 2)
    const normalIndex = ref(normalToken, normals.length / 3)
    if (positionIndex < 0 || positionIndex * 3 + 2 >= positions.length) return -1
    const key = `${positionIndex}/${uvIndex}/${normalIndex}`
    const existing = corners.get(key)
    if (existing !== undefined) return existing
    const index = outPosition.length / 3
    outPosition.push(positions[positionIndex * 3] ?? 0, positions[positionIndex * 3 + 1] ?? 0, positions[positionIndex * 3 + 2] ?? 0)
    outColor.push(colors[positionIndex * 3] ?? 1, colors[positionIndex * 3 + 1] ?? 1, colors[positionIndex * 3 + 2] ?? 1)
    if (uvIndex >= 0 && uvIndex * 2 + 1 < texcoords.length) outUv.push(texcoords[uvIndex * 2] ?? 0, texcoords[uvIndex * 2 + 1] ?? 0)
    else outUv.push(0, 0)
    if (normalIndex >= 0 && normalIndex * 3 + 2 < normals.length) {
      outNormal.push(normals[normalIndex * 3] ?? 0, normals[normalIndex * 3 + 1] ?? 0, normals[normalIndex * 3 + 2] ?? 0)
    } else outNormal.push(Number.NaN, Number.NaN, Number.NaN)
    corners.set(key, index)
    return index
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const parts = line.split(/\s+/)
    const keyword = parts[0]
    if (keyword === "v") {
      const x = Number(parts[1])
      const y = Number(parts[2])
      const z = Number(parts[3])
      positions.push(Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0, Number.isFinite(z) ? z : 0)
      if (parts.length >= 7) {
        hasColor = true
        colors[positions.length - 3] = Number(parts[4])
        colors[positions.length - 2] = Number(parts[5])
        colors[positions.length - 1] = Number(parts[6])
      }
    } else if (keyword === "vt") {
      texcoords.push(Number(parts[1]) || 0, Number(parts[2]) || 0)
    } else if (keyword === "vn") {
      normals.push(Number(parts[1]) || 0, Number(parts[2]) || 0, Number(parts[3]) || 0)
    } else if (keyword === "g" || keyword === "o" || keyword === "usemtl") {
      if (group.count > 0) groups.push(group)
      group = { name: parts.slice(1).join(" ") || "default", start: indices.length, count: 0 }
    } else if (keyword === "f") {
      const ids = parts.slice(1).map(corner)
      if (ids.some((id) => id < 0) || ids.length < 3) continue
      for (let index = 1; index + 1 < ids.length; index += 1) {
        indices.push(ids[0] ?? 0, ids[index] ?? 0, ids[index + 1] ?? 0)
        group.count += 3
      }
    }
  }
  if (group.count > 0) groups.push(group)
  if (indices.length === 0) return null
  const position = Float32Array.from(outPosition)
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let index = 0; index < position.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = position[index + axis] ?? 0
      min[axis] = Math.min(min[axis] ?? Infinity, value)
      max[axis] = Math.max(max[axis] ?? -Infinity, value)
    }
  }
  return {
    position,
    normal: outNormal.every(Number.isFinite) ? Float32Array.from(outNormal) : null,
    uv: texcoords.length > 0 ? Float32Array.from(outUv) : null,
    color: hasColor ? Float32Array.from(outColor) : null,
    index: position.length / 3 > 65535 ? Uint32Array.from(indices) : Uint16Array.from(indices),
    groups,
    bounds: { min, max },
  }
}

/**
 * Exported OBJ space (Unity Y-up, X mirrored) → board space (x = column, y = row, z = up), scaled by `scale`.
 * A proper rotation: the windings stay outward.
 */
export function objToBoard(mesh: ParsedMesh, scale = 1): ParsedMesh {
  const position = new Float32Array(mesh.position.length)
  const normal = mesh.normal ? new Float32Array(mesh.normal.length) : null
  for (let index = 0; index < mesh.position.length; index += 3) {
    position[index] = -(mesh.position[index] ?? 0) * scale
    position[index + 1] = (mesh.position[index + 2] ?? 0) * scale
    position[index + 2] = (mesh.position[index + 1] ?? 0) * scale
    if (normal && mesh.normal) {
      normal[index] = -(mesh.normal[index] ?? 0)
      normal[index + 1] = mesh.normal[index + 2] ?? 0
      normal[index + 2] = mesh.normal[index + 1] ?? 0
    }
  }
  return { ...mesh, position, normal }
}

export interface BoardPlacement {
  /** Board position of the piece's origin: column, row, height. */
  readonly x: number
  readonly y: number
  readonly z: number
  /** Quarter turns counter-clockwise about the board's up axis. */
  readonly quarterTurns?: number
}

/**
 * Place a board-space mesh (x = column, y = row, z = up) at `placement`, then convert it to the three.js scene
 * (x = column, y = height, z = −row).
 */
export function placeBoardMesh(mesh: TerrainGeometry, placement: BoardPlacement): TerrainGeometry {
  const angle = (placement.quarterTurns ?? 0) * Math.PI / 2
  const cosine = Math.round(Math.cos(angle))
  const sine = Math.round(Math.sin(angle))
  const position = new Float32Array(mesh.position.length)
  const normal = new Float32Array(mesh.normal.length)
  for (let index = 0; index < mesh.position.length; index += 3) {
    const px = mesh.position[index] ?? 0
    const py = mesh.position[index + 1] ?? 0
    const pz = mesh.position[index + 2] ?? 0
    const boardX = placement.x + px * cosine - py * sine
    const boardY = placement.y + px * sine + py * cosine
    const boardZ = placement.z + pz
    position[index] = boardX
    position[index + 1] = boardZ
    position[index + 2] = -boardY
    const nx = mesh.normal[index] ?? 0
    const ny = mesh.normal[index + 1] ?? 0
    const nz = mesh.normal[index + 2] ?? 0
    normal[index] = nx * cosine - ny * sine
    normal[index + 1] = nz
    normal[index + 2] = -(nx * sine + ny * cosine)
  }
  return { ...mesh, position, normal }
}

/** A parsed mesh as the renderer's geometry arrays, filling missing UV and normal arrays. */
export function terrainGeometryOf(mesh: ParsedMesh): TerrainGeometry {
  const count = mesh.position.length / 3
  return {
    position: mesh.position,
    normal: mesh.normal ?? Float32Array.from({ length: count * 3 }, (_, index) => (index % 3 === 2 ? 1 : 0)),
    uv: mesh.uv ?? new Float32Array(count * 2),
    color: mesh.color ?? Float32Array.from({ length: count * 3 }, () => 1),
    index: mesh.index,
  }
}

/** Box-project UVs of a board-space mesh: up-facing faces take `top`, the other faces `side`. */
export function boxProjectUv(mesh: TerrainGeometry, top: TerrainSurface, side: TerrainSurface): TerrainGeometry {
  const p = mesh.position
  const n = mesh.normal
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (let i = 0; i < p.length; i += 3) {
    x0 = Math.min(x0, p[i] ?? 0)
    x1 = Math.max(x1, p[i] ?? 0)
    y0 = Math.min(y0, p[i + 1] ?? 0)
    y1 = Math.max(y1, p[i + 1] ?? 0)
    z0 = Math.min(z0, p[i + 2] ?? 0)
    z1 = Math.max(z1, p[i + 2] ?? 0)
  }
  const uvTop = surfaceUV(top)
  const uvSide = surfaceUV(side)
  const uv = new Float32Array((p.length / 3) * 2)
  for (let i = 0, j = 0; i < p.length; i += 3, j += 2) {
    const nx = n[i] ?? 0
    const ny = n[i + 1] ?? 0
    const nz = n[i + 2] ?? 1
    const px = p[i] ?? 0
    const py = p[i + 1] ?? 0
    const pz = p[i + 2] ?? 0
    let coordinate: readonly [number, number]
    if (nz > 0.6) {
      coordinate = uvAt(uvTop, (px - x0) / (x1 - x0 || 1), (py - y0) / (y1 - y0 || 1))
    } else {
      const fy = (pz - z0) / (z1 - z0 || 1)
      let fx: number
      if (Math.abs(nx) >= Math.abs(ny)) fx = nx > 0 ? (py - y0) / (y1 - y0 || 1) : (y1 - py) / (y1 - y0 || 1)
      else fx = ny < 0 ? (px - x0) / (x1 - x0 || 1) : (x1 - px) / (x1 - x0 || 1)
      coordinate = uvAt(uvSide, fx, fy)
    }
    uv[j] = coordinate[0]
    uv[j + 1] = coordinate[1]
  }
  return { ...mesh, uv }
}

/** An axis-aligned box on the ground, centred on the origin: size × size × height, five faces (no bottom). */
export function boxGeometry(size: number, height: number): TerrainGeometry {
  const a = size / 2
  const faces: readonly (readonly [Vec3, readonly Vec3[]])[] = [
    [[0, 0, 1], [[-a, -a, height], [a, -a, height], [a, a, height], [-a, a, height]]],
    [[0, -1, 0], [[-a, -a, 0], [a, -a, 0], [a, -a, height], [-a, -a, height]]],
    [[1, 0, 0], [[a, -a, 0], [a, a, 0], [a, a, height], [a, -a, height]]],
    [[0, 1, 0], [[a, a, 0], [-a, a, 0], [-a, a, height], [a, a, height]]],
    [[-1, 0, 0], [[-a, a, 0], [-a, -a, 0], [-a, -a, height], [-a, a, height]]],
  ]
  const position: number[] = []
  const normal: number[] = []
  const index: number[] = []
  faces.forEach(([faceNormal, corners]) => {
    const base = position.length / 3
    for (const point of corners) {
      position.push(point[0], point[1], point[2])
      normal.push(faceNormal[0], faceNormal[1], faceNormal[2])
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3)
  })
  return {
    position: Float32Array.from(position),
    normal: Float32Array.from(normal),
    uv: Float32Array.from(new Array(faces.length * 8).fill(0)),
    color: Float32Array.from(new Array((position.length / 3) * 3).fill(1)),
    index: Uint16Array.from(index),
  }
}

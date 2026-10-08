import type { MissionMap } from "#contract/view.js"
import { orientSurface, sideRect, surfaceUV, uvAt, type TerrainSurface, type TerrainUvTable } from "./atlas.js"
import { cellKey, classifyCells, type TerrainCell, type TerrainCells } from "./cells.js"
import { BACKDROP, BASIN, BEVEL, CLIFF, PANEL, PLATFORM_DEVICE_HEIGHT, type Vec3 } from "./palette.js"

export type { Vec3 } from "./palette.js"

export interface TerrainGeometry {
  readonly position: Float32Array
  readonly normal: Float32Array
  readonly uv: Float32Array
  readonly color: Float32Array
  readonly index: Uint16Array | Uint32Array
}

export type TerrainDirection = "S" | "E" | "N" | "W"

export interface TerrainEdge {
  readonly x: number
  readonly y: number
  readonly direction: TerrainDirection
  readonly z: number
}

export interface TerrainGate {
  readonly kind: "start" | "end"
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface TerrainDevice {
  readonly kind: "blower" | "crate"
  readonly x: number
  readonly y: number
  readonly z: number
  readonly direction: "UP" | "RIGHT" | "DOWN" | "LEFT"
}

export interface TerrainLayout {
  readonly buckets: {
    readonly board: TerrainGeometry
    readonly decal: TerrainGeometry
    readonly pipe: TerrainGeometry
    readonly glass: TerrainGeometry
  }
  readonly gates: readonly TerrainGate[]
  readonly devices: readonly TerrainDevice[]
  readonly water: readonly TerrainCellPoint[]
  readonly mire: readonly TerrainCellPoint[]
  readonly smog: readonly TerrainCellPoint[]
  readonly infection: readonly TerrainCellPoint[]
  readonly edges: readonly TerrainEdge[]
  readonly bounds: { readonly x0: number, readonly x1: number, readonly y0: number, readonly y1: number }
}

export interface TerrainCellPoint {
  readonly x: number
  readonly y: number
}

const WHITE: Vec3 = [1, 1, 1]
const FLAT_NORMAL: Vec3 = [0, 0, 1]

const DIRECTIONS: readonly (readonly [TerrainDirection, number, number])[] = [
  ["S", 0, -1],
  ["E", 1, 0],
  ["N", 0, 1],
  ["W", -1, 0],
]

const NORMAL_OF: Readonly<Record<TerrainDirection, Vec3>> = {
  S: [0, -1, 0],
  E: [1, 0, 0],
  N: [0, 1, 0],
  W: [-1, 0, 0],
}

function scale(value: Vec3, factor: number): Vec3 {
  return [value[0] * factor, value[1] * factor, value[2] * factor]
}

function pick(value: Vec3 | readonly Vec3[], index: number): Vec3 {
  return typeof value[0] === "number" ? (value as Vec3) : ((value as readonly Vec3[])[index] ?? WHITE)
}

function normalize(value: Vec3): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]) || 1
  return [value[0] / length, value[1] / length, value[2] / length]
}

/** Accumulates quads and triangles of one bucket; positions are in board space (x = column, y = row, z = up). */
class GeometryBuilder {
  private readonly positions: number[] = []
  private readonly normals: number[] = []
  private readonly uvs: number[] = []
  private readonly colors: number[] = []
  private readonly indices: number[] = []
  private vertices = 0

  quad(
    corners: readonly Vec3[],
    uv: readonly number[] | null,
    normal: Vec3 | readonly Vec3[],
    color: Vec3 | readonly Vec3[] | null,
  ): void {
    const base = this.vertices
    for (let corner = 0; corner < 4; corner += 1) {
      this.push(
        corners[corner] ?? WHITE,
        [uv?.[corner * 2] ?? 0, uv?.[corner * 2 + 1] ?? 0],
        pick(normal, corner),
        color ? pick(color, corner) : WHITE,
      )
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  triangle(
    corners: readonly [Vec3, Vec3, Vec3],
    normal: Vec3 | readonly Vec3[],
    color: Vec3 | readonly Vec3[],
  ): void {
    const base = this.vertices
    for (let corner = 0; corner < 3; corner += 1) {
      this.push(corners[corner] ?? WHITE, [0, 0], pick(normal, corner), pick(color, corner))
    }
    this.indices.push(base, base + 1, base + 2)
  }

  get vertexCount(): number {
    return this.vertices
  }

  finish(): TerrainGeometry {
    return {
      position: Float32Array.from(this.positions),
      normal: Float32Array.from(this.normals),
      uv: Float32Array.from(this.uvs),
      color: Float32Array.from(this.colors),
      index: this.vertices > 65535 ? Uint32Array.from(this.indices) : Uint16Array.from(this.indices),
    }
  }

  private push(point: Vec3, uv: readonly [number, number], normal: Vec3, color: Vec3): void {
    this.positions.push(point[0], point[1], point[2])
    this.normals.push(normal[0], normal[1], normal[2])
    this.uvs.push(uv[0], uv[1])
    this.colors.push(color[0], color[1], color[2])
    this.vertices += 1
  }
}

function surfaceOf(table: TerrainUvTable, name: string): TerrainSurface {
  const found = table[name] ?? table.graySide ?? table.concrete
  if (!found) throw new Error(`terrain UV table has no surface ${name}`)
  return found
}

/** Corners (BL, BR, TR, TL seen from outside) of the side face `direction` of box [x0,x1]×[y0,y1] from zb to zt. */
export function sideCorners(
  direction: TerrainDirection,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  zb: number,
  zt: number,
): readonly Vec3[] {
  switch (direction) {
    case "S": return [[x0, y0, zb], [x1, y0, zb], [x1, y0, zt], [x0, y0, zt]]
    case "N": return [[x1, y1, zb], [x0, y1, zb], [x0, y1, zt], [x1, y1, zt]]
    case "E": return [[x1, y0, zb], [x1, y1, zb], [x1, y1, zt], [x1, y0, zt]]
    case "W": return [[x0, y1, zb], [x0, y0, zb], [x0, y0, zt], [x0, y1, zt]]
  }
}

/** Beveled top of a tile: a flat inset top at `zt` and four sloped strips down to `zt − drop` at the border. */
function bevelTop(
  builder: GeometryBuilder,
  uvTable: TerrainUvTable,
  cell: TerrainCell,
  zt: number,
  inset: number,
  drop: number,
  occlusion: readonly [number, number, number, number],
  tint: Vec3,
): void {
  const x0 = cell.x - 0.5
  const y0 = cell.y - 0.5
  const uv = surfaceUV(orientSurface(surfaceOf(uvTable, cell.surface), cell.rot, cell.flipX))
  const zo = zt - drop
  const at = (fx: number, fy: number): readonly [number, number] => uvAt(uv, fx, fy)
  const colorAt = (fx: number, fy: number): Vec3 => {
    const a = occlusion[0] + (occlusion[1] - occlusion[0]) * fx
    const d = occlusion[3] + (occlusion[2] - occlusion[3]) * fx
    return scale(tint, a + (d - a) * fy)
  }
  const point = (fx: number, fy: number, z: number): Vec3 => [x0 + fx, y0 + fy, z]
  const ie = 1 - inset

  const innerUv = [...at(inset, inset), ...at(ie, inset), ...at(ie, ie), ...at(inset, ie)]
  builder.quad(
    [point(inset, inset, zt), point(ie, inset, zt), point(ie, ie, zt), point(inset, ie, zt)],
    innerUv,
    FLAT_NORMAL,
    [colorAt(inset, inset), colorAt(ie, inset), colorAt(ie, ie), colorAt(inset, ie)],
  )
  if (drop <= 0) return

  const southNormal = normalize([0, -drop, inset])
  const northNormal = normalize([0, drop, inset])
  const eastNormal = normalize([drop, 0, inset])
  const westNormal = normalize([-drop, 0, inset])
  builder.quad(
    [point(0, 0, zo), point(1, 0, zo), point(ie, inset, zt), point(inset, inset, zt)],
    [...at(0, 0), ...at(1, 0), ...at(ie, inset), ...at(inset, inset)],
    southNormal,
    [colorAt(0, 0), colorAt(1, 0), colorAt(ie, inset), colorAt(inset, inset)],
  )
  builder.quad(
    [point(1, 1, zo), point(0, 1, zo), point(inset, ie, zt), point(ie, ie, zt)],
    [...at(1, 1), ...at(0, 1), ...at(inset, ie), ...at(ie, ie)],
    northNormal,
    [colorAt(1, 1), colorAt(0, 1), colorAt(inset, ie), colorAt(ie, ie)],
  )
  builder.quad(
    [point(1, 0, zo), point(1, 1, zo), point(ie, ie, zt), point(ie, inset, zt)],
    [...at(1, 0), ...at(1, 1), ...at(ie, ie), ...at(ie, inset)],
    eastNormal,
    [colorAt(1, 0), colorAt(1, 1), colorAt(ie, ie), colorAt(ie, inset)],
  )
  builder.quad(
    [point(0, 1, zo), point(0, 0, zo), point(inset, inset, zt), point(inset, ie, zt)],
    [...at(0, 1), ...at(0, 0), ...at(inset, inset), ...at(inset, ie)],
    westNormal,
    [colorAt(0, 1), colorAt(0, 0), colorAt(inset, inset), colorAt(inset, ie)],
  )
}

/** A bench plate of the Final Assault: a 2×2 grid of light concrete panels on the dark-rimmed top. */
function benchPanels(
  builder: GeometryBuilder,
  uvTable: TerrainUvTable,
  cell: TerrainCell,
  zt: number,
  occlusion: readonly [number, number, number, number],
): void {
  const surface = uvTable.concrete ?? uvTable.steel
  if (!surface) return
  const x0 = cell.x - 0.5
  const y0 = cell.y - 0.5
  const z = zt + PANEL.lift
  const rim = PANEL.rim
  const half = PANEL.seam / 2
  const light: Vec3 = [0.9, 0.92, 0.94]
  const span: readonly (readonly [number, number])[] = [[rim, 0.5 - half], [0.5 + half, 1 - rim]]
  for (let i = 0; i < 2; i += 1) {
    for (let j = 0; j < 2; j += 1) {
      const [fx0, fx1] = span[i] ?? [0, 1]
      const [fy0, fy1] = span[j] ?? [0, 1]
      const uv = surfaceUV(surface, [i * 0.5, (1 - j) * 0.5, i * 0.5 + 0.5, (1 - j) * 0.5 + 0.5])
      const colorAt = (fx: number, fy: number): Vec3 => {
        const s0 = occlusion[0] + (occlusion[1] - occlusion[0]) * fx
        const s1 = occlusion[3] + (occlusion[2] - occlusion[3]) * fx
        return scale(light, s0 + (s1 - s0) * fy)
      }
      builder.quad(
        [[x0 + fx0, y0 + fy0, z], [x0 + fx1, y0 + fy0, z], [x0 + fx1, y0 + fy1, z], [x0 + fx0, y0 + fy1, z]],
        uv,
        FLAT_NORMAL,
        [colorAt(fx0, fy0), colorAt(fx1, fy0), colorAt(fx1, fy1), colorAt(fx0, fy1)],
      )
    }
  }
}

/** A side face from zb to zt; the panel keeps its aspect on the face. */
function sideFace(
  builder: GeometryBuilder,
  uvTable: TerrainUvTable,
  surfaceName: string,
  direction: TerrainDirection,
  box: { readonly x0: number, readonly x1: number, readonly y0: number, readonly y1: number },
  heights: { readonly zb: number, readonly zt: number },
  colors: { readonly bottom: Vec3, readonly top: Vec3 },
  width = 1,
): void {
  if (heights.zt - heights.zb < 1e-4) return
  const surface = surfaceOf(uvTable, surfaceName)
  const uv = surfaceUV(surface, sideRect(surface, width, heights.zt - heights.zb))
  const corners = sideCorners(direction, box.x0, box.x1, box.y0, box.y1, heights.zb, heights.zt)
  builder.quad(corners, uv, NORMAL_OF[direction], [colors.bottom, colors.bottom, colors.top, colors.top])
}

/** Closed cylinder from a to b (8 segments) with flat caps. */
function tube(builder: GeometryBuilder, a: Vec3, b: Vec3, radius: number, segments = 8, color: Vec3 = WHITE): void {
  const delta: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const length = Math.hypot(delta[0], delta[1], delta[2])
  if (length < 1e-6) return
  const axis = normalize(delta)
  const reference: Vec3 = Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  const u = normalize([
    axis[1] * reference[2] - axis[2] * reference[1],
    axis[2] * reference[0] - axis[0] * reference[2],
    axis[0] * reference[1] - axis[1] * reference[0],
  ])
  const v: Vec3 = [
    axis[1] * u[2] - axis[2] * u[1],
    axis[2] * u[0] - axis[0] * u[2],
    axis[0] * u[1] - axis[1] * u[0],
  ]
  const ring = (k: number): Vec3 => {
    const angle = (k / segments) * Math.PI * 2
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    return [u[0] * cosine + v[0] * sine, u[1] * cosine + v[1] * sine, u[2] * cosine + v[2] * sine]
  }
  const offset = (base: Vec3, n: Vec3): Vec3 => [base[0] + n[0] * radius, base[1] + n[1] * radius, base[2] + n[2] * radius]
  for (let k = 0; k < segments; k += 1) {
    const n0 = ring(k)
    const n1 = ring(k + 1)
    builder.quad([offset(a, n0), offset(a, n1), offset(b, n1), offset(b, n0)], null, [n0, n1, n1, n0], color)
  }
  for (const [end, sign] of [[a, -1], [b, 1]] as const) {
    const normal: Vec3 = [axis[0] * sign, axis[1] * sign, axis[2] * sign]
    for (let k = 0; k < segments; k += 1) {
      const r0 = ring(k)
      const r1 = ring(k + 1)
      const p0 = offset(end, r0)
      const p1 = offset(end, r1)
      if (sign > 0) builder.triangle([end, p0, p1], normal, color)
      else builder.triangle([end, p1, p0], normal, color)
    }
  }
}

/** Orange railings around every connected region of fence tiles, with posts at the corners and on long runs. */
function buildFences(builder: GeometryBuilder, cells: TerrainCells): void {
  const fence = (x: number, y: number): boolean => {
    const cell = cells.get(cellKey(x, y))
    return Boolean(cell && cell.drawn && cell.glyph === "b")
  }
  const rail = { inset: 0.07, height: 0.26, radius: 0.032, post: 0.038 }
  const posts = new Set<string>()
  for (const cell of cells.values()) {
    if (!fence(cell.x, cell.y)) continue
    const { x, y } = cell
    const e = rail.inset
    const x0 = x - 0.5
    const x1 = x + 0.5
    const y0 = y - 0.5
    const y1 = y + 0.5
    const south = !fence(x, y - 1)
    const north = !fence(x, y + 1)
    const west = !fence(x - 1, y)
    const east = !fence(x + 1, y)
    const xa = west ? x0 + e : x0
    const xb = east ? x1 - e : x1
    const ya = south ? y0 + e : y0
    const yb = north ? y1 - e : y1
    const h = rail.height
    if (south) tube(builder, [xa, y0 + e, h], [xb, y0 + e, h], rail.radius, 8, [0.94, 0.57, 0.17])
    if (north) tube(builder, [xa, y1 - e, h], [xb, y1 - e, h], rail.radius, 8, [0.94, 0.57, 0.17])
    if (west) tube(builder, [x0 + e, ya, h], [x0 + e, yb, h], rail.radius, 8, [0.94, 0.57, 0.17])
    if (east) tube(builder, [x1 - e, ya, h], [x1 - e, yb, h], rail.radius, 8, [0.94, 0.57, 0.17])
    const post = (px: number, py: number, key: string): void => {
      if (posts.has(key)) return
      posts.add(key)
      tube(builder, [px, py, 0], [px, py, h + rail.radius], rail.post, 8, [0.94, 0.57, 0.17])
    }
    const key = `${x},${y}`
    if (south && west) post(x0 + e, y0 + e, `${key},sw`)
    if (south && east) post(x1 - e, y0 + e, `${key},se`)
    if (north && west) post(x0 + e, y1 - e, `${key},nw`)
    if (north && east) post(x1 - e, y1 - e, `${key},ne`)
    if (south && !west && !east && x % 2 === 0) post(x0, y0 + e, `${key},sm`)
    if (north && !west && !east && x % 2 === 0) post(x0, y1 - e, `${key},nm`)
    if (west && !south && !north && y % 2 === 0) post(x0 + e, y0, `${key},wm`)
    if (east && !south && !north && y % 2 === 0) post(x1 - e, y0, `${key},em`)
  }
}

/** Tiles outside the play area: undrawn tiles and the forbidden or separator tiles connected to them. */
function outsideTiles(map: MissionMap, cells: TerrainCells): ReadonlySet<string> {
  const outside = new Set<string>()
  const stack: [number, number][] = []
  const minX = -1
  const maxX = Math.max(...map.tiles.map((tile) => tile.x), 0) + 1
  const minY = -1
  const maxY = Math.max(...map.tiles.map((tile) => tile.y), 0) + 1
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const cell = cells.get(cellKey(x, y))
      if (!cell || !cell.drawn) {
        outside.add(cellKey(x, y))
        stack.push([x, y])
      }
    }
  }
  while (stack.length > 0) {
    const [x, y] = stack.pop()!
    for (const [, dx, dy] of DIRECTIONS) {
      const nx = x + dx
      const ny = y + dy
      const key = cellKey(nx, ny)
      const next = cells.get(key)
      if (!next || outside.has(key) || !next.drawn || next.content) continue
      outside.add(key)
      stack.push([nx, ny])
    }
  }
  return outside
}

function topHeight(cell: TerrainCell): number {
  return cell.glyph === "d" ? -BASIN : cell.height
}

/** Build every board bucket of a map from its tiles (master board3d/layout.js buildBoard). */
export function buildTerrainLayout(map: MissionMap, uvTable: TerrainUvTable): TerrainLayout {
  const cells = classifyCells(map)
  const board = new GeometryBuilder()
  const decal = new GeometryBuilder()
  const pipe = new GeometryBuilder()
  const glass = new GeometryBuilder()
  const gates: TerrainGate[] = []
  const devices: TerrainDevice[] = []
  const water: TerrainCellPoint[] = []
  const mire: TerrainCellPoint[] = []
  const smog: TerrainCellPoint[] = []
  const infection: TerrainCellPoint[] = []
  const edges: TerrainEdge[] = []
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  const sorted = [...cells.values()].sort((left, right) => left.y - right.y || left.x - right.x)
  const cellAt = (x: number, y: number): TerrainCell | undefined => cells.get(cellKey(x, y))

  for (const cell of sorted) {
    if (!cell.drawn) continue
    minX = Math.min(minX, cell.x - 0.5)
    maxX = Math.max(maxX, cell.x + 0.5)
    minY = Math.min(minY, cell.y - 0.5)
    maxY = Math.max(maxY, cell.y + 0.5)
    const zt = topHeight(cell)
    const x0 = cell.x - 0.5
    const x1 = cell.x + 0.5
    const y0 = cell.y - 0.5
    const y1 = cell.y + 0.5
    const occluded = (dx: number, dy: number): number => {
      let raised = false
      for (const [ax, ay] of [[0, 0], [dx, 0], [0, dy], [dx, dy]] as const) {
        const neighbor = cellAt(cell.x + ax, cell.y + ay)
        if (neighbor && neighbor.drawn && topHeight(neighbor) > zt + 0.05) raised = true
      }
      return raised ? 0.66 : 1
    }
    const occlusion: [number, number, number, number] = [occluded(-1, -1), occluded(1, -1), occluded(1, 1), occluded(-1, 1)]
    const [inset, drop] = cell.raised ? BEVEL.block : BEVEL.low
    const isBasin = cell.glyph === "d"
    bevelTop(cell.glyph === "p" ? glass : board, uvTable, cell, zt, inset, isBasin ? 0 : drop, occlusion, cell.tint)
    if (cell.panels) benchPanels(board, uvTable, cell, zt, occlusion)
    const zEdge = zt - (isBasin ? 0 : drop)
    const box = { x0, x1, y0, y1 }
    for (const [direction, dx, dy] of DIRECTIONS) {
      const neighbor = cellAt(cell.x + dx, cell.y + dy)
      const neighborDrawn = Boolean(neighbor && neighbor.drawn)
      if (!neighbor || !neighborDrawn) {
        const sideTint = cell.sideTint
        if (zEdge > 0.001) {
          sideFace(board, uvTable, cell.side, direction, box, { zb: 0, zt: zEdge }, { bottom: scale(sideTint, 0.7), top: sideTint })
        }
        sideFace(
          board,
          uvTable,
          "pipePanel",
          direction,
          box,
          { zb: -CLIFF, zt: Math.min(0, zEdge) },
          { bottom: [0.16, 0.18, 0.2], top: [0.62, 0.66, 0.7] },
        )
        continue
      }
      const neighborTop = topHeight(neighbor) - (neighbor.glyph === "d" ? 0 : (neighbor.raised ? BEVEL.block[1] : BEVEL.low[1]))
      if (zEdge > neighborTop + 1e-4) {
        const sideTint: Vec3 = isBasin ? [0.45, 0.5, 0.55] : cell.sideTint
        const surfaceName = isBasin ? "graySide" : cell.side
        sideFace(board, uvTable, surfaceName, direction, box, { zb: neighborTop, zt: zEdge }, { bottom: scale(sideTint, 0.62), top: sideTint })
      }
    }
    switch (cell.glyph) {
      case "S":
        gates.push({ kind: "start", x: cell.x, y: cell.y, z: 0 })
        break
      case "E":
        gates.push({ kind: "end", x: cell.x, y: cell.y, z: 0 })
        break
      case "I":
      case "O": {
        const surface = uvTable[cell.glyph === "I" ? "arrowDown" : "arrowUp"]
        if (surface) {
          const a = 0.3
          const z = zt + 0.004
          decal.quad(
            [[cell.x - a, cell.y - a, z], [cell.x + a, cell.y - a, z], [cell.x + a, cell.y + a, z], [cell.x - a, cell.y + a, z]],
            surfaceUV(surface),
            FLAT_NORMAL,
            WHITE,
          )
        }
        break
      }
      case "d":
        water.push({ x: cell.x, y: cell.y })
        break
      case "m":
        mire.push({ x: cell.x, y: cell.y })
        break
      case "g":
        smog.push({ x: cell.x, y: cell.y })
        break
      case "i":
        infection.push({ x: cell.x, y: cell.y })
        break
      default:
        break
    }
  }

  buildFences(pipe, cells)

  const zone = (cell: TerrainCell | undefined): boolean => Boolean(cell && cell.drawn && cell.content && cell.glyph !== "a" && cell.glyph !== "A")
  const outside = outsideTiles(map, cells)
  for (const cell of sorted) {
    if (!zone(cell)) continue
    for (const [direction, dx, dy] of DIRECTIONS) {
      const neighbor = cellAt(cell.x + dx, cell.y + dy)
      if (zone(neighbor)) continue
      if (!outside.has(cellKey(cell.x + dx, cell.y + dy))) continue
      edges.push({ x: cell.x, y: cell.y, direction, z: topHeight(cell) })
    }
  }

  for (const cell of sorted) {
    if (cell.device === "platform") buildPlatform(board, decal, uvTable, cell)
    if (cell.device === "blower") devices.push({ kind: "blower", x: cell.x, y: cell.y, z: cell.height, direction: "UP" })
    if (cell.device === "crate") devices.push({ kind: "crate", x: cell.x, y: cell.y, z: cell.height, direction: "UP" })
  }

  return {
    buckets: {
      board: board.finish(),
      decal: decal.finish(),
      pipe: pipe.finish(),
      glass: glass.finish(),
    },
    gates,
    devices,
    water,
    mire,
    smog,
    infection,
    edges,
    bounds: {
      x0: minX,
      x1: maxX,
      y0: minY,
      y1: maxY,
    },
  }
}

/** A platform device: a plate standing a platform-height above its tile, grey sides. */
function buildPlatform(board: GeometryBuilder, decal: GeometryBuilder, uvTable: TerrainUvTable, cell: TerrainCell): void {
  const size = 0.94
  const h = PLATFORM_DEVICE_HEIGHT
  const z0 = cell.height
  const zt = z0 + h
  const half = size / 2
  const x0 = cell.x - half
  const x1 = cell.x + half
  const y0 = cell.y - half
  const y1 = cell.y + half
  const top = uvTable.plateS
  if (top) {
    board.quad([[x0, y0, zt], [x1, y0, zt], [x1, y1, zt], [x0, y1, zt]], surfaceUV(top), FLAT_NORMAL, [1.02, 1.02, 1.02])
  } else {
    decal.quad([[x0, y0, zt], [x1, y0, zt], [x1, y1, zt], [x0, y1, zt]], surfaceUV(surfaceOf(uvTable, "hazardX")), FLAT_NORMAL, WHITE)
  }
  const side = surfaceOf(uvTable, "graySide")
  const uv = surfaceUV(side, sideRect(side, size, h))
  for (const direction of ["S", "E", "N", "W"] as const) {
    board.quad(
      sideCorners(direction, x0, x1, y0, y1, z0, zt),
      uv,
      NORMAL_OF[direction],
      [[0.5, 0.53, 0.56], [0.5, 0.53, 0.56], [0.85, 0.88, 0.9], [0.85, 0.88, 0.9]],
    )
  }
}

/** Water, mire and infection tiles: a flat quad a little above the ground, inset from the tile border. */
export function overlayQuads(points: readonly TerrainCellPoint[], z: number, inset = 0): TerrainGeometry {
  const builder = new GeometryBuilder()
  const a = 0.5 - inset
  for (const point of points) {
    builder.quad(
      [[point.x - a, point.y - a, z], [point.x + a, point.y - a, z], [point.x + a, point.y + a, z], [point.x - a, point.y + a, z]],
      [0, 0, 1, 0, 1, 1, 0, 1],
      FLAT_NORMAL,
      null,
    )
  }
  return builder.finish()
}

/** Smog grilles: two crossed haze cards standing up on every grille tile. */
export function smogCards(points: readonly TerrainCellPoint[]): TerrainGeometry {
  const builder = new GeometryBuilder()
  const height = 0.95
  const width = 0.55
  for (const point of points) {
    for (const [dx, dy] of [[1, 0], [0.7, 0.7]] as const) {
      const corners: Vec3[] = [
        [point.x - dx * width, point.y - dy * width, 0.02],
        [point.x + dx * width, point.y + dy * width, 0.02],
        [point.x + dx * width, point.y + dy * width, height],
        [point.x - dx * width, point.y - dy * width, height],
      ]
      builder.quad(corners, [0, 0, 1, 0, 1, 1, 0, 1], [0, -1, 0], null)
    }
  }
  return builder.finish()
}

/** The cyan field border: a thin emissive strip on the outer side of each boundary tile. */
export function edgeStrips(edges: readonly TerrainEdge[]): TerrainGeometry {
  const builder = new GeometryBuilder()
  const width = 0.085
  const inset = 0.018
  for (const edge of edges) {
    const x0 = edge.x - 0.5
    const x1 = edge.x + 0.5
    const y0 = edge.y - 0.5
    const y1 = edge.y + 0.5
    const z = edge.z + 0.006
    let corners: Vec3[]
    switch (edge.direction) {
      case "S": corners = [[x0, y0 + inset, z], [x1, y0 + inset, z], [x1, y0 + inset + width, z], [x0, y0 + inset + width, z]]; break
      case "N": corners = [[x1, y1 - inset, z], [x0, y1 - inset, z], [x0, y1 - inset - width, z], [x1, y1 - inset - width, z]]; break
      case "E": corners = [[x1 - inset, y0, z], [x1 - inset, y1, z], [x1 - inset - width, y1, z], [x1 - inset - width, y0, z]]; break
      case "W": corners = [[x0 + inset, y1, z], [x0 + inset, y0, z], [x0 + inset + width, y0, z], [x0 + inset + width, y1, z]]; break
    }
    builder.quad(corners, [0, 0, 1, 0, 1, 1, 0, 1], FLAT_NORMAL, null)
  }
  return builder.finish()
}

/**
 * The background plane. `plane` is a mesh centred on the origin in board units; without one, a flat square of
 * `BACKDROP.size` is used. The plane sits at `BACKDROP.z` centred on the map and is grown `BACKDROP.tiles` times
 * about its centre, keeping its texel density (the texture mirrors, so the copies join seamlessly).
 */
export function backdropGeometry(map: MissionMap, plane: TerrainGeometry | null): TerrainGeometry {
  const cx = (map.cols - 1) / 2
  const cy = (map.rows - 1) / 2
  const size = BACKDROP.size
  const base: TerrainGeometry = plane ?? {
    position: Float32Array.from([
      -size / 2, -size / 2, 0,
      size / 2, -size / 2, 0,
      size / 2, size / 2, 0,
      -size / 2, size / 2, 0,
    ]),
    normal: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uv: Float32Array.from([0, 0, 1, 0, 1, 1, 0, 1]),
    color: Float32Array.from(new Array(12).fill(1)),
    index: Uint16Array.from([0, 1, 2, 0, 2, 3]),
  }
  const k = BACKDROP.tiles
  const position = new Float32Array(base.position.length)
  for (let i = 0; i < base.position.length; i += 3) {
    const x = cx + (base.position[i] ?? 0)
    const y = cy + (base.position[i + 1] ?? 0)
    position[i] = cx + (x - cx) * k
    position[i + 1] = cy + (y - cy) * k
    position[i + 2] = BACKDROP.z + (base.position[i + 2] ?? 0)
  }
  const uv = new Float32Array(base.uv.length)
  for (let i = 0; i < uv.length; i += 1) uv[i] = 0.5 + ((base.uv[i] ?? 0) - 0.5) * k
  const facesDown = (base.normal[2] ?? 1) < 0
  const normal = new Float32Array(base.normal.length)
  for (let i = 0; i < normal.length; i += 1) normal[i] = facesDown ? -(base.normal[i] ?? 0) : (base.normal[i] ?? 0)
  const index = Uint16Array.from(base.index)
  if (facesDown) {
    for (let i = 0; i < index.length; i += 3) {
      const swap = index[i + 1] ?? 0
      index[i + 1] = index[i + 2] ?? 0
      index[i + 2] = swap
    }
  }
  return { position, normal, uv, color: base.color, index }
}

/** The key light's contact shadow catcher: a square on the backdrop, just above it. */
export function shadowCatcherGeometry(map: MissionMap): TerrainGeometry {
  const cx = (map.cols - 1) / 2
  const cy = (map.rows - 1) / 2
  const half = BACKDROP.size / 2
  const z = BACKDROP.z + 0.02
  return {
    position: Float32Array.from([cx - half, cy - half, z, cx + half, cy - half, z, cx + half, cy + half, z, cx - half, cy + half, z]),
    normal: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uv: Float32Array.from([0, 0, 1, 0, 1, 1, 0, 1]),
    color: Float32Array.from(new Array(12).fill(1)),
    index: Uint16Array.from([0, 1, 2, 0, 2, 3]),
  }
}

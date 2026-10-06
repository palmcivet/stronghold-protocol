export interface GridPoint {
  readonly x: number
  readonly y: number
}

export function bresenhamClear(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  clear: (x: number, y: number) => boolean,
): boolean {
  let x = ax
  let y = ay
  const dx = Math.abs(bx - x)
  const dy = Math.abs(by - y)
  const sx = bx > x ? 1 : -1
  const sy = by > y ? 1 : -1
  let err = dx - dy
  if (!clear(x, y)) return false
  while (x !== bx || y !== by) {
    const doubled = 2 * err
    let nextX = x
    let nextY = y
    if (doubled > -dy) {
      err -= dy
      nextX += sx
    }
    if (doubled < dx) {
      err += dx
      nextY += sy
    }
    if (nextY !== y && nextX !== x && !(clear(x, nextY) && clear(nextX, y))) return false
    x = nextX
    y = nextY
    if (!clear(x, y)) return false
  }
  return true
}

export function segmentClear(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  clear: (x: number, y: number) => boolean,
): boolean {
  let x = ax
  let y = ay
  if (y !== by && x !== bx) return false
  const sx = Math.sign(bx - x)
  const sy = Math.sign(by - y)
  if (!clear(x, y)) return false
  while (x !== bx || y !== by) {
    x += sx
    y += sy
    if (!clear(x, y)) return false
  }
  return true
}

export function bresenhamTiles(from: GridPoint, to: GridPoint): GridPoint[] {
  let x = from.x
  let y = from.y
  const dx = Math.abs(to.x - x)
  const dy = Math.abs(to.y - y)
  const sx = to.x > x ? 1 : -1
  const sy = to.y > y ? 1 : -1
  let err = dx - dy
  const out: GridPoint[] = [{ x, y }]
  let guard = dx + dy + 2
  while ((x !== to.x || y !== to.y) && guard > 0) {
    guard -= 1
    const doubled = 2 * err
    if (doubled > -dy) {
      err -= dy
      x += sx
    }
    if (doubled < dx) {
      err += dx
      y += sy
    }
    out.push({ x, y })
  }
  return out
}

/** 线段穿过格子内部时调用 fn。只擦到角点的格子不算。fn 返回 false 时停下。 */
export function crossTiles(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  fn: (x: number, y: number) => boolean | void,
): boolean {
  let x = ax
  let y = ay
  const dx = Math.abs(bx - x)
  const dy = Math.abs(by - y)
  const sx = bx > x ? 1 : -1
  const sy = by > y ? 1 : -1
  if (fn(x, y) === false) return false
  for (let stepX = 1, stepY = 1; x !== bx || y !== by; ) {
    const boundX = stepX <= dx ? (2 * stepX - 1) * dy : Infinity
    const boundY = stepY <= dy ? (2 * stepY - 1) * dx : Infinity
    if (boundX === boundY) {
      x += sx
      y += sy
      stepX += 1
      stepY += 1
    } else if (boundX < boundY) {
      x += sx
      stepX += 1
    } else {
      y += sy
      stepY += 1
    }
    if (fn(x, y) === false) return false
  }
  return true
}

export function onSegment(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
  return (by - ay) * (cx - ax) === (bx - ax) * (cy - ay) && (by - ay) * (cy - by) + (bx - ax) * (cx - bx) > 0
}

/**
 * 从 (x, y) 直线走到格子中心 point 时，除起点格和终点格外只经过能走且没有箱子的格子。
 * 擦到角点时两侧格子都要能走。
 */
export function straightClear(
  walkable: (x: number, y: number) => boolean,
  crate: (x: number, y: number) => boolean,
  x: number,
  y: number,
  point: GridPoint,
  guardLimit: number,
): boolean {
  let col = Math.round(x)
  let row = Math.round(y)
  const dx = point.x - x
  const dy = point.y - y
  const stepCol = dx > 0 ? 1 : -1
  const stepRow = dy > 0 ? 1 : -1
  const tileDx = dx !== 0 ? Math.abs(1 / dx) : Infinity
  const tileDy = dy !== 0 ? Math.abs(1 / dy) : Infinity
  let timeX = dx !== 0 ? (col + 0.5 * stepCol - x) / dx : Infinity
  let timeY = dy !== 0 ? (row + 0.5 * stepRow - y) / dy : Infinity
  const clear = (tileRow: number, tileCol: number): boolean =>
    (tileRow === point.y && tileCol === point.x) || (walkable(tileCol, tileRow) && !crate(tileCol, tileRow))
  for (let guard = guardLimit; guard > 0 && (row !== point.y || col !== point.x); guard -= 1) {
    if (timeX >= 1 && timeY >= 1) break
    if (Math.abs(timeX - timeY) < 1e-9) {
      if (!clear(row, col + stepCol) || !clear(row + stepRow, col)) return false
      col += stepCol
      row += stepRow
      timeX += tileDx
      timeY += tileDy
    } else if (timeX < timeY) {
      col += stepCol
      timeX += tileDx
    } else {
      row += stepRow
      timeY += tileDy
    }
    if (!clear(row, col)) return false
  }
  return true
}

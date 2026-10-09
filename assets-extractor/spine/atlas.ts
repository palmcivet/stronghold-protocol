// Spine 3.8 atlas：空行之后的第一行是页名，随后是 `key: value` 页字段，再是区域。
// 缺 size 时按真实 PNG 补上，和 PNG 不一致时改掉；敌人图集补 `pma: true`。两次规范化得到同一份文本。

export interface AtlasPage {
  name: string
  line: number
  fields: Record<string, string>
  fieldLines: Record<string, number>
  lastFieldLine: number
  regions: string[]
}

export interface ParsedAtlas {
  readonly lines: readonly string[]
  readonly pages: readonly AtlasPage[]
}

export interface NormalizeAtlasOptions {
  readonly pageSize?: ((pageName: string) => { readonly width: number; readonly height: number } | null) | null
  readonly pma?: boolean
  readonly renamePage?: ((pageName: string) => string) | null
}

export interface NormalizedAtlas {
  readonly text: string
  readonly changed: boolean
  readonly pages: readonly string[]
  readonly missingSize: readonly string[]
  readonly fixedSize: readonly string[]
}

export interface AtlasInfo {
  readonly pages: readonly string[]
  readonly regions: ReadonlySet<string>
  readonly hasSize: boolean
  readonly hasPma: boolean
}

function splitEntry(line: string | undefined): [string, string] | null {
  const text = line?.trim() ?? ""
  if (!text) return null
  const colon = text.indexOf(":")
  if (colon === -1) return null
  return [text.slice(0, colon).trim(), text.slice(colon + 1).trim()]
}

function lineAt(lines: readonly string[], index: number): string {
  return lines[index] ?? ""
}

export function parseAtlas(text: string): ParsedAtlas {
  const lines = String(text).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n")
  const pages: AtlasPage[] = []
  let page: AtlasPage | null = null
  let index = 0
  while (index < lines.length) {
    const line = lineAt(lines, index)
    if (!line.trim()) {
      page = null
      index++
      continue
    }
    if (page === null) {
      page = { name: line.trim(), line: index, fields: {}, fieldLines: {}, lastFieldLine: index, regions: [] }
      pages.push(page)
      index++
      while (index < lines.length) {
        const entry = splitEntry(lines[index])
        if (!entry) break
        page.fields[entry[0]] = entry[1]
        page.fieldLines[entry[0]] = index
        page.lastFieldLine = index
        index++
      }
      continue
    }
    page.regions.push(line)
    index++
    while (index < lines.length && splitEntry(lines[index])) index++
  }
  return { lines, pages }
}

export function normalizeAtlas(text: string, options: NormalizeAtlasOptions): NormalizedAtlas {
  const pageSize = options.pageSize ?? null
  const pma = options.pma ?? false
  const renamePage = options.renamePage ?? null
  const { lines, pages } = parseAtlas(text)
  const inserts = new Map<number, string[]>()
  const replace = new Map<number, string>()
  const missingSize: string[] = []
  const fixedSize: string[] = []
  const addAfter = (idx: number, row: string): void => {
    const list = inserts.get(idx)
    if (list) list.push(row)
    else inserts.set(idx, [row])
  }
  for (const page of pages) {
    if (renamePage) {
      const local = renamePage(page.name)
      if (local && local !== page.name) replace.set(page.line, local)
    }
    const real = pageSize ? pageSize(page.name) : null
    const sizeField = page.fields["size"]
    if (sizeField === undefined) {
      if (real) addAfter(page.line, `size: ${real.width},${real.height}`)
      else missingSize.push(page.name)
    } else if (real) {
      const match = /^(\d+)\s*,\s*(\d+)$/.exec(sizeField)
      const width = match?.[1]
      const height = match?.[2]
      if (!width || !height || Number(width) !== real.width || Number(height) !== real.height) {
        const sizeLine = page.fieldLines["size"]
        if (sizeLine !== undefined) replace.set(sizeLine, `size: ${real.width},${real.height}`)
        fixedSize.push(page.name)
      }
    }
    if (pma && page.fields["pma"] === undefined) addAfter(page.lastFieldLine, "pma: true")
  }
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    out.push(replace.has(i) ? (replace.get(i) ?? lineAt(lines, i)) : lineAt(lines, i))
    const extra = inserts.get(i)
    if (extra) {
      extra.sort((a, b) => (a.startsWith("size:") ? -1 : 0) - (b.startsWith("size:") ? -1 : 0))
      out.push(...extra)
    }
  }
  const result = out.join("\n")
  const original = String(text).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")
  return {
    text: result,
    changed: result !== original,
    pages: pages.map((page) => replace.get(page.line) ?? page.name),
    missingSize,
    fixedSize,
  }
}

export function atlasInfo(text: string): AtlasInfo {
  const { pages } = parseAtlas(text)
  const regions = new Set<string>()
  for (const page of pages) for (const region of page.regions) regions.add(region)
  return {
    pages: pages.map((page) => page.name),
    regions,
    hasSize: pages.length > 0 && pages.every((page) => /^\d+\s*,\s*\d+$/.test(page.fields["size"] ?? "")),
    hasPma: pages.length > 0 && pages.every((page) => page.fields["pma"] === "true"),
  }
}

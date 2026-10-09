import { parseAssetKey, type AssetKey } from "arknights-assets-catalog"
import { expect, test } from "vitest"
import { nodeBuildFiles } from "#port/node-files.js"
import { coversKey } from "#source/asset-source.js"
import { loadPathTable, parsePathTable } from "#source/path-table.js"
import { createSources, routeOf, sourcesFor, SOURCE_TABLE, SPINE_META_NAMESPACE } from "#source/table.js"

const key = (text: string): AssetKey => text as AssetKey

test("the longest namespace wins", () => {
  expect(routeOf(key("image:skill/skchr_amiya_1"))?.sources).toEqual(["yuanyan"])
  expect(routeOf(key("image:skill/empty"))?.sources).toEqual(["arknights-assets"])
  expect(routeOf(key("image:skill/empty_large"))?.sources).toEqual(["arknights-assets"])
  expect(routeOf(key("image:skill/empty_other"))?.sources).toEqual(["yuanyan"])
  expect(routeOf(key("font:bender/regular"))?.sources).toEqual(["fonts"])
  expect(routeOf(key("spine:token/enemy_9012_acloon/front"))?.sources).toEqual(["fexli", "ark-models"])
  expect(routeOf(key("image:nothing/here"))).toBeNull()
  expect(routeOf(key(`json:${SPINE_META_NAMESPACE}/char/x/front`))).toBeNull()
})

test("every routed source exists and covers its routes", async () => {
  const sources = await createSources(nodeBuildFiles)
  const byId = new Map(sources.map((source) => [source.id, source]))
  expect(sources.map((source) => source.id).sort()).toEqual(["ark-models", "arknights-assets", "fexli", "fonts", "gamedata", "voice", "yuanyan"])
  for (const route of SOURCE_TABLE) {
    for (const id of route.sources) {
      const source = byId.get(id)
      expect(source, `${route.kind}:${route.namespace} -> ${id}`).toBeDefined()
      expect(source?.covers.some((cover) => cover.kind === route.kind && route.namespace.startsWith(cover.namespace)), `${id} covers ${route.kind}:${route.namespace}`).toBe(true)
    }
  }
  expect(sourcesFor(key("image:prof/caster"), byId).map((source) => source.id)).toEqual(["arknights-assets"])
  expect(sourcesFor(key("texture:map/x"), byId)).toEqual([])
})

test.each(["arknights-assets", "voice"])("every %s path table key routes to that source", async (id) => {
  const table = await loadPathTable(nodeBuildFiles, id)
  const sources = await createSources(nodeBuildFiles)
  const source = sources.find((candidate) => candidate.id === id)
  expect(table.size).toBeGreaterThan(0)
  for (const [entry, path] of table) {
    const route = routeOf(entry)
    expect(route, entry).not.toBeNull()
    expect(route?.sources[0], entry).toBe(id)
    const { kind, path: keyPath } = parseAssetKey(entry)
    expect(source && coversKey(source, kind, keyPath), entry).toBe(true)
    expect(path.startsWith("assets/dyn/"), entry).toBe(true)
  }
})

test("path tables reject invalid keys and paths", () => {
  expect(() => parsePathTable([], "t")).toThrow(/object/)
  expect(() => parsePathTable({ "image:Bad Key": "a.png" }, "t")).toThrow(/invalid key/)
  expect(() => parsePathTable({ "image:a/b": "../a.png" }, "t")).toThrow(/relative/)
  expect(() => parsePathTable({ "image:a/b": "/a.png" }, "t")).toThrow(/relative/)
  expect(parsePathTable({ "image:a/b": "x/a.png" }, "t").get(key("image:a/b"))).toBe("x/a.png")
})

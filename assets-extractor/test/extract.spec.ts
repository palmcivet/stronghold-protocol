import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"
import { extractorPackageRoot } from "#package-root.js"

const packageRoot = extractorPackageRoot()
const repoRoot = join(packageRoot, "..")
const mediaDir = join(packageRoot, ".cache", "assets", "sources", "local-client", "files")
const tool = join(packageRoot, "source/local-client/python")
const env = { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }
const python = ["python3", "python"].find((bin) => spawnSync(bin, ["--version"]).status === 0)
const pillow = !!python && spawnSync(python, ["-c", "import PIL"], { env }).status === 0
const webp = pillow && spawnSync(python, ["-c", "import sys; from PIL import features; sys.exit(0 if features.check('webp') else 1)"], { env }).status === 0

interface LocalEntry {
  readonly path?: string
  readonly kind?: string
  readonly count?: number
  readonly verts?: number
  readonly webp?: string
}

type LocalGroup = Readonly<Record<string, LocalEntry>>

interface LocalManifest {
  readonly groups: Readonly<Record<string, LocalGroup>>
}

const OPTIONAL_FIELDS = { path: "string", kind: "string", count: "number", verts: "number", webp: "string" } as const

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isLocalEntry(value: unknown): value is LocalEntry {
  if (!isRecord(value)) return false
  return Object.entries(OPTIONAL_FIELDS).every(([field, type]) => value[field] === undefined || typeof value[field] === type)
}

function isLocalGroup(value: unknown): value is LocalGroup {
  return isRecord(value) && Object.values(value).every(isLocalEntry)
}

function isLocalManifest(value: unknown): value is LocalManifest {
  return isRecord(value) && isRecord(value["groups"]) && Object.values(value["groups"]).every(isLocalGroup)
}

/** The local-client manifest (`groups.<subdir>.<name>`) beside the extracted files, or null when it is absent or malformed. */
function readLocalManifest(path: string): LocalManifest | null {
  if (!existsSync(path)) return null
  const value: unknown = JSON.parse(readFileSync(path, "utf8"))
  return isLocalManifest(value) ? value : null
}

const manifest = readLocalManifest(join(mediaDir, "local-assets.json"))

function runPython(code: string): unknown {
  const src = `import sys, json\nfrom types import SimpleNamespace as NS\nsys.path.insert(0, ${JSON.stringify(tool)})\nimport extract as e\n${code}`
  const result = spawnSync(python ?? "python3", ["-c", src], { encoding: "utf8", env })
  expect(result.status, result.stderr).toBe(0)
  return JSON.parse(result.stdout)
}

function onDisk(assetPath: string): string {
  const decoded = decodeURIComponent(assetPath).replace(/^\//, "")
  const rel = decoded.startsWith("assets/") ? decoded.slice("assets/".length) : decoded
  return join(mediaDir, rel)
}

test.skipIf(!python)("job table exports map materials and board meshes with their prefabs", () => {
  const result = spawnSync(python ?? "python3", [join(tool, "extract.py"), "--print-jobs"], { encoding: "utf8", env })
  expect(result.status, result.stderr).toBe(0)
  const { jobs } = JSON.parse(result.stdout) as { jobs: { sub: string; kinds: string[]; bundle: string }[] }
  for (const sub of ["map/autochess", "map/autochesssand"]) {
    expect(jobs.find((job) => job.sub === sub)?.kinds).toEqual(["Material", "Texture2D"])
  }
  const mesh = jobs.filter((job) => job.sub.startsWith("mesh/"))
  expect(mesh.map((job) => job.bundle)).toEqual([
    "arts/maps/map_autochess/bkg_mesh.ab",
    "arts/maps/common/meshes/s_background_common.ab",
    "arts/maps/common/meshes/s_common_box_01.ab",
    "arts/maps/common/meshes/s_wind_device.ab",
  ])
  for (const job of mesh) expect(job.kinds).toEqual(["GameObject", "Material", "Mesh", "Texture2D"])
  expect(new Set(jobs.map((job) => job.sub)).size).toBe(jobs.length)
})

test.skipIf(!python)("material_info keeps textures, floats, colours and sorted keywords", () => {
  const out = runPython(`
class P:
    def __init__(self, obj=None, pid=1, err=False): self.m_PathID, self._o, self._e = pid, obj, err
    def read(self):
        if self._e: raise FileNotFoundError('cab-x not found')
        return self._o
tex = lambda n: NS(m_Name=n)
v2 = lambda x, y: NS(x=x, y=y)
mat = NS(m_Name='MT', m_Shader=P(err=True), m_ValidKeywords=['_NORMALMAP', 'HG_LIGHTMAP'],
  m_SavedProperties=NS(
    m_TexEnvs=[('_MainTex', NS(m_Texture=P(tex('TX_D')), m_Scale=v2(2, 1), m_Offset=v2(0, -0.0))),
               ('_BumpMap', NS(m_Texture=P(pid=0), m_Scale=v2(1, 1), m_Offset=v2(0, 0))),
               ('_EmissionMap', NS(m_Texture=P(err=True), m_Scale=v2(1, 1), m_Offset=v2(0, 0)))],
    m_Floats=[('_Cutoff', 0.40799999237060547), ('_Bad', float('nan'))],
    m_Colors=[('_EmissionColor', NS(r=0.559, g=0.559, b=0.559, a=1))]))
bg = NS(m_Name='BG', m_Shader=P(NS(m_ParsedForm=NS(m_Name='Torappu/Unlit/Texture'))), m_ShaderKeywords='B A',
  m_SavedProperties=NS(m_TexEnvs=[], m_Floats=[], m_Colors=[]))
print(json.dumps([e.material_info(mat), e.material_info(bg)]))`) as [Record<string, unknown>, Record<string, unknown>]
  expect(out[0]).toEqual({
    shader: null,
    keywords: ["HG_LIGHTMAP", "_NORMALMAP"],
    textures: { _MainTex: { texture: "TX_D", scale: [2, 1], offset: [0, 0] } },
    floats: { _Bad: 0, _Cutoff: 0.408 },
    colors: { _EmissionColor: [0.559, 0.559, 0.559, 1] },
  })
  expect(out[1]).toEqual({ shader: "Torappu/Unlit/Texture", keywords: ["A", "B"], textures: {}, floats: {}, colors: {} })
})

test.skipIf(!python)("dep_bundles loads shader bundles beside material jobs", () => {
  const out = runPython(`
import tempfile, pathlib
d = pathlib.Path(tempfile.mkdtemp())
(d / 'shaders').mkdir()
for n in ('standarddirectional.ab', 'other.ab', 'notes.txt'): (d / 'shaders' / n).write_bytes(b'')
(d / 'shaders' / 'sub.ab').mkdir()
rel = lambda ps: [p.relative_to(d).as_posix() for p in ps]
print(json.dumps({'mat': rel(e.dep_bundles(d, {'Texture2D', 'Material'})), 'sprite': rel(e.dep_bundles(d, {'Sprite'})),
                  'none': rel(e.dep_bundles(d / 'missing', {'Material'}))}))`)
  expect(out).toEqual({ mat: ["shaders/other.ab", "shaders/standarddirectional.ab"], sprite: [], none: [] })
})

test.skipIf(!python)("prefab_node keeps the local transform and drops negative zero", () => {
  const out = runPython(`
class P:
    def __init__(self, obj=None, pid=1, err=False): self.m_PathID, self._o, self._e = pid, obj, err
    def read(self):
        if self._e: raise FileNotFoundError('external')
        return self._o
class Transform:
    def __init__(self, **k): self.__dict__.update(k)
class MeshFilter:
    def __init__(self, **k): self.__dict__.update(k)
class MeshRenderer:
    def __init__(self, **k): self.__dict__.update(k)
v3 = lambda x, y, z: NS(x=x, y=y, z=z)
root_go = NS(m_Name='Root')
root_tr = Transform(m_LocalPosition=v3(0, 0, 0), m_LocalRotation=NS(x=0, y=0, z=0, w=1), m_LocalScale=v3(1, 1, 1),
                    m_Father=P(pid=0), m_GameObject=P(root_go))
child_tr = Transform(m_LocalPosition=v3(-0.0, 3.5254242420196533, -8), m_LocalRotation=NS(x=0, y=-0.0, z=0, w=1),
                     m_LocalScale=v3(0.01, 0.01, 0.01), m_Father=P(root_tr), m_GameObject=None)
go = NS(m_Name='S_Background_shadow', m_Component=[
  NS(component=P(child_tr)),
  NS(component=P(MeshFilter(m_Mesh=P(NS(m_Name='S_Background_shadow'))))),
  NS(component=P(MeshRenderer(m_Materials=[P(NS(m_Name='lambert1')), P(err=True)]))),
  NS(component=P(err=True)),
])
print(json.dumps(e.prefab_node(go)))`)
  expect(out).toEqual({
    name: "S_Background_shadow",
    parent: "Root",
    pos: [0, 3.525424, -8],
    rot: [0, 0, 0, 1],
    scale: [0.01, 0.01, 0.01],
    mesh: "S_Background_shadow",
    materials: ["lambert1", null],
  })
  const raw = spawnSync(
    python ?? "python3",
    ["-c", `import sys; sys.path.insert(0, ${JSON.stringify(tool)}); import extract as e, json; print(json.dumps(e.vec(type('V', (), {'x': -0.0, 'y': float('inf'), 'z': 1e-9})())))`],
    { encoding: "utf8", env },
  )
  expect(raw.stdout.trim()).toBe("[0.0, 0, 0.0]")
})

test.skipIf(!python)("board jobs list gate effects, water maps and derived textures", () => {
  const result = spawnSync(python ?? "python3", [join(tool, "extract.py"), "--print-jobs"], { encoding: "utf8", env })
  expect(result.status, result.stderr).toBe(0)
  const parsed = JSON.parse(result.stdout) as {
    jobs: { sub: string; bundle: string; kinds: string[]; keep?: string }[]
    derived: { sub: string; from: string; derive: string; name: string }[]
    webp: { sub: string; name: string; mode: string }[]
  }
  const by = Object.fromEntries(parsed.jobs.map((job) => [job.sub, job]))
  expect(by["map/fx"]?.bundle).toBe("arts/effects/[pack]map.ab")
  expect(by["map/fx"]?.kinds).toEqual(["GameObject", "Material", "Mesh", "Texture2D"])
  expect(by["map/common"]?.bundle).toBe("arts/maps/common/res.ab")
  expect(new RegExp(by["map/common"]?.keep ?? "").test("TX_wind_device")).toBe(true)
  expect(new RegExp(by["map/common"]?.keep ?? "").test("TX_R6_bomb")).toBe(false)
  expect(new RegExp(by["map/water"]?.keep ?? "").test("[ucp]TX_water_normal")).toBe(true)
  expect(parsed.jobs.filter((job) => job.sub.startsWith("mesh/"))).toHaveLength(4)
  expect(parsed.derived.map((row) => [row.sub, row.from, row.derive, row.name])).toEqual([
    ["map/autochess", "TX_autochessi_N", "normal_rg", "TX_autochessi_N_rgb"],
    ["map/autochess", "TX_autochessi_M", "rough_from_gloss", "TX_autochessi_M_rough"],
  ])
  const mode = Object.fromEntries(parsed.webp.map((row) => [row.name, row.mode]))
  for (const name of ["TX_autochessi_N_rgb", "[ucp]TX_water_normal", "TX_autochessi_M_rough", "T_noise_clouds_01"]) expect(mode[name]).toBe("lossless")
  for (const name of ["TX_autochessi_D", "TX_autochessi_BG", "TX_autochessi_common_D"]) expect(mode[name]).toBe("lossy")
})

test.skipIf(!pillow)("derived maps rebuild normal Z and roughness from smoothness", () => {
  const out = runPython(`
from PIL import Image
n = Image.new('RGB', (3, 1))
n.putpixel((0, 0), (128, 128, 0)); n.putpixel((1, 0), (255, 128, 0)); n.putpixel((2, 0), (128, 20, 0))
rn = e.derive_normal_rg(n)
m = Image.new('RGBA', (2, 1)); m.putpixel((0, 0), (0, 0, 0, 0)); m.putpixel((1, 0), (0, 0, 0, 200))
rm = e.derive_rough_from_gloss(m)
print(json.dumps({'n': [list(rn.getpixel((i, 0))) for i in range(3)], 'm': [list(rm.getpixel((i, 0))) for i in range(2)], 'mode': [rn.mode, rm.mode]}))`) as {
    n: number[][]
    m: number[][]
    mode: string[]
  }
  expect(out.mode).toEqual(["RGB", "RGB"])
  expect(out.n[0]?.[2]).toBeGreaterThanOrEqual(254)
  expect(Math.abs((out.n[1]?.[2] ?? 0) - 128)).toBeLessThanOrEqual(1)
  expect(out.n[0]?.slice(0, 2)).toEqual([128, 128])
  expect(out.m).toEqual([[255, 255, 0], [255, 55, 0]])
})

test.skipIf(!webp)("webp copies sit beside the PNG and keep alpha, normals and hidden RGB", () => {
  const dir = mkdtempSync(join(tmpdir(), "sp-webp-"))
  try {
    const out = runPython(`
from pathlib import Path
from PIL import Image
root = Path(${JSON.stringify(dir)})
sub = root / 'map' / 'autochess'
sub.mkdir(parents=True)
d = Image.new('RGBA', (64, 64), (200, 40, 40, 0))
for x in range(32):
    for y in range(64): d.putpixel((x, y), (x * 8, y * 4, 90, 255))
d.save(sub / 'TX_autochessi_D.png')
n = Image.new('RGB', (64, 64))
for x in range(64):
    for y in range(64): n.putpixel((x, y), ((x * 37) % 256, (y * 53) % 256, 200 + (x + y) % 56))
n.save(sub / 'TX_autochessi_N_rgb.png')
entry = lambda name, kind: {'path': f'/assets/map/autochess/{name}.png', 'w': 64, 'h': 64, 'kind': kind}
groups = {'map/autochess': {'TX_autochessi_D': entry('TX_autochessi_D', 'Texture2D'),
                            'TX_autochessi_N_rgb': entry('TX_autochessi_N_rgb', 'Derived'),
                            'TX_autochessi_E': entry('TX_autochessi_E', 'Texture2D')}}
logs = []
code = e.webp_only(root, logs.append)
g = groups['map/autochess']
px = lambda p: list(Image.open(p).convert('RGBA').getdata())
a, b = px(sub / 'TX_autochessi_D.png'), px(sub / 'TX_autochessi_D.webp')
hidden = [q for p, q in zip(a, b) if p[3] == 0]
print(json.dumps({'code': code, 'paths': {k: v['path'] for k, v in g.items()}, 'modes': {k: v.get('webp') for k, v in g.items()},
                  'pngKept': (sub / 'TX_autochessi_D.png').exists(),
                  'alphaSame': all(p[3] == q[3] for p, q in zip(a, b)),
                  'normalSame': px(sub / 'TX_autochessi_N_rgb.png') == px(sub / 'TX_autochessi_N_rgb.webp'),
                  'hidden': [sum(q[i] for q in hidden) / len(hidden) for i in range(3)],
                  'again': e.run_webp(root, 'map/autochess', groups, logs.append)}))`) as {
      code: number
      paths: Record<string, string>
      modes: Record<string, string | null>
      pngKept: boolean
      alphaSame: boolean
      normalSame: boolean
      hidden: number[]
      again: number
    }
    expect(out.code).toBe(0)
    const at = (name: string, extension: string): string => `/assets/map/autochess/${name}.${extension}`
    expect(out.paths).toEqual({
      TX_autochessi_D: at("TX_autochessi_D", "webp"),
      TX_autochessi_N_rgb: at("TX_autochessi_N_rgb", "webp"),
      TX_autochessi_E: at("TX_autochessi_E", "png"),
    })
    expect(out.modes).toEqual({ TX_autochessi_D: "lossy", TX_autochessi_N_rgb: "lossless", TX_autochessi_E: null })
    expect(out.pngKept).toBe(true)
    expect(out.alphaSame).toBe(true)
    expect(out.normalSame).toBe(true)
    out.hidden.forEach((value, index) => expect(Math.abs(value - [200, 40, 40][index]!)).toBeLessThan(12))
    expect(out.again).toBe(2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test.skipIf(!python)("prefab_node names a shared mesh from the export map", () => {
  const out = runPython(`
class P:
    def __init__(self, obj=None, pid=1, fid=0): self.m_PathID, self.m_FileID, self._o = pid, fid, obj
    def read(self): return self._o
class MeshFilter:
    def __init__(self, **k): self.__dict__.update(k)
go = NS(m_Name='Start_back', m_Component=[NS(component=P(MeshFilter(m_Mesh=P(NS(m_Name='Start_back'), pid=42))))])
print(json.dumps([e.prefab_node(go)['mesh'], e.prefab_node(go, {42: 'Start_back_42'})['mesh'], e.prefab_node(go, {7: 'x'})['mesh']]))`)
  expect(out).toEqual(["Start_back", "Start_back_42", "Start_back"])
})

const meshFiles = existsSync(join(mediaDir, "mesh"))
const mapGroup = manifest?.groups?.["map/autochess"]

test.skipIf(!mapGroup?.["materials"])("map/autochess materials.json matches the extracted group", () => {
  const group = manifest?.groups?.["map/autochess"]
  expect(group?.["materials"]?.kind).toBe("Materials")
  if (!meshFiles || !group?.["materials"]?.path) return
  const mats = JSON.parse(readFileSync(onDisk(group["materials"].path), "utf8")) as Record<string, { shader?: string; keywords: string[]; textures: Record<string, { texture: string }> }>
  expect(Object.keys(mats)).toEqual(["MT_autochess", "MT_autochess_Transparent", "MT_autochess_common", "MT_autochessi_BG"])
  expect(mats["MT_autochess"]?.textures["_MainTex"]?.texture).toBe("TX_autochessi_D")
  expect(mats["MT_autochess"]?.textures["_BumpMap"]?.texture).toBe("TX_autochessi_N")
  expect(mats["MT_autochess"]?.keywords).toContain("_EMISSION")
  expect(mats["MT_autochessi_BG"]?.shader).toBe("Torappu/Unlit/Texture")
  for (const key of ["MT_autochess", "MT_autochess_Transparent", "MT_autochess_common"]) expect(mats[key]?.shader).toBe("Torappu/Scene/StandardDirectional")
  const sandPath = manifest?.groups?.["map/autochesssand"]?.["materials"]?.path
  if (sandPath) {
    const sand = JSON.parse(readFileSync(onDisk(sandPath), "utf8")) as Record<string, { shader?: string }>
    for (const [key, row] of Object.entries(sand)) expect(row.shader ?? "", key).toMatch(/^Torappu\/Scene\/(StandardRealtimeShadow|StylizedWater)$/)
  }
  for (const row of Object.values(mats)) {
    for (const texture of Object.values(row.textures)) expect(group[texture.texture]).toBeTruthy()
  }
})

const meshGroups = Object.keys(manifest?.groups ?? {}).some((key) => key.startsWith("mesh/"))

test.skipIf(!meshGroups)("mesh groups list obj files and a prefab", () => {
  const groups = Object.entries(manifest?.groups ?? {}).filter(([key]) => key.startsWith("mesh/"))
  expect(groups.map(([key]) => key).sort()).toEqual(["mesh/map_autochess_bkg", "mesh/s_background_common", "mesh/s_common_box_01", "mesh/s_wind_device"])
  for (const [name, group] of groups) {
    expect(group["prefab"]?.kind, name).toBe("Prefab")
    const meshes = Object.values(group).filter((entry) => entry.kind === "Mesh")
    expect(meshes.length, name).toBeGreaterThanOrEqual(1)
    if (!meshFiles || !group["prefab"]?.path) continue
    const prefab = JSON.parse(readFileSync(onDisk(group["prefab"].path), "utf8")) as { pos: number[]; rot: number[]; mesh?: string }[]
    expect(prefab).toHaveLength(group["prefab"].count ?? 0)
    for (const node of prefab) {
      expect(node.pos).toHaveLength(3)
      expect(node.rot).toHaveLength(4)
      if (node.mesh) expect(group[node.mesh]).toBeTruthy()
    }
    for (const mesh of meshes) {
      if (!mesh.path) continue
      const obj = readFileSync(onDisk(mesh.path), "utf8")
      const verts = obj.split("\n").filter((line) => line.startsWith("v ")).length
      expect(verts).toBe(mesh.verts)
      expect(obj.split("\n").some((line) => line.startsWith("f "))).toBe(true)
    }
  }
  const bkgPath = manifest?.groups?.["mesh/map_autochess_bkg"]?.["prefab"]?.path
  if (meshFiles && bkgPath) {
    const bkg = JSON.parse(readFileSync(onDisk(bkgPath), "utf8")) as { name: string }[]
    expect(bkg.map((node) => node.name)).toEqual(["S_Background_common", "S_Background_shadow"])
  }
})

test.skipIf(!python)("enemy scale groups drop the standard and the enemy_ prefix", () => {
  const src =
    `import sys, json\nsys.path.insert(0, ${JSON.stringify(tool)})\nimport enemy_scales as s\n` +
    `print(json.dumps(s.group_table({'enemy_1005_yokai_3': 0.16, 'enemy_1005_yokai': 0.2, 'enemy_1040_bombd': 0.2, 'enemy_10083_hlbird': 0.27, 'enemy_x': None})))`
  const result = spawnSync(python ?? "python3", ["-c", src], { encoding: "utf8", env })
  expect(result.status, result.stderr).toBe(0)
  const lines = JSON.parse(result.stdout) as string[]
  expect(lines).toEqual(["  [0.16, ['1005_yokai_3']],", "  [0.2, ['1005_yokai', '1040_bombd']],"])
  const enemy = readFileSync(join(repoRoot, "app/data/compiler/packet/record/enemy.ts"), "utf8")
  expect(enemy).toContain('[0.16, ["1005_yokai_3"]]')
})

const fxFiles = existsSync(join(mediaDir, "map/fx"))

test.skipIf(!manifest?.groups?.["map/fx"] || !fxFiles)("webp copies listed by the local manifest sit beside their pngs", () => {
  const groups = manifest?.groups ?? {}
  for (const [groupName, entries] of Object.entries(groups)) {
    for (const [name, entry] of Object.entries(entries)) {
      if (!/\.webp$/.test(entry.path ?? "")) continue
      expect(existsSync(onDisk(entry.path ?? "")), `${groupName}/${name}`).toBe(true)
      expect(existsSync(onDisk((entry.path ?? "").replace(/\.webp$/, ".png")))).toBe(true)
      expect(entry.webp === "lossy" || entry.webp === "lossless").toBe(true)
    }
  }
})

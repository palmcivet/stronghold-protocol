import {
  AdditiveBlending,
  Color,
  DataTexture,
  DoubleSide,
  EquirectangularReflectionMapping,
  FrontSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  PMREMGenerator,
  RGBAFormat,
  RepeatWrapping,
  ShaderMaterial,
  ShadowMaterial,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
  Vector2,
  Vector4,
  type Material,
  type ColorRepresentation,
  type IUniform,
  type Side,
  type WebGLRenderer,
} from "three"
import { ORIGINIUM, type Vec3 } from "./palette.js"

export interface FocusUniforms {
  readonly uFocus: { value: Vector4 }
  readonly uFocusDim: { value: number }
  readonly uFocusSoft: { value: number }
  readonly uSheen: { value: Color }
}

/** Shared focus falloff: the lit field keeps full brightness, everything else fades towards `uFocusDim`. */
export function focusUniforms(): FocusUniforms {
  return {
    uFocus: { value: new Vector4(0, 9, 10, 12) },
    uFocusDim: { value: 0.72 },
    uFocusSoft: { value: 2.2 },
    uSheen: { value: new Color(0.4, 0.45, 0.52) },
  }
}

/** Inject the focus falloff and the glossy sheen into a built-in material (onBeforeCompile). */
export function addFocus<T extends Material>(material: T, focus: FocusUniforms): T {
  const previous = (material as unknown as { onBeforeCompile?: unknown }).onBeforeCompile
  Object.assign(material, {
    onBeforeCompile: (shader: { uniforms: Record<string, unknown>, vertexShader: string, fragmentShader: string }, renderer: unknown) => {
      if (typeof previous === "function") (previous as (s: unknown, r: unknown) => void)(shader, renderer)
      Object.assign(shader.uniforms, focus)
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vFocusWorld;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvFocusWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;")
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <emissivemap_fragment>", [
          "#include <emissivemap_fragment>",
          "#if defined( USE_COLOR )",
          "  { float ek = (vColor.r + vColor.g + vColor.b) / 3.0; totalEmissiveRadiance *= ek * ek; }",
          "#endif",
        ].join("\n"))
        .replace("#include <common>", [
          "#include <common>",
          "varying vec3 vFocusWorld;",
          "uniform vec4 uFocus;",
          "uniform float uFocusDim;",
          "uniform float uFocusSoft;",
          "uniform vec3 uSheen;",
        ].join("\n"))
        .replace("#include <opaque_fragment>", [
          "#ifdef USE_ROUGHNESSMAP",
          "  { float sm = clamp(1.0 - texelRoughness.g, 0.0, 1.0); float tintk = 1.0;",
          "    #if defined( USE_COLOR )",
          "      tintk = (vColor.r + vColor.g + vColor.b) / 3.0; tintk *= tintk;",
          "    #endif",
          "    outgoingLight += uSheen * sm * sm * tintk * diffuseColor.a; }",
          "#endif",
          "{",
          "  vec2 fq = vFocusWorld.xz;",
          "  vec2 fd = max(vec2(0.0), max(uFocus.xy - fq, fq - uFocus.zw));",
          "  float fm = 1.0 - smoothstep(0.0, uFocusSoft, length(fd));",
          "  outgoingLight *= mix(uFocusDim, 1.0, fm);",
          "}",
          "#include <opaque_fragment>",
        ].join("\n"))
    },
    customProgramCacheKey: () => "terrain-focus",
  })
  return material
}

export interface BoardTextures {
  readonly diffuse: Texture
  readonly normal?: Texture | null
  readonly roughness?: Texture | null
  readonly emissive?: Texture | null
  readonly common?: Texture | null
  readonly commonEmissive?: Texture | null
  readonly background?: Texture | null
  readonly wind?: Texture | null
  readonly gate?: Texture | null
  readonly water?: Texture | null
  readonly caustics?: Texture | null
  readonly noise?: Texture | null
}

/** MT_autochess: albedo, normal, roughness and emission of the board atlas, vertex colours carry AO and tints. */
export function boardMaterial(textures: BoardTextures, focus: FocusUniforms, emissive: number): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    map: textures.diffuse,
    vertexColors: true,
    normalMap: textures.normal ?? null,
    roughnessMap: textures.roughness ?? null,
    roughness: 0.78,
    metalness: 0,
    emissiveMap: textures.emissive ?? null,
    emissive: textures.emissive ? new Color(1, 1, 1) : new Color(0, 0, 0),
    emissiveIntensity: emissive,
  })
  if (textures.normal) material.normalScale = new Vector2(1, 1)
  return addFocus(material, focus)
}

/**
 * The preview pen's glass: the inner square of every hatch re-shaded as sky-lit glass (world-space cloud reflection,
 * low roughness for the key light's glint). Same UVs and atlas as the board.
 */
export function glassMaterial(textures: BoardTextures, focus: FocusUniforms, emissive: number): MeshStandardMaterial {
  const material = boardMaterial(textures, focus, emissive)
  const uniforms = {
    uCloud: { value: textures.noise ?? null },
    uSkyLow: { value: new Color(0.4, 0.47, 0.54) },
    uSkyHigh: { value: new Color(0.72, 0.77, 0.82) },
  }
  const previous = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer)
    Object.assign(shader.uniforms, uniforms)
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", [
        "#include <common>",
        "uniform sampler2D uCloud;",
        "uniform vec3 uSkyLow;",
        "uniform vec3 uSkyHigh;",
      ].join("\n"))
      .replace("#include <roughnessmap_fragment>", [
        "#include <roughnessmap_fragment>",
        "{",
        "  vec2 gq = abs(fract(vFocusWorld.xz + 0.5) - 0.5);",
        "  float glassK = 1.0 - smoothstep(0.355, 0.375, max(gq.x, gq.y));",
        "  float cl = texture2D(uCloud, vFocusWorld.xz * 0.06 + vec2(0.13, 0.41), 3.0).r * 0.7 + texture2D(uCloud, vFocusWorld.xz * 0.17, 2.0).r * 0.3;",
        "  vec3 sky = mix(uSkyLow, uSkyHigh, smoothstep(0.2, 0.8, cl));",
        "  vec3 under = diffuseColor.rgb;",
        "  diffuseColor.rgb = mix(under, sky + (under - vec3(0.35)) * 0.08, glassK);",
        "  roughnessFactor = mix(roughnessFactor, 0.22, glassK);",
        "  #ifdef USE_ROUGHNESSMAP",
        "    texelRoughness.g = mix(texelRoughness.g, 0.4, glassK);",
        "  #endif",
        "}",
      ].join("\n"))
  }
  material.customProgramCacheKey = () => "terrain-glass"
  return material
}

/** MT_autochess_common: alpha-tested device plates drawn just above the tops. */
export function decalMaterial(textures: BoardTextures, focus: FocusUniforms): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    map: textures.common ?? null,
    alphaTest: 0.408,
    roughness: 0.7,
    metalness: 0,
    emissiveMap: textures.commonEmissive ?? null,
    emissive: textures.commonEmissive ? new Color(0.559, 0.559, 0.559) : new Color(0, 0, 0),
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  return addFocus(material, focus)
}

/** Orange tubular fence railings. */
export function pipeMaterial(focus: FocusUniforms): MeshStandardMaterial {
  return addFocus(new MeshStandardMaterial({ color: 0xf0922b, roughness: 0.42, metalness: 0.35 }), focus)
}

/** Unlit textured material: the background plane and the wind device. */
export function unlitMaterial(map: Texture | null, color: ColorRepresentation = 0xffffff, side: Side = FrontSide): MeshBasicMaterial {
  return new MeshBasicMaterial({ map, color, side })
}

export interface GateUniforms {
  readonly map: { value: Texture | null }
  readonly uTint: { value: Color }
  readonly uPulse: { value: number }
  readonly uFlash: { value: Color }
}

/** Gate and objective boxes: additive (start) or alpha blended (end). `uPulse` follows the clip's intensity curve. */
export function gateMaterial(map: Texture | null, additive: boolean, tint: Vec3 = [1, 1, 1]): ShaderMaterial {
  const uniforms: GateUniforms = {
    map: { value: map },
    uTint: { value: new Color(tint[0], tint[1], tint[2]) },
    uPulse: { value: 1 },
    uFlash: { value: new Color(0, 0, 0) },
  }
  return new ShaderMaterial({
    uniforms: { ...uniforms },
    vertexShader: [
      "varying vec2 vUv;",
      "void main() {",
      "  vUv = uv;",
      "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform sampler2D map;",
      "uniform vec3 uTint;",
      "uniform float uPulse;",
      "uniform vec3 uFlash;",
      "varying vec2 vUv;",
      "void main() {",
      "  vec4 t = texture2D(map, vUv);",
      "  vec3 c = t.rgb * uTint;",
      "  c = mix(c, uFlash * max(max(t.r, t.g), t.b) * 1.6, clamp(length(uFlash), 0.0, 1.0));",
      additive ? "  gl_FragColor = vec4(c * t.a * uPulse, 1.0);" : "  gl_FragColor = vec4(c, t.a * clamp(uPulse, 0.0, 1.0));",
      "  #include <colorspace_fragment>",
      "}",
    ].join("\n"),
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: additive ? AdditiveBlending : NormalBlending,
  })
}

/** The cyan field border: additive emissive strips with a dash pattern. */
export function glowMaterial(dashes: Texture | null, color: number = 0x39d6ff): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map: dashes,
    color,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  })
}

export function shadowCatcherMaterial(): ShadowMaterial {
  return new ShadowMaterial({ opacity: 0.32, color: 0x000000 })
}

const TERRAIN_VERTEX = [
  "varying vec2 vUv;",
  "varying vec3 vWorld;",
  "void main() {",
  "  vUv = uv;",
  "  vec4 w = modelMatrix * vec4(position, 1.0);",
  "  vWorld = w.xyz;",
  "  gl_Position = projectionMatrix * viewMatrix * w;",
  "}",
].join("\n")

const FOCUS_GLSL = [
  "uniform vec4 uFocus; uniform float uFocusDim; uniform float uFocusSoft;",
  "float focusMask(vec2 q) { vec2 d = max(vec2(0.0), max(uFocus.xy - q, q - uFocus.zw)); return mix(uFocusDim, 1.0, 1.0 - smoothstep(0.0, uFocusSoft, length(d))); }",
].join("\n")

function terrainShader(uniforms: Record<string, IUniform>, fragment: string[]): ShaderMaterial {
  return new ShaderMaterial({
    uniforms,
    vertexShader: TERRAIN_VERTEX,
    fragmentShader: [...fragment, "#include <colorspace_fragment>"].join("\n"),
    transparent: true,
    depthWrite: false,
  })
}

/** Deep sea: teal water with two scrolling layers of the official normal map and caustics. */
export function waterMaterial(textures: BoardTextures, focus: FocusUniforms): ShaderMaterial {
  return terrainShader({
    uTime: { value: 0 },
    uNormal: { value: textures.water ?? null },
    uCaustics: { value: textures.caustics ?? null },
    ...focus,
  }, [
    "uniform float uTime; uniform sampler2D uNormal; uniform sampler2D uCaustics;",
    FOCUS_GLSL,
    "varying vec2 vUv; varying vec3 vWorld;",
    "void main() {",
    "  vec2 p = vWorld.xz * 0.45;",
    "  vec3 n1 = texture2D(uNormal, p + vec2(uTime * 0.03, uTime * 0.021)).xyz * 2.0 - 1.0;",
    "  vec3 n2 = texture2D(uNormal, p * 1.7 - vec2(uTime * 0.025, -uTime * 0.017)).xyz * 2.0 - 1.0;",
    "  vec3 n = normalize(vec3(n1.xy + n2.xy, 2.2));",
    "  vec3 L = normalize(vec3(-0.45, -0.3, 0.84));",
    "  float diff = clamp(dot(n, L), 0.0, 1.0);",
    "  vec3 V = normalize(vec3(0.0, -0.5, 0.866));",
    "  float spec = pow(clamp(dot(reflect(-L, n), V), 0.0, 1.0), 40.0);",
    "  float ca = texture2D(uCaustics, vWorld.xz * 0.6 + n.xy * 0.08 + vec2(uTime * 0.02, 0.0)).r;",
    "  vec3 deep = vec3(0.03, 0.2, 0.27), shallow = vec3(0.09, 0.46, 0.55);",
    "  vec3 c = mix(deep, shallow, 0.35 + 0.45 * diff) + ca * vec3(0.18, 0.32, 0.34) + spec * vec3(0.8, 0.95, 1.0);",
    "  c *= focusMask(vWorld.xz);",
    "  gl_FragColor = vec4(c, 0.9);",
    "}",
  ])
}

/** Mire: slow brown-green sludge from cloud noise, with sticky bubbles. */
export function mireMaterial(textures: BoardTextures, focus: FocusUniforms): ShaderMaterial {
  return terrainShader({ uTime: { value: 0 }, uNoise: { value: textures.noise ?? null }, ...focus }, [
    "uniform float uTime; uniform sampler2D uNoise;",
    FOCUS_GLSL,
    "varying vec2 vUv; varying vec3 vWorld;",
    "void main() {",
    "  vec2 p = vWorld.xz * 0.35;",
    "  float a = texture2D(uNoise, p + vec2(uTime * 0.012, uTime * 0.008)).r;",
    "  float b = texture2D(uNoise, p * 2.3 - vec2(uTime * 0.01, -uTime * 0.014)).r;",
    "  float m = smoothstep(0.25, 0.75, a * 0.65 + b * 0.5);",
    "  vec3 c = mix(vec3(0.16, 0.19, 0.08), vec3(0.37, 0.4, 0.17), m);",
    "  float bub = smoothstep(0.82, 0.9, b) * (0.5 + 0.5 * sin(uTime * 3.0 + a * 20.0));",
    "  c += bub * vec3(0.35, 0.4, 0.2);",
    "  vec2 e = min(vUv, 1.0 - vUv);",
    "  float edge = smoothstep(0.0, 0.12, min(e.x, e.y));",
    "  c *= focusMask(vWorld.xz);",
    "  gl_FragColor = vec4(c, 0.86 * edge);",
    "}",
  ])
}

const vec3Literal = (value: readonly number[]): string => `vec3(${value.map((item) => item.toFixed(3)).join(", ")})`

/**
 * 活性源石 (infection): dark crust patches with pulsing orange veins, world-space so the crust runs across neighbouring
 * tiles. The palette is `ORIGINIUM`, shared with the 2D board.
 */
export function infectionMaterial(textures: BoardTextures, focus: FocusUniforms): ShaderMaterial {
  return terrainShader({ uTime: { value: 0 }, uNoise: { value: textures.noise ?? null }, ...focus }, [
    "uniform float uTime; uniform sampler2D uNoise;",
    FOCUS_GLSL,
    "varying vec2 vUv; varying vec3 vWorld;",
    "void main() {",
    "  float n = texture2D(uNoise, vWorld.xz * 0.55).r;",
    "  float n2 = texture2D(uNoise, vWorld.xz * 1.3 + 0.37).r;",
    "  float n3 = texture2D(uNoise, vWorld.xz * 3.1 + 0.11).r;",
    "  float crust = smoothstep(0.38, 0.62, n * 0.7 + n2 * 0.45);",
    "  float vein = smoothstep(0.86, 0.98, 1.0 - abs(n2 * 2.0 - 1.0)) * (0.35 + 0.65 * crust);",
    "  float grain = smoothstep(0.93, 1.0, n3) * crust;",
    "  float pulse = 0.6 + 0.4 * sin(uTime * 2.2 + n * 9.0);",
    `  vec3 base = mix(${vec3Literal(ORIGINIUM.base)}, ${vec3Literal(ORIGINIUM.crust)}, n2);`,
    `  vec3 glow = ${vec3Literal(ORIGINIUM.vein)} * (1.2 + 0.8 * pulse);`,
    "  vec3 c = mix(base, glow, vein);",
    `  c = mix(c, ${vec3Literal(ORIGINIUM.spec)} * (1.0 + 0.6 * pulse), grain);`,
    "  c *= focusMask(vWorld.xz);",
    "  float a = clamp(crust * 0.72 + vein, 0.0, 1.0);",
    "  gl_FragColor = vec4(c, a);",
    "}",
  ])
}

/** Smog: drifting exhaust haze on vertical cards over the grilles. */
export function smogMaterial(textures: BoardTextures, focus: FocusUniforms): ShaderMaterial {
  const material = terrainShader({ uTime: { value: 0 }, uNoise: { value: textures.noise ?? null }, ...focus }, [
    "uniform float uTime; uniform sampler2D uNoise;",
    FOCUS_GLSL,
    "varying vec2 vUv; varying vec3 vWorld;",
    "void main() {",
    "  vec2 p = vec2(vUv.x * 0.8 + vWorld.x * 0.13, vUv.y * 0.7 - uTime * 0.12);",
    "  float n = texture2D(uNoise, p).r * 0.7 + texture2D(uNoise, p * 2.1 + vec2(uTime * 0.03, 0.0)).r * 0.5;",
    "  float fade = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y)) * smoothstep(0.0, 0.2, vUv.x) * (1.0 - smoothstep(0.8, 1.0, vUv.x));",
    "  float a = smoothstep(0.3, 0.9, n) * fade * 0.8;",
    "  vec3 c = vec3(0.74, 0.79, 0.78) * focusMask(vWorld.xz);",
    "  gl_FragColor = vec4(c, a);",
    "}",
  ])
  material.side = DoubleSide
  return material
}

/** A studio environment for image-based light: bright sky with light panels above the horizon, dark void below. */
export function environmentTexture(renderer: WebGLRenderer): Texture {
  const width = 256
  const height = 128
  const data = new Uint8Array(width * height * 4)
  const stops: readonly (readonly [number, readonly number[]])[] = [
    [0, [223, 231, 239]],
    [0.32, [185, 195, 204]],
    [0.5, [109, 117, 125]],
    [0.56, [38, 43, 48]],
    [1, [12, 14, 16]],
  ]
  for (let y = 0; y < height; y += 1) {
    const t = y / (height - 1)
    let from = stops[0]!
    let to = stops[stops.length - 1]!
    for (let index = 0; index < stops.length - 1; index += 1) {
      if (t >= stops[index]![0] && t <= stops[index + 1]![0]) {
        from = stops[index]!
        to = stops[index + 1]!
        break
      }
    }
    const span = to[0] - from[0] || 1
    const k = Math.min(1, Math.max(0, (t - from[0]) / span))
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        data[offset + channel] = Math.round((from[1][channel] ?? 0) + ((to[1][channel] ?? 0) - (from[1][channel] ?? 0)) * k)
      }
      data[offset + 3] = 255
    }
  }
  for (let panel = 0; panel < 6; panel += 1) {
    for (let y = 14 + (panel % 2) * 8; y < 21 + (panel % 2) * 8; y += 1) {
      for (let x = 8 + panel * 42; x < 34 + panel * 42; x += 1) {
        const offset = (y * width + x) * 4
        data[offset] = 255
        data[offset + 1] = 255
        data[offset + 2] = 255
      }
    }
  }
  const equirect = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType)
  equirect.mapping = EquirectangularReflectionMapping
  equirect.colorSpace = SRGBColorSpace
  equirect.needsUpdate = true
  const generator = new PMREMGenerator(renderer)
  const target = generator.fromEquirectangular(equirect)
  generator.dispose()
  equirect.dispose()
  return target.texture
}

/** The dash pattern of the cyan field border. */
export function dashTexture(): DataTexture {
  const width = 128
  const height = 8
  const data = new Uint8Array(width * height * 4)
  for (let x = 0; x < width; x += 1) {
    const inDash = x >= 2 && (x - 2) % 32 < 26
    for (let y = 0; y < height; y += 1) {
      const offset = (y * width + x) * 4
      const fade = Math.max(0, 1 - Math.abs(y - 3.5) / 4.5)
      data[offset] = 255
      data[offset + 1] = 255
      data[offset + 2] = 255
      data[offset + 3] = inDash ? Math.round(fade * 255) : 0
    }
  }
  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType)
  texture.wrapS = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

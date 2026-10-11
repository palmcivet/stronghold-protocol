import {
  AdditiveBlending,
  AlwaysStencilFunc,
  type Blending,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  DoubleSide,
  DstColorFactor,
  DynamicDrawUsage,
  EqualStencilFunc,
  InvertStencilOp,
  KeepStencilOp,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  OneMinusSrcColorFactor,
  type Texture,
} from 'three';

/** Slot blend modes, in the order of the Spine binary format. */
export const SKELETON_BLEND_MODES = [
  'normal',
  'additive',
  'multiply',
  'screen',
] as const;

export type SkeletonBlendMode = (typeof SKELETON_BLEND_MODES)[number];

/** One textured triangle list ready to be appended. Positions are 2D, colours are RGBA 0..1. */
export interface SkeletonBatchPart {
  readonly page: Texture;
  readonly premultipliedAlpha: boolean;
  readonly blend: SkeletonBlendMode;
  readonly positions: ArrayLike<number>;
  /** Texture coordinates with v down the atlas page. */
  readonly uvs: ArrayLike<number>;
  readonly vertexCount: number;
  readonly triangles: ArrayLike<number>;
  readonly color: readonly [number, number, number, number];
}

export interface SkeletonMesh {
  readonly mesh: Mesh;
  /** Starts a new frame of parts. */
  begin(): void;
  append(part: SkeletonBatchPart): void;
  /**
   * Starts clipping the parts appended after it to a polygon (2D positions). The polygon is drawn into the stencil
   * buffer, so the renderer needs one; any polygon works, convex or not.
   */
  beginClip(polygon: ArrayLike<number>, vertexCount: number): void;
  /** Ends the clipping started by `beginClip`. */
  endClip(): void;
  /** Whether a clipping is open. */
  readonly clipping: boolean;
  /** Vertices and indices written by the last `end`; the attributes keep spare capacity past them. */
  readonly vertexCount: number;
  readonly indexCount: number;
  /** Uploads the parts appended since `begin`. */
  end(): void;
  /** Smallest box around the drawn positions: x, y, width, height. */
  bounds(): {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  setOpacity(opacity: number): void;
  dispose(): void;
}

function blendingOf(blend: SkeletonBlendMode): {
  readonly blending: Blending;
  readonly custom?: readonly [number, number];
} {
  switch (blend) {
    case 'normal':
      return { blending: NormalBlending };
    case 'additive':
      return { blending: AdditiveBlending };
    case 'multiply':
      return {
        blending: CustomBlending,
        custom: [DstColorFactor, OneMinusSrcAlphaFactor],
      };
    case 'screen':
      return {
        blending: CustomBlending,
        custom: [OneFactor, OneMinusSrcColorFactor],
      };
  }
}

/** A growable typed array that keeps its storage across frames. */
class Float32Buffer {
  data = new Float32Array(256);
  length = 0;
  reserve(extra: number): void {
    if (this.length + extra <= this.data.length) {
      return;
    }
    let size = this.data.length;
    while (size < this.length + extra) {
      size *= 2;
    }
    const next = new Float32Array(size);
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }
}

/**
 * One buffer geometry per skeleton: every frame the attachments' world vertices are written into it in draw order and
 * drawn in groups that share an atlas page and a blend mode.
 */
export function createSkeletonMesh(): SkeletonMesh {
  const geometry = new BufferGeometry();
  const materials: MeshBasicMaterial[] = [];
  const materialKeys = new Map<string, number>();
  const mesh = new Mesh(geometry, materials);
  mesh.frustumCulled = false;
  const position = new Float32Buffer();
  const uv = new Float32Buffer();
  const color = new Float32Buffer();
  let index = new Uint32Array(512);
  let indexLength = 0;
  let vertexCount = 0;
  let opacity = 1;
  let groupMaterial = -1;
  let groupStart = 0;
  let bounds = { x: 0, y: 0, width: 0, height: 0 };
  let clipPolygon: Float32Array | null = null;
  let writtenVertices = 0;
  let writtenIndices = 0;

  /**
   * Points the attribute at the buffer's storage and uploads the written part. A new attribute is made only when the
   * storage has grown since the last frame.
   */
  const bind = (
    name: string,
    data: Float32Array,
    itemSize: number,
    used: number,
  ): void => {
    let attribute = geometry.getAttribute(name) as BufferAttribute | undefined;
    if (attribute?.array !== data) {
      attribute = new BufferAttribute(data, itemSize).setUsage(
        DynamicDrawUsage,
      );
      geometry.setAttribute(name, attribute);
    } else {
      attribute.needsUpdate = true;
    }
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, used);
  };
  let clipCount = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  /** Flips the stencil bit inside the polygon: once to open a clipping, once more to close it. */
  const stencilMaterialIndex = (): number => {
    const known = materialKeys.get('stencil');
    if (known !== undefined) {
      return known;
    }
    const material = new MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      depthTest: false,
      transparent: true,
      side: DoubleSide,
    });
    material.stencilWrite = true;
    material.stencilFunc = AlwaysStencilFunc;
    material.stencilRef = 1;
    material.stencilWriteMask = 1;
    material.stencilFail = KeepStencilOp;
    material.stencilZFail = InvertStencilOp;
    material.stencilZPass = InvertStencilOp;
    materials.push(material);
    materialKeys.set('stencil', materials.length - 1);
    return materials.length - 1;
  };

  const writeStencil = (polygon: ArrayLike<number>, count: number): void => {
    if (count < 3) {
      return;
    }
    const fan: number[] = [];
    for (let corner = 1; corner < count - 1; corner += 1) {
      fan.push(0, corner, corner + 1);
    }
    appendTriangles(
      stencilMaterialIndex(),
      polygon,
      null,
      count,
      fan,
      [1, 1, 1, 1],
      false,
      false,
    );
  };

  const materialFor = (part: SkeletonBatchPart): number => {
    const clipped = clipPolygon !== null;
    const key = `${part.page.uuid}:${part.blend}:${part.premultipliedAlpha}:${clipped}`;
    const known = materialKeys.get(key);
    if (known !== undefined) {
      return known;
    }
    const { blending, custom } = blendingOf(part.blend);
    const material = new MeshBasicMaterial({
      map: part.page,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending,
      premultipliedAlpha: part.premultipliedAlpha,
      opacity,
    });
    if (custom) {
      material.blendSrc = custom[0] as typeof material.blendSrc;
      material.blendDst = custom[1] as typeof material.blendDst;
    }
    if (clipped) {
      material.stencilWrite = true;
      material.stencilFunc = EqualStencilFunc;
      material.stencilRef = 1;
      material.stencilFuncMask = 1;
      material.stencilWriteMask = 0;
      material.stencilFail = KeepStencilOp;
      material.stencilZFail = KeepStencilOp;
      material.stencilZPass = KeepStencilOp;
    }
    materials.push(material);
    materialKeys.set(key, materials.length - 1);
    return materials.length - 1;
  };

  const closeGroup = (): void => {
    if (groupMaterial >= 0 && indexLength > groupStart) {
      geometry.addGroup(groupStart, indexLength - groupStart, groupMaterial);
    }
    groupStart = indexLength;
  };

  const appendTriangles = (
    material: number,
    positions: ArrayLike<number>,
    uvs: ArrayLike<number> | null,
    count: number,
    triangles: ArrayLike<number>,
    rgba: readonly [number, number, number, number],
    premultipliedAlpha: boolean,
    measured: boolean,
  ): void => {
    if (material !== groupMaterial) {
      closeGroup();
      groupMaterial = material;
    }
    position.reserve(count * 3);
    uv.reserve(count * 2);
    color.reserve(count * 4);
    const [r, g, b, a] = rgba;
    const alpha = premultipliedAlpha ? a : 1;
    for (let vertex = 0; vertex < count; vertex += 1) {
      const x = positions[vertex * 2] ?? 0;
      const y = positions[vertex * 2 + 1] ?? 0;
      position.data[position.length++] = x;
      position.data[position.length++] = y;
      position.data[position.length++] = 0;
      uv.data[uv.length++] = uvs?.[vertex * 2] ?? 0;
      uv.data[uv.length++] = 1 - (uvs?.[vertex * 2 + 1] ?? 0);
      color.data[color.length++] = r * alpha;
      color.data[color.length++] = g * alpha;
      color.data[color.length++] = b * alpha;
      color.data[color.length++] = a;
      if (!measured) {
        continue;
      }
      if (x < minX) {
        minX = x;
      }
      if (y < minY) {
        minY = y;
      }
      if (x > maxX) {
        maxX = x;
      }
      if (y > maxY) {
        maxY = y;
      }
    }
    if (indexLength + triangles.length > index.length) {
      let size = index.length;
      while (size < indexLength + triangles.length) {
        size *= 2;
      }
      const next = new Uint32Array(size);
      next.set(index.subarray(0, indexLength));
      index = next;
    }
    for (let corner = 0; corner < triangles.length; corner += 1) {
      index[indexLength++] = vertexCount + (triangles[corner] ?? 0);
    }
    vertexCount += count;
  };

  return {
    mesh,
    begin() {
      position.length = 0;
      uv.length = 0;
      color.length = 0;
      indexLength = 0;
      vertexCount = 0;
      groupMaterial = -1;
      groupStart = 0;
      geometry.clearGroups();
      clipPolygon = null;
      minX = Infinity;
      minY = Infinity;
      maxX = -Infinity;
      maxY = -Infinity;
    },
    append(part) {
      if (part.vertexCount === 0 || part.triangles.length === 0) {
        return;
      }
      appendTriangles(
        materialFor(part),
        part.positions,
        part.uvs,
        part.vertexCount,
        part.triangles,
        part.color,
        part.premultipliedAlpha,
        true,
      );
    },
    beginClip(polygon, count) {
      if (clipPolygon) {
        this.endClip();
      }
      clipPolygon = Float32Array.from(
        { length: count * 2 },
        (_, index) => polygon[index] ?? 0,
      );
      clipCount = count;
      writeStencil(clipPolygon, clipCount);
    },
    endClip() {
      if (!clipPolygon) {
        return;
      }
      const polygon = clipPolygon;
      clipPolygon = null;
      writeStencil(polygon, clipCount);
    },
    get clipping() {
      return clipPolygon !== null;
    },
    end() {
      this.endClip();
      closeGroup();
      bind('position', position.data, 3, position.length);
      bind('uv', uv.data, 2, uv.length);
      bind('color', color.data, 4, color.length);
      let indexAttribute = geometry.getIndex();
      if (indexAttribute?.array !== index) {
        indexAttribute = new BufferAttribute(index, 1).setUsage(
          DynamicDrawUsage,
        );
        geometry.setIndex(indexAttribute);
      } else {
        indexAttribute.needsUpdate = true;
      }
      indexAttribute.clearUpdateRanges();
      indexAttribute.addUpdateRange(0, indexLength);
      geometry.setDrawRange(0, indexLength);
      writtenVertices = vertexCount;
      writtenIndices = indexLength;
      bounds =
        vertexCount > 0
          ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
          : { x: 0, y: 0, width: 0, height: 0 };
    },
    get vertexCount() {
      return writtenVertices;
    },
    get indexCount() {
      return writtenIndices;
    },
    bounds: () => bounds,
    setOpacity(next) {
      opacity = next;
      for (const material of materials) {
        material.opacity = next;
      }
    },
    dispose() {
      geometry.dispose();
      for (const material of materials) {
        material.dispose();
      }
    },
  };
}

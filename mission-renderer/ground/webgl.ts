/** The canvas events the terrain listens to for WebGL context loss and restoration. */
export interface WebGLSurface {
  getContext(kind: 'webgl' | 'webgl2'): unknown;
  addEventListener(
    type: 'webglcontextlost' | 'webglcontextrestored',
    listener: (event: WebGLContextEvent) => void,
  ): void;
  removeEventListener(
    type: 'webglcontextlost' | 'webglcontextrestored',
    listener: (event: WebGLContextEvent) => void,
  ): void;
}

export interface WebGLContextEvent {
  preventDefault(): void;
}

/** The parts of `document` the WebGL check needs. */
export interface WebGLProbeDocument {
  createElement(tag: 'canvas'): {
    getContext(
      kind: 'webgl2',
      attributes?: { readonly failIfMajorPerformanceCaveat?: boolean },
    ): {
      getExtension(name: 'WEBGL_lose_context'): { loseContext(): void } | null;
    } | null;
  };
}

/**
 * Whether the browser can draw the ground: WebGL2, which Three needs. A software or blocklisted GPU counts as
 * unavailable unless `allowSlow`. False without a document.
 */
export function webgl2Available(
  allowSlow = false,
  doc: WebGLProbeDocument | undefined = (
    globalThis as { document?: WebGLProbeDocument }
  ).document,
): boolean {
  if (!doc) {
    return false;
  }
  try {
    const gl = doc
      .createElement('canvas')
      .getContext(
        'webgl2',
        allowSlow ? {} : { failIfMajorPerformanceCaveat: true },
      );
    if (!gl) {
      return false;
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

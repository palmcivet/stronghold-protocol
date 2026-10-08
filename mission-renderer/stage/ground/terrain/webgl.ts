/** The canvas events the terrain listens to for WebGL context loss and restoration. */
export interface WebGLSurface {
  getContext(kind: "webgl" | "webgl2"): unknown
  addEventListener(
    type: "webglcontextlost" | "webglcontextrestored",
    listener: (event: WebGLContextEvent) => void,
  ): void
  removeEventListener(
    type: "webglcontextlost" | "webglcontextrestored",
    listener: (event: WebGLContextEvent) => void,
  ): void
}

export interface WebGLContextEvent {
  preventDefault(): void
}

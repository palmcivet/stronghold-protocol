export type MissionPointerHit =
  | { readonly type: "unit"; readonly unitId: string }
  | { readonly type: "tile"; readonly x: number; readonly y: number }
  | { readonly type: "empty" }

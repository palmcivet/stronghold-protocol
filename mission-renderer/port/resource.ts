import type { AssetRef, ResourceResolver } from "arknights-assets-catalog"

export type RendererAssetKind = "image" | "spine" | "model"

export interface RendererResourcePort<TImage = unknown, TSpine = unknown, TModel = unknown> {
  url(ref: AssetRef): string
  image(ref: AssetRef): Promise<TImage>
  spine(ref: AssetRef): Promise<TSpine>
  model(ref: AssetRef): Promise<TModel>
  release(ref: AssetRef, kind?: RendererAssetKind): void
}

export interface RendererResourceLoaders<TImage = unknown, TSpine = unknown, TModel = unknown> {
  readonly resolver: ResourceResolver
  readonly origin?: string
  readonly image: (url: string, ref: AssetRef) => Promise<TImage>
  readonly spine: (url: string, ref: AssetRef) => Promise<TSpine>
  readonly model?: (url: string, ref: AssetRef) => Promise<TModel>
}

interface CachedAsset<T> {
  readonly promise: Promise<T>
  references: number
}

export function createRendererResourcePort<TImage = unknown, TSpine = unknown, TModel = unknown>(
  options: RendererResourceLoaders<TImage, TSpine, TModel>,
): RendererResourcePort<TImage, TSpine, TModel> & { clear(): void } {
  const assets: Record<RendererAssetKind, Map<string, CachedAsset<unknown>>> = {
    image: new Map(),
    spine: new Map(),
    model: new Map(),
  }
  const urlOf = (ref: AssetRef): string => options.resolver.url(ref, options.origin)
  const load = <T>(kind: RendererAssetKind, ref: AssetRef, create: () => Promise<T>): Promise<T> => {
    const cache = assets[kind]
    const existing = cache.get(ref.id)
    if (existing) {
      existing.references += 1
      return existing.promise as Promise<T>
    }
    const value = { promise: create(), references: 1 }
    cache.set(ref.id, value)
    return value.promise
  }

  return {
    url: urlOf,
    image: (ref) => load("image", ref, () => options.image(urlOf(ref), ref)),
    spine: (ref) => load("spine", ref, () => options.spine(urlOf(ref), ref)),
    model(ref) {
      if (!options.model) return Promise.reject(new Error("renderer model loader is not configured"))
      return load("model", ref, () => options.model!(urlOf(ref), ref))
    },
    release(ref, kind = "spine") {
      const value = assets[kind].get(ref.id)
      if (!value) return
      value.references -= 1
      if (value.references <= 0) assets[kind].delete(ref.id)
    },
    clear() {
      assets.image.clear()
      assets.spine.clear()
      assets.model.clear()
    },
  }
}

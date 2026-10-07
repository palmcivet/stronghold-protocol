import type { AssetRef, ResourceResolver } from "arknights-assets-catalog"

export interface RendererResourcePort<TImage = unknown, TSpine = unknown> {
  url(ref: AssetRef): string
  image(ref: AssetRef): Promise<TImage>
  spine(ref: AssetRef): Promise<TSpine>
  release(ref: AssetRef): void
}

export interface RendererResourceLoaders<TImage = unknown, TSpine = unknown> {
  readonly resolver: ResourceResolver
  readonly origin?: string
  readonly image: (url: string, ref: AssetRef) => Promise<TImage>
  readonly spine: (url: string, ref: AssetRef) => Promise<TSpine>
}

interface CachedSpine<T> {
  readonly promise: Promise<T>
  references: number
}

export function createRendererResourcePort<TImage = unknown, TSpine = unknown>(
  options: RendererResourceLoaders<TImage, TSpine>,
): RendererResourcePort<TImage, TSpine> & { clear(): void } {
  const images = new Map<string, Promise<TImage>>()
  const spines = new Map<string, CachedSpine<TSpine>>()
  const keyOf = (ref: AssetRef): string => ref.id
  const urlOf = (ref: AssetRef): string => options.resolver.url(ref, options.origin)

  return {
    url: urlOf,
    image(ref) {
      const key = keyOf(ref)
      const existing = images.get(key)
      if (existing) return existing
      const promise = options.image(urlOf(ref), ref)
      images.set(key, promise)
      return promise
    },
    spine(ref) {
      const key = keyOf(ref)
      const existing = spines.get(key)
      if (existing) {
        existing.references += 1
        return existing.promise
      }
      const value = { promise: options.spine(urlOf(ref), ref), references: 1 }
      spines.set(key, value)
      return value.promise
    },
    release(ref) {
      const key = keyOf(ref)
      const value = spines.get(key)
      if (!value) return
      value.references -= 1
      if (value.references <= 0) spines.delete(key)
    },
    clear() {
      images.clear()
      spines.clear()
    },
  }
}

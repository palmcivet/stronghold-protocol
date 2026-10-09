import { fileAddress, type AssetKey, type PackManifest } from "arknights-assets-catalog"

const CSS_FORMATS: Readonly<Record<string, string>> = Object.freeze({
  woff2: "woff2",
  woff: "woff",
  otf: "opentype",
  ttf: "truetype",
})

/**
 * `@font-face` rules for the font keys of a base pack. The family name is the key path with `-` for `/`,
 * so `font:bender/regular` is `bender-regular`. Sources come in file order: WOFF2 first, the original after it.
 */
export function fontsCss(manifest: PackManifest): string {
  const rules = (Object.keys(manifest.assets) as AssetKey[])
    .filter((key) => key.startsWith("font:"))
    .sort()
    .map((key) => {
      const asset = manifest.assets[key]
      if (!asset) throw new Error(`${key} has no asset`)
      const family = key.slice("font:".length).split("/").join("-")
      const sources = asset.files.map((file) => {
        const format = CSS_FORMATS[file.format]
        if (!format) throw new Error(`${key} has a font file format ${file.format} that CSS does not name`)
        return `url("${manifest.fileRoot}${fileAddress(key, { name: file.name, format: file.format })}?v=${file.hash.slice(0, 12)}") format("${format}")`
      })
      return `@font-face {\n  font-family: "${family}";\n  src: ${sources.join(",\n    ")};\n  font-display: swap;\n}\n`
    })
  return rules.join("\n")
}

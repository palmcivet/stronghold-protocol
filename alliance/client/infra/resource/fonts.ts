import type { AssetLayer } from 'arknights-assets-catalog';

function layerHasFont(layer: AssetLayer): boolean {
  return Object.keys(layer.manifest.assets).some((key) =>
    key.startsWith('font:'),
  );
}

/**
 * Stylesheet URLs for packs that publish `font:*`.
 * A next base pack serves `fonts.css` beside its manifest.
 * A master backend (`compatRoot`, absolute, ending in `/`) serves `fonts/fonts.css`.
 */
export function fontStylesheetHrefs(
  layers: readonly AssetLayer[],
  compatRoot?: string,
): readonly string[] {
  if (!layers.some(layerHasFont)) {
    return [];
  }
  const hrefs: string[] = [];
  for (const layer of layers) {
    if (!layerHasFont(layer)) {
      continue;
    }
    const url = String(layer.url);
    if (url.endsWith('manifest.json')) {
      hrefs.push(`${url.slice(0, -'manifest.json'.length)}fonts.css`);
    }
  }
  if (compatRoot) {
    hrefs.push(new URL('fonts/fonts.css', compatRoot).toString());
  }
  return [...new Set(hrefs)];
}

/** Inserts each stylesheet once. A failed load removes the tag. */
export function installFontStyles(
  hrefs: readonly string[],
  target: Document = document,
): void {
  const present = new Set(
    [...target.querySelectorAll('link[data-wsde-fonts]')].map((node) =>
      node.getAttribute('href'),
    ),
  );
  for (const href of hrefs) {
    if (present.has(href)) {
      continue;
    }
    const link = target.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.wsdeFonts = href;
    link.addEventListener('error', () => {
      link.remove();
    });
    target.head.append(link);
  }
}

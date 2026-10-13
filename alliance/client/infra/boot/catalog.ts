import {
  buildUpstreamCatalog,
  UPSTREAM_CATALOG_TABLES,
  type UpstreamCatalogInput,
} from '@alliance/compat-upstream';
import { catalogStore } from '../store/catalog.js';
import { setDataText } from '../text/index.js';

/** Reads the catalog of a master backend from its `/data/`. A table that fails to load stays empty. */
export async function loadCompatCatalog(
  fetcher: typeof globalThis.fetch = (input, init) =>
    globalThis.fetch(input, init),
): Promise<void> {
  const entries = await Promise.all(
    UPSTREAM_CATALOG_TABLES.map(async (table) => {
      try {
        const response = await fetcher(`/data/${table}.json`);
        return [table, response.ok ? await response.json() : null] as const;
      } catch {
        return [table, null] as const;
      }
    }),
  );
  const { catalog, text } = buildUpstreamCatalog(
    Object.fromEntries(entries) as UpstreamCatalogInput,
  );
  catalogStore.setState({ catalog, loaded: true });
  setDataText(text);
}

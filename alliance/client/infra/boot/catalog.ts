import {
  buildUpstreamCatalog,
  combatDefsOf,
  type StageMap,
  stageMapOf,
  UPSTREAM_CATALOG_TABLES,
  type UpstreamCatalogInput,
} from '@alliance/compat-upstream';
import { catalogStore } from '#infra/store/catalog.js';
import { combatDefsStore } from '#infra/store/combat-defs.js';
import { applyMatchRules } from '#infra/store/match-rules.js';
import { stageMapStore } from '#infra/store/stage-map.js';
import { setDataText } from '#infra/text/index.js';

/** The board of every stage record in master's `stages.json`. */
function stageMapsOf(stages: unknown): Record<string, StageMap> {
  if (stages === null || typeof stages !== 'object') {
    return {};
  }
  return Object.fromEntries(
    Object.entries(stages).flatMap(([id, stage]) => {
      const map = stageMapOf(stage);
      return map ? [[id, map]] : [];
    }),
  );
}

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
  const tables = Object.fromEntries(entries) as UpstreamCatalogInput &
    Record<string, unknown>;
  const { catalog, text } = buildUpstreamCatalog(tables);
  catalogStore.setState({ catalog, loaded: true });
  stageMapStore.setState({
    maps: stageMapsOf(tables.stages),
  });
  combatDefsStore.setState({
    defs: combatDefsOf(tables.chess, tables.enemies),
  });
  applyMatchRules(tables.config);
  setDataText(text);
}

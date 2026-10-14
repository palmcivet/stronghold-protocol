import { useMemo } from 'react';
import { useStore } from 'zustand';
import { useCatalog } from '#infra/store/hook.js';
import { dataName, useText } from '#infra/text/index.js';
import {
  ChoiceGroup,
  Cluster,
  EmptyState,
  GridList,
  Muted,
  SearchField,
  Stack,
  Switch,
  TierChip,
} from '#ui/index.js';
import { LoadoutChoices } from './choices.js';
import { loadoutStore } from './state.js';
import { SyncStatus, TakesEffect } from './sync-status.js';

/** The roster of the loadout: visible base chess, in tier order. */
export function useAdjustable() {
  const catalog = useCatalog((state) => state.catalog);
  return useMemo(
    () =>
      Object.values(catalog.chess)
        .filter(
          (chess) =>
            chess.visible &&
            !chess.golden &&
            chess.loadout !== null &&
            chess.baseId === chess.id,
        )
        .sort(
          (left, right) =>
            left.tier - right.tier || (left.id < right.id ? -1 : 1),
        ),
    [catalog],
  );
}

/** The operators whose loadout can change, with tier, search and changed-only filters. */
export function LoadoutRoster() {
  const t = useText();
  const operators = useAdjustable();
  const { selected, query, tier, changedOnly, entries, ops } =
    useStore(loadoutStore);
  const isChanged = (chess: (typeof operators)[number]): boolean =>
    entries[chess.id] !== undefined ||
    (chess.charId !== null && ops[chess.charId] !== undefined);
  const tiers = [...new Set(operators.map((chess) => chess.tier))];
  const shown = operators.filter((chess) => {
    if (tier !== null && chess.tier !== tier) {
      return false;
    }
    if (changedOnly && !isChanged(chess)) {
      return false;
    }
    return query === '' || dataName('chess', chess.id).includes(query.trim());
  });
  return (
    <Stack gap={3}>
      <Cluster gap={2}>
        <SearchField
          label={t('core:loadout.search')}
          value={query}
          onChange={(next) => loadoutStore.setState({ query: next })}
          clearLabel={t('core:loadout.searchClear')}
        />
        <ChoiceGroup
          label={t('core:loadout.tier')}
          value={tier === null ? 'all' : String(tier)}
          onChange={(value) =>
            loadoutStore.setState({
              tier: value === 'all' ? null : Number(value),
            })
          }
          options={[
            { value: 'all', label: t('core:loadout.tierAll') },
            ...tiers.map((value) => ({
              value: String(value),
              label: String(value),
            })),
          ]}
        />
        <Switch
          isSelected={changedOnly}
          onChange={(next) => loadoutStore.setState({ changedOnly: next })}
        >
          {t('core:loadout.changedOnly')}
        </Switch>
      </Cluster>
      {shown.length === 0 ? (
        <EmptyState title={t('core:loadout.empty')} />
      ) : (
        <GridList
          label={t('core:loadout.heading')}
          selected={selected}
          onSelect={(id) => loadoutStore.setState({ selected: id })}
          items={shown.map((chess) => ({
            id: chess.id,
            label: dataName('chess', chess.id),
            content: (
              <Cluster gap={2}>
                <TierChip tier={chess.tier} />
                <span>{dataName('chess', chess.id)}</span>
                {isChanged(chess) ? (
                  <Muted>{t('core:loadout.changed')}</Muted>
                ) : null}
              </Cluster>
            ),
          }))}
        />
      )}
    </Stack>
  );
}

/** Skill, module, potential and cultivation of the selected operator. */
export function LoadoutDetail() {
  const t = useText();
  const catalog = useCatalog((state) => state.catalog);
  const selected = useStore(loadoutStore, (state) => state.selected);
  const chess = selected === null ? undefined : catalog.chess[selected];
  return (
    <Stack gap={3}>
      {chess?.loadout ? (
        <Stack gap={3}>
          <Cluster gap={2}>
            <TierChip tier={chess.tier} />
            <strong>{dataName('chess', chess.id)}</strong>
          </Cluster>
          <LoadoutChoices chess={chess} />
        </Stack>
      ) : (
        <EmptyState title={t('core:loadout.pick')} />
      )}
      <Cluster gap={2}>
        <SyncStatus kind="loadout" />
        <TakesEffect kind="loadout" />
      </Cluster>
    </Stack>
  );
}

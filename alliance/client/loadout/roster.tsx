import { MODULE_NONE } from '@alliance/contract/message.js';
import { useMemo } from 'react';
import { useStore } from 'zustand';
import { useIntent } from '../infra/intent/context.js';
import { useCatalog } from '../infra/store/hook.js';
import { dataName, useText } from '../infra/text/index.js';
import {
  Button,
  ChoiceGroup,
  Cluster,
  EmptyState,
  GridList,
  Muted,
  SearchField,
  Stack,
  Switch,
  TierChip,
} from '../ui/index.js';
import { chooseLoadout, loadoutStore } from './state.js';

function useAdjustable() {
  const catalog = useCatalog((state) => state.catalog);
  return useMemo(
    () =>
      Object.values(catalog.chess)
        .filter(
          (chess) =>
            chess.visible &&
            !chess.golden &&
            chess.loadout !== null &&
            (chess.loadout.skills.length > 1 ||
              chess.loadout.modules.length > 1),
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
  const { selected, query, tier, changedOnly, entries } =
    useStore(loadoutStore);
  const tiers = [...new Set(operators.map((chess) => chess.tier))];
  const shown = operators.filter((chess) => {
    if (tier !== null && chess.tier !== tier) {
      return false;
    }
    if (changedOnly && entries[chess.id] === undefined) {
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
                {entries[chess.id] ? (
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

/** Skill and module of the selected operator, and saving the working copy. */
export function LoadoutDetail() {
  const t = useText();
  const intents = useIntent();
  const catalog = useCatalog((state) => state.catalog);
  const { selected, entries, saved } = useStore(loadoutStore);
  const chess = selected === null ? undefined : catalog.chess[selected];
  const options = chess?.loadout ?? null;
  const entry = selected === null ? undefined : entries[selected];
  return (
    <Stack gap={3}>
      {chess && options ? (
        <Stack gap={3}>
          <Cluster gap={2}>
            <TierChip tier={chess.tier} />
            <strong>{dataName('chess', chess.id)}</strong>
          </Cluster>
          {options.skills.length > 1 ? (
            <ChoiceGroup
              label={t('core:loadout.skills')}
              value={String(entry?.skill ?? options.defaultSkill ?? '')}
              onChange={(value) =>
                chooseLoadout(chess.id, { skill: Number(value) })
              }
              options={options.skills.map((index) => ({
                value: String(index),
                label: t('core:loadout.skill', { index: index + 1 }),
              }))}
            />
          ) : null}
          {options.modules.length > 1 ? (
            <ChoiceGroup
              label={t('core:loadout.module')}
              value={entry?.module ?? options.defaultModule ?? MODULE_NONE}
              onChange={(value) => chooseLoadout(chess.id, { module: value })}
              options={options.modules.map((module) => ({
                value: module,
                label:
                  module === MODULE_NONE
                    ? t('core:loadout.moduleNone')
                    : module,
              }))}
            />
          ) : null}
        </Stack>
      ) : (
        <EmptyState title={t('core:loadout.pick')} />
      )}
      <Cluster gap={2}>
        <Button
          variant="primary"
          isDisabled={Object.keys(entries).length === 0}
          onPress={async () => {
            const outcome = await intents.dispatch({
              type: 'room.loadout',
              fields: { entries },
            });
            loadoutStore.setState({ saved: outcome.ok });
          }}
        >
          {t('core:loadout.save')}
        </Button>
        {saved ? <span role="status">{t('core:loadout.saved')}</span> : null}
      </Cluster>
    </Stack>
  );
}

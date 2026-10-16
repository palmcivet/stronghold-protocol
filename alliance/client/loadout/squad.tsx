import type { CatalogDiySlot } from '@alliance/contract/catalog.js';
import type { DiyPick } from '@alliance/contract/message.js';
import {
  Button,
  Cluster,
  ListBox,
  Notice,
  Select,
  Stack,
  Text,
} from '@alliance/ui';
import { useMemo } from 'react';
import { useStore } from 'zustand';
import { useCatalog } from '#infra/store/hook.js';
import {
  dataName,
  has,
  lookup,
  shownName,
  useText,
} from '#infra/text/index.js';
import { ChessThumb } from '#part/art.js';
import { loadoutStore } from './state.js';
import { SyncStatus, TakesEffect } from './sync-status.js';

const EMPTY = '';

/** The pick a newly chosen operator starts with, as master's `defaultPick`: a prototype's is locked (the server completes it), an owned one takes its last skill and first module. */
export function defaultPick(slot: CatalogDiySlot, charId: string): DiyPick {
  const choice = slot.choices?.[charId];
  if (!choice || choice.locked) {
    return { charId };
  }
  return {
    charId,
    skillIndex: choice.skills.at(-1) ?? 0,
    uniEquipId: choice.modules[0] ?? null,
  };
}

function setPick(slotId: string, pick: DiyPick | null): void {
  loadoutStore.setState((state) => {
    const next = { ...state.diy };
    if (pick) {
      next[slotId] = pick;
    } else {
      delete next[slotId];
    }
    return { diy: next };
  });
}

const NO_MODULE = 'none';

/** An owned pick's skill and module (master's protocol fields `skillIndex` and `uniEquipId`); a prototype's are locked. */
function PickChoices({
  slot,
  pick,
}: {
  readonly slot: CatalogDiySlot;
  readonly pick: DiyPick;
}) {
  const t = useText();
  const choice = slot.choices?.[pick.charId];
  if (!choice) {
    return null;
  }
  if (choice.locked) {
    return <Text kind="muted">{t('core:diy.locked')}</Text>;
  }
  return (
    <Cluster gap={2}>
      {choice.skills.length > 0 ? (
        <Select
          label={t('core:loadout.skills')}
          value={String(pick.skillIndex ?? choice.skills.at(-1) ?? 0)}
          onChange={(value) =>
            setPick(slot.id, { ...pick, skillIndex: Number(value) })
          }
          options={choice.skills.map((index) => ({
            value: String(index),
            label: t('core:loadout.skill', { index: index + 1 }),
          }))}
        />
      ) : null}
      {choice.modules.length > 0 ? (
        <Select
          label={t('core:loadout.module')}
          value={pick.uniEquipId ?? NO_MODULE}
          onChange={(value) =>
            setPick(slot.id, {
              ...pick,
              uniEquipId: value === NO_MODULE ? null : value,
            })
          }
          options={[
            { value: NO_MODULE, label: t('core:loadout.moduleNone') },
            ...choice.modules.map((id) => ({
              value: id,
              label: has(`data:module.${id}.name`)
                ? lookup(`data:module.${id}.name`)
                : id,
            })),
          ]}
        />
      ) : null}
    </Cluster>
  );
}

/** Operator ownership: the droppable chess by tier; one not owned is fielded by its stand-in. */
export function Ownership() {
  const t = useText();
  const catalog = useCatalog((state) => state.catalog);
  const notOwned = useStore(loadoutStore, (state) => state.notOwned);
  const tiers = useMemo(() => {
    const byTier = new Map<number, string[]>();
    for (const chess of Object.values(catalog.chess)) {
      if (chess.droppable) {
        byTier.set(chess.tier, [...(byTier.get(chess.tier) ?? []), chess.id]);
      }
    }
    return [...byTier.entries()].sort((left, right) => left[0] - right[0]);
  }, [catalog]);
  if (tiers.length === 0) {
    return <Notice title={t('core:ownership.empty')} />;
  }
  const all = tiers.flatMap(([, ids]) => ids);
  const owned = all.filter((id) => !notOwned.includes(id));
  const setOwned = (ids: readonly string[], group: readonly string[]): void => {
    loadoutStore.setState((state) => ({
      notOwned: [
        ...state.notOwned.filter((id) => !group.includes(id)),
        ...group.filter((id) => !ids.includes(id)),
      ].sort(),
    }));
  };
  return (
    <Stack gap={3}>
      <Text kind="muted">{t('core:ownership.hint')}</Text>
      {tiers.map(([tier, ids]) => (
        <Stack key={tier} gap={1}>
          <strong>{t('core:ownership.tier', { tier })}</strong>
          <ListBox
            label={t('core:ownership.tier', { tier })}
            multiple
            selected={owned.filter((id) => ids.includes(id))}
            onSelect={(selected) => setOwned(selected, ids)}
            items={ids.map((id) => ({
              id,
              label: dataName('chess', id),
              content: (
                <Cluster gap={2}>
                  <ChessThumb chessId={id} size="sm" />
                  <span>{dataName('chess', id)}</span>
                </Cluster>
              ),
            }))}
          />
        </Stack>
      ))}
      <Cluster gap={2}>
        <Button
          onPress={() => {
            loadoutStore.setState({ notOwned: [] });
          }}
        >
          {t('core:ownership.ownAll')}
        </Button>
        <SyncStatus kind="ownership" />
        <TakesEffect kind="ownership" />
      </Cluster>
    </Stack>
  );
}

/** The custom squad: one operator for each slot, from the slot's candidates. */
export function CustomSquad() {
  const t = useText();
  const slots = useCatalog((state) => state.catalog.diySlots ?? []);
  const diy = useStore(loadoutStore, (state) => state.diy);
  if (slots.length === 0) {
    return <Notice title={t('core:diy.empty')} />;
  }
  return (
    <Stack gap={3}>
      <Text kind="muted">{t('core:diy.hint')}</Text>
      {slots.map((slot, index) => (
        <Stack key={slot.id} gap={1}>
          <Select
            label={t('core:diy.slot', { index: index + 1, tier: slot.tier })}
            value={diy[slot.id]?.charId ?? EMPTY}
            onChange={(value) =>
              setPick(
                slot.id,
                value === EMPTY ? null : defaultPick(slot, value),
              )
            }
            options={[
              { value: EMPTY, label: t('core:diy.none') },
              ...slot.candidates.map((charId) => ({
                value: charId,
                label: shownName('operator', charId),
              })),
            ]}
          />
          {diy[slot.id] ? (
            <PickChoices slot={slot} pick={diy[slot.id] as DiyPick} />
          ) : null}
        </Stack>
      ))}
      <Cluster gap={2}>
        <SyncStatus kind="diy" />
        <TakesEffect kind="diy" />
      </Cluster>
    </Stack>
  );
}

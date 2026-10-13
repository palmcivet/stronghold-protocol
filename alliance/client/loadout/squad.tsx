import type { DiyPick } from '@alliance/contract/message.js';
import { useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { useIntent } from '../infra/intent/context.js';
import { useCatalog } from '../infra/store/hook.js';
import { dataName, shownName, useText } from '../infra/text/index.js';
import { ChessThumb } from '../part/art.js';
import {
  Button,
  Cluster,
  EmptyState,
  ListBox,
  Muted,
  Select,
  Stack,
} from '../ui/index.js';
import { loadoutStore } from './state.js';

const EMPTY = '';

/** Saves through the intent bus and says whether the server took it. */
function useSave() {
  const intents = useIntent();
  const [saved, setSaved] = useState<boolean | null>(null);
  const save = async (
    type: 'room.ownership' | 'room.diy',
    fields: Readonly<Record<string, unknown>>,
  ): Promise<void> => {
    const outcome = await intents.dispatch({ type, fields });
    setSaved(outcome.ok);
  };
  return { saved, save, reset: () => setSaved(null) };
}

function SaveState({ saved }: { readonly saved: boolean | null }) {
  const t = useText();
  if (saved === null) {
    return null;
  }
  return (
    <span role="status">
      {saved ? t('core:loadout.saved') : t('core:loadout.notSaved')}
    </span>
  );
}

/** Operator ownership: the droppable chess by tier; one not owned is fielded by its stand-in. */
export function Ownership() {
  const t = useText();
  const catalog = useCatalog((state) => state.catalog);
  const notOwned = useStore(loadoutStore, (state) => state.notOwned);
  const { saved, save, reset } = useSave();
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
    return <EmptyState title={t('core:ownership.empty')} />;
  }
  const all = tiers.flatMap(([, ids]) => ids);
  const owned = all.filter((id) => !notOwned.includes(id));
  const setOwned = (ids: readonly string[], group: readonly string[]): void => {
    reset();
    loadoutStore.setState((state) => ({
      notOwned: [
        ...state.notOwned.filter((id) => !group.includes(id)),
        ...group.filter((id) => !ids.includes(id)),
      ].sort(),
    }));
  };
  return (
    <Stack gap={3}>
      <Muted>{t('core:ownership.hint')}</Muted>
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
            reset();
            loadoutStore.setState({ notOwned: [] });
          }}
        >
          {t('core:ownership.ownAll')}
        </Button>
        <Button
          variant="primary"
          onPress={() => void save('room.ownership', { notOwned })}
        >
          {t('core:loadout.save')}
        </Button>
        <SaveState saved={saved} />
      </Cluster>
    </Stack>
  );
}

/** The custom squad: one operator for each slot, from the slot's candidates. */
export function CustomSquad() {
  const t = useText();
  const slots = useCatalog((state) => state.catalog.diySlots ?? []);
  const diy = useStore(loadoutStore, (state) => state.diy);
  const { saved, save, reset } = useSave();
  if (slots.length === 0) {
    return <EmptyState title={t('core:diy.empty')} />;
  }
  const picks: Record<string, DiyPick | null> = Object.fromEntries(
    slots.map((slot) => {
      const charId = diy[slot.id];
      return [slot.id, charId ? { charId } : null];
    }),
  );
  return (
    <Stack gap={3}>
      <Muted>{t('core:diy.hint')}</Muted>
      {slots.map((slot, index) => (
        <Select
          key={slot.id}
          label={t('core:diy.slot', { index: index + 1, tier: slot.tier })}
          value={diy[slot.id] ?? EMPTY}
          onChange={(value) => {
            reset();
            loadoutStore.setState((state) => {
              const next = { ...state.diy };
              if (value === EMPTY) {
                delete next[slot.id];
              } else {
                next[slot.id] = value;
              }
              return { diy: next };
            });
          }}
          options={[
            { value: EMPTY, label: t('core:diy.none') },
            ...slot.candidates.map((charId) => ({
              value: charId,
              label: shownName('operator', charId),
            })),
          ]}
        />
      ))}
      <Cluster gap={2}>
        <Button
          variant="primary"
          onPress={() => void save('room.diy', { picks })}
        >
          {t('core:loadout.save')}
        </Button>
        <SaveState saved={saved} />
      </Cluster>
    </Stack>
  );
}

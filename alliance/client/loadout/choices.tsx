import type { CatalogChess } from '@alliance/contract/catalog.js';
import {
  CULTIVATE_MAX,
  MODULE_NONE,
  POTENTIAL_MAX,
  POTENTIAL_MIN,
} from '@alliance/contract/message.js';
import { useStore } from 'zustand';
import { useCatalog } from '#infra/store/hook.js';
import { has, lookup, useText } from '#infra/text/index.js';
import { Button, ChoiceGroup, Muted, Stack } from '#ui/index.js';
import { effectiveChoice, opsOf } from './model.js';
import { chooseLoadout, chooseOps, loadoutStore, resetChess } from './state.js';

const POTENTIALS = Array.from(
  { length: POTENTIAL_MAX - POTENTIAL_MIN + 1 },
  (_, index) => POTENTIAL_MIN + index,
);
const TIERS = Array.from({ length: CULTIVATE_MAX + 1 }, (_, index) => index);

/** A text of the data, or nothing when the data has none. */
function dataText(key: `data:${string}`): string | null {
  return has(key) ? lookup(key) : null;
}

function skillName(chessId: string, index: number, fallback: string): string {
  return dataText(`data:chess.${chessId}.skill.${index}.name`) ?? fallback;
}

/** Master's skill picker: the skill names, the selected skill's charge and its normal and elite descriptions. */
function SkillPicker({
  chess,
  golden,
  skill,
}: {
  readonly chess: CatalogChess;
  readonly golden: CatalogChess | undefined;
  readonly skill: number | null;
}) {
  const t = useText();
  const options = chess.loadout;
  if (!options || options.skills.length === 0) {
    return null;
  }
  const info = chess.skills?.find((item) => item.index === skill);
  const spType =
    info?.spType && has(`core:loadout.sp.${info.spType}`)
      ? lookup(`core:loadout.sp.${info.spType}`)
      : null;
  const desc =
    skill === null
      ? null
      : dataText(`data:chess.${chess.id}.skill.${skill}.desc`);
  const eliteDesc =
    skill === null || !golden
      ? null
      : dataText(`data:chess.${golden.id}.skill.${skill}.desc`);
  return (
    <Stack gap={1}>
      {options.skills.length > 1 ? (
        <ChoiceGroup
          label={t('core:loadout.skills')}
          value={String(skill ?? '')}
          onChange={(value) => chooseLoadout(chess, { skill: Number(value) })}
          options={options.skills.map((index) => ({
            value: String(index),
            label: `${skillName(chess.id, index, t('core:loadout.skill', { index: index + 1 }))}${
              index === options.defaultSkill
                ? ` · ${t('core:loadout.default')}`
                : ''
            }`,
          }))}
        />
      ) : (
        <strong>
          {skill === null
            ? null
            : skillName(
                chess.id,
                skill,
                t('core:loadout.skill', { index: skill + 1 }),
              )}
        </strong>
      )}
      {spType || info?.spCost != null ? (
        <Muted>
          {[
            spType,
            info?.spCost != null
              ? t('core:loadout.spCost', { cost: info.spCost })
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Muted>
      ) : null}
      {desc ? <p>{desc}</p> : null}
      {eliteDesc && eliteDesc !== desc ? (
        <p>
          <Muted>{t('core:loadout.elite')}</Muted> {eliteDesc}
        </p>
      ) : null}
    </Stack>
  );
}

/** Master's module picker: the module names and types, and the selected module's effect. */
function ModulePicker({
  chess,
  module,
}: {
  readonly chess: CatalogChess;
  readonly module: string | null;
}) {
  const t = useText();
  const options = chess.loadout;
  if (!options || options.modules.length <= 1) {
    return null;
  }
  const label = (id: string): string => {
    if (id === MODULE_NONE) {
      return t('core:loadout.moduleNone');
    }
    const name = dataText(`data:module.${id}.name`) ?? id;
    const type = dataText(`data:module.${id}.type`);
    const base = type ? `${type} ${name}` : name;
    return id === options.defaultModule
      ? `${base} · ${t('core:loadout.default')}`
      : base;
  };
  const desc =
    module && module !== MODULE_NONE
      ? dataText(`data:module.${module}.desc`)
      : null;
  return (
    <Stack gap={1}>
      <ChoiceGroup
        label={t('core:loadout.module')}
        value={module ?? MODULE_NONE}
        onChange={(value) => chooseLoadout(chess, { module: value })}
        options={options.modules.map((id) => ({ value: id, label: label(id) }))}
      />
      {desc ? <p>{desc}</p> : null}
    </Stack>
  );
}

/** Master's 潜能与练度 section: potential 1–6 and cultivation 0–3, moot for an operator marked not owned. */
function OpsPicker({ chess }: { readonly chess: CatalogChess }) {
  const t = useText();
  const ops = useStore(loadoutStore, (state) => state.ops);
  const standIn = useStore(
    loadoutStore,
    (state) => chess.droppable === true && state.notOwned.includes(chess.id),
  );
  if (!chess.charId) {
    return null;
  }
  const charId = chess.charId;
  const current = opsOf(ops, charId);
  return (
    <Stack gap={1}>
      <strong>{t('core:loadout.opsHeading')}</strong>
      {current.changed ? null : <Muted>{t('core:loadout.opsDefault')}</Muted>}
      <ChoiceGroup
        label={t('core:loadout.potential')}
        value={String(current.potential)}
        onChange={(value) => chooseOps(charId, { potential: Number(value) })}
        options={POTENTIALS.map((n) => ({
          value: String(n),
          label: String(n),
        }))}
      />
      <ChoiceGroup
        label={t('core:loadout.cultivate')}
        value={String(current.cultivate)}
        onChange={(value) => chooseOps(charId, { cultivate: Number(value) })}
        options={TIERS.map((n) => ({
          value: String(n),
          label: lookup(`core:loadout.cultivate.${n}`),
        }))}
      />
      <Muted>
        {standIn ? t('core:loadout.opsStandIn') : t('core:loadout.opsHint')}
      </Muted>
    </Stack>
  );
}

/** Every choice of one operator: skill, module, potential and cultivation, and back to the defaults. */
export function LoadoutChoices({ chess }: { readonly chess: CatalogChess }) {
  const t = useText();
  const entries = useStore(loadoutStore, (state) => state.entries);
  const ops = useStore(loadoutStore, (state) => state.ops);
  const golden = useCatalog((state) =>
    chess.goldenId ? state.catalog.chess[chess.goldenId] : undefined,
  );
  const choice = effectiveChoice(entries, chess);
  const changed =
    choice.changed || (chess.charId ? opsOf(ops, chess.charId).changed : false);
  return (
    <Stack gap={3}>
      <SkillPicker chess={chess} golden={golden} skill={choice.skill} />
      <ModulePicker chess={chess} module={choice.module} />
      <OpsPicker chess={chess} />
      {changed ? (
        <Button onPress={() => resetChess(chess)}>
          {t('core:loadout.reset')}
        </Button>
      ) : null}
    </Stack>
  );
}

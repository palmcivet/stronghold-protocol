import { MODULE_NONE } from '@alliance/contract/message.js';
import { useMemo, useState } from 'react';
import { useIntent } from '../infra/intent/context.js';
import { useCatalog } from '../infra/store/hook.js';
import { dataName, useText } from '../infra/text/index.js';
import { cx } from '../infra/theme/class-name.js';
import { Button, ChoiceGroup, Panel } from '../ui/index.js';
import styles from './screen.module.css';

type Entries = Readonly<Record<string, { skill?: number; module?: string }>>;

/** Skill and module of each operator. Only choices that differ from the default are sent. */
export function LoadoutPanel() {
  const t = useText();
  const intents = useIntent();
  const catalog = useCatalog((state) => state.catalog);
  const [entries, setEntries] = useState<Entries>({});
  const [saved, setSaved] = useState(false);

  const operators = useMemo(
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

  const choose = (
    id: string,
    change: { skill?: number; module?: string },
  ): void => {
    setSaved(false);
    setEntries((current) => ({
      ...current,
      [id]: { ...current[id], ...change },
    }));
  };

  return (
    <Panel title={t('core:loadout.heading')}>
      <ul className={cx(styles.list)}>
        {operators.map((chess) => {
          const options = chess.loadout;
          if (!options) {
            return null;
          }
          const entry = entries[chess.id];
          return (
            <li key={chess.id} className={cx(styles.item)}>
              <span>{dataName('chess', chess.id)}</span>
              {options.skills.length > 1 ? (
                <ChoiceGroup
                  label={t('core:loadout.skills')}
                  value={String(entry?.skill ?? options.defaultSkill ?? '')}
                  onChange={(value) =>
                    choose(chess.id, { skill: Number(value) })
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
                  onChange={(value) => choose(chess.id, { module: value })}
                  options={options.modules.map((module) => ({
                    value: module,
                    label:
                      module === MODULE_NONE
                        ? t('core:loadout.moduleNone')
                        : module,
                  }))}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className={cx(styles.row)}>
        <Button
          variant="primary"
          onPress={async () => {
            const outcome = await intents.dispatch({
              type: 'room.loadout',
              fields: { entries },
            });
            setSaved(outcome.ok);
          }}
        >
          {t('core:loadout.save')}
        </Button>
        {saved ? <span role="status">{t('core:loadout.saved')}</span> : null}
      </div>
    </Panel>
  );
}

import { DIFFICULTIES, ROOM_CODE_LEN } from '@alliance/contract/match.js';
import { type FormEvent, useState } from 'react';
import { Form } from 'react-aria-components';
import { useIntent } from '../infra/intent/context.js';
import { useSession } from '../infra/store/hook.js';
import { lookup, useText } from '../infra/text/index.js';
import { cx } from '../infra/theme/class-name.js';
import { Button, ChoiceGroup, Panel, TextField } from '../ui/index.js';
import styles from './screen.module.css';

export function LobbyScreen() {
  const t = useText();
  const intents = useIntent();
  const spectatorSeats = useSession(
    (state) => state.backend?.capabilities.spectatorSeats ?? false,
  );
  const [mode, setMode] = useState<'solo' | 'coop'>('solo');
  const [difficulty, setDifficulty] = useState<string>(DIFFICULTIES[0]);
  const [code, setCode] = useState('');
  const normalized = code.trim().toUpperCase();
  const codeValid = /^[A-Z0-9]+$/.test(normalized);

  const join = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (codeValid) {
      void intents.dispatch({
        type: 'room.join',
        fields: { code: normalized },
      });
    }
  };

  return (
    <div className={cx(styles.screen)}>
      <h1 className={cx(styles.heading)}>{t('core:lobby.heading')}</h1>
      <div className={cx(styles.columns)}>
        <Panel title={t('core:lobby.create')}>
          <ChoiceGroup
            label={t('core:lobby.mode')}
            value={mode}
            onChange={(value) => setMode(value === 'coop' ? 'coop' : 'solo')}
            options={[
              { value: 'solo', label: t('core:lobby.mode.solo') },
              { value: 'coop', label: t('core:lobby.mode.coop') },
            ]}
          />
          <ChoiceGroup
            label={t('core:lobby.difficulty')}
            value={difficulty}
            onChange={setDifficulty}
            options={DIFFICULTIES.map((value) => ({
              value,
              label: lookup(`core:difficulty.${value}`),
            }))}
          />
          <Button
            variant="primary"
            onPress={() =>
              void intents.dispatch({
                type: 'room.create',
                fields: { mode, difficulty },
              })
            }
          >
            {t('core:lobby.create')}
          </Button>
        </Panel>
        <Panel title={t('core:lobby.join')}>
          <Form onSubmit={join} className={cx(styles.list)}>
            <TextField
              label={t('core:lobby.code')}
              value={code}
              onChange={setCode}
              maxLength={ROOM_CODE_LEN + 2}
            />
            <div className={cx(styles.row)}>
              <Button type="submit" variant="primary" isDisabled={!codeValid}>
                {t('core:lobby.join')}
              </Button>
              {spectatorSeats ? (
                <Button
                  isDisabled={!codeValid}
                  onPress={() =>
                    void intents.dispatch({
                      type: 'room.spectate',
                      fields: { code: normalized },
                    })
                  }
                >
                  {t('core:lobby.spectate')}
                </Button>
              ) : null}
            </div>
          </Form>
        </Panel>
      </div>
    </div>
  );
}

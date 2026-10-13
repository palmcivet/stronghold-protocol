import { DIFFICULTIES, ROOM_CODE_LEN } from '@alliance/contract/match.js';
import { type FormEvent, useState } from 'react';
import { Form } from 'react-aria-components';
import { useStore } from 'zustand';
import { useIntent } from '../infra/intent/context.js';
import { useSession } from '../infra/store/hook.js';
import { lookup, useText } from '../infra/text/index.js';
import { cx } from '../infra/theme/class-name.js';
import {
  Badge,
  Button,
  Cluster,
  DifficultyTag,
  GridList,
  Muted,
  Panel,
  Stack,
  TextField,
} from '../ui/index.js';
import styles from './entry.module.css';
import { recentStore, rememberRoom } from './recent.js';

type RoomMode = 'solo' | 'coop';

const DIFFICULTY_CODES = ['AC-1', 'AC-2', 'AC-3', 'AC-4'] as const;

/** Mode and difficulty cards, and the create button. */
export function CreateRoom() {
  const t = useText();
  const intents = useIntent();
  const [mode, setMode] = useState<RoomMode>('solo');
  const [difficulty, setDifficulty] = useState<string>(DIFFICULTIES[0]);
  return (
    <Panel title={t('core:lobby.create')}>
      <Stack gap={4}>
        <GridList
          label={t('core:lobby.mode')}
          selected={mode}
          onSelect={(id) => setMode(id === 'coop' ? 'coop' : 'solo')}
          items={(['solo', 'coop'] as const).map((id) => ({
            id,
            label: lookup(`core:lobby.mode.${id}`),
            content: (
              <span className={cx(styles.modeCard)}>
                <strong>{lookup(`core:lobby.mode.${id}`)}</strong>
                <Muted>{lookup(`core:lobby.mode.${id}.desc`)}</Muted>
              </span>
            ),
          }))}
        />
        <GridList
          label={t('core:lobby.difficulty')}
          selected={difficulty}
          onSelect={setDifficulty}
          items={DIFFICULTIES.map((id, index) => ({
            id,
            label: lookup(`core:difficulty.${id}`),
            content: (
              <span className={cx(styles.difficultyCard)}>
                <span className={cx(styles.difficultyHead)}>
                  <DifficultyTag
                    id={id.toLowerCase()}
                    label={lookup(`core:difficulty.${id}`)}
                  />
                  <Badge>{DIFFICULTY_CODES[index]}</Badge>
                </span>
                <span>{lookup(`core:entry.difficulty.${mode}.${id}`)}</span>
                <span className={cx(styles.effects)}>
                  {lookup(`core:entry.difficulty.${mode}.${id}.effects`)
                    .split('\n')
                    .map((effect) => (
                      <Muted key={effect}>· {effect}</Muted>
                    ))}
                </span>
              </span>
            ),
          }))}
        />
        <Cluster justify="end">
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
        </Cluster>
      </Stack>
    </Panel>
  );
}

/** The room code, the recent rooms, and join or spectate. */
export function JoinRoom() {
  const t = useText();
  const intents = useIntent();
  const spectatorSeats = useSession(
    (state) => state.backend?.capabilities.spectatorSeats ?? false,
  );
  const recent = useStore(recentStore, (state) => state.codes);
  const [code, setCode] = useState('');
  const normalized = normalizeCode(code);
  const codeValid = normalized.length === ROOM_CODE_LEN;
  const go = async (
    type: 'room.join' | 'room.spectate',
    target: string,
  ): Promise<void> => {
    const outcome = await intents.dispatch({ type, fields: { code: target } });
    if (outcome.ok) {
      rememberRoom(target);
    }
  };
  const join = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (codeValid) {
      void go('room.join', normalized);
    }
  };
  return (
    <Panel title={t('core:lobby.join')}>
      <Form onSubmit={join}>
        <Stack>
          <TextField
            label={t('core:lobby.code')}
            value={code}
            onChange={setCode}
            maxLength={64}
          />
          <Cluster>
            <Button type="submit" variant="primary" isDisabled={!codeValid}>
              {t('core:lobby.join')}
            </Button>
            {spectatorSeats ? (
              <Button
                isDisabled={!codeValid}
                onPress={() => void go('room.spectate', normalized)}
              >
                {t('core:lobby.spectate')}
              </Button>
            ) : null}
          </Cluster>
        </Stack>
      </Form>
      {recent.length ? (
        <Cluster gap={2} label={t('core:lobby.recent')}>
          <Muted>{t('core:lobby.recent')}</Muted>
          {recent.map((entry) => (
            <Button key={entry} onPress={() => setCode(entry)}>
              {entry}
            </Button>
          ))}
        </Cluster>
      ) : null}
    </Panel>
  );
}

/** A room code from the input: a pasted invite link's `room` parameter, upper-cased alphanumerics, clamped. */
export function normalizeCode(input: string): string {
  let source = input.trim();
  try {
    const room = new URL(source).searchParams.get('room');
    const path = new URL(source).pathname.match(/\/room\/([A-Za-z0-9]+)/)?.[1];
    source = room ?? path ?? source;
  } catch {
    // not a link
  }
  return source
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_CODE_LEN);
}

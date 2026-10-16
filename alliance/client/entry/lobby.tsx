import {
  DIFFICULTIES,
  MAX_SEATS,
  MAX_SPECTATORS,
  ROOM_CODE_LEN,
} from '@alliance/contract/match.js';
import {
  Button,
  cx,
  Icon,
  ListBox,
  Text,
  TextField,
  Tooltip,
} from '@alliance/ui';
import { type CSSProperties, type FormEvent, useState } from 'react';
import { Form } from 'react-aria-components';
import { useStore } from 'zustand';
import { useIntent } from '#infra/intent/context.js';
import { useArt } from '#infra/resource/art.js';
import { useCatalog, useSession } from '#infra/store/hook.js';
import { lookup, useText } from '#infra/text/index.js';
import { difficultyIconKey, difficultyInfo } from '#part/difficulty.js';
import styles from './entry.module.css';
import { recentStore, rememberRoom } from './recent.js';

type RoomMode = 'solo' | 'coop';

const MODE_ICONS = { solo: 'user', coop: 'users' } as const;
const MODE_MICRO = {
  solo: 'SOLO SIMULATION',
  coop: 'ALLIANCE SIMULATION',
} as const;

function SectionLabel({
  index,
  label,
  micro,
}: {
  readonly index: string;
  readonly label: string;
  readonly micro: string;
}) {
  return (
    <div className={cx(styles.sectionLabel)}>
      <span className={cx(styles.sectionIdx)}>{index}</span>
      <span>{label}</span>
      <span className={cx(styles.micro)}>{micro}</span>
    </div>
  );
}

function ModeCard({ mode }: { readonly mode: RoomMode }) {
  const t = useText();
  return (
    <span className={cx(styles.modeCard)}>
      <span className={cx(styles.modeArt)} aria-hidden="true" />
      <span className={cx(styles.modeIcon)}>
        <Icon name={MODE_ICONS[mode]} />
      </span>
      <span className={cx(styles.modeText)}>
        <span className={cx(styles.micro)}>{MODE_MICRO[mode]}</span>
        <strong className={cx(styles.modeName)}>
          {lookup(`core:lobby.mode.${mode}`)}
        </strong>
        <span className={cx(styles.modeDesc)}>
          {lookup(`core:lobby.mode.${mode}.desc`, { n: MAX_SEATS - 1 })}
        </span>
        <span className={cx(styles.points)}>
          {lookup(`core:lobby.mode.${mode}.points`, { n: MAX_SEATS })
            .split('\n')
            .map((point) => (
              <span key={point}>{point}</span>
            ))}
        </span>
      </span>
      <span className={cx(styles.modeCheck)} aria-hidden="true">
        <Icon name="check" size="calc(var(--wsde-dp) * 12)" />
        {t('core:lobby.selected')}
      </span>
    </span>
  );
}

function DifficultyCard({
  mode,
  difficulty,
}: {
  readonly mode: RoomMode;
  readonly difficulty: string;
}) {
  const t = useText();
  const modes = useCatalog((state) => state.catalog.modes);
  const info = difficultyInfo(modes, mode, difficulty);
  const icon = useArt(info.icon ?? difficultyIconKey(difficulty));
  return (
    <span
      className={cx(styles.difficultyCard)}
      style={
        {
          '--difficulty': `var(--wsde-color-difficulty-${difficulty.toLowerCase()}, var(--wsde-tone-amber-base))`,
        } as CSSProperties
      }
    >
      <span className={cx(styles.difficultyBar)} aria-hidden="true" />
      <span className={cx(styles.difficultyHead)}>
        {icon ? (
          <img className={cx(styles.difficultyGlyph)} src={icon} alt="" />
        ) : (
          <span className={cx(styles.difficultyGlyphFallback)}>
            <Icon name="rook" />
          </span>
        )}
        <span className={cx(styles.difficultyName)}>
          {lookup(`core:difficulty.${difficulty}`)}
        </span>
        {info.code ? (
          <span className={cx(styles.difficultyCode)}>{info.code}</span>
        ) : null}
        <span className={cx(styles.rounds)}>
          {info.rounds === null
            ? null
            : t('core:lobby.rounds', { rounds: info.rounds })}
          {info.hidden ? (
            <span className={cx(styles.hiddenBadge)}>
              {t('core:lobby.hidden')}
            </span>
          ) : null}
        </span>
      </span>
      <span className={cx(styles.difficultyDesc)}>{info.desc}</span>
      <span className={cx(styles.effects)}>
        {info.effects.map((effect) => (
          <span key={effect}>{effect}</span>
        ))}
        {info.stageNote ? (
          <span className={cx(styles.stageNote)}>
            <Icon name="rook" />
            {info.stageNote}
          </span>
        ) : null}
      </span>
      <span className={cx(styles.difficultyCheck)} aria-hidden="true">
        <Icon name="check" />
        <span>{t('core:lobby.selected')}</span>
      </span>
    </span>
  );
}

/** Mode cards, the difficulty ladder, and the create button. */
export function CreateRoom() {
  const t = useText();
  const intents = useIntent();
  const [mode, setMode] = useState<RoomMode>('solo');
  const [difficulty, setDifficulty] = useState<string>(DIFFICULTIES[0]);
  return (
    <section className={cx(styles.create)} aria-label={t('core:lobby.create')}>
      <div className={cx(styles.createMode)}>
        <SectionLabel index="01" label={t('core:lobby.mode')} micro="MODE" />
        <ListBox
          variant="cards"
          label={t('core:lobby.mode')}
          selected={mode}
          onSelect={(id) => setMode(id === 'coop' ? 'coop' : 'solo')}
          items={(['solo', 'coop'] as const).map((id) => ({
            id,
            label: lookup(`core:lobby.mode.${id}`),
            content: <ModeCard mode={id} />,
          }))}
        />
      </div>
      <div className={cx(styles.createDifficulty)}>
        <SectionLabel
          index="02"
          label={t('core:lobby.difficulty')}
          micro="DIFFICULTY"
        />
        <ListBox
          variant="ladder"
          label={t('core:lobby.difficulty')}
          selected={difficulty}
          onSelect={setDifficulty}
          items={DIFFICULTIES.map((id) => ({
            id,
            label: lookup(`core:difficulty.${id}`),
            content: <DifficultyCard mode={mode} difficulty={id} />,
          }))}
        />
      </div>
      <div className={cx(styles.createAction)}>
        <Button
          variant="primary"
          onPress={() =>
            void intents.dispatch({
              type: 'room.create',
              fields: { mode, difficulty },
            })
          }
        >
          {t(
            mode === 'solo' ? 'core:lobby.start.solo' : 'core:lobby.start.coop',
          )}
          <span className={cx(styles.createChevrons)} aria-hidden="true">
            ››
          </span>
        </Button>
        <Text kind="muted">
          {t(
            mode === 'solo'
              ? 'core:lobby.start.solo.hint'
              : 'core:lobby.start.coop.hint',
          )}
        </Text>
      </div>
    </section>
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
    <section className={cx(styles.join)} aria-label={t('core:lobby.join')}>
      <SectionLabel
        index="03"
        label={t('core:lobby.join')}
        micro="JOIN WITH ALLIANCE KEY"
      />
      <div className={cx(styles.joinPanel)}>
        <Form onSubmit={join} className={cx(styles.joinForm)}>
          <div className={cx(styles.joinRow)}>
            <TextField
              label={t('core:lobby.code.hint')}
              value={code}
              onChange={setCode}
              maxLength={64}
            />
            <Button
              type="submit"
              variant="amber"
              icon="users"
              isDisabled={!codeValid}
            >
              {t('core:lobby.join')}
            </Button>
            {spectatorSeats ? (
              <Tooltip
                tip={t('core:lobby.spectate.tip', { n: MAX_SPECTATORS })}
              >
                <Button
                  icon="eye"
                  isDisabled={!codeValid}
                  onPress={() => void go('room.spectate', normalized)}
                >
                  {t('core:lobby.spectate')}
                </Button>
              </Tooltip>
            ) : null}
          </div>
        </Form>
        <div className={cx(styles.joinFoot)}>
          {recent.length ? (
            <>
              <Text kind="muted">{t('core:lobby.recent')}</Text>
              {recent.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className={cx(styles.codeChip)}
                  onClick={() => setCode(entry)}
                >
                  {entry}
                </button>
              ))}
            </>
          ) : (
            <Text kind="muted">
              {t('core:lobby.recent.empty', { n: ROOM_CODE_LEN })}
            </Text>
          )}
        </div>
      </div>
    </section>
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

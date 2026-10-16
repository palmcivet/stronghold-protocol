import { Button, cx, Icon, Stack, Text } from '@alliance/ui';
import { useIntent } from '#infra/intent/context.js';
import { useMatch, useSession, useStream } from '#infra/store/hook.js';
import { useText } from '#infra/text/index.js';
import { usePlayback } from '#match/playback-state.js';
import styles from './hud.module.css';

/** Teammates' live progress under the waiting pill, as master's CombatHud. */
function ProgressList({
  list,
}: {
  readonly list: readonly {
    readonly fieldId: string;
    readonly name: string;
    readonly done: boolean;
    readonly killed: number | null;
    readonly total: number | null;
  }[];
}) {
  const t = useText();
  if (!list.length) {
    return null;
  }
  return (
    <ul
      className={cx(styles.combatProgress)}
      aria-label={t('core:combat.teammateProgress')}
    >
      {list.map((entry) => (
        <li
          key={entry.fieldId}
          className={cx(styles.combatProg)}
          data-done={entry.done || undefined}
        >
          <b>{entry.name}</b>
          {entry.done ? (
            <span title={t('core:playback.ended')}>✓</span>
          ) : (
            <span className={cx(styles.combatProgNum)}>
              {entry.killed != null && entry.total != null
                ? `${entry.killed}/${entry.total}`
                : '•••'}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** COST / DP on the right edge during combat, as master's DpCounter. */
function DpBox({ dp }: { readonly dp: number | null }) {
  const t = useText();
  if (dp === null || !Number.isFinite(dp)) {
    return null;
  }
  return (
    <div className={cx(styles.dpBox)} title={t('core:combat.costTip')}>
      <Icon name="bolt" />
      <Text variant="number">{Math.floor(dp)}</Text>
      <span className={cx(styles.microLabel)}>COST</span>
    </div>
  );
}

/**
 * The combat HUD as master's: COST on the right edge; bottom-centre pills for waiting, spectating, and the field
 * switcher. Kill progress stays in the top phase capsule, not here.
 */
export function Combat() {
  const t = useText();
  const intents = useIntent();
  const battle = usePlayback((state) => state.battle);
  const streamDp = useStream((state) => state.snapshot?.dp ?? null);
  // local bridge COST first, then streamed b.snap.dp
  const dp = battle?.dp ?? streamDp;
  const playerId = useSession((state) => state.playerId);
  const watch = useSession(
    (state) => state.backend?.capabilities.watchByField ?? false,
  );
  const { fields, players, privateAlive } = useMatch((state) => ({
    fields: state.public?.fields ?? [],
    players: state.public?.players ?? [],
    privateAlive: state.private?.alive,
  }));
  const own = players.find((player) => player.playerId === playerId) ?? null;
  const alive = privateAlive ?? own?.alive ?? true;
  const seated = own !== null;
  const watchingOther =
    battle !== null && own?.fieldId != null && battle.fieldId !== own.fieldId;
  const watched =
    battle !== null
      ? players.find((player) => player.fieldId === battle.fieldId)
      : undefined;
  const myDone =
    battle?.done === true ||
    (own?.fieldId
      ? (fields.find((field) => field.fieldId === own.fieldId)?.progress
          ?.done ?? false)
      : false);
  const progress = fields
    .map((field) => {
      const player = players.find((entry) => entry.fieldId === field.fieldId);
      if (!player || player.playerId === playerId) {
        return null;
      }
      return {
        fieldId: field.fieldId,
        name: player.name,
        done: field.progress?.done === true,
        killed: field.progress?.killed ?? null,
        total: field.progress?.total ?? null,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const liveFields = fields.filter(
    (field) => field.kind !== 'solo' || fields.length === 1,
  );
  const canCycle = watch && liveFields.length > 1;
  const cycle = (delta: number): void => {
    if (!battle || !canCycle) {
      return;
    }
    const ids = liveFields.map((field) => field.fieldId);
    const index = Math.max(0, ids.indexOf(battle.fieldId));
    const next = ids[(index + delta + ids.length) % ids.length];
    if (next && next !== battle.fieldId) {
      void intents.dispatch({ type: 'g.watch', fields: { fieldId: next } });
    }
  };
  const label = watchingOther
    ? (watched?.name ?? t('core:combat.self'))
    : t('core:combat.self');
  const backOwn =
    watchingOther && own?.fieldId ? (
      <Button
        onPress={() =>
          void intents.dispatch({
            type: 'g.watch',
            fields: { fieldId: own.fieldId },
          })
        }
      >
        {t('core:watch.own')}
      </Button>
    ) : null;

  return (
    <section
      className={cx(styles.combat)}
      aria-label={t('core:combat.heading')}
    >
      <DpBox dp={dp} />
      <div className={cx(styles.combatBottom)}>
        {myDone && !watchingOther && seated ? (
          <Stack gap={1}>
            <div className={cx(styles.combatMsg)} role="status">
              <Icon name="hourglass" />
              <span>{t('core:combat.waitTeammates')}</span>
            </div>
            <ProgressList list={progress} />
          </Stack>
        ) : null}
        {!alive && !watchingOther ? (
          <div className={cx(styles.combatMsg)} data-dead="" role="status">
            <Icon name="close" />
            <span>
              {seated
                ? t('core:combat.eliminated')
                : t('core:combat.spectating')}
            </span>
          </div>
        ) : null}
        {watchingOther && !canCycle ? (
          <div className={cx(styles.viewSwitch)} data-single="">
            <span className={cx(styles.viewLabel)}>
              <Icon name="eye" />
              <span>{label}</span>
            </span>
            {backOwn}
          </div>
        ) : null}
        {canCycle ? (
          <div className={cx(styles.viewSwitch)}>
            <button
              type="button"
              className={cx(styles.viewArrow)}
              aria-label={t('core:combat.prevField')}
              onClick={() => cycle(-1)}
            >
              <Icon name="chevron-left" />
            </button>
            <span className={cx(styles.viewLabel)}>
              {watchingOther ? <Icon name="eye" /> : null}
              <span>{label}</span>
            </span>
            <button
              type="button"
              className={cx(styles.viewArrow)}
              aria-label={t('core:combat.nextField')}
              onClick={() => cycle(1)}
            >
              <Icon name="chevron-right" />
            </button>
            {backOwn}
          </div>
        ) : null}
      </div>
    </section>
  );
}

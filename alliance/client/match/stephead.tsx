import { useIntent } from '#infra/intent/context.js';
import { useMatch, useSession } from '#infra/store/hook.js';
import { lookup, useText } from '#infra/text/index.js';
import { cx } from '#infra/theme/class-name.js';
import { requestConfirm } from '#part/overlay.js';
import { Button, Cluster, DifficultyTag, Icon, Muted } from '#ui/index.js';
import { ClockFace } from './countdown.js';
import styles from './match.module.css';

/** Asks, then gives up the match. */
export async function confirmLeave(
  intents: ReturnType<typeof useIntent>,
  t: ReturnType<typeof useText>,
): Promise<void> {
  const ok = await requestConfirm({
    title: t('core:match.leave'),
    body: t('core:match.leaveConfirm'),
    confirm: t('core:match.leave'),
    cancel: t('core:common.cancel'),
    tone: 'danger',
  });
  if (ok) {
    void intents.dispatch({ type: 'g.leave' });
  }
}

/** Where briefing and strategy stand in the two setup steps. */
const STEPS: Readonly<Record<string, number>> = {
  INFO_CHECK: 1,
  BAND_DRAFT: 2,
};

/** The step head of briefing and strategy: leave, latency and difficulty | the step number and name | the countdown. */
export function StepHead() {
  const t = useText();
  const intents = useIntent();
  const view = useMatch((state) => state.public);
  const ping = useSession((state) => state.connection.ping);
  if (!view) {
    return null;
  }
  const step = STEPS[view.phase] ?? null;
  return (
    <header className={cx(styles.stephead)}>
      <Cluster gap={2}>
        <Button onPress={() => void confirmLeave(intents, t)}>
          <Icon name="exit" />
          {t('core:match.exit')}
        </Button>
        {ping === null ? null : (
          <Muted>{t('core:entry.ping', { ms: Math.round(ping) })}</Muted>
        )}
        <DifficultyTag
          id={view.difficulty.toLowerCase()}
          label={lookup(`core:difficulty.${view.difficulty}`)}
        />
      </Cluster>
      <h1 className={cx(styles.stepTitle)}>
        {step ? (
          <span className={cx(styles.stepIndex)}>
            {t('core:briefing.step', { step, of: 2 })}
          </span>
        ) : null}
        {lookup(`core:phase.${view.phase}`)}
      </h1>
      <div className={cx(styles.stepClock)}>
        <ClockFace />
      </div>
    </header>
  );
}

import { PHASE } from '@alliance/contract/match.js';
import { useMatch } from '../infra/store/hook.js';
import { useText } from '../infra/text/index.js';
import { cx } from '../infra/theme/class-name.js';
import { BattleStatus } from './field/battle-status.js';
import { Bench } from './field/bench.js';
import { DomField } from './field/dom-field.js';
import styles from './field/field.module.css';
import { StageField } from './field/stage.js';
import { StreamField } from './field/stream-field.js';
import { UnitActions } from './field/unit-actions.js';
import { usePlaybackRuntime } from './playback/context.js';

const PREPARATION_PHASES: ReadonlySet<string> = new Set([
  PHASE.PREP,
  PHASE.SP_DRAFT,
]);

/** The battlefield boundary: the stage, the battle's status and stream, the board, the bench and the piece menu. */
export function Field() {
  const t = useText();
  const playback = usePlaybackRuntime();
  const { phase, own } = useMatch((state) => ({
    phase: state.public?.phase ?? null,
    own: state.private,
  }));
  const canAct =
    own?.alive === true && phase !== null && PREPARATION_PHASES.has(phase);
  return (
    <section
      className={cx(styles.fieldPart)}
      aria-label={t('core:field.label')}
    >
      {playback ? <StageField playback={playback} /> : null}
      <BattleStatus />
      <StreamField />
      <DomField canAct={canAct} />
      <UnitActions canAct={canAct} />
      {own ? <Bench canAct={canAct} /> : null}
    </section>
  );
}

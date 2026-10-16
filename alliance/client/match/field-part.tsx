import { PHASE } from '@alliance/contract/match.js';
import { cx } from '@alliance/ui';
import { useMatch } from '#infra/store/hook.js';
import { useText } from '#infra/text/index.js';
import { Bench } from '#match/field/bench.js';
import { DomField } from '#match/field/dom-field.js';
import styles from '#match/field/field.module.css';
import { StageField } from '#match/field/stage.js';
import { UnitActions } from '#match/field/unit-actions.js';
import { usePlaybackRuntime } from '#match/playback-runtime.js';

const PREPARATION_PHASES: ReadonlySet<string> = new Set([
  PHASE.PREP,
  PHASE.SP_DRAFT,
]);

/**
 * The battlefield boundary: the 3D stage filling the screen under the HUD, the battle's status and the piece menu over
 * it, and the keyboard grid and bench list for keyboards and screen readers.
 */
export function Field() {
  const t = useText();
  const playback = usePlaybackRuntime();
  const { phase, own } = useMatch((state) => ({
    phase: state.public?.phase ?? null,
    own: state.private,
  }));
  const preparing = phase !== null && PREPARATION_PHASES.has(phase);
  const canAct = own?.alive === true && preparing;
  return (
    <section
      className={cx(styles.fieldPart)}
      aria-label={t('core:field.label')}
    >
      <StageField playback={playback} preparing={preparing} canAct={canAct} />
      <div className={cx(styles.float)}>
        <UnitActions canAct={canAct} />
      </div>
      <DomField canAct={canAct} />
      {own ? (
        <div className="wsde-visually-hidden">
          <Bench canAct={canAct} />
        </div>
      ) : null}
    </section>
  );
}

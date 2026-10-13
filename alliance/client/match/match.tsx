import { PHASE } from '@alliance/contract/match.js';
import { useMatch } from '../infra/store/hook.js';
import { useText } from '../infra/text/index.js';
import { cx } from '../infra/theme/class-name.js';
import { PartSlot } from '../part/boundary.js';
import { Panel } from '../ui/index.js';
import { BattleStatus } from './field/battle-status.js';
import { Bench } from './field/bench.js';
import { DomField } from './field/dom-field.js';
import { StageField } from './field/stage.js';
import { StreamField } from './field/stream-field.js';
import { UnitActions } from './field/unit-actions.js';
import { Bonds } from './hud/bonds.js';
import { Choices } from './hud/choice.js';
import { Emotes } from './hud/emote.js';
import { Hud } from './hud/hud.js';
import { Intel } from './hud/intel.js';
import { Shop } from './hud/shop.js';
import { Team } from './hud/team.js';
import { Ticker } from './hud/ticker.js';
import { usePlaybackRuntime } from './playback/context.js';
import styles from './screen.module.css';

/** Part id of the battlefield. */
export const FIELD_PART = 'core:match.field';

const PREPARATION_PHASES: ReadonlySet<string> = new Set([
  PHASE.PREP,
  PHASE.SP_DRAFT,
]);

/** The match: the persistent panels, the preparation tools, the field and the battle playback. */
export function MatchScreen() {
  const t = useText();
  const playback = usePlaybackRuntime();
  const { phase, own } = useMatch((state) => ({
    phase: state.public?.phase ?? null,
    own: state.private,
  }));
  const alive = own?.alive === true;
  const canAct = alive && phase !== null && PREPARATION_PHASES.has(phase);
  return (
    <div className={cx(styles.match)}>
      <div className={cx(styles.center)}>
        <Hud />
        <Team />
        <Bonds />
      </div>
      <div className={cx(styles.center)}>
        <Choices canAct={alive} />
        <Panel title={t('core:field.label')}>
          <PartSlot part={FIELD_PART}>
            {playback ? <StageField playback={playback} /> : null}
            <BattleStatus />
            <StreamField />
            <DomField canAct={canAct} />
          </PartSlot>
        </Panel>
        <UnitActions canAct={canAct} />
        {own ? <Bench canAct={canAct} /> : null}
        {own ? <Shop canAct={canAct} /> : null}
      </div>
      <div className={cx(styles.center)}>
        <Intel />
        <Ticker />
        <Emotes canSend={own !== null} />
      </div>
    </div>
  );
}

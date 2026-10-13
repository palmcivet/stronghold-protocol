import { PHASE } from '@alliance/contract/match.js';
import { useMatch } from '../../infra/store/hook.js';
import { useText } from '../../infra/text/index.js';
import { cx } from '../../infra/theme/class-name.js';
import { Part } from '../../part/registry.js';
import { type PartInsert, Slot } from '../../part/slot.js';
import { Muted, Stack } from '../../ui/index.js';
import styles from './hud.module.css';
import { COMBAT_PHASES } from './topbar.js';

const PREP_PHASES: ReadonlySet<string> = new Set([
  PHASE.PREP,
  PHASE.SP_DRAFT,
  PHASE.ROUND_START,
  PHASE.SETTLE,
  PHASE.BATTLE_CHECK,
]);

const at = (
  into: string,
  entries: readonly (readonly [string, number])[],
): readonly PartInsert[] => entries.map(([id, order]) => ({ into, id, order }));

const UNDER = at('core:match.hud.under', [
  ['core:match.ticker', 10],
  ['core:match.bonds', 20],
]);
const LEFT = at('core:match.hud.left', [['core:match.team', 10]]);
const SIDE = at('core:match.hud.side', [['core:match.effects', 10]]);
const FLOAT = at('core:match.hud.float', [
  ['core:match.detail', 10],
  ['core:match.emote', 20],
  ['core:match.reward', 30],
]);
const MODAL = at('core:match.modal', [
  ['core:match.choice', 10],
  ['core:match.equip-replace', 20],
  ['core:match.pause', 30],
  ['core:match.away', 40],
  ['core:match.vote', 50],
  ['core:match.intel', 60],
  ['core:match.bond-detail', 70],
]);

/** The bottom area: the shop while preparing, the combat HUD in battle. */
function Bottom() {
  const phase = useMatch((state) => state.public?.phase ?? null);
  const own = useMatch((state) => state.private !== null);
  const defaults: PartInsert[] = [];
  if (phase && COMBAT_PHASES.has(phase)) {
    defaults.push({
      into: 'core:match.hud.bottom',
      id: 'core:match.combat',
      order: 10,
    });
  } else if (own && phase && PREP_PHASES.has(phase)) {
    defaults.push({
      into: 'core:match.hud.bottom',
      id: 'core:match.shop',
      order: 10,
    });
  }
  return <Slot id="core:match.hud.bottom" defaults={defaults} />;
}

/** The match layout: the field fills the page, the HUD in five areas over it, and the modal container. */
export function MatchLayout() {
  const t = useText();
  const loaded = useMatch((state) => state.public !== null);
  if (!loaded) {
    return <Muted>{t('core:common.loading')}</Muted>;
  }
  return (
    <div className={cx(styles.layout)} data-layout="match">
      <div className={cx(styles.field)} data-region="field">
        <Part id="core:match.field" />
      </div>
      <div className={cx(styles.top)} data-region="top">
        <Part id="core:match.topbar" />
        <div className={cx(styles.under)} data-region="under">
          <Slot id="core:match.hud.under" defaults={UNDER} />
        </div>
      </div>
      <div className={cx(styles.left)} data-region="left">
        <Slot id="core:match.hud.left" defaults={LEFT} />
      </div>
      <div className={cx(styles.side)} data-region="side">
        <Slot id="core:match.hud.side" defaults={SIDE} />
      </div>
      <div className={cx(styles.bottom)} data-region="bottom">
        <Bottom />
      </div>
      <div className={cx(styles.floatArea)} data-region="float">
        <Stack gap={2}>
          <Slot id="core:match.hud.float" defaults={FLOAT} />
        </Stack>
      </div>
      <Slot id="core:match.modal" defaults={MODAL} />
    </div>
  );
}

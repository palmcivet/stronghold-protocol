import { useRouteContext } from '@tanstack/react-router';
import { useEffect } from 'react';
import { boundIntent, isTyping } from '../infra/intent/keys.js';
import { matchViewOf } from '../infra/router/match-view.js';
import { PAGE } from '../infra/router/page.js';
import { useMatch } from '../infra/store/hook.js';
import { settingsStore } from '../infra/store/settings.js';
import { cx } from '../infra/theme/class-name.js';
import { definePart, Part } from '../part/registry.js';
import { registerBriefingParts } from './briefing/parts.js';
import { Field } from './field-part.js';
import { Combat } from './hud/combat.js';
import { Detail } from './hud/detail.js';
import { EmoteWheel } from './hud/emote.js';
import { MatchLayout } from './hud/layout.js';
import { Away, Choice, EquipReplace, Pause, Vote } from './hud/overlays.js';
import { Reward, Shop, ShopCard, ShopTools } from './hud/shop.js';
import { BondDetail, Bonds, Effects, Ticker } from './hud/strip.js';
import { Team, TeamRow } from './hud/team.js';
import { Clock, Exit, Intel, Lens, Lp, Round, TopBar } from './hud/topbar.js';
import { MatchInfo } from './info.js';
import styles from './match.module.css';
import { registerResultParts } from './settlement/parts.js';
import { StepHead } from './stephead.js';
import { registerStrategyParts } from './strategy/parts.js';

/** Layout part of each view of the match page. */
const VIEW_LAYOUT = {
  briefing: 'core:briefing.layout',
  strategy: 'core:strategy.layout',
  match: 'core:match.hud',
  result: 'core:result.layout',
} as const;

/** The match page: the layout of the phase, and the match's keys while it is on. */
function MatchPage() {
  const { runtime } = useRouteContext({ from: '__root__' });
  const view = useMatch((state) =>
    matchViewOf(state.public?.phase, state.result !== null),
  );
  useEffect(() => {
    if (view !== 'match') {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        isTyping(event.target)
      ) {
        return;
      }
      const intent = boundIntent(event.code, settingsStore.getState().keys);
      if (intent) {
        event.preventDefault();
        void runtime.intents.dispatch(intent);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, runtime.intents]);
  return (
    <section
      data-part={PAGE.match}
      data-view={view}
      className={cx(styles.page)}
    >
      <Part id={VIEW_LAYOUT[view]} />
    </section>
  );
}

const HUD_PARTS = [
  ['core:match.topbar', TopBar],
  ['core:match.exit', Exit],
  ['core:match.round', Round],
  ['core:match.lp', Lp],
  ['core:match.clock', Clock],
  ['core:match.lens', Lens],
  ['core:match.intel', Intel],
  ['core:match.ticker', Ticker],
  ['core:match.bonds', Bonds],
  ['core:match.bond-detail', BondDetail],
  ['core:match.team', Team],
  ['core:match.team-row', TeamRow],
  ['core:match.effects', Effects],
  ['core:match.detail', Detail],
  ['core:match.shop', Shop],
  ['core:match.shop-card', ShopCard],
  ['core:match.shop-tools', ShopTools],
  ['core:match.reward', Reward],
  ['core:match.choice', Choice],
  ['core:match.equip-replace', EquipReplace],
  ['core:match.combat', Combat],
  ['core:match.emote', EmoteWheel],
  ['core:match.vote', Vote],
  ['core:match.pause', Pause],
  ['core:match.away', Away],
] as const;

/** Parts that only allow `insert` around them (UI.md: not replaceable). */
const CLOSED: ReadonlySet<string> = new Set([
  'core:match.exit',
  'core:match.lens',
  'core:match.shop-tools',
]);

export function registerMatchParts(): readonly (() => void)[] {
  return [
    definePart(PAGE.match, MatchPage, { extensible: true }),
    definePart('core:match.hud', MatchLayout, { extensible: true }),
    definePart('core:match.stephead', StepHead, { extensible: true }),
    definePart('core:match.info', MatchInfo, { extensible: true }),
    definePart('core:match.field', Field, { extensible: true }),
    ...HUD_PARTS.map(([id, component]) =>
      definePart(id, component, { extensible: !CLOSED.has(id) }),
    ),
    ...registerBriefingParts(),
    ...registerStrategyParts(),
    ...registerResultParts(),
  ];
}

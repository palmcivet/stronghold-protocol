import { useRouteContext } from '@tanstack/react-router';
import { useEffect } from 'react';
import { boundIntent, isTyping } from '../infra/intent/keys.js';
import { matchViewOf } from '../infra/router/match-view.js';
import { PAGE } from '../infra/router/page.js';
import { useMatch } from '../infra/store/hook.js';
import { settingsStore } from '../infra/store/settings.js';
import { cx } from '../infra/theme/class-name.js';
import { BriefingScreen } from '../match/briefing/briefing.js';
import { MatchScreen } from '../match/match.js';
import { ResultScreen } from '../match/settlement/result.js';
import { StrategyScreen } from '../match/strategy/strategy.js';
import styles from '../shell/shell.module.css';

export function MatchPage() {
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
      {view === 'briefing' ? <BriefingScreen /> : null}
      {view === 'strategy' ? <StrategyScreen /> : null}
      {view === 'match' ? <MatchScreen /> : null}
      {view === 'result' ? <ResultScreen /> : null}
    </section>
  );
}

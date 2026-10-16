import { Button, Cluster, cx, Icon } from '@alliance/ui';
import { useEffect, useState } from 'react';
import { getPlatform } from '#infra/platform/index.js';
import { useMatch } from '#infra/store/hook.js';
import { has, lookup, useText } from '#infra/text/index.js';
import { DIALOG, openDialog } from '#part/dialog.js';
import { openSettings } from '#part/overlay.js';
import { Part } from '#part/registry.js';
import styles from './hud.module.css';
import { PhaseBand } from './phase-band.js';

/** How long the phase banner stays, as master's. */
const BANNER_MS = 1800;

function toggleFullscreen(): void {
  if (!getPlatform().fullscreen) {
    return;
  }
  if (document.fullscreenElement) {
    void document.exitFullscreen();
  } else {
    void document.documentElement.requestFullscreen();
  }
}

/** The bottom-left corner, as master's: emotes, settings, guide, fullscreen. */
export function Corner() {
  const t = useText();
  return (
    <Cluster gap={1}>
      <Part id="core:match.emote" />
      <Button
        aria-label={t('core:settings.open')}
        onPress={() => openSettings()}
      >
        <Icon name="settings" />
      </Button>
      <Button
        aria-label={t('core:nav.guide')}
        onPress={() => void openDialog(DIALOG.guide)}
      >
        <Icon name="book" />
      </Button>
      <Button
        aria-label={t('core:match.fullscreen')}
        onPress={toggleFullscreen}
      >
        <Icon name="expand" />
      </Button>
    </Cluster>
  );
}

/** The banner shown for a moment when the phase changes: its name under "ROUND nn // PHASE". */
export function PhaseBanner() {
  const view = useMatch((state) =>
    state.public
      ? { phase: state.public.phase, round: state.public.round }
      : null,
  );
  const phase = view?.phase ?? null;
  const round = view?.round ?? 0;
  const [shown, setShown] = useState<string | null>(null);
  // the banner shows again at every new round, even with the same phase name
  // biome-ignore lint/correctness/useExhaustiveDependencies: round restarts the banner
  useEffect(() => {
    if (phase) {
      setShown(phase);
    }
  }, [phase, round]);
  const key = `core:phase.${shown}`;
  if (!shown || !has(key)) {
    return null;
  }
  return (
    <div className={cx(styles.phaseBanner)}>
      <PhaseBand
        key={`${shown}:${round}`}
        title={lookup(key)}
        micro={`ROUND ${String(round).padStart(2, '0')} // ${shown.toUpperCase()}`}
        duration={BANNER_MS}
        onDone={() => setShown(null)}
      />
    </div>
  );
}

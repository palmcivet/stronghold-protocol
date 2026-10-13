import {
  createMissionStage,
  type MissionBoard,
} from 'arknights-mission-renderer';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { cx } from '../../infra/theme/class-name.js';
import type { Playback } from '../playback.js';
import styles from './field.module.css';

/**
 * The renderer stage of the battle this client runs. No skeleton backend is installed, so actors show stand-ins.
 * Camera and highlights are worked out here and handed to the stage.
 */
export function StageField({ playback }: { readonly playback: Playback }) {
  const local = useSyncExternalStore(
    playback.subscribe,
    playback.local,
    () => null,
  );
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!local || !element) {
      return;
    }
    let stage: MissionBoard;
    try {
      stage = createMissionStage(local.map, { terrain: {} });
    } catch (failure) {
      console.warn('[field] the stage cannot start', failure);
      return;
    }
    stage.dispatch({ type: 'set-update-mode', mode: 'local' });
    const canvas = stage.canvas as unknown as HTMLElement | null;
    if (canvas) {
      element.append(canvas);
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        stage.resize(entry.contentRect.width, entry.contentRect.height);
      }
    });
    observer.observe(element);
    let frame = 0;
    let last = performance.now();
    const tick = (at: number): void => {
      const seconds = Math.min(0.25, (at - last) / 1000);
      last = at;
      playback.advance(seconds);
      stage.dispatch({
        type: 'push-snapshot',
        snapshot: local.battle.snapshot(),
      });
      stage.update(seconds);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      stage.destroy();
      canvas?.remove();
    };
  }, [local, playback]);

  if (!local) {
    return null;
  }
  return <div ref={host} className={cx(styles.stage)} />;
}

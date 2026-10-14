import type { BattleStartMessage } from '@alliance/contract/server-message.js';
import {
  type Battle,
  type BattleSpec,
  createBattle,
  createFrameClock,
  type MissionModule,
} from 'arknights-mission-core';
import type { LocalBattle, Playback } from '#match/playback.js';
import { playbackStore } from '#match/playback-state.js';
import type { BattleBridge, BattleStart } from './bridge.js';

/** Game seconds per real second, as the master backend runs its battles. */
export const PLAYBACK_SPEED = 2;
/** Real seconds between two `b.progress` frames. */
export const PROGRESS_INTERVAL = 1;

export interface PlaybackOptions {
  readonly bridge: BattleBridge | null;
  /** Sends a battle frame. */
  readonly send: (type: 'b.progress' | 'b.result', fields: object) => void;
  readonly createBattle?: (
    spec: BattleSpec,
    modules: readonly MissionModule[],
  ) => Battle;
}

function startOf(frame: BattleStartMessage): BattleStart {
  const { t: _type, ...start } = frame;
  return start;
}

/**
 * Runs the battles the backend hands to this client. Without a bridge for the backend's spec, or for a battle this
 * client only watches, the server's progress on `m.public` is shown instead.
 */
export function createPlayback(options: PlaybackOptions): Playback {
  const build =
    options.createBattle ?? ((spec, modules) => createBattle(spec, modules));
  const clock = createFrameClock();
  const listeners = new Set<() => void>();
  let local: LocalBattle | null = null;
  let sinceProgress = 0;
  let reported = false;

  const notify = (): void => {
    for (const listener of [...listeners]) {
      listener();
    }
  };

  function begin(start: BattleStart): void {
    local = null;
    reported = false;
    sinceProgress = 0;
    const prepared =
      start.authoritative && !start.done && options.bridge
        ? safePrepare(options.bridge, start)
        : null;
    if (prepared) {
      try {
        local = {
          start,
          battle: build(prepared.spec, prepared.modules),
          map: prepared.map,
        };
      } catch (failure) {
        // Unknown content tags / modules must not break the match frame listener.
        console.warn('[playback] the battle cannot start here', failure);
        local = null;
      }
    }
    playbackStore.setState({
      battle: {
        battleId: start.battleId,
        fieldId: start.fieldId,
        kind: start.kind,
        authoritative: start.authoritative,
        mode: local ? 'local' : 'server',
        killed: 0,
        total: 0,
        dp: null,
        done: start.done,
        endReason: null,
      },
    });
    if (local) {
      report();
    }
    notify();
  }

  function report(): void {
    if (!local || !options.bridge) {
      return;
    }
    const progress = options.bridge.progress(local.battle, local.start);
    options.send('b.progress', { battleId: local.start.battleId, ...progress });
    const current = playbackStore.getState().battle;
    if (current) {
      playbackStore.setState({
        battle: {
          ...current,
          killed: progress.killed,
          total: progress.total,
          dp: progress.dp ?? current.dp,
        },
      });
    }
  }

  function finish(): void {
    if (!local || !options.bridge || reported) {
      return;
    }
    reported = true;
    report();
    options.send('b.result', {
      battleId: local.start.battleId,
      result: options.bridge.result(local.battle, local.start),
    });
    const current = playbackStore.getState().battle;
    if (current) {
      playbackStore.setState({ battle: { ...current, done: true } });
    }
  }

  return {
    local: () => local,
    onFrame(frame) {
      if (frame.t === 'b.start') {
        begin(startOf(frame));
        return;
      }
      const current = playbackStore.getState().battle;
      if (!current) {
        return;
      }
      if (frame.t === 'b.end' && current.battleId === frame.battleId) {
        local = null;
        playbackStore.setState({
          battle: {
            ...current,
            done: true,
            endReason: frame.reason,
          },
        });
        notify();
        return;
      }
      if (frame.t === 'm.public' && current.mode === 'server') {
        const field = frame.fields.find(
          (item) => item.fieldId === current.fieldId,
        );
        if (field?.progress) {
          playbackStore.setState({
            battle: {
              ...current,
              killed: field.progress.killed,
              total: field.progress.total,
              done: field.progress.done,
            },
          });
        }
      }
    },
    advance(seconds) {
      if (!local || reported) {
        return;
      }
      try {
        clock.advance(local.battle, seconds, PLAYBACK_SPEED);
      } catch (failure) {
        console.warn('[playback] the local battle stopped', failure);
        local = null;
        notify();
        return;
      }
      sinceProgress += seconds;
      if (local.battle.result().finished) {
        finish();
        notify();
        return;
      }
      if (sinceProgress >= PROGRESS_INTERVAL) {
        sinceProgress = 0;
        report();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    stop() {
      local = null;
      listeners.clear();
    },
  };
}

function safePrepare(
  bridge: BattleBridge,
  start: BattleStart,
): ReturnType<BattleBridge['prepare']> {
  try {
    return bridge.prepare(start);
  } catch (failure) {
    console.warn('[playback] the spec cannot be run here', failure);
    return null;
  }
}

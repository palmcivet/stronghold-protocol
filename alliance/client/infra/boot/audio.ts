import type { ServerMessage } from '@alliance/contract/server-message.js';
import { layerCue, trackFor } from '#infra/audio/cue.js';
import {
  connectionCue,
  countdownCue,
  createBattleCues,
  createMatchCues,
  enterCue,
  intentCue,
  presenceCue,
  roomCue,
} from '#infra/audio/events.js';
import { setCueSink } from '#infra/audio/feedback.js';
import {
  type AudioOutput,
  type AudioPacks,
  type AudioPlayer,
  createAudioPlayer,
} from '#infra/audio/player.js';
import type { IntentBus } from '#infra/intent/bus.js';
import { assetsStore } from '#infra/store/assets.js';
import { matchStore, secondsLeft } from '#infra/store/match.js';
import { presenceStore } from '#infra/store/presence.js';
import { roomStore } from '#infra/store/room.js';
import { sessionStore } from '#infra/store/session.js';
import { audioGains, settingsStore } from '#infra/store/settings.js';
import { playbackStore } from '#match/playback-state.js';

/** Plays through audio elements. A play the browser refuses before the first user gesture stays silent. */
export function elementOutput(): AudioOutput {
  let music: HTMLAudioElement | null = null;
  let gains = { music: 1, sfx: 1 };
  const start = (element: HTMLAudioElement, volume: number): void => {
    element.volume = volume;
    element.play().catch(() => {
      // autoplay refused; the next track tries again
    });
  };
  const stopMusic = (): void => {
    if (music) {
      music.onended = null;
      music.pause();
      music = null;
    }
  };
  return {
    playOnce(source) {
      if (gains.sfx > 0) {
        start(new Audio(source.url), gains.sfx);
      }
    },
    playMusic(intro, loop) {
      stopMusic();
      const looping = (): HTMLAudioElement => {
        const element = new Audio(loop.url);
        element.loop = true;
        return element;
      };
      const first = intro ? new Audio(intro.url) : looping();
      if (intro) {
        first.onended = () => {
          if (music === first) {
            music = looping();
            start(music, gains.music);
          }
        };
      }
      music = first;
      start(first, gains.music);
    },
    stopMusic,
    setGains(next) {
      gains = { ...next };
      if (music) {
        music.volume = gains.music;
      }
    },
  };
}

/** The packs of the running match, else the current ones. */
function currentPacks(): AudioPacks | null {
  const { match, resources } = assetsStore.getState();
  return match?.resources ?? resources;
}

/** Real ms between two checks of the countdown. */
const COUNTDOWN_CHECK_MS = 250;

export interface AudioRuntime {
  readonly player: AudioPlayer;
  /** Plays the cues a server push asks for. */
  onFrame(frame: ServerMessage): void;
  dispose(): void;
}

export interface AudioOptions {
  readonly output: AudioOutput;
  /** Intents whose outcome has a sound. */
  readonly intents?: IntentBus;
}

const inMatch = (): boolean =>
  presenceStore.getState().presence.kind === 'in-match';

/**
 * Plays the track of the screen, phase and round; the cues of the intents, the match, the countdown, the battle and
 * the buttons; with the volumes of the settings.
 */
export function installAudio({ output, intents }: AudioOptions): AudioRuntime {
  const player = createAudioPlayer(output, currentPacks);
  const battle = createBattleCues();
  const match = createMatchCues();
  const cue = (role: ReturnType<typeof enterCue>): void => {
    if (role) {
      player.cue(role);
    }
  };
  output.setGains(audioGains(settingsStore.getState().audio));

  const sync = (): void => {
    const { presence } = presenceStore.getState();
    if (presence.kind === 'disconnected') {
      player.stop();
      return;
    }
    const view = matchStore.getState().public;
    player.music(
      trackFor(presence.kind === 'in-match', view),
      view?.round ?? null,
    );
  };

  let lastSeconds = -1;
  const countdown = setInterval(() => {
    const state = matchStore.getState();
    const seconds = inMatch() ? secondsLeft(state, Date.now()) : null;
    const tick = countdownCue(
      state.public?.phase ?? null,
      lastSeconds,
      seconds ?? -1,
    );
    lastSeconds = seconds ?? -1;
    cue(tick);
  }, COUNTDOWN_CHECK_MS);

  const unsubscribe = [
    presenceStore.subscribe((state, previous) => {
      sync();
      cue(presenceCue(previous.presence, state.presence));
    }),
    matchStore.subscribe((state, previous) => {
      sync();
      if (inMatch()) {
        for (const role of match.onChange(
          previous,
          state,
          sessionStore.getState().playerId,
          roomStore.getState().room?.mode === 'coop',
        )) {
          player.cue(role);
        }
      }
    }),
    roomStore.subscribe((state, previous) => {
      cue(roomCue(previous.room, state.room, sessionStore.getState().playerId));
    }),
    sessionStore.subscribe((state, previous) => {
      cue(enterCue(previous.entered, state.entered));
      cue(connectionCue(previous.connection.status, state.connection.status));
    }),
    assetsStore.subscribe(sync),
    settingsStore.subscribe((state, previous) => {
      if (state.audio !== previous.audio) {
        output.setGains(audioGains(state.audio));
      }
    }),
    setCueSink((role) => player.cue(role)),
    intents?.onOutcome((intent, outcome) => {
      cue(intentCue(intent.type, outcome.ok));
    }) ?? (() => undefined),
  ];
  sync();

  return {
    player,
    onFrame(frame) {
      if (frame.t === 'b.start') {
        battle.reset();
      } else if (!inMatch()) {
        return;
      } else if (frame.t === 'm.layer') {
        const role = layerCue(frame, sessionStore.getState().playerId);
        if (role) {
          player.cue(role);
        }
      } else if (
        frame.t === 'b.ev' &&
        frame.fieldId === playbackStore.getState().battle?.fieldId
      ) {
        for (const cue of battle.onEvents(frame.ev)) {
          player.cue(cue);
        }
      }
    },
    dispose() {
      clearInterval(countdown);
      for (const stop of unsubscribe) {
        stop();
      }
      player.stop();
    },
  };
}

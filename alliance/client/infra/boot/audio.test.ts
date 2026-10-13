import { PHASE } from '@alliance/contract/match.js';
import type { PublicView } from '@alliance/contract/server-message.js';
import {
  type AssetKey,
  createAssetResolver,
  type PackAsset,
} from 'arknights-assets-catalog';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playbackStore } from '../../match/playback-state.js';
import { playCue } from '../audio/feedback.js';
import type { AudioOutput } from '../audio/player.js';
import type { IntentBus, IntentListener } from '../intent/bus.js';
import type { ResourceStore } from '../resource/store.js';
import { assetsStore } from '../store/assets.js';
import { initialMatch, matchStore } from '../store/match.js';
import { presenceStore } from '../store/presence.js';
import { roomStore } from '../store/room.js';
import { initialSession, sessionStore } from '../store/session.js';
import { DEFAULT_AUDIO, settingsStore } from '../store/settings.js';
import { installAudio } from './audio.js';

const HASH = 'aa'.repeat(32);
const sound = (name: string): AssetKey => `audio:sfx/autochess/${name}`;
const LOBBY: AssetKey = 'audio:bgm/m_sys_act1autochess_loop';
const PREP: AssetKey = 'audio:bgm/m_bat_act1autochess_loop';
const EARLY: AssetKey = 'audio:bgm/m_bat_kazimierz2_2_loop';
const LATE: AssetKey = 'audio:bgm/m_bat_kazimierz2_1_loop';
const CUES = {
  ui: {
    click: sound('click'),
    buy: sound('buy'),
    error: sound('error'),
    roundStart: sound('roundstart'),
    timer: sound('timer'),
    emote: sound('emote'),
    start: sound('start'),
    disconnect: sound('disconnect'),
    matchSucceed: sound('matchsucceed'),
    joinRoom: sound('joinroom'),
  },
  bond: { levelUp: sound('buffup') },
  battle: { deploy: sound('deploy'), enemyDie: sound('enemydie') },
  bgm: {
    lobby: { loop: LOBBY },
    prep: { loop: PREP },
    combat: { loop: PREP },
  },
  combat: [
    { rounds: { from: 1, to: 7 }, loop: EARLY },
    { rounds: { from: 8 }, loop: LATE },
  ],
};
const audio: PackAsset = {
  kind: 'audio',
  files: [{ role: 'main', name: null, format: 'mp3', bytes: 1, hash: HASH }],
  dependsOn: [],
  fallbackId: null,
  preloadGroup: null,
};
const KEYS = [
  LOBBY,
  PREP,
  EARLY,
  LATE,
  ...Object.values(CUES.ui),
  ...Object.values(CUES.bond),
  ...Object.values(CUES.battle),
];
const resources = {
  resolver: createAssetResolver([
    {
      url: 'https://cdn.example/res/season/',
      manifest: {
        schemaVersion: 1,
        pack: { type: 'season', id: 's', version: '1', contentHash: HASH },
        requires: [],
        fileRoot: 'files/',
        assets: Object.fromEntries(KEYS.map((key) => [key, audio])),
      },
    },
  ]),
  refs: {},
  cues: CUES,
} as unknown as ResourceStore;

function recorder() {
  const calls: string[] = [];
  const output: AudioOutput = {
    playOnce: (source) => calls.push(`once ${source.key}`),
    playMusic: (_intro, loop) => calls.push(`music ${loop.key}`),
    stopMusic: () => calls.push('stop'),
    setGains: (gains) => calls.push(`gains ${gains.music} ${gains.sfx}`),
  };
  const played = () =>
    calls
      .filter((call) => call.startsWith('once'))
      .map((call) => call.slice(5));
  return { calls, output, played };
}

function fakeIntents() {
  const listeners: IntentListener[] = [];
  const bus = {
    onOutcome: (listener: IntentListener) => {
      listeners.push(listener);
      return () => undefined;
    },
  } as unknown as IntentBus;
  const answer = (type: string, ok: boolean) => {
    for (const listener of listeners) {
      listener(
        { type },
        ok
          ? { ok: true, reply: { t: 'ok' } }
          : ({ ok: false, error: new Error('no') } as never),
      );
    }
  };
  return { bus, answer };
}

const view = (phase: string, round = 1, deadline = 0) =>
  ({ phase, round, deadline, players: [] }) as unknown as PublicView;

beforeEach(() => {
  assetsStore.setState({ resources });
  sessionStore.setState({ playerId: 'p1' });
  presenceStore.setState({ presence: { kind: 'in-match', code: 'HAHT' } });
});

afterEach(() => {
  vi.useRealTimers();
  assetsStore.setState({ resources: null, match: null });
  matchStore.setState(initialMatch());
  playbackStore.setState({ battle: null });
  presenceStore.setState({ presence: { kind: 'disconnected' } });
  sessionStore.setState(initialSession());
  settingsStore.setState({ audio: DEFAULT_AUDIO });
});

describe('audio of the shell', () => {
  it('plays the lobby, the track of the phase, the combat track of the round, and stops when disconnected', () => {
    presenceStore.setState({ presence: { kind: 'connected' } });
    const { calls, output } = recorder();
    const runtime = installAudio({ output });
    presenceStore.setState({ presence: { kind: 'in-match', code: 'HAHT' } });
    matchStore.setState({ public: view(PHASE.PREP) });
    matchStore.setState({ public: view(PHASE.COMBAT, 3) });
    matchStore.setState({ public: view(PHASE.COMBAT, 9) });
    presenceStore.setState({ presence: { kind: 'disconnected' } });
    runtime.dispose();
    expect(
      calls.filter((call) => call.startsWith('music') || call === 'stop'),
    ).toEqual([
      `music ${LOBBY}`,
      `music ${PREP}`,
      `music ${EARLY}`,
      `music ${LATE}`,
      'stop',
    ]);
  });

  it('cues the own bond layer gains during a match only', () => {
    const { output, played } = recorder();
    const runtime = installAudio({ output });
    const layer = (playerId: string) =>
      ({ t: 'm.layer', playerId, bondId: 'bond_a', add: 1 }) as const;
    runtime.onFrame(layer('p2'));
    runtime.onFrame(layer('p1'));
    presenceStore.setState({ presence: { kind: 'in-room', code: 'HAHT' } });
    runtime.onFrame(layer('p1'));
    runtime.dispose();
    expect(played()).toEqual([sound('buffup')]);
  });

  it('cues the intents, the phases, the emotes of the others and the buttons', () => {
    const { output, played } = recorder();
    const intents = fakeIntents();
    const runtime = installAudio({ output, intents: intents.bus });
    intents.answer('g.buy', true);
    intents.answer('g.buy', false);
    matchStore.setState({ public: view(PHASE.ROUND_START) });
    matchStore.setState({
      emotes: [{ seq: 1, playerId: 'p2', id: 'e1', at: 0 }],
    });
    matchStore.setState({
      emotes: [
        { seq: 1, playerId: 'p2', id: 'e1', at: 0 },
        { seq: 2, playerId: 'p1', id: 'e1', at: 0 },
      ],
    });
    playCue('ui.click');
    runtime.dispose();
    playCue('ui.click');
    expect(played()).toEqual([
      sound('buy'),
      sound('error'),
      sound('roundstart'),
      sound('emote'),
      sound('click'),
    ]);
  });

  it('ticks the last seconds of the preparation once each', () => {
    vi.useFakeTimers({ now: 100_000 });
    const { output, played } = recorder();
    const runtime = installAudio({ output });
    matchStore.setState({ public: view(PHASE.PREP, 1, 100_000 + 7_000) });
    vi.advanceTimersByTime(7_000);
    runtime.dispose();
    expect(played().filter((key) => key === sound('timer'))).toHaveLength(5);
  });

  it('cues the battle events of the shown field', () => {
    const { output, played } = recorder();
    const runtime = installAudio({ output });
    playbackStore.setState({
      battle: { fieldId: 'f1' } as never,
    });
    runtime.onFrame({ t: 'b.start' } as never);
    const ev = (fieldId: string, events: unknown[][]) =>
      ({ t: 'b.ev', fieldId, gt: 0, ev: events }) as const;
    runtime.onFrame(
      ev('f1', [
        ['spawn', { id: 'u1', side: 'player', kind: 'char' }],
        ['spawn', { id: 'e1', side: 'enemy', kind: 'enemy', tier: 1 }],
        ['deploy', 'u1'],
        ['die', 'e1', 'kill'],
      ]),
    );
    runtime.onFrame(ev('f2', [['deploy', 'u1']]));
    runtime.dispose();
    expect(played()).toEqual([sound('deploy'), sound('enemydie')]);
  });

  it('cues entering, the match start, a joining player and a lost connection', () => {
    presenceStore.setState({ presence: { kind: 'in-room', code: 'HAHT' } });
    const { output, played } = recorder();
    const runtime = installAudio({ output });
    const online = sessionStore.getState().connection;
    sessionStore.setState({ entered: true });
    sessionStore.setState({ connection: { ...online, status: 'online' } });
    const room = (...ids: string[]) =>
      ({
        code: 'HAHT',
        seats: ids.map((playerId, seat) => ({ seat, playerId, isBot: false })),
      }) as never;
    roomStore.setState({ room: room('p1') });
    roomStore.setState({ room: room('p1', 'p2') });
    presenceStore.setState({ presence: { kind: 'in-match', code: 'HAHT' } });
    sessionStore.setState({
      connection: { ...online, status: 'reconnecting' },
    });
    runtime.dispose();
    roomStore.setState({ room: null });
    expect(played()).toEqual([
      sound('start'),
      sound('joinroom'),
      sound('matchsucceed'),
      sound('disconnect'),
    ]);
  });

  it('applies the volume settings to the output', () => {
    const { calls, output } = recorder();
    const runtime = installAudio({ output });
    settingsStore.setState({
      audio: { ...DEFAULT_AUDIO, sfx: { volume: 80, muted: true } },
    });
    runtime.dispose();
    expect(calls.filter((call) => call.startsWith('gains'))).toEqual([
      `gains ${0.8 * 0.6} ${0.8 * 0.8}`,
      `gains ${0.8 * 0.6} 0`,
    ]);
  });
});

import { PHASE } from '@alliance/contract/match.js';
import type {
  PublicView,
  RoomView,
} from '@alliance/contract/server-message.js';
import { describe, expect, it } from 'vitest';
import { initialMatch, type MatchState } from '#infra/store/match.js';
import {
  connectionCue,
  countdownCue,
  createBattleCues,
  createMatchCues,
  enterCue,
  intentCue,
  phaseCue,
  presenceCue,
  roomCue,
} from './events.js';

const view = (phase: string, players = 1) =>
  ({
    phase,
    players: Array.from({ length: players }, (_, index) => ({
      playerId: `x${index}`,
      lp: 10,
    })),
  }) as unknown as PublicView;
const match = (change: Partial<MatchState>): MatchState => ({
  ...initialMatch(),
  ...change,
});

describe('cue events', () => {
  it('cues an accepted intent by its type and any refused one as an error', () => {
    expect(intentCue('g.refresh', true)).toBe('ui.refresh');
    expect(intentCue('g.ready', true)).toBeNull();
    expect(intentCue('g.ready', false)).toBe('ui.error');
    expect(intentCue('room.join', false)).toBe('ui.matchFail');
    expect(intentCue('room.leave', true)).toBe('ui.matchCancel');
  });

  it('cues the start of a phase, the boss round by the team size', () => {
    expect(phaseCue(view(PHASE.ROUND_START))).toBe('ui.roundStart');
    expect(phaseCue(view(PHASE.COMBAT))).toBe('ui.battleStart');
    expect(phaseCue(view(PHASE.FINAL_ASSAULT, 1))).toBe('ui.bossRoundSingle');
    expect(phaseCue(view(PHASE.FINAL_ASSAULT, 3))).toBe('ui.bossRoundTeam');
    expect(phaseCue(view(PHASE.RESULT))).toBeNull();
  });

  it('ticks once per second in the last five seconds of the preparation', () => {
    expect(countdownCue(PHASE.PREP, 6, 5)).toBe('ui.timer');
    expect(countdownCue(PHASE.PREP, 5, 5)).toBeNull();
    expect(countdownCue(PHASE.PREP, 7, 6)).toBeNull();
    expect(countdownCue(PHASE.PREP, 1, 0)).toBeNull();
    expect(countdownCue(PHASE.COMBAT, 4, 3)).toBeNull();
  });

  it('cues the new phase, a new broadcast line, the emote of another player and the result', () => {
    const cues = createMatchCues();
    const before = match({ public: view(PHASE.PREP) });
    expect(
      cues.onChange(
        before,
        match({
          public: view(PHASE.COMBAT),
          ticker: [{ id: 1, text: 'x' }],
          emotes: [{ seq: 1, playerId: 'p2', id: 'e', at: 0 }],
          result: { victory: false } as MatchState['result'],
        }),
        'p1',
        false,
      ),
    ).toEqual([
      'ui.battleStart',
      'ui.broadcast',
      'ui.emote',
      'ui.settlementFail',
    ]);
    expect(
      cues.onChange(
        before,
        match({
          public: view(PHASE.PREP),
          emotes: [{ seq: 1, playerId: 'p1', id: 'e', at: 0 }],
        }),
        'p1',
        false,
      ),
    ).toEqual([]);
    const won = { victory: true } as MatchState['result'];
    expect(cues.onChange(before, match({ result: won }), 'p1', true)).toEqual([
      'ui.settlementTeam',
    ]);
    expect(cues.onChange(before, match({ result: won }), 'p1', false)).toEqual([
      'ui.settlementSucceed',
    ]);
  });

  it('tells the end of a battle by the LP it cost', () => {
    const at = (phase: string, lp: number) =>
      match({
        public: {
          phase,
          players: [{ playerId: 'p1', lp }],
        } as unknown as PublicView,
      });
    const cues = createMatchCues();
    cues.onChange(at(PHASE.PREP, 20), at(PHASE.COMBAT, 20), 'p1', false);
    // The settlement LP may come after the phase change: nothing is decided in SETTLE.
    expect(
      cues.onChange(at(PHASE.COMBAT, 20), at(PHASE.SETTLE, 20), 'p1', false),
    ).toEqual([]);
    cues.onChange(at(PHASE.SETTLE, 20), at(PHASE.SETTLE, 17), 'p1', false);
    expect(
      cues.onChange(
        at(PHASE.SETTLE, 17),
        at(PHASE.ROUND_START, 17),
        'p1',
        false,
      ),
    ).toEqual(['ui.battleOverReduce', 'ui.roundStart']);
    cues.onChange(at(PHASE.PREP, 17), at(PHASE.COMBAT, 17), 'p1', false);
    cues.onChange(at(PHASE.COMBAT, 17), at(PHASE.SETTLE, 17), 'p1', false);
    expect(
      cues.onChange(at(PHASE.SETTLE, 17), at(PHASE.RESULT, 17), 'p1', false),
    ).toEqual(['ui.battleOverNormal']);
    cues.onChange(at(PHASE.PREP, 17), at(PHASE.UNITE, 17), 'p1', false);
    cues.onChange(at(PHASE.UNITE, 17), at(PHASE.SETTLE, 17), 'p1', false);
    expect(
      cues.onChange(
        at(PHASE.SETTLE, 17),
        at(PHASE.ROUND_START, 17),
        'p1',
        false,
      ),
    ).toEqual(['ui.battleOverNoReduce', 'ui.roundStart']);
    expect(
      cues.onChange(at(PHASE.SETTLE, 7), at(PHASE.SETTLE, 4), 'p1', false),
    ).toEqual(['ui.danger']);
  });

  it('tells the end of a co-op defence by the settled LP charge when the settlement data carries it', () => {
    const at = (phase: string, losses?: Record<string, number>) =>
      match({
        public: {
          phase,
          players: [{ playerId: 'p1', lp: 17 }],
        } as unknown as PublicView,
        settlement: losses ? { lpLoss: losses } : null,
      });
    const cues = createMatchCues();
    cues.onChange(at(PHASE.PREP), at(PHASE.UNITE), 'p1', true);
    // the LP push has not come yet; the settled charge decides at once
    expect(
      cues.onChange(at(PHASE.UNITE), at(PHASE.SETTLE, { p1: 2 }), 'p1', true),
    ).toEqual(['ui.battleOverReduce']);
    expect(
      cues.onChange(
        at(PHASE.SETTLE, { p1: 2 }),
        at(PHASE.ROUND_START),
        'p1',
        true,
      ),
    ).toEqual(['ui.roundStart']);
    cues.onChange(at(PHASE.PREP), at(PHASE.UNITE), 'p1', true);
    expect(
      cues.onChange(at(PHASE.UNITE), at(PHASE.SETTLE, { p1: 0 }), 'p1', true),
    ).toEqual(['ui.battleOverNoReduce']);
    // a result without the own player falls back to the first state after SETTLE
    cues.onChange(at(PHASE.PREP), at(PHASE.UNITE), 'p1', true);
    expect(
      cues.onChange(at(PHASE.UNITE), at(PHASE.SETTLE, { p2: 3 }), 'p1', true),
    ).toEqual([]);
    expect(
      cues.onChange(
        at(PHASE.SETTLE, { p2: 3 }),
        at(PHASE.ROUND_START),
        'p1',
        true,
      ),
    ).toEqual(['ui.battleOverNoReduce', 'ui.roundStart']);
  });

  it('cues going first, the own draft turn and the fall of the boss', () => {
    const cues = createMatchCues();
    const drafting = (turn: string | null) =>
      match({
        public: {
          phase: PHASE.BAND_DRAFT,
          players: [],
          draft: { order: ['p1', 'p2'], turn, picks: {} },
        } as unknown as PublicView,
      });
    expect(
      cues.onChange(
        match({ public: view(PHASE.BAND_DRAFT) }),
        drafting('p1'),
        'p1',
        true,
      ),
    ).toEqual(['ui.goFirst', 'ui.yourTurn']);
    expect(cues.onChange(drafting('p1'), drafting('p2'), 'p1', true)).toEqual(
      [],
    );
    const boss = (hp: number) =>
      match({
        public: {
          phase: PHASE.FINAL_ASSAULT,
          players: [],
          bossHp: { hp, max: 100 },
        } as unknown as PublicView,
      });
    expect(cues.onChange(boss(10), boss(0), 'p1', true)).toEqual([
      'ui.killBoss',
    ]);
  });

  it('cues entering, losing the connection, the match start and a player joining the room', () => {
    expect(enterCue(false, true)).toBe('ui.start');
    expect(enterCue(true, true)).toBeNull();
    expect(connectionCue('online', 'reconnecting')).toBe('ui.disconnect');
    expect(connectionCue('connecting', 'online')).toBeNull();
    expect(
      presenceCue(
        { kind: 'in-room', code: 'A' },
        { kind: 'in-match', code: 'A' },
      ),
    ).toBe('ui.matchSucceed');
    const room = (...ids: string[]) =>
      ({
        code: 'A',
        seats: ids.map((playerId, seat) => ({ seat, playerId, isBot: false })),
      }) as unknown as RoomView;
    expect(roomCue(room('p1'), room('p1', 'p2'), 'p1')).toBe('ui.joinRoom');
    expect(roomCue(null, room('p1', 'p2'), 'p1')).toBeNull();
    expect(roomCue(room('p1', 'p2'), room('p1'), 'p1')).toBeNull();
  });

  it('cues the shared battle sounds of the units it saw spawn', () => {
    const battle = createBattleCues();
    expect(
      battle.onEvents([
        ['spawn', { id: 'c', side: 'player', kind: 'char' }],
        ['spawn', { id: 't', side: 'player', kind: 'token' }],
        ['spawn', { id: 'e', side: 'enemy', kind: 'enemy', tier: 2 }],
        ['deploy', 'c'],
        ['deploy', 't'],
        ['atk', 'e', 'c', 'none'],
        ['atk', 'c', 'e', 'none'],
        ['heal', 'c', 10],
        ['die', 'e', 'kill'],
        ['die', 't', 'kill'],
        ['die', 'c', 'kill'],
        ['leak', 'x'],
        ['die', 'unknown', 'kill'],
      ]),
    ).toEqual([
      'battle.deploy',
      'battle.tokenDeploy',
      'battle.enemyHit',
      'battle.heal',
      'battle.enemyDieHeavy',
      'battle.tokenDie',
      'battle.charDie',
      'battle.leak',
    ]);
    battle.reset();
    expect(battle.onEvents([['deploy', 'c']])).toEqual([]);
  });
});

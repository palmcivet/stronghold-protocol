import { PHASE, type Phase } from '@alliance/contract/match.js';
import type {
  PublicView,
  RoomView,
} from '@alliance/contract/server-message.js';
import type { CueRole } from '@alliance/data/pack-app';
import type { ConnectionStatus } from '../connection/socket.js';
import type { MatchState } from '../store/match.js';
import type { Presence } from '../store/presence.js';

/** Cue of an intent the server accepted. */
const INTENT_CUES: Readonly<Record<string, CueRole>> = {
  'g.buy': 'ui.buy',
  'g.sell': 'ui.sell',
  'g.refresh': 'ui.refresh',
  'g.freeze': 'ui.freeze',
  'g.levelUp': 'ui.levelup',
  'g.move': 'ui.drop',
  'g.equip': 'ui.equip',
  'g.art': 'ui.artPlace',
  'g.reward': 'ui.pick',
  'g.choice': 'ui.pick',
  'g.band': 'ui.confirm',
  'g.bandSkip': 'ui.back',
  'g.infoReady': 'ui.ready',
  'g.emote': 'ui.emote',
  'g.destroy': 'ui.back',

  'room.leave': 'ui.matchCancel',
};

/** Cue of a refused intent that has its own sound instead of the error sound. */
const REFUSED_CUES: Readonly<Record<string, CueRole>> = {
  'room.join': 'ui.matchFail',
  'room.create': 'ui.matchFail',
};

/** Cue of an intent's outcome: its own sound when accepted, the error sound when refused. */
export function intentCue(type: string, ok: boolean): CueRole | null {
  return ok ? (INTENT_CUES[type] ?? null) : (REFUSED_CUES[type] ?? 'ui.error');
}

/** Cue of entering a phase. */
export function phaseCue(
  view: Pick<PublicView, 'phase' | 'players'>,
): CueRole | null {
  switch (view.phase) {
    case PHASE.ROUND_START:
      return 'ui.roundStart';
    case PHASE.PREP:
      return 'ui.rest';
    case PHASE.COMBAT:
      return 'ui.battleStart';
    case PHASE.UNITE:
      return 'ui.defenceUnite';
    case PHASE.FINAL_ASSAULT:
      return view.players.length <= 1
        ? 'ui.bossRoundSingle'
        : 'ui.bossRoundTeam';
    case PHASE.HIDDEN_CORE:
      return 'ui.bossRoundSecret';
    case PHASE.SP_DRAFT:
      return 'ui.draft';
    default:
      return null;
  }
}

/** Seconds left of the preparation that tick the countdown. */
export const COUNTDOWN_SECONDS = 5;

/** Countdown tick: once per second in the last seconds of the preparation. */
export function countdownCue(
  phase: Phase | null,
  previous: number,
  seconds: number,
): CueRole | null {
  return phase === PHASE.PREP &&
    seconds !== previous &&
    seconds > 0 &&
    seconds <= COUNTDOWN_SECONDS
    ? 'ui.timer'
    : null;
}

/** LP at or below which the own LP is in danger. */
export const DANGER_LP = 5;

const BATTLE_PHASES: ReadonlySet<Phase> = new Set([PHASE.COMBAT, PHASE.UNITE]);

export interface MatchCues {
  /**
   * Cues of a change of the match state: a new phase, the own turn of a draft and going first, the end of a battle by
   * the LP it cost, the own LP falling into danger, the boss falling, broadcast lines, emotes of the others and the
   * result. `team` is a match of several players.
   */
  onChange(
    previous: MatchState,
    next: MatchState,
    playerId: string | null,
    team: boolean,
  ): readonly CueRole[];
}

const lpOf = (state: MatchState, playerId: string | null): number | null =>
  state.public?.players.find((player) => player.playerId === playerId)?.lp ??
  null;

const battleOverCue = (lost: boolean, unite: boolean): CueRole =>
  lost
    ? 'ui.battleOverReduce'
    : unite
      ? 'ui.battleOverNoReduce'
      : 'ui.battleOverNormal';

/** A battle that ended and waits for the state that settles it. */
interface EndedBattle {
  /** Own LP when the battle started. */
  readonly lp: number | null;
  readonly unite: boolean;
}

/**
 * Match cues. The end of a battle is cued from the settlement: the own LP charge of the settlement data once the
 * state carries it, else on the first state after the settlement, when the phase moves on from `SETTLE` to the next
 * round or the result, whose LP is settled whatever order the pushes came in.
 */
export function createMatchCues(): MatchCues {
  let lpAtBattle: number | null = null;
  let ended: EndedBattle | null = null;
  return {
    onChange(previous, next, playerId, team) {
      const cues: CueRole[] = [];
      const view = next.public;
      const before = previous.public;
      if (view && view.phase !== before?.phase) {
        if (
          before &&
          BATTLE_PHASES.has(before.phase) &&
          !BATTLE_PHASES.has(view.phase)
        ) {
          ended = { lp: lpAtBattle, unite: before.phase === PHASE.UNITE };
          lpAtBattle = null;
        }
        if (ended && view.phase !== PHASE.SETTLE) {
          const lp = lpOf(next, playerId);
          cues.push(
            battleOverCue(
              ended.lp !== null && lp !== null && lp < ended.lp,
              ended.unite,
            ),
          );
          ended = null;
        }
        if (BATTLE_PHASES.has(view.phase) && lpAtBattle === null) {
          lpAtBattle = lpOf(next, playerId);
        }
        const cue = phaseCue(view);
        if (cue) {
          cues.push(cue);
        }
      }
      const loss =
        playerId === null ? undefined : next.settlement?.lpLoss[playerId];
      if (ended && view?.phase === PHASE.SETTLE && typeof loss === 'number') {
        cues.push(battleOverCue(loss > 0, ended.unite));
        ended = null;
      }
      if (view?.draft && !before?.draft && view.draft.order[0] === playerId) {
        cues.push('ui.goFirst');
      }
      const turn = view?.draft?.turn ?? view?.sp?.turn ?? null;
      const turnBefore = before?.draft?.turn ?? before?.sp?.turn ?? null;
      if (playerId !== null && turn === playerId && turnBefore !== playerId) {
        cues.push('ui.yourTurn');
      }
      const lp = lpOf(next, playerId);
      const lpBefore = lpOf(previous, playerId);
      if (
        lp !== null &&
        lpBefore !== null &&
        lp > 0 &&
        lp <= DANGER_LP &&
        lpBefore > DANGER_LP
      ) {
        cues.push('ui.danger');
      }
      if ((before?.bossHp?.hp ?? 0) > 0 && view?.bossHp?.hp === 0) {
        cues.push('ui.killBoss');
      }
      const lastTicker = previous.ticker.at(-1)?.id ?? -1;
      if (next.ticker.some((line) => line.id > lastTicker)) {
        cues.push('ui.broadcast');
      }
      const lastEmote = previous.emotes.at(-1)?.seq ?? -1;
      if (
        next.emotes.some(
          (line) => line.seq > lastEmote && line.playerId !== playerId,
        )
      ) {
        cues.push('ui.emote');
      }
      if (next.result && !previous.result) {
        cues.push(
          !next.result.victory
            ? 'ui.settlementFail'
            : team
              ? 'ui.settlementTeam'
              : 'ui.settlementSucceed',
        );
      }
      return cues;
    },
  };
}

/** Cue of entering the game from the title screen. */
export function enterCue(before: boolean, entered: boolean): CueRole | null {
  return entered && !before ? 'ui.start' : null;
}

/** Cue of losing the connection the player had. */
export function connectionCue(
  before: ConnectionStatus,
  status: ConnectionStatus,
): CueRole | null {
  return before === 'online' && status !== 'online' ? 'ui.disconnect' : null;
}

/** Cue of the server starting the match of the room the player waits in. */
export function presenceCue(
  before: Presence,
  presence: Presence,
): CueRole | null {
  return before.kind === 'in-room' && presence.kind === 'in-match'
    ? 'ui.matchSucceed'
    : null;
}

/** Cue of another player taking a seat in the room the player is in. */
export function roomCue(
  before: RoomView | null,
  room: RoomView | null,
  playerId: string | null,
): CueRole | null {
  if (!before || !room || before.code !== room.code) {
    return null;
  }
  const seated = (view: RoomView): ReadonlySet<string> =>
    new Set(
      view.seats.flatMap((seat) =>
        seat && !seat.isBot && seat.playerId !== playerId
          ? [seat.playerId]
          : [],
      ),
    );
  const earlier = seated(before);
  return [...seated(room)].some((id) => !earlier.has(id))
    ? 'ui.joinRoom'
    : null;
}

interface TrackedUnit {
  readonly side: string;
  readonly kind: string;
  readonly tier: number;
}

export interface BattleCues {
  /** Cues of a batch of `b.ev` events of the shown field. */
  onEvents(events: readonly (readonly unknown[])[]): readonly CueRole[];
  /** Forgets the units of the last battle. */
  reset(): void;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === 'object';

/** Battle sounds shared by every unit, from the events of the battle. Units are known from their `spawn` event. */
export function createBattleCues(): BattleCues {
  const units = new Map<string, TrackedUnit>();
  const classOf = (unit: TrackedUnit): 'enemy' | 'token' | 'char' =>
    unit.side === 'enemy' ? 'enemy' : unit.kind === 'token' ? 'token' : 'char';
  return {
    onEvents(events) {
      const cues: CueRole[] = [];
      for (const event of events) {
        const [kind, first, second] = event;
        if (
          kind === 'spawn' &&
          isRecord(first) &&
          typeof first.id === 'string'
        ) {
          units.set(first.id, {
            side: String(first.side ?? ''),
            kind: String(first.kind ?? ''),
            tier: Number(first.tier ?? 1),
          });
          continue;
        }
        const unit = typeof first === 'string' ? units.get(first) : undefined;
        if (kind === 'heal') {
          cues.push('battle.heal');
        } else if (kind === 'leak') {
          cues.push('battle.leak');
        } else if (!unit) {
        } else if (kind === 'deploy' && unit.side !== 'enemy') {
          cues.push(
            classOf(unit) === 'token' ? 'battle.tokenDeploy' : 'battle.deploy',
          );
        } else if (kind === 'die') {
          const unitClass = classOf(unit);
          cues.push(
            unitClass === 'enemy'
              ? unit.tier >= 2
                ? 'battle.enemyDieHeavy'
                : 'battle.enemyDie'
              : unitClass === 'token'
                ? 'battle.tokenDie'
                : 'battle.charDie',
          );
        } else if (
          kind === 'atk' &&
          unit.side === 'enemy' &&
          typeof second === 'string' &&
          units.get(second)?.side !== 'enemy'
        ) {
          cues.push('battle.enemyHit');
        }
      }
      return cues;
    },
    reset() {
      units.clear();
    },
  };
}

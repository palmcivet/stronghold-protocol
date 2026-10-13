import type { Dir, ErrCode, Phase } from '#contract/match.js';
import type { S2CType, UnitStatsEntry } from '#contract/message.js';

/** Payloads of the server → client messages. A server may send fields beyond these; receivers ignore them. */

/** A server text: the msgid and its parameters, with `text` as the fallback. */
export interface WireText {
  readonly text: string;
  readonly msgid?: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

export interface WelcomeMessage {
  readonly t: 'welcome';
  readonly playerId: string;
  readonly token: string;
  readonly name: string;
  /** Server clock, epoch ms. */
  readonly serverNow: number;
  readonly version: number;
  readonly resumed: boolean;
  /** Present on a backend with the extension handshake. */
  readonly ext?: Readonly<Record<string, unknown>>;
}

export interface OkMessage {
  readonly t: 'ok';
  readonly rid: number;
}

export interface ErrorMessage {
  readonly t: 'error';
  readonly rid?: number;
  readonly code: ErrCode;
  readonly msg: string;
  readonly detail?: string;
}

export interface PongMessage {
  readonly t: 'pong';
  /** The client clock the `ping` carried. */
  readonly c: number;
  /** Server clock, epoch ms. */
  readonly s: number;
}

export interface SeatView {
  readonly seat: number;
  readonly playerId: string;
  readonly name: string;
  readonly isBot: boolean;
  readonly ready: boolean;
  readonly connected: boolean;
}

export interface SpectatorView {
  readonly playerId: string;
  readonly name: string;
  readonly connected?: boolean;
}

export interface RoomView {
  readonly code: string;
  readonly hostId: string;
  readonly mode: 'solo' | 'coop';
  readonly difficulty: string;
  readonly aiPicksLast?: boolean;
  readonly inMatch: boolean;
  readonly seats: readonly (SeatView | null)[];
  readonly spectators: readonly SpectatorView[];
}

export interface RoomStateMessage extends RoomView {
  readonly t: 'room.state';
}

export interface RoomClosedMessage {
  readonly t: 'room.closed';
  readonly reason: string;
}

export interface BondView {
  readonly bondId: string;
  readonly count: number;
  readonly active: boolean;
  readonly tier: number;
  readonly layers: number;
  readonly thresholds?: readonly number[];
  readonly countsHand?: boolean;
  /** A bond the mode switched off that still has members. */
  readonly off?: boolean;
}

export interface PlayerView {
  readonly playerId: string;
  readonly seat: number;
  readonly name: string;
  readonly isBot: boolean;
  readonly connected: boolean;
  readonly alive: boolean;
  readonly lp: number;
  readonly bandId: string | null;
  readonly shopLevel: number;
  readonly boardCount: number;
  readonly ready: boolean;
  readonly bonds?: readonly BondView[];
  readonly fieldId: string | null;
  readonly status: string;
  readonly autoplay: boolean;
}

export interface FieldProgress {
  readonly killed: number;
  readonly resolved?: number | null;
  readonly total: number;
  readonly done: boolean;
}

export interface FieldView {
  readonly fieldId: string;
  readonly kind: string;
  readonly players: readonly string[];
  readonly live: boolean;
  readonly progress?: FieldProgress;
}

export interface DraftView {
  readonly order: readonly string[];
  readonly turn: string | null;
  readonly picks: Readonly<Record<string, string>>;
  readonly skipsLeft?: Readonly<Record<string, number>>;
  /** Epoch ms of the turn end, 0 for untimed. */
  readonly turnDeadline: number;
  readonly turnSeconds?: number;
  readonly untimed: boolean;
}

export interface CardView {
  readonly kind: 'chess' | 'item';
  readonly id: string;
  readonly price?: number;
  readonly sold?: boolean;
  readonly soldOut?: boolean;
}

export interface SpDraftView {
  readonly family?: string;
  readonly name?: string;
  readonly desc?: string;
  readonly eventId?: string;
  readonly cards: readonly CardView[];
  readonly order?: readonly string[];
  readonly turn: string | null;
  readonly picks: Readonly<Record<string, unknown>>;
  readonly taken?: Readonly<Record<string, unknown>>;
  readonly untimed?: boolean;
}

export interface PublicView {
  readonly phase: Phase;
  readonly round: number;
  readonly lastRound: number;
  /** Epoch ms of the phase end, 0 for untimed. */
  readonly deadline: number;
  readonly serverNow: number;
  readonly modeId: string;
  readonly difficulty: string;
  readonly stageId: string | null;
  readonly setupRevision?: number;
  readonly factions?: readonly string[];
  readonly disabledBonds?: readonly string[];
  readonly bannedChess?: readonly string[];
  readonly bossId?: string | null;
  readonly hiddenBossId?: string | null;
  readonly bossRound?: number;
  readonly hiddenRound?: number;
  readonly spRound?: boolean;
  /** `client`: the browsers run the battles from `b.start`; `server`: the server streams them. */
  readonly combatMode?: 'client' | 'server';
  readonly paused?: boolean;
  readonly teamLp?: number;
  readonly bossHp?: { readonly hp: number; readonly max: number };
  readonly players: readonly PlayerView[];
  readonly fields: readonly FieldView[];
  readonly draft?: DraftView;
  readonly sp?: SpDraftView;
}

export interface PublicMessage extends PublicView {
  readonly t: 'm.public';
}

export interface ShopSlot extends CardView {
  readonly price: number;
  readonly basePrice?: number;
  readonly frozen?: boolean;
}

export interface RewardOffer {
  readonly tier?: number;
  readonly source?: 'merge' | 'special';
  readonly label?: string | null;
  readonly queued?: number;
  readonly slots: readonly CardView[];
}

export interface ShopView {
  readonly level: number;
  readonly maxLevel: number;
  readonly upgradePrice: number;
  readonly refreshPrice: number;
  readonly freeRefreshes: number;
  readonly frozen: boolean;
  readonly slots: readonly (ShopSlot | null)[];
  readonly rewardOffer: RewardOffer | null;
}

export interface PieceItem {
  readonly uid: number;
  readonly id: string;
}

export interface PieceView {
  readonly uid: number;
  readonly kind: 'chess' | 'item';
  readonly id: string;
  readonly golden?: boolean;
  readonly tier?: number;
  readonly items?: readonly PieceItem[];
  readonly count?: number;
  readonly row?: number;
  readonly col?: number;
  readonly dir?: Dir;
}

export interface EnemyPreview {
  readonly enemyKey: string;
  readonly count: number;
  readonly gate?: string;
  readonly t?: number;
  readonly fly?: boolean;
  readonly elite?: boolean;
  readonly boss?: boolean;
  readonly tag?: string | null;
}

export interface EffectView {
  readonly id: string;
  readonly name?: string;
  readonly desc?: string;
  readonly iconKind?: string;
  readonly iconId?: string;
}

export interface ChoiceView {
  readonly id: string;
  readonly round?: number;
  readonly sourceItemId?: string | null;
  readonly cards: readonly CardView[];
}

export interface LoadoutChoice {
  readonly skill?: number;
  readonly module?: string | null;
}

export interface PrivateView {
  readonly playerId: string;
  readonly seat?: number;
  readonly alive: boolean;
  readonly lp: number;
  readonly funds: number;
  readonly bandId: string | null;
  readonly ready: boolean;
  readonly canReady: boolean;
  readonly personalChoice: ChoiceView | null;
  readonly shop: ShopView;
  readonly hand: readonly (PieceView | null)[];
  readonly temp: readonly (PieceView | null)[];
  readonly board: readonly PieceView[];
  readonly deployCap: number;
  readonly deployCount: number;
  readonly bonds: readonly BondView[];
  readonly effects: readonly EffectView[];
  readonly nextEnemies: readonly EnemyPreview[];
  /** Operator loadout by base chess id; chess not listed use their defaults. */
  readonly loadout: Readonly<Record<string, LoadoutChoice>>;
  /** Base chess ids this player fields as stand-ins. */
  readonly standIns?: readonly string[];
}

export interface PrivateMessage extends PrivateView {
  readonly t: 'm.private';
}

export interface FieldMessage {
  readonly t: 'm.field';
  readonly fieldId: string;
  readonly kind: string;
  readonly live: boolean;
  readonly stageId?: string | null;
  readonly rect?: FieldRect;
  readonly prep?: boolean;
}

export interface ToastMessage extends WireText {
  readonly t: 'm.toast';
  readonly kind: 'info' | 'success' | 'warn' | 'error';
}

export interface TickerMessage extends WireText {
  readonly t: 'm.ticker';
  /** The broadcast entry, null for a line of the server's own. */
  readonly id: string | number | null;
  readonly type: string;
  /** Higher plays first. */
  readonly priority: number;
  readonly playerId: string | null;
  readonly args?: readonly string[];
}

export interface EmoteMessage {
  readonly t: 'm.emote';
  readonly playerId: string;
  readonly id: string;
}

/** A live bond layer gain of the receiver during preparation. Never replayed on resync. */
export interface LayerMessage {
  readonly t: 'm.layer';
  readonly playerId: string;
  readonly bondId: string;
  readonly add: number;
}

export interface ResultRow {
  readonly playerId: string;
  readonly name: string;
  readonly seat?: number;
  readonly victory?: boolean;
  readonly roundsPassed?: number;
  readonly lp?: number;
}

export interface ResultView {
  readonly victory: boolean;
  readonly roundsPassed: number;
  readonly reason: string;
  readonly hiddenReached?: boolean;
  readonly hiddenCleared?: boolean;
  readonly teamLp?: number | null;
  readonly modeId: string;
  readonly difficulty: string;
  readonly stageId?: string | null;
  readonly bossId?: string | null;
  readonly seed?: number;
  readonly durationMs?: number;
  readonly players: readonly ResultRow[];
}

export interface ResultMessage extends ResultView {
  readonly t: 'm.result';
}

export interface UnitStatsMessage {
  readonly t: 'm.unitStats';
  readonly seq: number | null;
  readonly round: number;
  readonly units: readonly UnitStatsEntry[];
}

export interface FieldRect {
  readonly r0: number;
  readonly r1: number;
  readonly c0: number;
  readonly c1: number;
}

export interface BattleStartMessage {
  readonly t: 'b.start';
  readonly battleId: string;
  readonly fieldId: string;
  readonly kind: string;
  /** The backend's battle spec. Its shape belongs to the backend. */
  readonly spec: unknown;
  /** This client runs the battle and reports it. */
  readonly authoritative: boolean;
  /** Epoch ms the battle started on the server. */
  readonly startAt: number;
  readonly serverNow: number;
  /** Game seconds already played. */
  readonly elapsed: number;
  readonly speed: number;
  /** The receiver only watches the field. */
  readonly watch: boolean;
  readonly done: boolean;
}

export interface BattlePoolMessage {
  readonly t: 'b.pool';
  readonly hp: number;
  readonly max: number;
  readonly teamLp: number | null;
  /** Cumulative boss damage the server counted, by field. */
  readonly acked: Readonly<Record<string, number>>;
}

export interface BattleEndMessage {
  readonly t: 'b.end';
  readonly battleId: string;
  readonly fieldId: string;
  readonly reason: string;
}

export interface BattleSnapMessage {
  readonly t: 'b.snap';
  readonly fieldId: string;
  readonly gt: number;
  readonly [field: string]: unknown;
}

export interface BattleEventsMessage {
  readonly t: 'b.ev';
  readonly fieldId: string;
  readonly gt: number;
  readonly ev: readonly (readonly unknown[])[];
}

export type ServerMessage =
  | WelcomeMessage
  | OkMessage
  | ErrorMessage
  | PongMessage
  | RoomStateMessage
  | RoomClosedMessage
  | PublicMessage
  | PrivateMessage
  | FieldMessage
  | ToastMessage
  | TickerMessage
  | EmoteMessage
  | LayerMessage
  | ResultMessage
  | UnitStatsMessage
  | BattleStartMessage
  | BattlePoolMessage
  | BattleEndMessage
  | BattleSnapMessage
  | BattleEventsMessage;

/** The message of one type, with the request id a reply may carry. */
export type ServerMessageOf<T extends S2CType> = Extract<
  ServerMessage,
  { readonly t: T }
> & { readonly rid?: number };

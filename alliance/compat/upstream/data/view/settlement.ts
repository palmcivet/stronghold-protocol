import type {
  ResultBond,
  ResultLineupEntry,
  ResultRow,
  ResultStats,
  ResultView,
} from '@alliance/contract/server-message.js';

/** Outcome of a co-op defence in master's `SETTLE` view (`m.public.uniteResult`). Master only; next does not send it. */
export interface MasterUniteResult {
  /** Enemies of the leakers that still got through. */
  readonly through: number;
  readonly helpers: readonly string[];
  readonly leakers: readonly string[];
  /** LP the settlement charged each alive player this round, by player id. */
  readonly losses: Readonly<Record<string, number>>;
}

/** The part of master's public view that carries settlement data. */
export interface MasterSettlementView {
  readonly uniteResult?: MasterUniteResult | null;
}

/** Settlement data the client reads, independent of the server. */
export interface Settlement {
  /** LP the settlement charged, by player id. A player without an entry has no settled charge in the data. */
  readonly lpLoss: Readonly<Record<string, number>>;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Settlement of a master public view, or null when it carries none. Entries that are not whole numbers from 0 are dropped. */
export function settlementOf(view: MasterSettlementView): Settlement | null {
  const result: unknown = view.uniteResult;
  if (!isRecord(result) || !isRecord(result.losses)) {
    return null;
  }
  const lpLoss = Object.fromEntries(
    Object.entries(result.losses).filter(
      (entry): entry is [string, number] =>
        Number.isInteger(entry[1]) && (entry[1] as number) >= 0,
    ),
  );
  return { lpLoss };
}

const str = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;
const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const bool = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;
const strOrNull = (value: unknown): string | null | undefined =>
  value === null ? null : str(value);

/** Drops the keys whose value is undefined, so optional fields stay absent. */
function defined<T>(record: Readonly<Record<string, unknown>>): T {
  return Object.fromEntries(
    Object.entries(record).filter((entry) => entry[1] !== undefined),
  ) as T;
}

function lineupOf(value: unknown): ResultLineupEntry[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== 'string') {
      return [];
    }
    return [
      defined<ResultLineupEntry>({
        id: entry.id,
        golden: bool(entry.golden),
        tier: num(entry.tier),
        diy:
          isRecord(entry.diy) && typeof entry.diy.charId === 'string'
            ? { charId: entry.diy.charId }
            : undefined,
        standInFor: str(entry.standInFor),
      }),
    ];
  });
}

function bondsOf(value: unknown): ResultBond[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.flatMap((entry) =>
    isRecord(entry) && typeof entry.bondId === 'string'
      ? [
          defined<ResultBond>({
            bondId: entry.bondId,
            active: bool(entry.active),
            layers: num(entry.layers),
          }),
        ]
      : [],
  );
}

function statsOf(value: unknown): ResultStats | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === 'number' && Number.isFinite(entry[1]),
    ),
  );
}

function titleOf(value: unknown): ResultRow['title'] {
  if (value === null) {
    return null;
  }
  if (!isRecord(value) || typeof value.name !== 'string') {
    return undefined;
  }
  return defined<NonNullable<ResultRow['title']>>({
    id: str(value.id),
    name: value.name,
    text: str(value.text),
  });
}

function rowOf(value: unknown): ResultRow[] {
  if (!isRecord(value) || typeof value.playerId !== 'string') {
    return [];
  }
  return [
    defined<ResultRow>({
      playerId: value.playerId,
      name: str(value.name) ?? value.playerId,
      seat: num(value.seat),
      isBot: bool(value.isBot),
      alive: bool(value.alive),
      victory: bool(value.victory),
      roundsPassed: num(value.roundsPassed),
      lp: num(value.lp),
      bandId: strOrNull(value.bandId),
      lineup: lineupOf(value.lineup),
      bonds: bondsOf(value.bonds),
      stats: statsOf(value.stats),
      trophies: num(value.trophies),
      reward: num(value.reward),
      left: bool(value.left),
      title: titleOf(value.title),
    }),
  ];
}

/** The result screen's view of master's `m.result`. Fields of the wrong type are dropped, never guessed. */
export function resultOf(message: unknown): ResultView | null {
  if (!isRecord(message)) {
    return null;
  }
  const teamLp = message.teamLp;
  return defined<ResultView>({
    victory: message.victory === true,
    roundsPassed: num(message.roundsPassed) ?? 0,
    reason: str(message.reason) ?? '',
    hiddenReached: bool(message.hiddenReached),
    hiddenCleared: bool(message.hiddenCleared),
    teamLp: teamLp === null ? null : num(teamLp),
    modeId: str(message.modeId) ?? '',
    difficulty: str(message.difficulty) ?? '',
    stageId: strOrNull(message.stageId),
    bossId: strOrNull(message.bossId),
    hiddenBossId: strOrNull(message.hiddenBossId),
    seed: num(message.seed),
    durationMs: num(message.durationMs),
    players: Array.isArray(message.players)
      ? message.players.flatMap(rowOf)
      : [],
  });
}

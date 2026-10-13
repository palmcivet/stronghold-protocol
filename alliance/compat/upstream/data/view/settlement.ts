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

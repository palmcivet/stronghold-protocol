import type { PacketData } from "#server/entry/packet.js"

/** Prep-phase hooks the match dispatcher calls. */
export const EFFECT_HOOKS: readonly string[] = [
  "onRoundStart",
  "onIncome",
  "onPrepStart",
  "onPrepEnd",
  "onGain",
  "onSold",
  "onRefresh",
  "onPrice",
  "onBuy",
  "onSpend",
  "onMerge",
  "onLevelUp",
  "onBattleStart",
  "onBattleResult",
  "onChoicePick",
  "onEquip",
  "onArt",
  "onDestroy",
  "onLayers",
]

export type EffectHookName = (typeof EFFECT_HOOKS)[number]

export interface EffectPiece {
  readonly uid?: number
  readonly id: string
  readonly kind: string
  readonly tier?: number
  readonly row?: number
  readonly col?: number
  readonly dir?: string
  readonly area?: string
  readonly sold?: boolean
  readonly items?: readonly { readonly id: string; readonly uid?: number }[]
}

export interface EffectCard {
  readonly id?: string
  readonly team?: boolean
  readonly name?: string
  readonly desc?: string
  readonly tacticKind?: string | null
}

export interface EffectSpawn {
  enemyKey?: string
  time?: number
  interval?: number
  count?: number
  routeIndex?: number
  tag?: string | null
  countInTotal?: boolean
  mods?: Record<string, unknown> | null
  bounty?: { coins?: number; ownerPlayerId?: string } | null
}

export interface EffectRoute {
  readonly end?: readonly unknown[]
}

export interface EffectEvent {
  kind?: string
  id?: string
  price?: number
  income?: number
  amount?: number
  level?: number
  gain?: number
  error?: string
  detail?: string
  reason?: string
  bondId?: string
  trigger?: boolean
  forTeammate?: boolean
  side?: string
  input?: Record<string, unknown>
  item?: { id?: string; uid?: number } | null
  target?: EffectPiece | null
  targets?: readonly EffectPiece[]
  piece?: EffectPiece | null
  card?: EffectCard | null
  slot?: { id?: string } | null
  spawns?: EffectSpawn[]
  routes?: readonly EffectRoute[] | null
}

export interface GarrisonRecord {
  readonly effectKey?: string
  readonly effectType?: string
  readonly eventType?: string
  readonly desc?: string
  readonly bb?: Readonly<Record<string, unknown>>
  readonly bbStr?: Readonly<Record<string, unknown>>
}

export interface EffectSource {
  readonly kind: string
  readonly key?: string
  readonly piece?: EffectPiece | null
  readonly holder?: EffectPiece | null
  readonly garrisonId?: string
  readonly garrison?: GarrisonRecord | null
  readonly bb?: Readonly<Record<string, unknown>>
  readonly bbStr?: Readonly<Record<string, unknown>>
  readonly where?: string
  readonly ref?: {
    readonly id: string
    readonly key?: string
    readonly params?: Readonly<Record<string, unknown>>
    readonly data?: Readonly<Record<string, unknown>>
  } | null
  readonly bandId?: string
  readonly bondId?: string
}

export interface BondView {
  readonly count?: number
  readonly active?: boolean
  readonly tier?: number
  readonly layers?: number
}

export interface PoolRoll {
  readonly kind: string
  readonly id: string
  readonly golden?: boolean
}

export interface GameDataView {
  item(id: string): Record<string, unknown> | null
  bond(id: string): Record<string, unknown> | null
  chess(id: string): Record<string, unknown> | null
  enemy(id: string): Record<string, unknown> | null
  garrison(id: string): GarrisonRecord | null
  band(id: string): Record<string, unknown> | null
  tierOf(id: string): number
  readonly bondIds?: readonly string[]
  readonly inactiveEnemies?: ReadonlySet<string>
  rewardOffer?(): { readonly count?: number } | null
}

export interface EffectRandom {
  (): number
  chance(probability: number): boolean
  pick<T>(items: readonly T[]): T
  shuffle<T>(items: readonly T[]): T[]
  /** Integer in `0 .. span - 1`. A span below 1 returns 0. */
  int(span: number): number
}

export interface EffectTeammate {
  readonly playerId: string
  readonly seat?: number
  bandId(): string | null
  grantItem(id: string, options?: Readonly<Record<string, unknown>>): unknown
}

export interface RoundStats {
  readonly refreshes: number
  readonly buys: number
  readonly sells: number
  readonly spent: number
  readonly gainedChess: number
  readonly arts: number
}

export interface LayerGain {
  readonly requireActive?: boolean
  readonly reason?: string
}

export interface GrantOptions {
  readonly requirePool?: boolean
  readonly source?: string
  readonly golden?: boolean
}

export type EffectHook = (ctx: EffectContext, event: EffectEvent) => void

export interface EffectHandler {
  run?: EffectHook
  garrisonHooks?: (garrison: unknown) => readonly string[]
  onRoundStart?: EffectHook
  onIncome?: EffectHook
  onPrepStart?: EffectHook
  onPrepEnd?: EffectHook
  onGain?: EffectHook
  onSold?: EffectHook
  onRefresh?: EffectHook
  onPrice?: EffectHook
  onBuy?: EffectHook
  onSpend?: EffectHook
  onMerge?: EffectHook
  onLevelUp?: EffectHook
  onBattleStart?: EffectHook
  onBattleResult?: EffectHook
  onChoicePick?: EffectHook
  onEquip?: EffectHook
  onArt?: EffectHook
  onDestroy?: EffectHook
  onLayers?: EffectHook
}

/** Prep-side effect registry. Match code owns the dispatcher; content only registers handlers. */
export interface EffectRegistry {
  register(key: string, handler: EffectHandler | EffectHook): EffectRegistry
  get(key: string): EffectHandler | null
  garrison(effectKey: string, handler: EffectHandler): EffectRegistry
  band(bandId: string, handler: EffectHandler): EffectRegistry
  bond(bondId: string, handler: EffectHandler): EffectRegistry
  item(itemKey: string, handler: EffectHandler): EffectRegistry
  choice(effectId: string, handler: EffectHandler): EffectRegistry
  effect(id: string, handler: EffectHandler): EffectRegistry
  global(name: string, handler: EffectHandler): EffectRegistry
}

export interface EffectContext {
  readonly source: EffectSource
  readonly round: number
  readonly seat: number
  readonly playerId: string
  readonly phase: string
  readonly gd: GameDataView
  readonly data: PacketData
  readonly rng: EffectRandom
  hand(): readonly (EffectPiece | null)[]
  board(): readonly EffectPiece[]
  /** Temporary hand slots. */
  temp(): readonly (EffectPiece | null)[]
  shopSlots(): readonly (EffectPiece | null)[]
  shopLevel(): number
  funds(): number
  bandId(): string | null
  roundStats(): RoundStats
  teammates(): readonly EffectTeammate[]
  piece(uid: number): EffectPiece | null
  chessRecord(id: string): Record<string, unknown> | null
  bond(bondId: string): BondView | null
  bondActive(bondId: string): boolean
  bondCount(bondId: string): number
  layers(bondId: string): number
  bonds(): Readonly<Record<string, BondView | null>>
  pieceBonds(uid: number): readonly string[]
  counter(key: string): number
  incCounter(key: string, amount?: number): number
  setCounter(key: string, value: number): void
  incPieceCounter(uid: number, key: string, amount?: number): number
  grantChess(id: string, options?: GrantOptions): EffectPiece | null
  grantItem(id: string, options?: GrantOptions): EffectPiece | null
  rollChess(options?: { readonly bond?: string; readonly maxTier?: number; readonly filter?: (id: string) => boolean }): string | null
  rollItem(options?: { readonly maxTier?: number; readonly pool?: string; readonly tier?: number }): string | null
  rollPool(poolId: string): PoolRoll | null
  setShopSlot(index: number, slot: { readonly kind: string; readonly id: string; readonly frozen?: boolean } | null): void
  offerChess(ids: readonly string[] | null, options?: Readonly<Record<string, unknown>>): void
  offerItems(ids: readonly string[], options?: Readonly<Record<string, unknown>>): void
  addBounty(card: Readonly<Record<string, unknown>>): boolean
  addFunds(amount: number, reason?: string): void
  addPendingFunds(amount: number, reason?: string): void
  addLayers(bondId: string, amount: number, options?: LayerGain): number
  addEffect(ref: Readonly<Record<string, unknown>>): void
  setDeviceActive(alias: string, on: boolean): void
  setPrice(price: number): void
  modifyPrice(delta: number): void
  grantFreeRefresh(count?: number): number
  triggerGarrisons(uid: number, eventType: string, options?: { readonly asUid?: number }): number
  garrisonsOf(uid: number): readonly GarrisonRecord[]
  toast(message: string, level?: string): void
  equipDirect(itemUid: number, holderUid: number): void
}

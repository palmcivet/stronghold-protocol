export interface BattleEvent {
  readonly tick: number
  readonly type: string
  readonly data: Readonly<Record<string, unknown>>
}

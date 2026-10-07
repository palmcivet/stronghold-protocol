export interface CoverageSkill {
  readonly index: number
  readonly skillId: string
  readonly name: string
  readonly isDefault: boolean
  readonly normal: string
  readonly elite: string
  readonly covered: boolean
}

export interface CoverageReport {
  readonly summary: {
    readonly chess: number
    readonly skills: number
    readonly covered: number
    readonly defaultCovered: number
    readonly defaults: number
    readonly chessFullyCovered: number
  }
  readonly chess: readonly {
    readonly chessId: string
    readonly name: string
    readonly tier: number
    readonly skills: readonly CoverageSkill[]
  }[]
}

export const AUTHORED: Set<string>

export function kitCoverage(options?: {
  readonly tier?: number | null
  readonly authored?: ReadonlySet<string>
}): CoverageReport

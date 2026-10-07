const blocked = new Set<string>()

export function noteBlocked(name: string): void {
  blocked.add(name)
}

export function blockedBehaviors(): readonly string[] {
  return [...blocked].sort()
}

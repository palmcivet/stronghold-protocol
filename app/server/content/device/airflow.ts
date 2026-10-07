import { oppositeDirection, type Direction } from "arknights-mission-core"

export type AirflowRelation = "equal" | "opposite" | "vertical"

/** Same facing is equal, the reverse is opposite, and every other pair is vertical. */
export function airflowRelationOf(unitFacing: Direction, flowFacing: Direction): AirflowRelation {
  if (unitFacing === flowFacing) return "equal"
  if (unitFacing === oppositeDirection(flowFacing)) return "opposite"
  return "vertical"
}

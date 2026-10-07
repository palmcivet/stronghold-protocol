import { expect, test } from "vitest"
import { airflowRelationOf } from "#server/content/device/airflow.js"

test("blower facing is equal, opposite, or vertical", () => {
  expect(airflowRelationOf("RIGHT", "RIGHT")).toBe("equal")
  expect(airflowRelationOf("RIGHT", "LEFT")).toBe("opposite")
  expect(airflowRelationOf("UP", "DOWN")).toBe("opposite")
  expect(airflowRelationOf("DOWN", "LEFT")).toBe("vertical")
  expect(airflowRelationOf("LEFT", "UP")).toBe("vertical")
})

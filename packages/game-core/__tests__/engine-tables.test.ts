import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TABLES_SOURCE, TABLES_TARGET, generateTables, parseTables } from "../scripts/generate-tables";
import { PlanType } from "../src/types/plan";

describe("engine tables", () => {
  it("are generated from contracts/src/structure/tables.cairo and up to date", () => {
    const expected = generateTables(readFileSync(TABLES_SOURCE, "utf8"));
    // Run `bun run generate:tables` in packages/game-core when this fails
    expect(readFileSync(TABLES_TARGET, "utf8")).toBe(expected);
  });

  it("name the plans in the order of game-core's PlanType codes", () => {
    const plans = parseTables(readFileSync(TABLES_SOURCE, "utf8"));
    expect(plans.map((plan) => plan?.name ?? PlanType.None)).toEqual(Object.values(PlanType));
  });
});

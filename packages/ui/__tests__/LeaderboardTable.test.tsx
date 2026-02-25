import { describe, it, expect } from "vitest";

describe("LeaderboardTable", () => {
  it("exports LeaderboardTable component", async () => {
    const mod = await import("../src/components/LeaderboardTable");
    expect(mod.LeaderboardTable).toBeDefined();
    // Tamagui styled() with `as any` may return object or function
    expect(["function", "object"]).toContain(typeof mod.LeaderboardTable);
  });

  it("exports LeaderboardTableProps type interface", async () => {
    const mod = await import("../src/components/LeaderboardTable");
    expect(mod.LeaderboardTable).toBeDefined();
  });

  it("exports sub-components for table layout", async () => {
    const mod = await import("../src/components/LeaderboardTable");
    expect(mod.LeaderboardRow).toBeDefined();
    expect(mod.LeaderboardRank).toBeDefined();
    expect(mod.LeaderboardName).toBeDefined();
    expect(mod.LeaderboardScore).toBeDefined();
  });

  it("exports LeaderboardHeader for column headers", async () => {
    const mod = await import("../src/components/LeaderboardTable");
    expect(mod.LeaderboardHeader).toBeDefined();
  });

  it("is re-exported from components index", async () => {
    const mod = await import("../src/components/index");
    expect(mod.LeaderboardTable).toBeDefined();
    expect(mod.LeaderboardRow).toBeDefined();
    expect(mod.LeaderboardRank).toBeDefined();
    expect(mod.LeaderboardName).toBeDefined();
    expect(mod.LeaderboardScore).toBeDefined();
    expect(mod.LeaderboardHeader).toBeDefined();
  });
});

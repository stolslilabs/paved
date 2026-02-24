import { describe, it, expect } from "vitest";

describe("GameModeCardView", () => {
  it("exports as a function component", async () => {
    const mod = await import("../src/components/GameModeCard");
    expect(typeof mod.GameModeCardView).toBe("function");
  });

  it("is re-exported from components index", async () => {
    const mod = await import("../src/components/index");
    expect(mod.GameModeCardView).toBeDefined();
    expect(typeof mod.GameModeCardView).toBe("function");
  });
});

describe("GameListItemView", () => {
  it("exports as a function component", async () => {
    const mod = await import("../src/components/GameListItem");
    expect(typeof mod.GameListItemView).toBe("function");
  });

  it("is re-exported from components index", async () => {
    const mod = await import("../src/components/index");
    expect(mod.GameListItemView).toBeDefined();
    expect(typeof mod.GameListItemView).toBe("function");
  });
});

describe("LeaderboardTableView", () => {
  it("exports as a function component", async () => {
    const mod = await import("../src/components/LeaderboardTable");
    expect(typeof mod.LeaderboardTableView).toBe("function");
  });

  it("is re-exported from components index", async () => {
    const mod = await import("../src/components/index");
    expect(mod.LeaderboardTableView).toBeDefined();
    expect(typeof mod.LeaderboardTableView).toBe("function");
  });
});

describe("ModeDetailDialogView", () => {
  it("exports as a function component", async () => {
    const mod = await import("../src/components/ModeDetailDialog");
    expect(typeof mod.ModeDetailDialogView).toBe("function");
  });

  it("is re-exported from components index", async () => {
    const mod = await import("../src/components/index");
    expect(mod.ModeDetailDialogView).toBeDefined();
    expect(typeof mod.ModeDetailDialogView).toBe("function");
  });
});

describe("View components re-exported from root index", () => {
  it("exports all View components from src/index", async () => {
    const mod = await import("../src/index");
    expect(mod.GameModeCardView).toBeDefined();
    expect(mod.GameListItemView).toBeDefined();
    expect(mod.LeaderboardTableView).toBeDefined();
    expect(mod.ModeDetailDialogView).toBeDefined();
  });
});

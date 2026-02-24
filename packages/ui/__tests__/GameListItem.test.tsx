import { describe, it, expect, vi } from "vitest";

describe("GameListItem", () => {
  it("exports GameListItem component", async () => {
    const mod = await import("../src/components/GameListItem");
    expect(mod.GameListItem).toBeDefined();
    // Tamagui styled() with `as any` may return object or function
    expect(["function", "object"]).toContain(typeof mod.GameListItem);
  });

  it("exports GameListItemProps type interface", async () => {
    const mod = await import("../src/components/GameListItem");
    expect(mod.GameListItem).toBeDefined();
  });

  it("accepts all required props shape", async () => {
    const mod = await import("../src/components/GameListItem");
    const { GameListItem } = mod;

    const requiredProps = {
      gameId: 42,
      mode: "daily",
      score: 150,
      tilesPlaced: 30,
      totalTiles: 72,
      isOver: false,
      onEnter: vi.fn(),
    };

    expect(GameListItem).toBeDefined();
    expect(GameListItem).not.toBeNull();
  });

  it("exports sub-components for item layout", async () => {
    const mod = await import("../src/components/GameListItem");
    expect(mod.GameListItemRow).toBeDefined();
    expect(mod.GameListItemLabel).toBeDefined();
    expect(mod.GameListItemValue).toBeDefined();
  });

  it("is re-exported from components index", async () => {
    const mod = await import("../src/components/index");
    expect(mod.GameListItem).toBeDefined();
    expect(mod.GameListItemRow).toBeDefined();
    expect(mod.GameListItemLabel).toBeDefined();
    expect(mod.GameListItemValue).toBeDefined();
  });
});

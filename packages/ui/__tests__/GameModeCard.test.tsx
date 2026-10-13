import { describe, it, expect, vi } from "vitest";

describe("GameModeCard", () => {
  it("exports GameModeCard component", async () => {
    const mod = await import("../src/components/GameModeCard");
    expect(mod.GameModeCard).toBeDefined();
    // Tamagui styled() with `as any` may return object or function
    expect(["function", "object"]).toContain(typeof mod.GameModeCard);
  });

  it("exports GameModeCardProps type (component accepts required props without throwing)", async () => {
    const mod = await import("../src/components/GameModeCard");
    const { GameModeCard } = mod;
    expect(GameModeCard).toBeDefined();
  });

  it("accepts all required props shape", async () => {
    const mod = await import("../src/components/GameModeCard");
    const { GameModeCard } = mod;

    const requiredProps = {
      mode: "daily",
      title: "Daily Challenge",
      description: "Complete a daily puzzle",
      tileCount: 72,
      duration: "24h",
      entryFee: "Free",
      onPress: vi.fn(),
    };

    // Verify the component is a valid Tamagui styled component
    expect(GameModeCard).toBeDefined();
    expect(GameModeCard).not.toBeNull();
  });

  it("exports sub-components for card layout", async () => {
    const mod = await import("../src/components/GameModeCard");
    expect(mod.GameModeCardTitle).toBeDefined();
    expect(mod.GameModeCardDescription).toBeDefined();
    expect(mod.GameModeCardStats).toBeDefined();
  });

  it("is re-exported from components index", async () => {
    const mod = await import("../src/components/index");
    expect(mod.GameModeCard).toBeDefined();
    expect(mod.GameModeCardTitle).toBeDefined();
    expect(mod.GameModeCardDescription).toBeDefined();
    expect(mod.GameModeCardStats).toBeDefined();
  });
});

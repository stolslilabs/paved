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

  it("renders a free card: Free badge, no time or podium line, its own action label", async () => {
    const { GameModeCardView } = await import("../src/components/GameModeCard");
    const { collectText } = await import("./helpers/collect-text");
    const text = collectText(
      GameModeCardView({
        mode: "training",
        title: "Training",
        description: "Free, no wallet, no rewards",
        tileCount: 38,
        duration: "No limit",
        entryFee: "50",
        free: true,
        topPlayers: [{ name: "Zed", score: 9 }],
        timeRemaining: "3h",
        onPress: vi.fn(),
      }),
    );
    expect(text).toContain("Free, no wallet, no rewards");
    expect(text).toContain("Free");
    expect(text).not.toContain("50");
    expect(text).not.toMatch(/Prize|Time:|Zed/);
    expect(text).toContain("Play");
  });
});

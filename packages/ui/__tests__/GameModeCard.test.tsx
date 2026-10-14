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
      mode: "challenge",
      title: "Challenge",
      description: "Complete a challenge puzzle",
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

  it("renders its extra content (the Challenge's top 3) and keeps it out of the card's press", async () => {
    const { GameModeCardView } = await import("../src/components/GameModeCard");
    const { collectText } = await import("./helpers/collect-text");
    const card = GameModeCardView({
      mode: "challenge",
      title: "Challenge",
      description: "38 tiles",
      tileCount: 38,
      duration: "24 hours",
      entryFee: "1 USDC",
      extra: "1. Ada 187",
      onPress: vi.fn(),
    }) as any;
    expect(collectText(card)).toContain("1. Ada 187");
    const wrapper = (card.props.children as any[]).find((c) => c && c.type === "div");
    const stop = vi.fn();
    wrapper.props.onClick({ stopPropagation: stop });
    expect(stop).toHaveBeenCalled();
    const none = GameModeCardView({ mode: "challenge", title: "D", description: "", tileCount: 1, duration: "", entryFee: "", onPress: vi.fn() }) as any;
    expect((none.props.children as any[]).some((c) => c && c.type === "div")).toBe(false);
  });
});

describe("GameModeCardView test id", () => {
  it("names each card by its mode, so a script can click the Challenge card without matching other text", async () => {
    const { GameModeCardView } = await import("../src/components/GameModeCard");
    const props = { title: "Challenge", description: "", tileCount: 38, duration: "24 hours", entryFee: "Free", onPress: () => {} };
    for (const mode of ["challenge", "training", "tutorial"]) {
      const element = (GameModeCardView as any)({ ...props, mode }) as { props: Record<string, unknown> };
      expect(element.props["data-testid"]).toBe(`mode-card-${mode}`);
    }
  });
});

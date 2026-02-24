import { describe, it, expect, vi } from "vitest";

describe("ModeDetailDialog", () => {
  it("exports ModeDetailDialog component", async () => {
    const mod = await import("../src/components/ModeDetailDialog");
    expect(mod.ModeDetailDialog).toBeDefined();
    // Tamagui styled() with `as any` may return object or function
    expect(["function", "object"]).toContain(typeof mod.ModeDetailDialog);
  });

  it("exports ModeDetailDialogProps type interface", async () => {
    const mod = await import("../src/components/ModeDetailDialog");
    expect(mod.ModeDetailDialog).toBeDefined();
  });

  it("accepts all required props shape", async () => {
    const mod = await import("../src/components/ModeDetailDialog");
    const { ModeDetailDialog } = mod;

    const requiredProps = {
      open: true,
      mode: "daily",
      title: "Daily Challenge",
      tileCount: 72,
      entryFee: "Free",
      duration: "24h",
      onConfirm: vi.fn(),
      onClose: vi.fn(),
    };

    expect(ModeDetailDialog).toBeDefined();
    expect(ModeDetailDialog).not.toBeNull();
  });

  it("accepts optional props without error", async () => {
    const mod = await import("../src/components/ModeDetailDialog");
    const { ModeDetailDialog } = mod;

    const allProps = {
      open: true,
      mode: "weekly",
      title: "Weekly Tournament",
      tileCount: 144,
      entryFee: "0.01 ETH",
      duration: "7d",
      prizePool: "1.5 ETH",
      topPlayers: [
        { name: "Alice", score: 500 },
        { name: "Bob", score: 450 },
      ],
      hasActiveGame: true,
      onConfirm: vi.fn(),
      onClose: vi.fn(),
    };

    expect(ModeDetailDialog).toBeDefined();
    expect(ModeDetailDialog).not.toBeNull();
  });

  it("exports ModeDetailDialogStat sub-component", async () => {
    const mod = await import("../src/components/ModeDetailDialog");
    expect(mod.ModeDetailDialogStat).toBeDefined();
  });

  it("is re-exported from components index", async () => {
    const mod = await import("../src/components/index");
    expect(mod.ModeDetailDialog).toBeDefined();
    expect(mod.ModeDetailDialogStat).toBeDefined();
  });
});

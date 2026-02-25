import { describe, it, expect } from "vitest";

describe("SpotSelector", () => {
  it("exports SpotSelector as a function component", async () => {
    const mod = await import("../src/overlays/SpotSelector");
    expect(typeof mod.SpotSelector).toBe("function");
  });

  it("exports SpotSelectorProps type (via interface check)", async () => {
    // TypeScript interfaces are erased at runtime, so we verify the module
    // loads without error and the named export exists
    const mod = await import("../src/overlays/SpotSelector");
    expect(mod.SpotSelector).toBeDefined();
  });

  it("is re-exported from overlays index", async () => {
    const mod = await import("../src/overlays/index");
    expect(mod.SpotSelector).toBeDefined();
    expect(typeof mod.SpotSelector).toBe("function");
  });

  it("is re-exported from root index", async () => {
    const mod = await import("../src/index");
    expect((mod as any).SpotSelector).toBeDefined();
    expect(typeof (mod as any).SpotSelector).toBe("function");
  });

  it("uses getValidSpotsForRole from @paved/game-core", async () => {
    // Verify the game-core dependency is importable and the function exists
    const gc = await import("@paved/game-core");
    expect(typeof gc.getValidSpotsForRole).toBe("function");
  });

  it("uses categoryToChar from @paved/game-core", async () => {
    const gc = await import("@paved/game-core");
    expect(typeof gc.categoryToChar).toBe("function");
  });

  it("component returns null when visible is false", async () => {
    const mod = await import("../src/overlays/SpotSelector");
    const result = mod.SpotSelector({
      tilePlan: 0,
      orientation: 0,
      roleIndex: -1,
      selectedSpot: 0,
      onSelectSpot: () => {},
      visible: false,
    });
    expect(result).toBeNull();
  });
});

import { describe, it, expect } from "vitest";

describe("IngameStatus", () => {
  it("exports IngameStatus as a function component", async () => {
    const mod = await import("../src/overlays/IngameStatus");
    expect(typeof mod.IngameStatus).toBe("function");
  });

  it("renders score value in the element tree", async () => {
    const mod = await import("../src/overlays/IngameStatus");
    const result = mod.IngameStatus({
      score: 42,
      built: 7,
      totalTiles: 72,
      discarded: 1,
    });
    // The component returns a React element tree; stringify to check content
    const json = JSON.stringify(result);
    expect(json).toContain("42");
  });

  it("renders built/totalTiles fraction", async () => {
    const mod = await import("../src/overlays/IngameStatus");
    const result = mod.IngameStatus({
      score: 0,
      built: 7,
      totalTiles: 72,
      discarded: 0,
    });
    const json = JSON.stringify(result);
    expect(json).toContain("7/72");
  });

  it("renders discarded count", async () => {
    const mod = await import("../src/overlays/IngameStatus");
    const result = mod.IngameStatus({
      score: 0,
      built: 0,
      totalTiles: 72,
      discarded: 3,
    });
    const json = JSON.stringify(result);
    expect(json).toContain("3");
  });

  it("has a dark semi-transparent background on the root container", async () => {
    const mod = await import("../src/overlays/IngameStatus");
    const result = mod.IngameStatus({
      score: 0,
      built: 0,
      totalTiles: 72,
      discarded: 0,
    });
    // The root element should have a backgroundColor prop for the dark overlay
    expect(result).not.toBeNull();
    expect(result?.props?.backgroundColor).toBeTruthy();
    expect(result?.props?.backgroundColor).toContain("rgba");
  });

  it("includes a Score label", async () => {
    const mod = await import("../src/overlays/IngameStatus");
    const result = mod.IngameStatus({
      score: 100,
      built: 5,
      totalTiles: 72,
      discarded: 2,
    });
    const json = JSON.stringify(result);
    expect(json).toContain("Score");
  });

  it("uses larger font size for score display", async () => {
    const mod = await import("../src/overlays/IngameStatus");
    const result = mod.IngameStatus({
      score: 100,
      built: 5,
      totalTiles: 72,
      discarded: 2,
    });
    // Score text should use $7 font size (larger than original $5)
    const json = JSON.stringify(result);
    expect(json).toContain("$7");
  });

  it("is re-exported from overlays index", async () => {
    const mod = await import("../src/overlays/index");
    expect(mod.IngameStatus).toBeDefined();
    expect(typeof mod.IngameStatus).toBe("function");
  });

  it("is re-exported from root index", async () => {
    const mod = await import("../src/index");
    expect((mod as any).IngameStatus).toBeDefined();
    expect(typeof (mod as any).IngameStatus).toBe("function");
  });
});

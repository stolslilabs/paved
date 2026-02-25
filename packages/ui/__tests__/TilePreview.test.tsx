import { describe, it, expect } from "vitest";
import { Plan, getTilePath } from "@paved/game-core";

describe("TilePreview", () => {
  it("exports TilePreview as a function component", async () => {
    const mod = await import("../src/overlays/TilePreview");
    expect(typeof mod.TilePreview).toBe("function");
  });

  it("exports TilePreviewProps type (module loads without error)", async () => {
    const mod = await import("../src/overlays/TilePreview");
    expect(mod.TilePreview).toBeDefined();
  });

  it("returns null when tilePlan is 0", async () => {
    const mod = await import("../src/overlays/TilePreview");
    const result = mod.TilePreview({ tilePlan: 0, orientation: 1 });
    expect(result).toBeNull();
  });

  it("returns an img element with correct src for plan index 11", async () => {
    const mod = await import("../src/overlays/TilePreview");
    const result = mod.TilePreview({ tilePlan: 11, orientation: 1 });
    expect(result).not.toBeNull();
    // React element: type is "img", props contains src
    expect(result?.type).toBe("img");
    expect(result?.props.src).toBe("/assets/tiles/rfrfcccfr.png");
  });

  it("applies 0deg rotation for orientation 1", async () => {
    const mod = await import("../src/overlays/TilePreview");
    const result = mod.TilePreview({ tilePlan: 11, orientation: 1 });
    expect(result?.props.style.transform).toBe("rotate(0deg)");
  });

  it("applies 90deg rotation for orientation 2", async () => {
    const mod = await import("../src/overlays/TilePreview");
    const result = mod.TilePreview({ tilePlan: 11, orientation: 2 });
    expect(result?.props.style.transform).toBe("rotate(90deg)");
  });

  it("applies 180deg rotation for orientation 3", async () => {
    const mod = await import("../src/overlays/TilePreview");
    const result = mod.TilePreview({ tilePlan: 11, orientation: 3 });
    expect(result?.props.style.transform).toBe("rotate(180deg)");
  });

  it("applies 270deg rotation for orientation 4", async () => {
    const mod = await import("../src/overlays/TilePreview");
    const result = mod.TilePreview({ tilePlan: 11, orientation: 4 });
    expect(result?.props.style.transform).toBe("rotate(270deg)");
  });

  it("uses default size of 80px", async () => {
    const mod = await import("../src/overlays/TilePreview");
    const result = mod.TilePreview({ tilePlan: 11, orientation: 1 });
    expect(result?.props.style.width).toBe("80px");
    expect(result?.props.style.height).toBe("80px");
  });

  it("respects custom size prop", async () => {
    const mod = await import("../src/overlays/TilePreview");
    const result = mod.TilePreview({ tilePlan: 11, orientation: 1, size: 120 });
    expect(result?.props.style.width).toBe("120px");
    expect(result?.props.style.height).toBe("120px");
  });

  it("sets alt text on the image", async () => {
    const mod = await import("../src/overlays/TilePreview");
    const result = mod.TilePreview({ tilePlan: 11, orientation: 1 });
    expect(result?.props.alt).toBe("Current tile");
  });

  it("is re-exported from overlays index", async () => {
    const mod = await import("../src/overlays/index");
    expect(mod.TilePreview).toBeDefined();
    expect(typeof mod.TilePreview).toBe("function");
  });

  it("is re-exported from root index", async () => {
    const mod = await import("../src/index");
    expect((mod as any).TilePreview).toBeDefined();
    expect(typeof (mod as any).TilePreview).toBe("function");
  });

  // Verify game-core integration
  it("Plan.from(11).value resolves to RFRFCCCFR", () => {
    const plan = Plan.from(11);
    expect(plan.value).toBe("RFRFCCCFR");
  });

  it("getTilePath produces correct path for RFRFCCCFR", () => {
    const path = getTilePath("RFRFCCCFR" as any);
    expect(path).toBe("/assets/tiles/rfrfcccfr.png");
  });
});

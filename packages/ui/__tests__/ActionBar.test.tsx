import { describe, it, expect } from "vitest";

describe("ActionBar", () => {
  it("exports ActionBar as a function component", async () => {
    const mod = await import("../src/overlays/ActionBar");
    expect(typeof mod.ActionBar).toBe("function");
  });

  it("includes tile preview when tilePlan > 0", async () => {
    const mod = await import("../src/overlays/ActionBar");
    const tpMod = await import("../src/overlays/TilePreview");
    const result = mod.ActionBar({
      tilePlan: 11,
      orientation: 1,
      onRotate: () => {},
      onConfirm: () => {},
      onDiscard: () => {},
      confirmDisabled: false,
      discardDisabled: false,
      packedCharacters: 0,
      selectedCharacter: 0,
      onSelectCharacter: () => {},
    });
    // TilePreview is a child React element with type === TilePreview function
    const children = result?.props?.children;
    expect(Array.isArray(children)).toBe(true);
    const tileChild = children.find((c: any) => c?.type === tpMod.TilePreview);
    expect(tileChild).toBeDefined();
    expect(tileChild.props.tilePlan).toBe(11);
  });

  it("does not render tile image when tilePlan is 0", async () => {
    const mod = await import("../src/overlays/ActionBar");
    const tpMod = await import("../src/overlays/TilePreview");
    const result = mod.ActionBar({
      tilePlan: 0,
      orientation: 1,
      onRotate: () => {},
      onConfirm: () => {},
      onDiscard: () => {},
      confirmDisabled: false,
      discardDisabled: false,
      packedCharacters: 0,
      selectedCharacter: 0,
      onSelectCharacter: () => {},
    });
    // TilePreview child exists but will return null when tilePlan=0
    const children = result?.props?.children;
    const tileChild = children.find((c: any) => c?.type === tpMod.TilePreview);
    expect(tileChild).toBeDefined();
    expect(tileChild.props.tilePlan).toBe(0);
    // Verify TilePreview returns null for tilePlan=0
    const rendered = tpMod.TilePreview(tileChild.props);
    expect(rendered).toBeNull();
  });

  it("renders Rotate button text", async () => {
    const mod = await import("../src/overlays/ActionBar");
    const result = mod.ActionBar({
      tilePlan: 11,
      orientation: 1,
      onRotate: () => {},
      onConfirm: () => {},
      onDiscard: () => {},
      confirmDisabled: false,
      discardDisabled: false,
      packedCharacters: 0,
      selectedCharacter: 0,
      onSelectCharacter: () => {},
    });
    const json = JSON.stringify(result);
    expect(json).toContain("Rotate");
  });

  it("renders Confirm button text", async () => {
    const mod = await import("../src/overlays/ActionBar");
    const result = mod.ActionBar({
      tilePlan: 11,
      orientation: 1,
      onRotate: () => {},
      onConfirm: () => {},
      onDiscard: () => {},
      confirmDisabled: false,
      discardDisabled: false,
      packedCharacters: 0,
      selectedCharacter: 0,
      onSelectCharacter: () => {},
    });
    const json = JSON.stringify(result);
    expect(json).toContain("Confirm");
  });

  it("renders Discard button text", async () => {
    const mod = await import("../src/overlays/ActionBar");
    const result = mod.ActionBar({
      tilePlan: 11,
      orientation: 1,
      onRotate: () => {},
      onConfirm: () => {},
      onDiscard: () => {},
      confirmDisabled: false,
      discardDisabled: false,
      packedCharacters: 0,
      selectedCharacter: 0,
      onSelectCharacter: () => {},
    });
    const json = JSON.stringify(result);
    expect(json).toContain("Discard");
  });

  it("has semi-transparent background on root container", async () => {
    const mod = await import("../src/overlays/ActionBar");
    const result = mod.ActionBar({
      tilePlan: 0,
      orientation: 1,
      onRotate: () => {},
      onConfirm: () => {},
      onDiscard: () => {},
      confirmDisabled: false,
      discardDisabled: false,
      packedCharacters: 0,
      selectedCharacter: 0,
      onSelectCharacter: () => {},
    });
    expect(result?.props?.backgroundColor).toBeTruthy();
    expect(result?.props?.backgroundColor).toContain("rgba");
  });

  it("renders character buttons when packedCharacters > 0", async () => {
    const mod = await import("../src/overlays/ActionBar");
    // packedCharacters=31 means all 5 characters available (binary 11111)
    const result = mod.ActionBar({
      tilePlan: 11,
      orientation: 1,
      onRotate: () => {},
      onConfirm: () => {},
      onDiscard: () => {},
      confirmDisabled: false,
      discardDisabled: false,
      packedCharacters: 31,
      selectedCharacter: 0,
      onSelectCharacter: () => {},
    });
    const json = JSON.stringify(result);
    // Should contain character names from getAvailableCharacters
    expect(json).toContain("Lord");
  });

  it("is re-exported from overlays index", async () => {
    const mod = await import("../src/overlays/index");
    expect(mod.ActionBar).toBeDefined();
    expect(typeof mod.ActionBar).toBe("function");
  });

  it("is re-exported from root index", async () => {
    const mod = await import("../src/index");
    expect((mod as any).ActionBar).toBeDefined();
    expect(typeof (mod as any).ActionBar).toBe("function");
  });
});

import { beforeAll, describe, it, expect } from "vitest";

describe("ActionBar", () => {
  // The first import of ActionBar pulls in tamagui and game-core, which is slow on a cold CI
  // runner (the first test hit the 5000 ms default once). Pay that cost here, under a hook
  // timeout sized for it, so no test carries it. Later imports are served from the module cache.
  beforeAll(async () => {
    await import("../src/overlays/ActionBar");
    await import("../src/index");
  }, 60_000);

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

describe("ActionBar lists the seven roles (P4)", () => {
  function images(node: any, out: Array<{ src: string; alt: string }> = []) {
    if (!node || typeof node !== "object") return out;
    if (Array.isArray(node)) {
      node.forEach((n) => images(n, out));
      return out;
    }
    if (node.type === "img") out.push({ src: node.props.src, alt: node.props.alt });
    images(node.props?.children, out);
    return out;
  }

  it("shows Woodsman and Herdsman after Pilgrim, with their art", async () => {
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
    const roles = images(result);
    expect(roles.map((r) => r.alt)).toEqual(["Lord", "Lady", "Adventurer", "Paladin", "Pilgrim", "Woodsman", "Herdsman"]);
    expect(roles.slice(5).map((r) => r.src)).toEqual(["/assets/characters/woodsman.png", "/assets/characters/herdsman.png"]);
  });
});

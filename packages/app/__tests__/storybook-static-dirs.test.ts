import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STATIC_DIRS, sharedDirs, writtenDirs } from "../scripts/storybook-static-dirs";

/** A config dir with folders under it: `{ "a/x": ... }` makes `a/x/` (and a file in it, so the folder is not empty). */
function tree(folders: string[]) {
  const root = mkdtempSync(join(tmpdir(), "static-dirs-"));
  const configDir = join(root, ".storybook");
  mkdirSync(configDir);
  for (const f of folders) {
    mkdirSync(join(root, f), { recursive: true });
    writeFileSync(join(root, f, "file.txt"), "x");
  }
  return configDir;
}

describe("the Storybook static dirs", () => {
  it("write no folder in common (the app's public/ and asset-sources/)", () => {
    expect(sharedDirs(STATIC_DIRS)).toEqual([]);
  });

  it("puts asset-sources/ under a path of its own, away from the app's renderer-assets/", () => {
    const written = STATIC_DIRS.map((d) => writtenDirs(d));
    expect(written[0]).toContain("/renderer-assets/models");
    expect(written[1]).toContain("/asset-sources/models");
    expect(written[1].some((p) => p.startsWith("/renderer-assets"))).toBe(false);
  });

  it("finds two entries that create one folder, the failing case (both served under /renderer-assets)", () => {
    const configDir = tree(["app/public/renderer-assets/models", "web/public/models"]);
    const shared = sharedDirs(["../app/public", { from: "../web/public", to: "/renderer-assets" }], configDir);
    expect(shared).toEqual(["/renderer-assets (static dirs 0 and 1)", "/renderer-assets/models (static dirs 0 and 1)"]);
  });

  it("finds two entries with the same destination even when their files differ", () => {
    const configDir = tree(["a", "b"]);
    expect(sharedDirs([{ from: "../a", to: "/x/y" }, { from: "../b", to: "/x/z" }], configDir)).toEqual(["/x (static dirs 0 and 1)"]);
  });

  it("passes entries that go to separate folders", () => {
    const configDir = tree(["a/sub", "b/sub"]);
    expect(sharedDirs([{ from: "../a", to: "/one" }, { from: "../b", to: "/two" }], configDir)).toEqual([]);
  });
});

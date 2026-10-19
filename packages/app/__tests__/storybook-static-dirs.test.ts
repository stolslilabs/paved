import { mkdirSync, readdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STORY_TRACKS } from "../src/mocks/music";
import { CONFIG_DIR, PUBLIC_DIR, STATIC_DIRS, sharedDirs, writtenDirs } from "../scripts/storybook-static-dirs";
import { SOURCE as MUSIC_SOURCES, sources } from "../scripts/compress-music-art.ts";

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
    expect(written.some((w) => w.includes("/renderer-assets/models"))).toBe(true);
    const sources = written.filter((w) => w.includes("/asset-sources/models"));
    expect(sources).toHaveLength(1);
    expect(sources[0]!.some((p) => p.startsWith("/renderer-assets"))).toBe(false);
  });

  it("carries only the tracks the stories play, not the 16 of public/music/", () => {
    const staged = STATIC_DIRS.filter((d): d is string => typeof d === "string");
    expect(staged).toHaveLength(1);
    expect(readdirSync(join(staged[0]!, "music")).sort()).toEqual(STORY_TRACKS.map((t) => t.replace("/music/", "")).sort());
    expect(readdirSync(PUBLIC_DIR)).toContain("music");
    expect(readdirSync(join(PUBLIC_DIR, "music")).filter((n) => n.endsWith(".m4a"))).toHaveLength(16);
    // The staged folder holds the root files too (the notices), and no other static dir is `public/` whole.
    expect(readdirSync(staged[0]!)).toContain("THIRD_PARTY_NOTICES.txt");
    expect(STATIC_DIRS.some((d) => typeof d !== "string" && d.from === PUBLIC_DIR)).toBe(false);
  });

  it("carries none of the music's original images (#569): only their WebP copies", () => {
    const originals = new Set(sources().map((s) => s.file));
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
    for (const d of STATIC_DIRS) {
      const from = resolve(CONFIG_DIR, typeof d === "string" ? d : d.from);
      expect(MUSIC_SOURCES.startsWith(from), from).toBe(false);
      for (const f of walk(from)) expect(originals.has(f.split("/").pop()!), f).toBe(false);
    }
  });

  it("serves every folder of public/ but music/ at its own path", () => {
    const tos = STATIC_DIRS.map((d) => (typeof d === "string" ? "/" : d.to));
    for (const n of ["fontawesome", "renderer-assets", "backgrounds"]) expect(tos).toContain(`/${n}`);
    expect(tos).not.toContain("/music");
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

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { rendererManifest } from "../vite/renderer-assets";
import { APP_MANIFEST } from "../src/mocks/assets";

const APP = resolve(__dirname, "..");

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.tsx?$/.test(name)) yield full;
  }
}

/**
 * The files that may still hand the renderer `asset-sources/` (`SOURCE_ASSETS`), and why. Any other story or story board
 * that does fails: the board stories read the app's compressed models (LOAD-FAST).
 */
const READS_SOURCE_MODELS: Record<string, string> = {
  // The tile browser shows the source models, the extended variants among them, which only `asset-sources/` holds.
  "src/stories/tiles/tile-browser.tsx": "source models",
  // "Renderer/Tiles", images "original": the 1680 px originals, as before TEX (`asset-sources/` has no manifest).
  "src/stories/renderer/tiles-board.tsx": "original tile images",
  // Not in LOAD-FAST's files: its `Rendered` story's hand tile. To move to `APP_ASSETS` in a later task.
  "src/components/containers/hand-panel.stories.tsx": "not moved yet",
};

/** A renderer handed `asset-sources/`: a `basePath` that names it, or a model path under it. */
const READS = /basePath(?:=\{|:\s*)[^,}\n]*\bSOURCE_ASSETS\b|\$\{SOURCE_ASSETS\}\/models\//;

describe("Storybook's renderer assets (LOAD-FAST)", () => {
  it("gives the stories the manifest the app's build writes", () => {
    expect(APP_MANIFEST).toEqual(rendererManifest());
  });

  it("has no story or story board read the source models, but the ones listed", () => {
    const readers = [...walk(join(APP, "src"))]
      .filter((file) => READS.test(readFileSync(file, "utf8")))
      .map((file) => relative(APP, file).split("\\").join("/"))
      .sort();
    expect(readers).toEqual(Object.keys(READS_SOURCE_MODELS).sort());
  });
});

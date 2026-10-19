import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, dynamicImports } from "../scripts/bundle-budget.ts";

// What the board's route chunk must not carry (BOARD-CHUNK): the modules the first frame of the board does not need. They load
// on demand, and in the browser's idle time (`BoardScene`). Read from the source maps of a build (`bun run build`); skipped
// without one.
const DIST = join(APP, "dist");
const built = existsSync(join(DIST, "index.html"));

const MOVED = [
  "src/components/containers/surrender-dialog.tsx",
  "src/components/containers/device-settings-sheet.tsx",
  "src/components/containers/board-season-wheel.tsx",
  "src/components/elements/season-wheel.tsx",
  "src/components/ui/sheet.tsx",
  "src/components/ui/dialog.tsx",
  "@radix-ui/react-dialog/",
  "@radix-ui/react-focus-scope/",
  "@radix-ui/react-dismissable-layer/",
  "react-remove-scroll/",
];

/** The chunks `code` imports statically (`from"./x.js"`), as file names. */
const staticImports = (code: string): string[] => [...new Set([...code.matchAll(/\bfrom\s*["']\.\/([^"']+\.js)["']/g)].map((m) => m[1]!))];

const sourcesOf = (file: string) => (JSON.parse(readFileSync(join(DIST, "assets", `${file}.map`), "utf8")) as { sources: string[] }).sources;

describe.skipIf(!built)("the board's route chunk in the production build", () => {
  const assets = built ? readdirSync(join(DIST, "assets")).filter((f) => f.endsWith(".js")) : [];
  const board = assets.filter((f) => /^board-[A-Za-z0-9_-]{8}\.js$/.test(f));

  it("is one chunk with a source map", () => {
    expect(board).toHaveLength(1);
    expect(existsSync(join(DIST, "assets", `${board[0]}.map`))).toBe(true);
  });

  // The board's first frame: its chunk and the chunks it imports statically. Since Story mode (#546) shares the board scene,
  // the bundler puts the scene in a chunk both boards import, so the scene's `import()`s are in that chunk, not the board's.
  const firstFrame = board.length ? [board[0]!, ...staticImports(readFileSync(join(DIST, "assets", board[0]!), "utf8"))] : [];

  it("holds none of the modules moved out of it, nor do the chunks it loads with it", () => {
    for (const chunk of firstFrame.filter((f) => existsSync(join(DIST, "assets", `${f}.map`)))) {
      const sources = sourcesOf(chunk);
      for (const moved of MOVED) expect(sources.filter((s) => s.includes(moved)), `${moved} in ${chunk}`).toEqual([]);
    }
  });

  it("loads the moved modules with import(), as chunks of their own", () => {
    const loaded = firstFrame.flatMap((chunk) => dynamicImports(readFileSync(join(DIST, "assets", chunk), "utf8")));
    for (const moved of ["src/components/containers/surrender-dialog.tsx", "src/components/containers/device-settings-sheet.tsx", "src/components/containers/board-season-wheel.tsx"]) {
      const chunk = loaded.find((f) => existsSync(join(DIST, "assets", `${f}.map`)) && sourcesOf(f).some((s) => s.includes(moved)));
      expect(chunk, moved).toBeDefined();
    }
  });
});

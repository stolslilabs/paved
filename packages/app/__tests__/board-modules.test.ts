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
  "src/components/ui/dialog.tsx",
  "@radix-ui/react-dialog/",
  "@radix-ui/react-focus-scope/",
  "@radix-ui/react-dismissable-layer/",
  "react-remove-scroll/",
];

const sourcesOf = (file: string) => (JSON.parse(readFileSync(join(DIST, "assets", `${file}.map`), "utf8")) as { sources: string[] }).sources;

describe.skipIf(!built)("the board's route chunk in the production build", () => {
  const assets = built ? readdirSync(join(DIST, "assets")).filter((f) => f.endsWith(".js")) : [];
  const board = assets.filter((f) => /^board-[A-Za-z0-9_-]{8}\.js$/.test(f));

  it("is one chunk with a source map", () => {
    expect(board).toHaveLength(1);
    expect(existsSync(join(DIST, "assets", `${board[0]}.map`))).toBe(true);
  });

  it("holds none of the modules moved out of it", () => {
    const sources = sourcesOf(board[0]!);
    for (const moved of MOVED) expect(sources.filter((s) => s.includes(moved)), moved).toEqual([]);
  });

  it("loads the moved modules with import(), as chunks of their own", () => {
    const loaded = dynamicImports(readFileSync(join(DIST, "assets", board[0]!), "utf8"));
    for (const moved of ["src/components/containers/surrender-dialog.tsx"]) {
      const chunk = loaded.find((f) => existsSync(join(DIST, "assets", `${f}.map`)) && sourcesOf(f).some((s) => s.includes(moved)));
      expect(chunk, moved).toBeDefined();
    }
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { canPlace } from "../../game-core/bench/generate-boards";
import type { BoardFixture } from "../../game-core/bench/generate-boards";
import { PLACEMENT_COUNT, generatePlacements } from "../../game-core/bench/generate-placements";
import type { PlacementFixture } from "../../game-core/bench/generate-placements";

const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../../game-core/bench/fixtures/${name}`, import.meta.url), "utf8"));

describe("bench placement sequences", () => {
  for (const size of [38, 72]) {
    describe(`${size} tiles`, () => {
      const board = fixture<BoardFixture>(`board-${size}.json`);
      const seq = fixture<PlacementFixture>(`placements-${size}.json`);

      it("has at least 20 placements with ids that continue the board", () => {
        expect(seq.placements.length).toBe(PLACEMENT_COUNT);
        expect(PLACEMENT_COUNT).toBeGreaterThanOrEqual(20);
        seq.placements.forEach((t, i) => expect(t.id).toBe(size + i + 1));
      });

      it("is legal in order: each tile is free, adjacent and matches every touching edge", () => {
        const byPos = new Map(board.tiles.map((t) => [`${t.x},${t.y}`, t]));
        for (const t of seq.placements) {
          expect(canPlace(byPos, t.x, t.y, t.plan, t.orientation)).toBe(true);
          byPos.set(`${t.x},${t.y}`, t);
        }
      });

      it("matches what the generator produces from the fixed seed", () => {
        expect(generatePlacements(board)).toEqual(seq);
      });
    });
  }
});

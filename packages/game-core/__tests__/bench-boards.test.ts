import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Direction, DirectionType, Layout, Orientation, Plan } from "../src/index";
import { BOARD_SIZES, generateBoard } from "../bench/generate-boards";
import type { BoardFixture } from "../bench/generate-boards";

const load = (size: number): BoardFixture =>
  JSON.parse(readFileSync(new URL(`../bench/fixtures/board-${size}.json`, import.meta.url), "utf8"));

const layoutOf = (t: { plan: number; orientation: number }) =>
  Layout.from(Plan.from(t.plan), Orientation.from(t.orientation).value);

describe("bench board fixtures", () => {
  for (const size of BOARD_SIZES) {
    describe(`${size} tiles`, () => {
      const board = load(size);

      it("has exactly the requested tiles and distinct positions", () => {
        expect(board.tiles).toHaveLength(size);
        expect(new Set(board.tiles.map((t) => `${t.x},${t.y}`)).size).toBe(size);
      });

      it("is legal: every pair of touching tiles has matching edges", () => {
        const byPos = new Map(board.tiles.map((t) => [`${t.x},${t.y}`, t]));
        let pairs = 0;
        for (const t of board.tiles) {
          const east = byPos.get(`${t.x + 1},${t.y}`);
          const north = byPos.get(`${t.x},${t.y + 1}`);
          if (east) {
            pairs++;
            expect(layoutOf(t).isCompatible(layoutOf(east), new Direction(DirectionType.East))).toBe(true);
          }
          if (north) {
            pairs++;
            expect(layoutOf(t).isCompatible(layoutOf(north), new Direction(DirectionType.North))).toBe(true);
          }
        }
        expect(pairs).toBeGreaterThanOrEqual(size - 1);
      });

      it("has a mix of plans and a few characters on their tiles", () => {
        expect(new Set(board.tiles.map((t) => t.plan)).size).toBeGreaterThanOrEqual(8);
        expect(board.characters.length).toBeGreaterThanOrEqual(3);
        for (const c of board.characters) {
          const tile = board.tiles.find((t) => t.id === c.tile_id);
          expect(tile?.occupied_spot).toBe(c.spot);
        }
      });

      it("matches what the generator produces from the fixed seed", () => {
        expect(generateBoard(size)).toEqual(board);
      });
    });
  }
});

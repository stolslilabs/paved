import { slow } from "../test-slow";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { columnParity, modelFiles, modelParity, reader } from "../scripts/voxel-parity";

/** A 0.4 x 0.4 box (4 x 4 voxels) from z = 0 to z = -0.3, as an indexed triangle list: the ground, the top and four walls. */
function box(): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  for (const z of [0, -0.3]) for (const [x, y] of [[0, 0], [0.4, 0], [0.4, 0.4], [0, 0.4]]) positions.push(x!, y!, z);
  const quad = (a: number, b: number, c: number, d: number) => [a, b, c, a, c, d];
  return { positions, indices: [...quad(0, 1, 2, 3), ...quad(4, 5, 6, 7), ...quad(0, 1, 5, 4), ...quad(1, 2, 6, 5), ...quad(2, 3, 7, 6), ...quad(3, 0, 4, 7)] };
}

describe("the column parity of a tile model (scripts/voxel-parity.ts)", () => {
  it("counts every column of a closed solid an even number of times", () => {
    const { positions, indices } = box();
    const parity = columnParity(positions, indices);
    expect([parity.columns, parity.odd, parity.empty]).toEqual([16, [], 0]);
  });

  it("finds the columns a stray triangle leaves odd: a ramp from the ground's corner to a point over the top", () => {
    const { positions, indices } = box();
    positions.push(0.4, 0.4, -0.6);
    const parity = columnParity(positions, [...indices, 0, 1, 8]);
    expect(parity.odd.length).toBeGreaterThan(0);
  });

  it("finds no inconsistent column in any model of the app: the sources and the shipped copies, base and Forest", async () => {
    const io = await reader();
    const files = modelFiles();
    expect(files.length).toBeGreaterThanOrEqual(182);
    const bad: string[] = [];
    for (const [label, path] of files) {
      expect(readFileSync(path).subarray(0, 4).toString(), label).toBe("glTF");
      const { odd } = await modelParity(io, path);
      if (odd.length > 0) bad.push(`${label}: ${odd.length}`);
    }
    expect(bad).toEqual([]);
  }, slow(120_000));
});

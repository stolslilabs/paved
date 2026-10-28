import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = resolve(import.meta.dirname, "../src/assets/tokens/cobbles-study");
const FILES = ["a-stone.svg", "b-pile.svg", "c-coin.svg", "d-paving.svg", "e-voxel.svg"];
const read = (file: string) => readFileSync(resolve(DIR, file), "utf8");

describe("the Cobbles icon's five directions (#849, the study for the owner's pick)", () => {
  it("are the five files of the study, nothing else", () => {
    expect(readdirSync(DIR).sort()).toEqual(FILES);
  });

  it("are each under 2 kB", () => {
    for (const file of FILES) expect(Buffer.byteLength(read(file)), file).toBeLessThan(2048);
  });

  it("are pure SVG, drawn on the 64 grid: no script, no style, no image, nothing fetched", () => {
    for (const file of FILES) {
      const svg = read(file);
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 66 66">'), file).toBe(true);
      expect(svg, file).not.toMatch(/<script|<style|<image|<foreignObject|https?:\/\/(?!www\.w3\.org\/2000\/svg)|href="(?!#)/);
    }
  });

  it("follow #844's relief codes: the Cobbles' dark outline, a lit gradient, a white light and a shadow under them", () => {
    for (const file of FILES) {
      const svg = read(file);
      expect(svg, file).toContain("<linearGradient");
      expect(svg, file).toMatch(/="#2E2A24"/);
      expect(svg, file).toMatch(/(?:fill|stroke)="#fff" (?:fill|stroke)-opacity="\.[5-7]/);
      expect(svg, file).toMatch(/fill="#000" fill-opacity="\.45"/);
    }
  });
});

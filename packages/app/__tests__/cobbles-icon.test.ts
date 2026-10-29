import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(import.meta.dirname, "../src/assets/tokens", path), "utf8");
const svg = read("cobbles.svg");
const notices = readFileSync(resolve(import.meta.dirname, "../public/THIRD_PARTY_NOTICES.txt"), "utf8");
/** The app's icon and the study's other two (#878): the stone it replaces and the sharp-edged cube. */
const FILES = { "cobbles.svg": svg, "cube-sharp.svg": read("cobbles-cube-study/cube-sharp.svg"), "stone.svg": read("cobbles-cube-study/stone.svg") };

describe("the Cobbles icon, a hewn stone cube (#878, worn edges: the open point's default)", () => {
  it.each(Object.entries(FILES))("%s is under 2 kB, pure SVG on the 64 grid: no script, no style, no image, nothing fetched", (_, file) => {
    expect(Buffer.byteLength(file)).toBeLessThan(2048);
    expect(file.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 66 66">')).toBe(true);
    expect(file).not.toMatch(/<script|<style|<image|<foreignObject|https?:\/\/(?!www\.w3\.org\/2000\/svg)|href="(?!#)/);
  });

  it.each(Object.entries(FILES))("%s follows #844's relief codes: the Cobbles' dark outline, a lit gradient, a white light and a shadow under them", (_, file) => {
    expect(file).toContain("<linearGradient");
    expect(file).toMatch(/="#2E2A24"/);
    expect(file).toMatch(/(?:fill|stroke)="#fff" (?:fill|stroke)-opacity="\.[5-7]/);
    expect(file).toMatch(/fill="#000" fill-opacity="\.45"/);
  });

  it("is a cube with three faces in the stone's granite: the top lit, the left in mid tone, the right darker", () => {
    for (const cube of [svg, FILES["cube-sharp.svg"]]) {
      expect(cube).toContain('<stop offset="0" stop-color="#F1ECE2"/>');
      expect(cube).toContain('<stop offset="0" stop-color="#9D8C75"/>');
      expect(cube).toContain('fill="#5C5244"');
    }
    // The worn cube rounds its corners (quadratic curves), the sharp one cuts them straight.
    expect(svg).toMatch(/<path id="o" d="M[^"]*Q/);
    expect(FILES["cube-sharp.svg"]).not.toMatch(/<path id="o" d="M[^"]*Q/);
  });

  it("is drawn for Paved, as the notices say: no Font Awesome shape left", () => {
    expect(notices).toContain("- cobbles.svg: one stone cube, written for Paved");
    expect(notices).not.toContain("cubes-stacked");
  });
});

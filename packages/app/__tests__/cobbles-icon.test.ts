import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(import.meta.dirname, "../src/assets/tokens", path), "utf8");
const svg = read("cobbles.svg");
const notices = readFileSync(resolve(import.meta.dirname, "../public/THIRD_PARTY_NOTICES.txt"), "utf8");

describe("the Cobbles icon, a hewn stone cube (#878, worn edges)", () => {
  it("is under 2 kB, pure SVG on the 64 grid: no script, no style, no image, nothing fetched", () => {
    expect(Buffer.byteLength(svg)).toBeLessThan(2048);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 66 66">')).toBe(true);
    expect(svg).not.toMatch(/<script|<style|<image|<foreignObject|https?:\/\/(?!www\.w3\.org\/2000\/svg)|href="(?!#)/);
  });

  it("follows #844's relief codes: the Cobbles' dark outline, a lit gradient, a white light and a shadow under them", () => {
    expect(svg).toContain("<linearGradient");
    expect(svg).toMatch(/="#2E2A24"/);
    expect(svg).toMatch(/(?:fill|stroke)="#fff" (?:fill|stroke)-opacity="\.[5-7]/);
    expect(svg).toMatch(/fill="#000" fill-opacity="\.45"/);
  });

  it("is a cube with three faces in the stone's granite: the top lit, the left in mid tone, the right darker", () => {
    expect(svg).toContain('<stop offset="0" stop-color="#F1ECE2"/>');
    expect(svg).toContain('<stop offset="0" stop-color="#9D8C75"/>');
    expect(svg).toContain('fill="#5C5244"');
    // The worn cube rounds its corners (quadratic curves).
    expect(svg).toMatch(/<path id="o" d="M[^"]*Q/);
  });

  it("is drawn for Paved, as the notices say: no Font Awesome shape left", () => {
    expect(notices).toContain("- cobbles.svg: one stone cube, written for Paved");
    expect(notices).not.toContain("cubes-stacked");
  });
});

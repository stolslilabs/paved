import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const svg = readFileSync(resolve(import.meta.dirname, "../src/assets/tokens/cobbles.svg"), "utf8");
const notices = readFileSync(resolve(import.meta.dirname, "../public/THIRD_PARTY_NOTICES.txt"), "utf8");

describe("the Cobbles icon, the owner's pick (#849: direction A, one cobblestone)", () => {
  it("is under 2 kB", () => {
    expect(Buffer.byteLength(svg)).toBeLessThan(2048);
  });

  it("is pure SVG, drawn on the 64 grid: no script, no style, no image, nothing fetched", () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 66 66">')).toBe(true);
    expect(svg).not.toMatch(/<script|<style|<image|<foreignObject|https?:\/\/(?!www\.w3\.org\/2000\/svg)|href="(?!#)/);
  });

  it("follows #844's relief codes: the Cobbles' dark outline, a lit gradient, a white light and a shadow under them", () => {
    expect(svg).toContain("<linearGradient");
    expect(svg).toMatch(/="#2E2A24"/);
    expect(svg).toMatch(/(?:fill|stroke)="#fff" (?:fill|stroke)-opacity="\.[5-7]/);
    expect(svg).toMatch(/fill="#000" fill-opacity="\.45"/);
  });

  it("is drawn for Paved, as the notices say: no Font Awesome shape left", () => {
    expect(notices).toContain("- cobbles.svg: one cobblestone, written for Paved");
    expect(notices).not.toContain("cubes-stacked");
  });
});

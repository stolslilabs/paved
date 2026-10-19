import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contrast, hexToRgb, oklchToRgb, parseOklch, rgbToHex } from "../src/styles/color-math";
import { STEPS, board, breakpoints, radiusBase, scales, semantic } from "../src/styles/tokens";

const css = readFileSync(resolve(import.meta.dirname, "../src/styles/theme.css"), "utf8");

describe("the token reader of the Foundations stories", () => {
  it("reads the six scales, 11 steps each", () => {
    const all = scales(css);
    expect(Object.keys(all)).toEqual(["gold", "charcoal", "meadow", "river", "ember", "amber"]);
    for (const swatches of Object.values(all)) expect(swatches.map((s) => s.step)).toEqual([...STEPS]);
  });

  it("paints every declared OKLCH within 4 per channel of the hex declared beside it", () => {
    for (const s of [...Object.values(scales(css)).flat(), board(css)]) {
      const painted = oklchToRgb(parseOklch(s.oklch));
      const declared = hexToRgb(s.hex);
      painted.forEach((v, i) => expect(Math.abs(v - declared[i]!)).toBeLessThanOrEqual(4));
    }
  });

  it("follows each semantic token to its scale step", () => {
    const by = Object.fromEntries(semantic(css).map((t) => [t.name, t]));
    expect(by.primary!.via).toBe("--color-gold-300");
    // Direction D (#537): the charcoal page, gold the one action colour; accent is a raised surface, not a gold-950 brown.
    expect(by.accent!.via).toBe("--color-charcoal-800");
    expect(by.background!.via).toBe("--color-charcoal-950");
    expect(by.background!.hex).toBe("#121316");
    expect(by.card!.hex).toBe("#1C1E22");
    expect(by.board!.hex).toBe("#0C0D0F");
  });

  it("keeps the Storybook UI theme on the board colour", () => {
    const theme = readFileSync(resolve(import.meta.dirname, "../.storybook/theme.ts"), "utf8");
    expect(theme).toContain(`BOARD = "${board(css).hex}"`);
  });

  it("reads --radius", () => {
    expect(radiusBase()).toBe("0.75rem");
  });

  it("reads the four named breakpoints", () => {
    expect(breakpoints(css)).toEqual([
      { name: "mobile", rem: 22.5 },
      { name: "tablet", rem: 40 },
      { name: "desktop", rem: 64 },
      { name: "wide", rem: 90 },
    ]);
  });
});

describe("color-math", () => {
  it("gives the WCAG ratios of black on white (21) and of a colour on itself (1)", () => {
    expect(contrast("oklch(0 0 0)", "oklch(1 0 0)")).toBeCloseTo(21, 1);
    expect(contrast("oklch(0.5 0.1 100)", "oklch(0.5 0.1 100)")).toBeCloseTo(1, 5);
  });

  it("round-trips hex", () => {
    expect(rgbToHex(hexToRgb("#F0BF5B"))).toBe("#F0BF5B");
  });

  it("puts the body text on the page above AA", () => {
    const t = Object.fromEntries(semantic(css).map((x) => [x.name, x.oklch]));
    expect(contrast(t.foreground!, t.background!)).toBeGreaterThan(7);
    expect(contrast(t["primary-foreground"]!, t.primary!)).toBeGreaterThan(4.5);
  });
});

describe("the token names on screen", () => {
  it("agree with the chain's labels, and no source of the app names $TILE", async () => {
    const { PAVED_LABEL, VPAVED_LABEL } = await import("@paved/chain");
    const { TOKENS } = await import("../src/components/elements/amount");
    expect(TOKENS.paved.symbol).toBe(PAVED_LABEL);
    expect(TOKENS.vpaved.symbol).toBe(VPAVED_LABEL);
    const dir = resolve(import.meta.dirname, "../src");
    const sources = (readdirSync(dir, { recursive: true }) as string[]).filter((f) => /\.(tsx?|css|html)$/.test(f));
    expect(sources.length).toBeGreaterThan(100);
    expect(sources.filter((f) => readFileSync(resolve(dir, f), "utf8").includes("$TILE"))).toEqual([]);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCoin, COIN_BASES, COIN_PATHS, type Coin, MARK_RADIUS, scalePath, USDC_MARK, usdcMark } from "../scripts/coins";
import { roundPath } from "../scripts/game-icons";

const COINS = Object.keys(COIN_PATHS) as Coin[];
const P_COINS: Coin[] = ["paved", "vpaved"];
const file = (coin: Coin) => readFileSync(COIN_PATHS[coin], "utf8");
const notices = readFileSync(resolve(import.meta.dirname, "../public/THIRD_PARTY_NOTICES.txt"), "utf8");

describe("PAVED's gold coin and vPAVED's silver one (#853), USDC's steel one (#861)", () => {
  it("are the files scripts/coins.ts gives from coin-front (bun run coins)", () => {
    for (const coin of COINS) expect(file(coin), coin).toBe(buildCoin(coin));
  });

  it("are each under 3 kB, pure SVG: no script, no style, no image, nothing fetched", () => {
    for (const coin of COINS) {
      const svg = file(coin);
      expect(Buffer.byteLength(svg), coin).toBeLessThan(3072);
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox=')).toBe(true);
      expect(svg, coin).not.toMatch(/<script|<style|<image|<foreignObject|https?:\/\/(?!www\.w3\.org\/2000\/svg)|href="(?!#)/);
    }
  });

  it("draw coin-front's coin, face and groove, its mark replaced by the P", () => {
    for (const coin of P_COINS) {
      const svg = file(coin);
      expect(svg).toContain('d="M0 256a256 256 0 1 1 512 0 256 256 0 1 1-512 0z"');
      expect(svg).toContain('d="M256 96a160 160 0 1 1 0 320 160 160 0 1 1 0-320z"');
      // coin-front's slot (its centre's mark) is not drawn.
      expect(svg).not.toMatch(/M280 184/);
      expect(svg).toMatch(/<path id="p" d="M\d+ \d+/);
    }
  });

  it("are PAVED gold and vPAVED silver, the game icons' gold and steel tones, so they read apart", () => {
    expect(COIN_BASES).toEqual({ paved: "#F0BF5B", vpaved: "#DADBDF", usdc: "#CDCFD4" });
    expect(file("paved")).toContain('stop-color="#F0BF5B"');
    expect(file("vpaved")).toContain('stop-color="#DADBDF"');
    expect(file("paved")).not.toBe(file("vpaved"));
  });

  it("are named in the notices: coin-front from Font Awesome Pro, the P from Almendra Bold", () => {
    const entry = notices.slice(notices.indexOf("- paved.svg (gold), vpaved.svg (silver)"), notices.indexOf("Game icons (src/"));
    expect(entry).toContain("`coin-front`");
    expect(entry).toContain("Font Awesome Commercial License");
    expect(entry).toContain("Almendra Bold");
  });
});

describe("USDC's coin (#861): the game icons' coin around the USDC mark, unaltered", () => {
  const svg = () => file("usdc");
  const mark = readFileSync(USDC_MARK, "utf8");
  const parts = [...mark.matchAll(/<path fill="(#[0-9A-F]{6})" d="([^"]+)"\/>/g)].map(([, fill, d]) => ({ fill: fill!, d: d! }));

  it("draws coin-front's coin in a neutral steel, a step darker than vPAVED's silver, with its groove and no P", () => {
    expect(svg()).toContain('<path id="o" d="M0 256a256 256 0 1 1 512 0 256 256 0 1 1-512 0z"/>');
    expect(svg()).toContain('<circle cx="256" cy="256" r="192" fill="url(#s)"/>');
    expect(svg()).toContain('stop-color="#CDCFD4"');
    expect(svg()).not.toContain('id="p"');
  });

  it("keeps the mark as published (the nums file): Circle's blue disc and its white sign, nothing else", () => {
    expect(parts.map((p) => p.fill)).toEqual(["#2775CA", "#FEFEFE", "#FEFEFE"]);
    // Its only fills are the mark's own two colours, after the rim: no gradient, mask, stroke or opacity on it.
    const drawn = svg().slice(svg().indexOf('<path fill="#2775CA"'));
    expect(drawn).toBe(usdcMark(mark) + "</svg>");
    expect(drawn).not.toMatch(/url\(|mask|stroke|opacity|transform/);
  });

  it("only scales the mark onto the coin's face: at scale 1 the scaled path rounds as the original does", () => {
    for (const { d } of parts) expect(roundPath(scalePath(d, 1, 0, 0))).toBe(roundPath(d));
    // The mark's disc spans its 2000 grid; on the coin it spans the face, centred: 256 ± MARK_RADIUS.
    const xs = (d: string) => (d.match(/M(\d+) /) ?? [])[1];
    expect(Number(xs(usdcMark(mark)))).toBe(Math.round(256 - MARK_RADIUS + (996 * MARK_RADIUS) / 1000));
    expect(MARK_RADIUS).toBeGreaterThan(160);
    expect(MARK_RADIUS).toBeLessThan(192);
  });

  it("is recorded in the notices: the mark unaltered, in its own colours; the coin around it Paved's", () => {
    const entry = notices.slice(notices.indexOf("- usdc.svg:"), notices.indexOf("- cobbles.svg:")).replace(/\s+/g, " ");
    expect(entry).toContain("unaltered, in its own colours");
    expect(entry).toContain("vendor/usdc/mark.svg");
    expect(entry).toContain("`coin-front`");
  });
});

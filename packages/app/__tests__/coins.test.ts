import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCoin, COIN_BASES, COIN_PATHS, type Coin } from "../scripts/coins";

const COINS = Object.keys(COIN_PATHS) as Coin[];
const file = (coin: Coin) => readFileSync(COIN_PATHS[coin], "utf8");
const notices = readFileSync(resolve(import.meta.dirname, "../public/THIRD_PARTY_NOTICES.txt"), "utf8");

describe("PAVED's gold coin and vPAVED's silver one (#853)", () => {
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
    for (const coin of COINS) {
      const svg = file(coin);
      expect(svg).toContain('d="M0 256a256 256 0 1 1 512 0 256 256 0 1 1-512 0z"');
      expect(svg).toContain('d="M256 96a160 160 0 1 1 0 320 160 160 0 1 1 0-320z"');
      // coin-front's slot (its centre's mark) is not drawn.
      expect(svg).not.toMatch(/M280 184/);
      expect(svg).toMatch(/<path id="p" d="M\d+ \d+/);
    }
  });

  it("are PAVED gold and vPAVED silver, the game icons' gold and steel tones, so they read apart", () => {
    expect(COIN_BASES).toEqual({ paved: "#F0BF5B", vpaved: "#DADBDF" });
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

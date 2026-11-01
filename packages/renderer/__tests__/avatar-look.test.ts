import { describe, expect, it } from "vitest";
import { KingStills, type KingStillOptions } from "../src/core/avatar/avatar-king";
import {
  KING_TRAITS,
  LOOK_VERSION,
  OPTION_NAMES,
  TRAIT_NAMES,
  TRAIT_OPTIONS,
  TRAIT_PARTS,
  decodeTraits,
  encodeTraits,
  randomTraits,
  seededRandom,
  traitsText,
  type Trait,
  type Traits,
} from "../src/core/avatar/avatar-look";

/** The look's byte of trait `trait` (byte 0 is the version). */
const byteOf = (look: bigint, trait: Trait) => Number((look >> (8n * BigInt(TRAIT_PARTS.indexOf(trait) + 1))) & 0xffn);

describe("the avatar's look", () => {
  it("stores every trait once, in a byte of its own after the version, within the contract's 15 parts", () => {
    expect([...TRAIT_PARTS].sort()).toEqual(Object.keys(TRAIT_OPTIONS).sort());
    expect(TRAIT_PARTS.length).toBeLessThanOrEqual(15);
    for (const options of Object.values(TRAIT_OPTIONS)) expect(options.length).toBeLessThanOrEqual(256);
    // The king is every trait's first option: the look of id 0 everywhere, the version alone.
    expect(encodeTraits(KING_TRAITS)).toBe(BigInt(LOOK_VERSION));
    expect(Object.entries(KING_TRAITS).every(([trait, value]) => TRAIT_OPTIONS[trait as Trait][0] === value)).toBe(true);
  });

  it("takes the old parts' bytes: skin, hair colour, eyes, then outfit and pauldrons, hair, beard, headwear, accessory", () => {
    expect(TRAIT_PARTS).toEqual(["skin", "hair", "eyes", "outfit", "pauldrons", "hairStyle", "beard", "headwear", "accessory"]);
    const look = encodeTraits({ ...KING_TRAITS, skin: "deep", outfit: "black", headwear: "feathered" });
    expect(look).toBe(1n | (4n << 8n) | (4n << 32n) | (5n << 64n));
    expect(look < 1n << 88n).toBe(true);
  });

  it("reads back every combination it writes", () => {
    const random = seededRandom(7);
    for (let i = 0; i < 500; i++) {
      const traits = randomTraits(random);
      const look = encodeTraits(traits);
      expect(decodeTraits(look)).toEqual(traits);
      for (const trait of TRAIT_PARTS) expect(TRAIT_OPTIONS[trait][byteOf(look, trait)]).toBe(traits[trait]);
    }
  });

  it("reads no avatar, another version and an unknown id as the king's, a byte past the traits as nothing", () => {
    expect(decodeTraits(0n)).toEqual(KING_TRAITS);
    expect(decodeTraits(2n | (4n << 8n))).toEqual(KING_TRAITS);
    // Skin 9 and headwear 200 are past their lists: those traits read as the king's, the others as written.
    expect(decodeTraits(1n | (9n << 8n) | (2n << 16n) | (200n << 64n))).toEqual({ ...KING_TRAITS, hair: "blond" });
    expect(decodeTraits(encodeTraits({ ...KING_TRAITS, beard: "goatee" }) | (12n << 80n))).toEqual({ ...KING_TRAITS, beard: "goatee" });
  });

  it("reads a look saved in the catalogue's format, its bytes taken by the traits", () => {
    // AVATAR-LOOK's skin 2, hair colour 3, eyes 0, eyebrows 1, mouth 2, hair 3, beard 1, headwear 6, accessory 0, background 12.
    const old = [2, 3, 0, 1, 2, 3, 1, 6, 0, 12].reduce((look, id, p) => look | (BigInt(id) << (8n * BigInt(p + 1))), 1n);
    expect(decodeTraits(old)).toEqual({ ...KING_TRAITS, skin: "tan", hair: "ginger", outfit: "red", pauldrons: "leather", beard: "none" });
  });

  it("names every trait and option for the creator", () => {
    for (const trait of Object.keys(TRAIT_OPTIONS) as Trait[]) {
      expect(TRAIT_NAMES[trait]).toMatch(/^[A-Z]/);
      expect(Object.keys(OPTION_NAMES[trait])).toEqual([...TRAIT_OPTIONS[trait]]);
    }
  });

  it("draws the same traits from the same seed", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    expect(Array.from({ length: 5 }, () => traitsText(randomTraits(a)))).toEqual(Array.from({ length: 5 }, () => traitsText(randomTraits(b))));
    // mulberry32's first draw for seed 1: the mocks' looks rest on it.
    expect(seededRandom(1)()).toBeCloseTo(0.6270739405881613, 12);
  });
});

/** The stills with the drawing stood in for (no WebGL here): each draw names its traits and side. */
class TestStills extends KingStills {
  draws: string[] = [];
  protected override draw(traits: Traits, px: number): string {
    const url = `still:${traitsText(traits) || "king"}:${px}`;
    this.draws.push(url);
    return url;
  }
}

describe("the avatar's stills", () => {
  const md: KingStillOptions = { size: 40, pixelRatio: 2 };

  it("draws each traits and side once, then answers from the cache", async () => {
    const stills = new TestStills({ idleMs: 10 });
    const wizard: Traits = { ...KING_TRAITS, headwear: "wizard" };
    expect(stills.peek(wizard, md)).toBeUndefined();
    const [a, b] = await Promise.all([stills.get(wizard, md), stills.get(wizard, md)]);
    expect(a).toBe("still:headwear-wizard:80");
    expect(b).toBe(a);
    expect(await stills.get(wizard, md)).toBe(a);
    expect(await stills.get(wizard, { size: 40, pixelRatio: 1 })).toBe("still:headwear-wizard:40");
    expect(stills.draws).toEqual(["still:headwear-wizard:80", "still:headwear-wizard:40"]);
    expect(stills.peek(wizard, md)).toBe(a);
    expect(stills.stats()).toMatchObject({ renders: 2, hits: 1, cached: 2 });
    stills.dispose();
  });

  it("draws one at a time, in the order asked", async () => {
    const stills = new TestStills({ idleMs: 10 });
    const order = ["skin-deep", "hair-blond", "beard-long"].map((text) => ({ ...KING_TRAITS, ...Object.fromEntries([text.split("-")]) }) as Traits);
    await Promise.all(order.map((t) => stills.get(t, md)));
    expect(stills.draws).toEqual(["still:skin-deep:80", "still:hair-blond:80", "still:beard-long:80"]);
    stills.dispose();
  });

  it("keeps the most recently asked images, up to its limit", async () => {
    const stills = new TestStills({ idleMs: 10, maxEntries: 2 });
    const t = (skin: Traits["skin"]): Traits => ({ ...KING_TRAITS, skin });
    await stills.get(t("pale"), md);
    await stills.get(t("tan"), md);
    await stills.get(t("pale"), md);
    await stills.get(t("brown"), md);
    expect(stills.peek(t("pale"), md)).toBeDefined();
    expect(stills.peek(t("tan"), md)).toBeUndefined();
    expect(stills.peek(t("brown"), md)).toBeDefined();
    stills.dispose();
  });

  it("sizes a still in device px, at most three to a CSS px", () => {
    expect(KingStills.pixels({ size: 44, pixelRatio: 1 })).toBe(44);
    expect(KingStills.pixels({ size: 44, pixelRatio: 2.5 })).toBe(110);
    expect(KingStills.pixels({ size: 44, pixelRatio: 4 })).toBe(132);
  });
});

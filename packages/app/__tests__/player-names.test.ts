import { describe, expect, it } from "vitest";
import { seededRandom } from "@paved/renderer";
import { PLAYER_NAME_MAX } from "../src/lib/name-limit";
import { BLOCKED_NAME_PAIRS, NAME_ADJECTIVES, NAME_NOUNS, PLAYER_NAME, cryptoRandom, playerName } from "../src/lib/player-names";

// A new player's name (#926): an adjective and a noun of Paved's world, then two digits, drawn from a seeded random here.

/** Rude words a join could spell across an adjective and a noun (lower case). */
const RUDE = ["ass", "anal", "anus", "bitch", "boob", "bum", "butt", "cock", "coon", "crap", "cum", "cunt", "damn", "dick", "dyke", "fag", "fart", "fuck", "fuk", "god", "hell", "hoe", "homo", "jizz", "kike", "kill", "knob", "nazi", "nig", "pee", "piss", "poo", "porn", "prick", "pus", "rape", "scum", "sex", "shit", "slut", "spic", "suck", "tard", "tit", "turd", "twat", "vag", "wank", "whore", "wog"];

const NAMES = 100_000;

describe("playerName (#926)", () => {
  it("lists about 250 words of each kind, each a capital then lower-case letters, at most 9, none twice nor in both lists", () => {
    for (const list of [NAME_ADJECTIVES, NAME_NOUNS]) {
      expect(list.length).toBeGreaterThanOrEqual(250);
      expect(new Set(list).size).toBe(list.length);
      for (const word of list) expect(word).toMatch(/^[A-Z][a-z]{1,8}$/);
    }
    expect(NAME_ADJECTIVES.filter((w) => NAME_NOUNS.includes(w))).toEqual([]);
  });

  it("gives every name its shape: two words in CamelCase and two digits, letters and digits only, 3 to 19 characters (#928)", () => {
    const random = seededRandom(926);
    for (let i = 0; i < NAMES; i++) {
      const name = playerName(random);
      expect(name).toMatch(PLAYER_NAME);
      expect(name.length).toBeGreaterThanOrEqual(3);
      expect(name.length).toBeLessThanOrEqual(PLAYER_NAME_MAX);
    }
  });

  it("never draws a blocked pair, and no join spells a rude word across the two words", () => {
    const random = seededRandom(744);
    for (let i = 0; i < NAMES; i++) expect(BLOCKED_NAME_PAIRS.has(playerName(random).slice(0, -2))).toBe(false);
    const across: string[] = [];
    for (const a of NAME_ADJECTIVES)
      for (const n of NAME_NOUNS) {
        const joined = (a + n).toLowerCase();
        for (const rude of RUDE) if (joined.includes(rude) && !a.toLowerCase().includes(rude) && !n.toLowerCase().includes(rude)) across.push(`${a}${n}`);
      }
    expect(across.filter((pair) => !BLOCKED_NAME_PAIRS.has(pair))).toEqual([]);
    // Each blocked pair is one the lists can draw.
    for (const pair of BLOCKED_NAME_PAIRS) expect(NAME_ADJECTIVES.some((a) => pair.startsWith(a) && NAME_NOUNS.includes(pair.slice(a.length)))).toBe(true);
  });

  it("repeats few names over 100,000 draws (about 6 million names: about 800 repeats expected)", () => {
    const random = seededRandom(927);
    const seen = new Set<string>();
    for (let i = 0; i < NAMES; i++) seen.add(playerName(random));
    const repeats = NAMES - seen.size;
    // Measured: 786 for this seed (0.79%); the birthday estimate n² / 2N for 6.25 million names is 800.
    expect(repeats).toBeLessThan(1_200);
  });

  it("draws from the device's cryptographic random by default, in [0, 1)", () => {
    for (let i = 0; i < 1000; i++) {
      const r = cryptoRandom();
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
    expect(playerName()).toMatch(PLAYER_NAME);
  });
});

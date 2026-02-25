import { describe, it, expect } from "vitest";
import {
  getSpotFromIndex,
  getIndexFromSpot,
  getRole,
  getCharacterFromIndex,
  getIndexFromCharacter,
  getColor,
  getAvailableCharacters,
  getCharacters,
  CHARACTER_COUNT,
  getBoost,
  getRoleAllowedSpots,
  getColorFromCharacter,
} from "../src/utils";

describe("getSpotFromIndex and getIndexFromSpot", () => {
  it("are inverses for all 9 grid positions", () => {
    for (let i = 0; i < 9; i++) {
      const spot = getSpotFromIndex(i);
      const back = getIndexFromSpot(spot);
      expect(back).toBe(i);
    }
  });

  it("getSpotFromIndex returns correct mappings", () => {
    expect(getSpotFromIndex(0)).toBe(2);  // NW
    expect(getSpotFromIndex(1)).toBe(9);  // W
    expect(getSpotFromIndex(2)).toBe(8);  // SW
    expect(getSpotFromIndex(3)).toBe(3);  // N
    expect(getSpotFromIndex(4)).toBe(1);  // C
    expect(getSpotFromIndex(5)).toBe(7);  // S
    expect(getSpotFromIndex(6)).toBe(4);  // NE
    expect(getSpotFromIndex(7)).toBe(5);  // E
    expect(getSpotFromIndex(8)).toBe(6);  // SE
  });

  it("getSpotFromIndex returns 0 for out-of-range", () => {
    expect(getSpotFromIndex(9)).toBe(0);
    expect(getSpotFromIndex(-1)).toBe(0);
  });

  it("getIndexFromSpot returns -1 for unknown spot", () => {
    expect(getIndexFromSpot(0)).toBe(-1);
    expect(getIndexFromSpot(10)).toBe(-1);
  });
});

describe("getRole()", () => {
  it("returns correct role names", () => {
    expect(getRole(0)).toBe("Lord");
    expect(getRole(1)).toBe("Lady");
    expect(getRole(2)).toBe("Adventurer");
    expect(getRole(3)).toBe("Paladin");
    expect(getRole(4)).toBe("Pilgrim");
    expect(getRole(5)).toBe("Woodsman");
    expect(getRole(6)).toBe("Herdsman");
  });

  it("returns empty string for out-of-range", () => {
    expect(getRole(7)).toBe("");
    expect(getRole(-1)).toBe("");
  });
});

describe("getCharacterFromIndex and getIndexFromCharacter", () => {
  it("are inverses for indices 0-6", () => {
    for (let i = 0; i < 7; i++) {
      const character = getCharacterFromIndex(i);
      const back = getIndexFromCharacter(character);
      expect(back).toBe(i);
    }
  });

  it("getCharacterFromIndex maps correctly", () => {
    expect(getCharacterFromIndex(0)).toBe(1);
    expect(getCharacterFromIndex(1)).toBe(2);
    expect(getCharacterFromIndex(2)).toBe(3);
    expect(getCharacterFromIndex(3)).toBe(4);
    expect(getCharacterFromIndex(4)).toBe(5);
    expect(getCharacterFromIndex(5)).toBe(6);
    expect(getCharacterFromIndex(6)).toBe(7);
  });

  it("getCharacterFromIndex returns 0 for out-of-range", () => {
    expect(getCharacterFromIndex(7)).toBe(0);
  });

  it("getIndexFromCharacter returns -1 for unknown", () => {
    expect(getIndexFromCharacter(0)).toBe(-1);
    expect(getIndexFromCharacter(8)).toBe(-1);
  });
});

describe("getColor()", () => {
  it("returns valid hex color string", () => {
    const color = getColor("test");
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("returns consistent results for same input", () => {
    expect(getColor("abc")).toBe(getColor("abc"));
  });

  it("returns different colors for different inputs", () => {
    const c1 = getColor("hello");
    const c2 = getColor("world");
    expect(c1).not.toBe(c2);
  });

  it("handles empty string", () => {
    const color = getColor("");
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("getAvailableCharacters()", () => {
  it("returns array of character status objects", () => {
    const result = getAvailableCharacters(0);
    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBe(CHARACTER_COUNT);
    for (const item of result) {
      expect(item).toHaveProperty("character");
      expect(item).toHaveProperty("status");
      expect(typeof item.character).toBe("string");
      expect(typeof item.status).toBe("boolean");
    }
  });

  it("decodes packed bitmap - all available when packed=0", () => {
    const result = getAvailableCharacters(0);
    // packed=0 -> after >>= 1 -> 0, all bits 0, so all status = true (available)
    for (const item of result) {
      expect(item.status).toBe(true);
    }
  });

  it("decodes packed bitmap - specific bits set", () => {
    // After shifting right by 1, bit pattern determines availability
    // status = (value & 1) === 0, so bit=0 means available, bit=1 means taken
    // packed = 0b111110 (62) -> after >>= 1 -> 0b11111 (31)
    // Each character checks least significant bit then shifts
    // Char 0: 31 & 1 = 1 -> status false (taken)
    // Char 1: 15 & 1 = 1 -> status false (taken)
    // etc.
    const result = getAvailableCharacters(62);
    expect(result[0].status).toBe(false); // bit set = not available
    expect(result[1].status).toBe(false);
    expect(result[2].status).toBe(false);
    expect(result[3].status).toBe(false);
    expect(result[4].status).toBe(false);
  });
});

describe("getCharacters()", () => {
  it("returns CHARACTER_COUNT characters", () => {
    const chars = getCharacters();
    expect(chars).toHaveLength(CHARACTER_COUNT);
  });

  it("returns role names", () => {
    const chars = getCharacters();
    expect(chars[0]).toBe("Lord");
    expect(chars[1]).toBe("Lady");
    expect(chars[2]).toBe("Adventurer");
    expect(chars[3]).toBe("Paladin");
    expect(chars[4]).toBe("Pilgrim");
  });
});

describe("getBoost()", () => {
  it("returns correct boost characters", () => {
    expect(getBoost(2)).toBe("R");
    expect(getBoost(3)).toBe("C");
    expect(getBoost(4)).toBe("W");
    expect(getBoost(5)).toBe("F");
    expect(getBoost(6)).toBe("F");
  });

  it("returns empty for 0 and 1", () => {
    expect(getBoost(0)).toBe("");
    expect(getBoost(1)).toBe("");
  });
});

describe("getRoleAllowedSpots()", () => {
  it("Lord (0) allowed C, R, W", () => {
    expect(getRoleAllowedSpots(0)).toEqual(["C", "R", "W"]);
  });

  it("Lady (1) allowed C, R, W", () => {
    expect(getRoleAllowedSpots(1)).toEqual(["C", "R", "W"]);
  });

  it("Adventurer (2) allowed R, W", () => {
    expect(getRoleAllowedSpots(2)).toEqual(["R", "W"]);
  });

  it("Paladin (3) allowed C, W", () => {
    expect(getRoleAllowedSpots(3)).toEqual(["C", "W"]);
  });

  it("Pilgrim (4) allowed C, R, W", () => {
    expect(getRoleAllowedSpots(4)).toEqual(["C", "R", "W"]);
  });

  it("Woodsman (5) allowed R, F", () => {
    expect(getRoleAllowedSpots(5)).toEqual(["R", "F"]);
  });

  it("Herdsman (6) allowed C, F", () => {
    expect(getRoleAllowedSpots(6)).toEqual(["C", "F"]);
  });
});

describe("getColorFromCharacter()", () => {
  it("returns named colors for known characters", () => {
    expect(getColorFromCharacter(1)).toBe("blue");
    expect(getColorFromCharacter(2)).toBe("pink");
    expect(getColorFromCharacter(3)).toBe("grey");
    expect(getColorFromCharacter(4)).toBe("red");
    expect(getColorFromCharacter(5)).toBe("yellow");
    expect(getColorFromCharacter(6)).toBe("green");
    expect(getColorFromCharacter(7)).toBe("purple");
  });

  it("returns black for unknown character", () => {
    expect(getColorFromCharacter(0)).toBe("black");
    expect(getColorFromCharacter(8)).toBe("black");
  });
});

import { describe, it, expect } from "vitest";
import { Player, PlayerData } from "../src/models/player";

function makePlayerData(overrides: Partial<PlayerData> = {}): PlayerData {
  return {
    id: 123,
    name: 0x416c696365, // "Alice" in hex ASCII
    score: 500,
    paved: 10,
    master: 456,
    ...overrides,
  };
}

describe("Player", () => {
  describe("constructor", () => {
    it("converts player_id to hex string with 0x prefix", () => {
      const player = new Player(makePlayerData({ id: 255 }));
      expect(player.id).toBe("0xff");
    });

    it("converts player_id bigint to hex", () => {
      const player = new Player(makePlayerData({ id: BigInt("0xdeadbeef") }));
      expect(player.id).toBe("0xdeadbeef");
    });

    it("converts master to hex string with 0x prefix", () => {
      const player = new Player(makePlayerData({ master: 256 }));
      expect(player.master).toBe("0x100");
    });

    it("stores score and paved", () => {
      const player = new Player(makePlayerData({ score: 999, paved: 42 }));
      expect(player.score).toBe(999);
      expect(player.paved).toBe(42);
    });
  });

  describe("decodeShortString", () => {
    it("converts felt252 to readable name (0x416c696365 = Alice)", () => {
      const player = new Player(makePlayerData({ name: 0x416c696365 }));
      expect(player.name).toBe("Alice");
    });

    it("decodes Bob (0x426f62)", () => {
      const player = new Player(makePlayerData({ name: 0x426f62 }));
      expect(player.name).toBe("Bob");
    });

    it("handles bigint name", () => {
      const player = new Player(makePlayerData({ name: BigInt("0x416c696365") }));
      expect(player.name).toBe("Alice");
    });

    it("handles string name as number", () => {
      const player = new Player(makePlayerData({ name: "0x416c696365" }));
      expect(player.name).toBe("Alice");
    });

    it("handles empty/zero name", () => {
      const player = new Player(makePlayerData({ name: 0 }));
      expect(player.name).toBe("");
    });
  });

  describe("getShortName()", () => {
    it("returns full name when 11 chars or less", () => {
      const player = new Player(makePlayerData({ name: 0x416c696365 }));
      expect(player.getShortName()).toBe("Alice");
    });

    it("truncates names longer than 11 chars", () => {
      // "ABCDEFGHIJKLong" = 16 chars
      // We need a hex encoding of a 12+ char string
      // "ABCDEFGHIJKL" in hex: 0x4142434445464748494a4b4c
      const player = new Player(makePlayerData({ name: BigInt("0x4142434445464748494a4b4c") }));
      expect(player.name).toBe("ABCDEFGHIJKL");
      expect(player.name.length).toBe(12);
      // Should truncate to 8 chars + ellipsis
      const short = player.getShortName();
      expect(short).toBe("ABCDEFGH\u2026");
      expect(short.length).toBe(9);
    });

    it("returns full name for exactly 11 chars", () => {
      // "ABCDEFGHIJK" = 11 chars -> 0x4142434445464748494a4b
      const player = new Player(makePlayerData({ name: BigInt("0x4142434445464748494a4b") }));
      expect(player.name).toBe("ABCDEFGHIJK");
      expect(player.getShortName()).toBe("ABCDEFGHIJK");
    });
  });
});

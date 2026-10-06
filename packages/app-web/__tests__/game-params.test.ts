import { describe, it, expect } from "vitest";
import { parseGameParams } from "../src/utils/game-params";

describe("parseGameParams", () => {
  it("reads mode, id and readonly", () => {
    expect(parseGameParams(new URLSearchParams("mode=tutorial&id=42&readonly=true"))).toEqual({
      mode: "tutorial",
      gameId: 42,
      readonly: true,
    });
  });

  it("defaults to a new daily game, writable", () => {
    expect(parseGameParams(new URLSearchParams(""))).toEqual({ mode: "daily", gameId: null, readonly: false });
  });

  it("reads weekly, gone since P1, as daily", () => {
    expect(parseGameParams(new URLSearchParams("mode=weekly")).mode).toBe("daily");
  });

  it("ignores an id that is not a positive integer", () => {
    expect(parseGameParams(new URLSearchParams("id=0")).gameId).toBeNull();
    expect(parseGameParams(new URLSearchParams("id=abc")).gameId).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { parseGameParams } from "../src/utils/game-params";
import { buildGameRoute } from "../src/utils/mode-routing";

const parse = (q: string) => parseGameParams(new URLSearchParams(q));

describe("parseGameParams", () => {
  it("reads mode, id and readonly", () => {
    expect(parse("mode=tutorial&id=42&readonly=true")).toEqual({
      mode: "tutorial",
      gameId: 42,
      invalidId: false,
      spawn: false,
      readonly: true,
    });
  });

  it("a bare /game neither spawns nor pays", () => {
    expect(parse("")).toEqual({ mode: "daily", gameId: null, invalidId: false, spawn: false, readonly: false });
    expect(parse("mode=daily").spawn).toBe(false);
  });

  it("spawns only on spawn=1 with no id", () => {
    expect(parse("mode=daily&spawn=1").spawn).toBe(true);
    expect(parse("mode=daily&spawn=true").spawn).toBe(false);
    expect(parse("mode=daily&id=3&spawn=1")).toMatchObject({ gameId: 3, spawn: false });
  });

  it("a malformed id is not found, never a spawn", () => {
    for (const id of ["0", "abc", "-1", "1.5", "1e3", "", "4294967296"]) {
      expect(parse(`mode=daily&spawn=1&id=${id}`)).toMatchObject({ gameId: null, invalidId: true, spawn: false });
    }
  });

  it("reads weekly, gone since P1, as daily", () => {
    expect(parse("mode=weekly").mode).toBe("daily");
  });

  it("round-trips the routes of the landing page", () => {
    expect(parseGameParams(new URLSearchParams(buildGameRoute({ mode: "daily", spawn: true }).split("?")[1]))).toMatchObject({ spawn: true, gameId: null });
    expect(parseGameParams(new URLSearchParams(buildGameRoute({ mode: "tutorial", gameId: 9 }).split("?")[1]))).toMatchObject({ spawn: false, gameId: 9 });
  });
});

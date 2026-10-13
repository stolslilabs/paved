import { describe, it, expect } from "vitest";
import { parseGameParams } from "../src/utils/game-params";
import { buildGameRoute } from "../src/utils/mode-routing";

const parse = (q: string) => parseGameParams(new URLSearchParams(q));

describe("parseGameParams", () => {
  it("reads mode, id and readonly", () => {
    expect(parse("mode=daily&id=42&readonly=true")).toEqual({
      mode: "daily",
      gameId: 42,
      invalidId: false,
      readonly: true,
    });
  });

  it("a bare /game shows nothing and starts nothing", () => {
    expect(parse("")).toEqual({ mode: "daily", gameId: null, invalidId: false, readonly: false });
  });

  it("the URL carries no consent: spawn and price in a link are ignored", () => {
    const crafted = parse("mode=daily&spawn=1&price=1000000000000000000");
    expect(crafted).toEqual({ mode: "daily", gameId: null, invalidId: false, readonly: false });
    expect(Object.keys(crafted)).not.toContain("spawn");
    expect(Object.keys(crafted)).not.toContain("price");
  });

  it("a malformed id is not found", () => {
    for (const id of ["0", "abc", "-1", "1.5", "1e3", "", "4294967296"]) {
      expect(parse(`mode=daily&id=${id}`)).toMatchObject({ gameId: null, invalidId: true });
    }
  });

  it("reads weekly, gone since P1, and the on-chain tutorial, gone since D-21, as daily", () => {
    expect(parse("mode=weekly").mode).toBe("daily");
    expect(parse("mode=tutorial&id=4").mode).toBe("daily");
  });

  it("round-trips the routes of the landing page", () => {
    expect(parseGameParams(new URLSearchParams(buildGameRoute({ mode: "daily", gameId: 9 }).split("?")[1]))).toMatchObject({ gameId: 9 });
  });
});

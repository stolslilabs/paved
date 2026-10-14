import { describe, expect, it } from "vitest";
import { playerLabel, shortId } from "../src/utils/indexer-view";

const ME = "0x" + "a".repeat(63) + "1";
const OTHER = "0x" + "b".repeat(63) + "2";

describe("playerLabel (N1)", () => {
  it("the connected player keeps their Controller username over the indexer's name, whatever the address's padding", () => {
    expect(playerLabel(ME, { id: ME, username: "me" }, "indexer-name")).toBe("me");
    expect(playerLabel("0x" + "0".repeat(8) + ME.slice(2), { id: ME, username: "me" })).toBe("me");
  });
  it("another player shows as the indexer's name when it has one", () => {
    expect(playerLabel(OTHER, { id: ME, username: "me" }, "ada")).toBe("ada");
    expect(playerLabel(OTHER, undefined, "ada")).toBe("ada");
  });
  it("else a short address: null, empty or no name", () => {
    for (const name of [null, undefined, ""]) expect(playerLabel(OTHER, { id: ME, username: "me" }, name)).toBe(shortId(OTHER));
  });
  it("the connected player without a username falls back to the indexer's name, then the short address", () => {
    expect(playerLabel(ME, { id: ME, username: null }, "ada")).toBe("ada");
    expect(playerLabel(ME, { id: ME, username: null })).toBe(shortId(ME));
  });
});

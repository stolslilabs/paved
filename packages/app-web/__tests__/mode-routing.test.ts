import { describe, expect, it } from "vitest";
import { buildGameRoute, modeFromParam } from "../src/utils/mode-routing";

describe("mode-routing", () => {
  it("routes to a game by mode and id", () => {
    expect(buildGameRoute({ gameId: 42, mode: "daily" })).toBe("/game?mode=daily&id=42");
  });

  it("adds readonly for a finished game", () => {
    expect(buildGameRoute({ gameId: 7, mode: "tutorial", readonly: true })).toBe("/game?mode=tutorial&id=7&readonly=true");
  });

  it("a route never carries a consent to start a game", () => {
    expect(buildGameRoute({ mode: "tutorial" })).toBe("/game?mode=tutorial");
    expect(buildGameRoute({ mode: "daily", gameId: 4 })).toBe("/game?mode=daily&id=4");
  });

  it("maps params to the two modes", () => {
    expect(modeFromParam("tutorial")).toBe("tutorial");
    expect(modeFromParam("daily")).toBe("daily");
    expect(modeFromParam("weekly")).toBe("daily");
    expect(modeFromParam(null)).toBe("daily");
  });
});

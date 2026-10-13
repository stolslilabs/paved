import { describe, expect, it } from "vitest";
import { buildGameRoute, isTrainingParam, modeFromParam } from "../src/utils/mode-routing";

describe("mode-routing", () => {
  it("routes to a game by mode and id", () => {
    expect(buildGameRoute({ gameId: 42, mode: "daily" })).toBe("/game?mode=daily&id=42");
  });

  it("adds readonly for a finished game", () => {
    expect(buildGameRoute({ gameId: 7, mode: "daily", readonly: true })).toBe("/game?mode=daily&id=7&readonly=true");
  });

  it("a route never carries a consent to start a game", () => {
    expect(buildGameRoute({ mode: "daily" })).toBe("/game?mode=daily");
    expect(buildGameRoute({ mode: "daily", gameId: 4 })).toBe("/game?mode=daily&id=4");
  });

  it("maps every param to Daily: the on-chain Tutorial left (D-21), the tutorial is the /tutorial page", () => {
    expect(modeFromParam("tutorial")).toBe("daily");
    expect(modeFromParam("daily")).toBe("daily");
    expect(modeFromParam("weekly")).toBe("daily");
    expect(modeFromParam(null)).toBe("daily");
  });

  it("routes Training to the game route, with no game id", () => {
    expect(buildGameRoute({ mode: "training" })).toBe("/game?mode=training");
    expect(buildGameRoute({ mode: "training", gameId: 9 })).toBe("/game?mode=training");
    expect(isTrainingParam("training")).toBe(true);
    expect(isTrainingParam("daily")).toBe(false);
    expect(isTrainingParam(null)).toBe(false);
    // The chain's modes are still two: a training param is not one of them.
    expect(modeFromParam("training")).toBe("daily");
  });
});

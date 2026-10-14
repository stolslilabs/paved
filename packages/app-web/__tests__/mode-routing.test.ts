import { describe, expect, it } from "vitest";
import { buildGameRoute, isDailyParam, isTrainingParam, isTutorialParam, modeFromParam, renamedModeSearch } from "../src/utils/mode-routing";

describe("mode-routing", () => {
  it("routes to a game by mode and id", () => {
    expect(buildGameRoute({ gameId: 42, mode: "challenge" })).toBe("/game?mode=challenge&id=42");
  });

  it("adds readonly for a finished game", () => {
    expect(buildGameRoute({ gameId: 7, mode: "challenge", readonly: true })).toBe("/game?mode=challenge&id=7&readonly=true");
  });

  it("a route never carries a consent to start a game", () => {
    expect(buildGameRoute({ mode: "challenge" })).toBe("/game?mode=challenge");
    expect(buildGameRoute({ mode: "challenge", gameId: 4 })).toBe("/game?mode=challenge&id=4");
  });

  it("maps every param to Challenge: the on-chain Tutorial left (D-21), the tutorial is the /tutorial page", () => {
    expect(modeFromParam("tutorial")).toBe("challenge");
    expect(modeFromParam("challenge")).toBe("challenge");
    expect(modeFromParam("weekly")).toBe("challenge");
    expect(modeFromParam(null)).toBe("challenge");
  });

  it("routes Training to the game route, with no game id", () => {
    expect(buildGameRoute({ mode: "training" })).toBe("/game?mode=training");
    expect(buildGameRoute({ mode: "training", gameId: 9 })).toBe("/game?mode=training");
    expect(isTrainingParam("training")).toBe(true);
    expect(isTrainingParam("challenge")).toBe(false);
    expect(isTrainingParam(null)).toBe(false);
    // The chain's modes are still two: a training param is not one of them.
    expect(modeFromParam("training")).toBe("challenge");
  });

  it("recognises the old tutorial link", () => {
    expect(isTutorialParam("tutorial")).toBe(true);
    expect(isTutorialParam("challenge")).toBe(false);
    expect(isTutorialParam(null)).toBe(false);
  });

  it("recognises the old Daily link (D-23) and renames only its mode", () => {
    expect(isDailyParam("daily")).toBe(true);
    expect(isDailyParam("challenge")).toBe(false);
    expect(isDailyParam(null)).toBe(false);
    expect(renamedModeSearch(new URLSearchParams("mode=daily&id=42&readonly=true"))).toBe("?mode=challenge&id=42&readonly=true");
    expect(renamedModeSearch(new URLSearchParams("mode=daily&ref=0x77"))).toBe("?mode=challenge&ref=0x77");
  });
});

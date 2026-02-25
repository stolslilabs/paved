import { describe, it, expect } from "vitest";
import { parseGameParams, modeToContractName } from "../src/utils/game-params";

describe("parseGameParams", () => {
  it("extracts mode from search params", () => {
    const params = new URLSearchParams("mode=weekly");
    expect(parseGameParams(params).mode).toBe("weekly");
  });

  it("extracts gameId from search params", () => {
    const params = new URLSearchParams("id=42");
    expect(parseGameParams(params).gameId).toBe(42);
  });

  it("extracts readonly flag from search params", () => {
    const params = new URLSearchParams("readonly=true");
    expect(parseGameParams(params).readonly).toBe(true);
  });

  it("defaults mode to daily when absent", () => {
    const params = new URLSearchParams("");
    expect(parseGameParams(params).mode).toBe("daily");
  });

  it("returns null gameId when absent", () => {
    const params = new URLSearchParams("");
    expect(parseGameParams(params).gameId).toBeNull();
  });

  it("returns false readonly when absent", () => {
    const params = new URLSearchParams("");
    expect(parseGameParams(params).readonly).toBe(false);
  });
});

describe("modeToContractName", () => {
  it("maps daily to Daily", () => {
    expect(modeToContractName("daily")).toBe("Daily");
  });

  it("maps weekly to Weekly", () => {
    expect(modeToContractName("weekly")).toBe("Weekly");
  });

  it("maps tutorial to Tutorial", () => {
    expect(modeToContractName("tutorial")).toBe("Tutorial");
  });

  it("defaults to Daily for unknown mode", () => {
    expect(modeToContractName("none")).toBe("Daily");
  });
});

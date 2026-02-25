import { describe, expect, it } from "vitest";
import { ModeType } from "@paved/game-core";
import {
  buildGameRoute,
  modeTypeFromParam,
  modeTypeFromToriiMode,
  resolveRuntimeMode,
} from "../src/utils/mode-routing";

describe("mode-routing utils", () => {
  describe("buildGameRoute", () => {
    it("includes id and mode for active game route", () => {
      expect(buildGameRoute({ gameId: 42, mode: "weekly" })).toBe("/game?id=42&mode=weekly");
    });

    it("includes readonly=true for completed game route", () => {
      expect(buildGameRoute({ gameId: 7, mode: "tutorial", readonly: true })).toBe(
        "/game?id=7&mode=tutorial&readonly=true"
      );
    });
  });

  describe("modeTypeFromParam", () => {
    it("maps valid params", () => {
      expect(modeTypeFromParam("daily")).toBe(ModeType.Daily);
      expect(modeTypeFromParam("weekly")).toBe(ModeType.Weekly);
      expect(modeTypeFromParam("tutorial")).toBe(ModeType.Tutorial);
    });

    it("falls back to daily for unknown params", () => {
      expect(modeTypeFromParam("none")).toBe(ModeType.Daily);
      expect(modeTypeFromParam("anything")).toBe(ModeType.Daily);
    });
  });

  describe("modeTypeFromToriiMode", () => {
    it("maps numeric mode indexes", () => {
      expect(modeTypeFromToriiMode(1)).toBe(ModeType.Daily);
      expect(modeTypeFromToriiMode(2)).toBe(ModeType.Weekly);
      expect(modeTypeFromToriiMode(3)).toBe(ModeType.Tutorial);
    });

    it("maps string mode indexes", () => {
      expect(modeTypeFromToriiMode("1")).toBe(ModeType.Daily);
      expect(modeTypeFromToriiMode("2")).toBe(ModeType.Weekly);
      expect(modeTypeFromToriiMode("3")).toBe(ModeType.Tutorial);
    });

    it("returns null for unsupported values", () => {
      expect(modeTypeFromToriiMode(0)).toBeNull();
      expect(modeTypeFromToriiMode("0")).toBeNull();
      expect(modeTypeFromToriiMode(99)).toBeNull();
    });
  });

  describe("resolveRuntimeMode", () => {
    it("uses torii mode when available", () => {
      expect(resolveRuntimeMode(ModeType.Daily, 2)).toBe(ModeType.Weekly);
      expect(resolveRuntimeMode(ModeType.Daily, "3")).toBe(ModeType.Tutorial);
    });

    it("keeps fallback mode when torii mode is unavailable", () => {
      expect(resolveRuntimeMode(ModeType.Weekly, 0)).toBe(ModeType.Weekly);
      expect(resolveRuntimeMode(ModeType.Tutorial, "invalid")).toBe(ModeType.Tutorial);
    });
  });
});

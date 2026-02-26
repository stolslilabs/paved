import { describe, expect, it } from "vitest";
import { resolveEconomySnapshotState } from "../src/components/EconomySnapshotCard";

describe("EconomySnapshotCard", () => {
  it("returns loading state", () => {
    expect(resolveEconomySnapshotState({ isLoading: true, error: null })).toEqual({
      tone: "loading",
      message: "Loading economy snapshot",
    });
  });

  it("returns error state", () => {
    expect(resolveEconomySnapshotState({ isLoading: false, error: "not found" })).toEqual({
      tone: "error",
      message: "not found",
    });
  });

  it("returns ready state", () => {
    expect(resolveEconomySnapshotState({
      isLoading: false,
      error: null,
      multiplierLabel: "1.25x",
    })).toEqual({
      tone: "ready",
      message: "Multiplier 1.25x",
    });
  });
});

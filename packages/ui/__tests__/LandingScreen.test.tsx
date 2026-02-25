import { describe, it, expect } from "vitest";
import { LandingScreen } from "../src/screens/Landing";
import type { LandingScreenProps } from "../src/screens/Landing";

describe("LandingScreen", () => {
  it("exports as a function component", () => {
    expect(typeof LandingScreen).toBe("function");
  });

  it("LandingScreenProps type includes new fields", () => {
    // Type-level test: this compiles if props are correct
    const props: LandingScreenProps = {
      connected: true,
      playerName: "Test",
      gameModes: [],
      activeGames: [],
      completedGames: [],
      leaderboard: [],
      isLoading: false,
      onModeSelect: () => {},
    };
    expect(props).toBeDefined();
    expect(props.connected).toBe(true);
    expect(props.playerName).toBe("Test");
    expect(props.gameModes).toEqual([]);
    expect(props.activeGames).toEqual([]);
    expect(props.completedGames).toEqual([]);
    expect(props.leaderboard).toEqual([]);
    expect(props.isLoading).toBe(false);
    expect(typeof props.onModeSelect).toBe("function");
  });

  it("maintains backward compatibility with original props", () => {
    const props: LandingScreenProps = {
      connected: false,
      playerName: "OG",
      onSpawn: () => {},
    };
    expect(props).toBeDefined();
  });
});

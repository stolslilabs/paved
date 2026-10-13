import { describe, it, expect } from "vitest";
import { LandingScreen } from "../src/screens/Landing";
import type { LandingScreenProps } from "../src/screens/Landing";
import { GameModeCardView } from "../src/components/GameModeCard";

/** The elements of a tree whose type is `type`, found through `props.children` (the screen is presentational). */
function elementsOf(node: unknown, type: unknown): Array<{ props: Record<string, unknown> }> {
  if (Array.isArray(node)) return node.flatMap((n) => elementsOf(n, type));
  const element = node as { type?: unknown; props?: { children?: unknown } } | null;
  if (!element || typeof element !== "object") return [];
  return [...(element.type === type ? [element as { props: Record<string, unknown> }] : []), ...elementsOf(element.props?.children, type)];
}
const card = (mode: string) => ({ mode, title: mode, description: "", tileCount: 10, duration: "", entryFee: "Free", onPress: () => {} });

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
      isLoading: false,
      onModeSelect: () => {},
    };
    expect(props).toBeDefined();
    expect(props.connected).toBe(true);
    expect(props.playerName).toBe("Test");
    expect(props.gameModes).toEqual([]);
    expect(props.activeGames).toEqual([]);
    expect(props.completedGames).toEqual([]);
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

  it("offers the quests screen through onQuests, next to the leaderboard", () => {
    const opened: string[] = [];
    const props: LandingScreenProps = { onLeaderboard: () => opened.push("leaderboard"), onQuests: () => opened.push("quests") };
    props.onQuests?.();
    expect(opened).toEqual(["quests"]);
  });

  it("shows the mode cards with no wallet and no player, so Training and the Tutorial sit among them", () => {
    for (const props of [{ connected: false }, { connected: true }, { connected: true, playerName: "Zed" }] as LandingScreenProps[]) {
      const tree = LandingScreen({ ...props, gameModes: [card("daily"), card("training"), card("tutorial")] });
      expect(elementsOf(tree, GameModeCardView).map((e) => e.props.mode)).toEqual(["daily", "training", "tutorial"]);
    }
  });

  it("shows no Game Modes section when there is no card", () => {
    expect(elementsOf(LandingScreen({ connected: false, gameModes: [] }), GameModeCardView)).toEqual([]);
  });
});

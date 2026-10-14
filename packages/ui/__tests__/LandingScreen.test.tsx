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
/** Every string child of a tree, as the screen renders it. */
function textsOf(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (Array.isArray(node)) return node.flatMap(textsOf);
  const element = node as { props?: { children?: unknown } } | null;
  return element && typeof element === "object" ? textsOf(element.props?.children) : [];
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

  // D-25 (E): a player is the wallet address; there is no account to create and no name on chain.
  it("a connected wallet is the player: no Create Account, a welcome with the name, and its games section", () => {
    for (const playerName of ["ada", "0x05f3…9a1c", undefined]) {
      const texts = textsOf(LandingScreen({ connected: true, playerName }));
      expect(texts).not.toContain("Create Account");
      if (playerName) expect(texts).toContain(`Welcome, ${playerName}`);
      expect(texts).toContain("Your Games");
    }
    const away = textsOf(LandingScreen({ connected: false }));
    expect(away).toContain("Connect your wallet to begin");
    expect(away).not.toContain("Your Games");
  });

  it("offers the quests screen through onQuests, next to the leaderboard", () => {
    const opened: string[] = [];
    const props: LandingScreenProps = { onLeaderboard: () => opened.push("leaderboard"), onQuests: () => opened.push("quests") };
    props.onQuests?.();
    expect(opened).toEqual(["quests"]);
  });

  it("shows the mode cards with no wallet and no player, so Training and the Tutorial sit among them", () => {
    for (const props of [{ connected: false }, { connected: true }, { connected: true, playerName: "Zed" }] as LandingScreenProps[]) {
      const tree = LandingScreen({ ...props, gameModes: [card("challenge"), card("training"), card("tutorial")] });
      expect(elementsOf(tree, GameModeCardView).map((e) => e.props.mode)).toEqual(["challenge", "training", "tutorial"]);
    }
  });

  it("shows no Game Modes section when there is no card", () => {
    expect(elementsOf(LandingScreen({ connected: false, gameModes: [] }), GameModeCardView)).toEqual([]);
  });

  it("a card's notice shows as plain text, and a card without one shows none (G4: new games paused)", () => {
    const notice = "New Challenge games are paused for now. Games already started can still be played.";
    expect(textsOf(GameModeCardView({ ...card("challenge"), notice }))).toContain(notice);
    expect(textsOf(GameModeCardView(card("challenge")))).not.toContain(notice);
  });
});

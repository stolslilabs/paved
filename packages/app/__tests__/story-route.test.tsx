import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAMPAIGNS, STORY_KEY, TUTORIAL, decodeLine, recordRun, EMPTY_PROGRESS, type StoryLevel } from "@paved/game-core";
import { App } from "../src/App";
import { UNLOCKS_KEY } from "../src/data/story";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { placeTile, preloadPages } from "./route-helpers";

preloadPages("story", "story-board");

const PLAYER = "0x5f1";
/** First Stone credited: the receipt of a first claim. */
const CREDITED = [{ name: "AchievementProgressed", fields: { taskId: 10n } }] as never;

beforeEach(() => {
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  vi.restoreAllMocks();
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

const hand = () => screen.getByRole("region", { name: "Your tile" });
const slotName = (x: number, y: number) => {
  const part = (n: number, plus: string, minus: string) => (n === 0 ? null : `${Math.abs(n)} ${n > 0 ? plus : minus}`);
  return [part(x, "east", "west"), part(y, "north", "south")].filter(Boolean).join(", ") || "centre";
};

/** Plays `level`'s stored line through the board: Discard, or the slot, turned to the line's orientation, then Validate. */
async function playLine(level: StoryLevel) {
  for (const move of decodeLine(level.line)) {
    if (move.action === "discard") {
      await userEvent.click(within(hand()).getByRole("button", { name: /Discard/ }));
      continue;
    }
    const { x, y, orientation } = move.placement;
    await userEvent.click(screen.getByRole("button", { name: `Slot ${slotName(x, y)}` }));
    const wanted = new RegExp(`, ${orientation.toLowerCase()}$`);
    for (let turn = 0; turn < 4 && !within(hand()).queryByRole("img", { name: wanted }); turn++) {
      await userEvent.click(await screen.findByRole("button", { name: "Rotate tile" }));
    }
    await placeTile();
  }
}

describe("/story (#546): campaigns, levels, stars and locks", { timeout: 30_000 }, () => {
  it("/tutorial leads to Story mode, where only the first level is open", async () => {
    const router = createTestRouter("/tutorial");
    render(<App router={router} sources={fakeSources({ store: () => memoryStore() }).sources} connector={fakeWallet().load} />);
    expect(await screen.findByRole("heading", { level: 2, name: "Tutorial" }, { timeout: 5000 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/story");
    const tutorial = screen.getByRole("region", { name: "Tutorial" });
    expect(within(tutorial).getByRole("button", { name: /^Level 1, First stone$/ })).toBeEnabled();
    expect(within(tutorial).getByRole("button", { name: /^Level 2, Turn it around, locked$/ })).toBeDisabled();
    expect(tutorial.querySelector('[title="Turn it around"]')).not.toBeNull();
    // The campaigns are cards; the locked one says what it needs, and pressing it shows its levels, locked.
    const cards = screen.getByRole("region", { name: "Campaigns" });
    const locked = within(cards).getByRole("button", { name: /^Open Country/ });
    expect(locked).toHaveAttribute("data-status", "locked");
    expect(locked).toHaveTextContent("22 more stars to open");
    expect(within(cards).getByRole("button", { name: /^Tutorial/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(locked);
    expect(locked).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(router.state.location.search).toBe("?campaign=2"));
    const second = screen.getByRole("region", { name: "Open Country" });
    expect(within(second).getByText("Locked")).toBeInTheDocument();
    expect(within(second).getByRole("button", { name: /^Level 1, .*, locked$/ })).toBeDisabled();
    expect(screen.queryByRole("region", { name: "Tutorial" })).toBeNull();
  });

  it("a campaign opened since the last visit plays its unlock once; the device remembers it (#592)", async () => {
    let progress = EMPTY_PROGRESS;
    for (const level of TUTORIAL.levels) progress = recordRun(progress, level, { campaignId: 1, levelIndex: level.id, moves: [] }, level.target);
    const store = memoryStore({ [STORY_KEY]: JSON.stringify(progress) });
    const first = render(<App router={createTestRouter("/story")} sources={fakeSources({ store: () => store }).sources} connector={fakeWallet().load} />);
    const cards = await screen.findByRole("region", { name: "Campaigns" }, { timeout: 5000 });
    expect(within(cards).getByRole("button", { name: /^Open Country/ })).toHaveAttribute("data-status", "unlocking");
    expect(within(cards).getByRole("button", { name: /^Tutorial/ })).toHaveAttribute("data-status", "complete");
    await waitFor(() => expect(JSON.parse(store.getItem(UNLOCKS_KEY) ?? "[]")).toEqual([2]));
    first.unmount();
    queryClient.clear();

    render(<App router={createTestRouter("/story")} sources={fakeSources({ store: () => store }).sources} connector={fakeWallet().load} />);
    const again = await screen.findByRole("region", { name: "Campaigns" }, { timeout: 5000 });
    expect(within(again).getByRole("button", { name: /^Open Country/ })).toHaveAttribute("data-status", "open");
  });

  it("the campaign just opened is the one in view, over a campaign remembered in the address (#592)", async () => {
    let progress = EMPTY_PROGRESS;
    for (const level of TUTORIAL.levels) progress = recordRun(progress, level, { campaignId: 1, levelIndex: level.id, moves: [] }, level.target);
    const store = memoryStore({ [STORY_KEY]: JSON.stringify(progress) });
    const router = createTestRouter("/story?campaign=1");
    render(<App router={router} sources={fakeSources({ store: () => store }).sources} connector={fakeWallet().load} />);
    const cards = await screen.findByRole("region", { name: "Campaigns" }, { timeout: 5000 });
    const opened = within(cards).getByRole("button", { name: /^Open Country/ });
    expect(opened).toHaveAttribute("data-status", "unlocking");
    expect(opened).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Open Country" })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toBe("?campaign=2"));
    // A pick after that is the player's: the address keeps it.
    await userEvent.click(within(cards).getByRole("button", { name: /^Tutorial/ }));
    await waitFor(() => expect(router.state.location.search).toBe("?campaign=1"));
    expect(screen.getByRole("region", { name: "Tutorial" })).toBeInTheDocument();
  });

  it("plays level 1 to 3 stars on the board, records the run, claims First Stone, and opens level 2", async () => {
    const store = memoryStore();
    const wallet = fakeWallet({ address: PLAYER, claimEvents: CREDITED });
    const router = createTestRouter("/story");
    render(<App router={router} sources={fakeSources({ store: () => store }).sources} connector={wallet.load} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Level 1, First stone$/ }, { timeout: 5000 }));
    // The intro first: what the level asks for, then Start.
    const intro = await screen.findByTestId("story-intro", {}, { timeout: 5000 });
    const level = TUTORIAL.levels[0]!;
    expect(intro).toHaveTextContent(level.intro);
    expect(intro).toHaveTextContent(String(level.target));
    expect(screen.queryByRole("region", { name: "Your tile" })).toBeNull();
    await userEvent.click(within(intro).getByRole("button", { name: /Start/ }));
    // The tip of level 1 names the hold on the check, which the bubble rings; Story has no Surrender.
    expect(screen.getByTestId("story-coach")).toHaveTextContent("hold the check");
    expect(screen.queryByRole("button", { name: /Surrender/ })).toBeNull();

    await playLine(level);
    const end = await screen.findByTestId("story-end", {}, { timeout: 5000 });
    expect(end).toHaveAttribute("data-stars", "3");
    expect(within(end).getByRole("img", { name: "3 of 3 stars" })).toBeInTheDocument();
    const saved = JSON.parse(store.getItem(STORY_KEY)!);
    expect(saved.levels["1-1"]).toMatchObject({ best: level.target, stars: 3, run: { campaignId: 1, levelIndex: 1 } });
    expect(saved.levels["1-1"].run.moves).toHaveLength(decodeLine(level.line).length);

    // The claim needs a signer: Connect first, then one `claim_tutorial`.
    await userEvent.click(within(end).getByRole("button", { name: "Connect" }));
    await userEvent.click(await within(end).findByRole("button", { name: "Claim First Stone" }));
    expect(await screen.findByText("Claimed: First Stone is yours.")).toBeInTheDocument();
    expect(wallet.calls.filter((c) => c === "claimTutorial")).toHaveLength(1);

    await userEvent.click(within(end).getByRole("button", { name: "Next level" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/story/1/2"));
    expect(await screen.findByTestId("story-intro")).toHaveTextContent(TUTORIAL.levels[1]!.title);
  });

  it("a discard-only run finishes with 1 star; Replay starts the level again", async () => {
    const store = memoryStore();
    render(<App router={createTestRouter("/story/1/1")} sources={fakeSources({ store: () => store }).sources} connector={fakeWallet().load} />);
    await userEvent.click(within(await screen.findByTestId("story-intro", {}, { timeout: 5000 })).getByRole("button", { name: /Start/ }));
    for (let i = 0; i < TUTORIAL.levels[0]!.deck.length; i++) await userEvent.click(within(hand()).getByRole("button", { name: /Discard/ }));
    const end = await screen.findByTestId("story-end");
    expect(end).toHaveAttribute("data-stars", "1");
    expect(JSON.parse(store.getItem(STORY_KEY)!).levels["1-1"]).toMatchObject({ best: 0, stars: 1 });
    await userEvent.click(within(end).getByRole("button", { name: "Replay" }));
    expect(screen.queryByTestId("story-end")).toBeNull();
    expect(within(hand()).getByRole("button", { name: /Discard/ })).toBeEnabled();
  });

  it("a locked level's address says so; the second campaign opens at 2 stars per Tutorial level", async () => {
    render(<App router={createTestRouter("/story/2/1")} sources={fakeSources({ store: () => memoryStore() }).sources} connector={fakeWallet().load} />);
    expect(await screen.findByText("This level is locked", {}, { timeout: 5000 })).toBeInTheDocument();

    let progress = EMPTY_PROGRESS;
    for (const level of TUTORIAL.levels) progress = recordRun(progress, level, { campaignId: 1, levelIndex: level.id, moves: [] }, Math.ceil(level.target * 0.7));
    const store = memoryStore({ [STORY_KEY]: JSON.stringify(progress) });
    render(<App router={createTestRouter("/story")} sources={fakeSources({ store: () => store }).sources} connector={fakeWallet().load} />);
    const second = await screen.findByRole("region", { name: CAMPAIGNS[1]!.name }, { timeout: 5000 });
    expect(within(second).queryByText("Locked")).toBeNull();
    expect(within(second).getByRole("button", { name: /^Level 1, / })).toBeEnabled();
    expect(within(second).getByRole("button", { name: /^Level 2, .*, locked$/ })).toBeDisabled();
  });

  it("the deck sheet of a level with tiles already placed counts them: nothing drawn reads as played (Tutorial 10)", async () => {
    let progress = EMPTY_PROGRESS;
    for (const level of TUTORIAL.levels.slice(0, 9)) progress = recordRun(progress, level, { campaignId: 1, levelIndex: level.id, moves: [] }, 0);
    const store = memoryStore({ [STORY_KEY]: JSON.stringify(progress) });
    render(<App router={createTestRouter("/story/1/10")} sources={fakeSources({ store: () => store }).sources} connector={fakeWallet().load} />);
    await userEvent.click(within(await screen.findByTestId("story-intro", {}, { timeout: 5000 })).getByRole("button", { name: /Start/ }));
    const level = TUTORIAL.levels[9]!;
    expect(screen.getByTestId("tiles-left")).toHaveTextContent(String(level.deck.length));
    await userEvent.click(screen.getByRole("button", { name: /^Tiles left/ }));
    // The starter and the 5 tiles placed at the start are played; the 3 of the deck are all still to come.
    // A fixed deck: every tile shown comes (not the Challenge's "some never come").
    expect(await screen.findByText(`This level deals all of these ${1 + level.placed!.length + level.deck.length} tiles, in a fixed order.`, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText(/some never come/)).toBeNull();
    expect(await screen.findByTestId("deck-summary", {}, { timeout: 5000 })).toHaveTextContent(`${1 + level.placed!.length} played, 0 discarded (dashed), ${level.deck.length} not yet.`);
    const road = screen.getByTestId("deck-plans").querySelector('[data-plan="RFRFFFFFR"]')!;
    // One RFRFFFFFR is on the board from the start, the other is the level's second draw: one crossed out, one not.
    expect(road.querySelectorAll('[data-out="true"]')).toHaveLength(1);
    expect(road.querySelectorAll('[data-out="false"]')).toHaveLength(1);
  });
});

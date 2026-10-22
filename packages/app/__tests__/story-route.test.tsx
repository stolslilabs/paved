import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAMPAIGNS, STORY_KEY, TUTORIAL, decodeLine, recordRun, EMPTY_PROGRESS, PlanType, type StoryLevel } from "@paved/game-core";
import { App } from "../src/App";
import { PRESENTED_KEY, UNLOCKS_KEY } from "../src/data/story";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { placeTile, preloadPages, discardTile } from "./route-helpers";

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
      await discardTile();
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

describe("/story (#546): campaigns, levels, stars and locks", { timeout: slow(30_000) }, () => {
  it("/tutorial leads to Story mode, where only the first level is open", async () => {
    const router = createTestRouter("/tutorial");
    render(<App router={router} sources={fakeSources({ store: () => memoryStore() }).sources} connector={fakeWallet().load} />);
    expect(await screen.findByRole("heading", { level: 2, name: "Tutorial" }, { timeout: slow(5000) })).toBeInTheDocument();
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
    const cards = await screen.findByRole("region", { name: "Campaigns" }, { timeout: slow(5000) });
    expect(within(cards).getByRole("button", { name: /^Open Country/ })).toHaveAttribute("data-status", "unlocking");
    expect(within(cards).getByRole("button", { name: /^Tutorial/ })).toHaveAttribute("data-status", "complete");
    await waitFor(() => expect(JSON.parse(store.getItem(UNLOCKS_KEY) ?? "[]")).toEqual([2]));
    first.unmount();
    queryClient.clear();

    render(<App router={createTestRouter("/story")} sources={fakeSources({ store: () => store }).sources} connector={fakeWallet().load} />);
    const again = await screen.findByRole("region", { name: "Campaigns" }, { timeout: slow(5000) });
    expect(within(again).getByRole("button", { name: /^Open Country/ })).toHaveAttribute("data-status", "open");
  });

  it("the campaign just opened is the one in view, over a campaign remembered in the address (#592)", async () => {
    let progress = EMPTY_PROGRESS;
    for (const level of TUTORIAL.levels) progress = recordRun(progress, level, { campaignId: 1, levelIndex: level.id, moves: [] }, level.target);
    const store = memoryStore({ [STORY_KEY]: JSON.stringify(progress) });
    const router = createTestRouter("/story?campaign=1");
    render(<App router={router} sources={fakeSources({ store: () => store }).sources} connector={fakeWallet().load} />);
    const cards = await screen.findByRole("region", { name: "Campaigns" }, { timeout: slow(5000) });
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
    await userEvent.click(await screen.findByRole("button", { name: /^Level 1, First stone$/ }, { timeout: slow(5000) }));
    // The deck's presentation first (#593): the title, the intro and the tiles it deals, never a star threshold; then Start.
    const intro = await screen.findByTestId("deck-presentation", {}, { timeout: slow(5000) });
    const level = TUTORIAL.levels[0]!;
    expect(intro).toHaveTextContent(level.intro);
    expect(intro).toHaveTextContent(`This level deals ${level.deck.length} tiles`);
    // Its two tiles in draw order, numbered (#613): the same plan twice, never grouped.
    expect(within(intro).getByTestId("presented-tiles").querySelectorAll("li")).toHaveLength(level.deck.length);
    expect(within(intro).getByLabelText("Tile 2")).toBeInTheDocument();
    expect(intro).not.toHaveTextContent(String(level.target));
    expect(intro).not.toHaveTextContent(String(Math.ceil(level.target * 0.7)));
    expect(screen.queryByRole("region", { name: "Your tile" })).toBeNull();
    await userEvent.click(within(intro).getByRole("button", { name: /Start/ }));
    expect(JSON.parse(store.getItem(PRESENTED_KEY)!)).toEqual(["1-1"]);
    // The tip of level 1 names the hold on the check, which the bubble rings; Story has no Surrender.
    expect(screen.getByTestId("story-coach")).toHaveTextContent("hold the check");
    expect(screen.queryByRole("button", { name: /Surrender/ })).toBeNull();

    await playLine(level);
    const end = await screen.findByTestId("story-end", {}, { timeout: slow(5000) });
    expect(end).toHaveAttribute("data-stars", "3");
    expect(within(end).getByRole("img", { name: "3 of 3 stars" })).toBeInTheDocument();
    // 3 stars: no next star to miss.
    expect(within(end).queryByTestId("to-next-star")).toBeNull();
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
    expect(await screen.findByTestId("deck-presentation")).toHaveTextContent(TUTORIAL.levels[1]!.title);
  });

  it("a discard-only run finishes with 1 star and the points short of the next; Replay goes straight to the board", async () => {
    const store = memoryStore();
    const level = TUTORIAL.levels[0]!;
    const first = render(<App router={createTestRouter("/story/1/1")} sources={fakeSources({ store: () => store }).sources} connector={fakeWallet().load} />);
    // A tap anywhere on the presentation starts the level.
    await userEvent.click(within(await screen.findByTestId("deck-presentation", {}, { timeout: slow(5000) })).getByText(level.intro));
    expect(screen.queryByTestId("deck-presentation")).toBeNull();
    for (let i = 0; i < level.deck.length; i++) await discardTile();
    const end = await screen.findByTestId("story-end");
    expect(end).toHaveAttribute("data-stars", "1");
    // A tap while the stars fill skips to the result: one row of stars, never two.
    await userEvent.click(within(end).getByRole("heading", { name: /complete$/ }));
    expect(within(screen.getByTestId("story-end")).getAllByTestId("star-fill")).toHaveLength(1);
    // The thresholds stay hidden: only what the next star was missing.
    expect(within(end).getByTestId("to-next-star")).toHaveTextContent(`${Math.ceil(level.target * 0.7)} points short of the next star.`);
    expect(end).not.toHaveTextContent(String(level.target));
    expect(JSON.parse(store.getItem(STORY_KEY)!).levels["1-1"]).toMatchObject({ best: 0, stars: 1 });
    await userEvent.click(within(end).getByRole("button", { name: "Replay" }));
    expect(screen.queryByTestId("story-end")).toBeNull();
    expect(screen.queryByTestId("deck-presentation")).toBeNull();
    expect(within(hand()).getByRole("button", { name: /^Hold to discard/ })).toBeEnabled();
    first.unmount();
    queryClient.clear();

    // Presented once on this device: the next visit opens on the board, and the deck sheet shows the presentation again.
    render(<App router={createTestRouter("/story/1/1")} sources={fakeSources({ store: () => store }).sources} connector={fakeWallet().load} />);
    expect(await within(await screen.findByRole("region", { name: "Your tile" }, { timeout: slow(5000) })).findByRole("button", { name: /^Hold to discard/ })).toBeEnabled();
    expect(screen.queryByTestId("deck-presentation")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /^Tiles left/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Present the level again" }, { timeout: slow(5000) }));
    const again = await screen.findByTestId("deck-presentation");
    await userEvent.click(within(again).getByRole("button", { name: /Start/ }));
    expect(screen.queryByTestId("deck-presentation")).toBeNull();
    expect(within(hand()).getByRole("button", { name: /^Hold to discard/ })).toBeEnabled();
  });

  it("a locked level's address says so; the second campaign opens at 2 stars per Tutorial level", async () => {
    render(<App router={createTestRouter("/story/2/1")} sources={fakeSources({ store: () => memoryStore() }).sources} connector={fakeWallet().load} />);
    expect(await screen.findByText("This level is locked", {}, { timeout: slow(5000) })).toBeInTheDocument();

    let progress = EMPTY_PROGRESS;
    for (const level of TUTORIAL.levels) progress = recordRun(progress, level, { campaignId: 1, levelIndex: level.id, moves: [] }, Math.ceil(level.target * 0.7));
    const store = memoryStore({ [STORY_KEY]: JSON.stringify(progress) });
    render(<App router={createTestRouter("/story")} sources={fakeSources({ store: () => store }).sources} connector={fakeWallet().load} />);
    const second = await screen.findByRole("region", { name: CAMPAIGNS[1]!.name }, { timeout: slow(5000) });
    expect(within(second).queryByText("Locked")).toBeNull();
    expect(within(second).getByRole("button", { name: /^Level 1, / })).toBeEnabled();
    expect(within(second).getByRole("button", { name: /^Level 2, .*, locked$/ })).toBeDisabled();
  });

  it("the deck sheet of a level shows its draw in order, the presentation's order; the tiles placed at the start are not in it (Tutorial 10, #613)", async () => {
    let progress = EMPTY_PROGRESS;
    for (const level of TUTORIAL.levels.slice(0, 9)) progress = recordRun(progress, level, { campaignId: 1, levelIndex: level.id, moves: [] }, 0);
    const store = memoryStore({ [STORY_KEY]: JSON.stringify(progress) });
    render(<App router={createTestRouter("/story/1/10")} sources={fakeSources({ store: () => store }).sources} connector={fakeWallet().load} />);
    const intro = await screen.findByTestId("deck-presentation", {}, { timeout: slow(5000) });
    const level = TUTORIAL.levels[9]!;
    const ids = level.deck.map((plan) => String(Object.values(PlanType).indexOf(plan)));
    const presented = [...within(intro).getByTestId("presented-tiles").querySelectorAll("li")].map((li) => li.getAttribute("data-plan"));
    expect(presented).toEqual(ids);
    await userEvent.click(within(intro).getByRole("button", { name: /Start/ }));
    expect(screen.getByTestId("tiles-left")).toHaveTextContent(String(level.deck.length));
    await userEvent.click(screen.getByRole("button", { name: /^Tiles left/ }));
    expect(await screen.findByText(`This level deals these ${level.deck.length} tiles in this order, the next one first.`, {}, { timeout: slow(5000) })).toBeInTheDocument();
    expect(screen.queryByText(/some never come/)).toBeNull();
    expect(screen.queryByTestId("deck-plans")).toBeNull();
    const order = screen.getByTestId("deck-order");
    const slots = [...order.querySelectorAll("li")];
    // The sheet's order is the presentation's; the first tile is in hand, none is out yet.
    expect(slots.map((li) => li.getAttribute("data-plan"))).toEqual(level.deck);
    expect(slots.map((li) => li.getAttribute("data-slot-state"))).toEqual(["hand", ...level.deck.slice(1).map(() => "next")]);
    expect(screen.getByTestId("deck-summary")).toHaveTextContent(`0 played, 0 discarded (dashed), ${level.deck.length} not yet.`);
  });
});

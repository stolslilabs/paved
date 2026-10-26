import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORY_KEY, TUTORIAL, recordRun, EMPTY_PROGRESS } from "@paved/game-core";
import { App } from "../src/App";
import { PRESENTED_KEY } from "../src/data/story";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { discardTile, preloadPages } from "./route-helpers";

preloadPages("home", "play", "story", "story-board", "quests", "vault", "settings", "credits", "referral", "theme", "welcome");

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

function open(path: string, store = memoryStore()) {
  const router = createTestRouter(path);
  render(<App router={router} sources={fakeSources({ store: () => store }).sources} connector={fakeWallet().load} />);
  return router;
}

const at = (router: ReturnType<typeof createTestRouter>) => `${router.state.location.pathname}${router.state.location.search}`;
const back = () => userEvent.click(screen.getByRole("button", { name: "Back" }));

/** Discards every tile of Tutorial level 1 (its deck presented already): the level's end. */
async function finishLevelOne() {
  await screen.findByRole("region", { name: "Your tile" }, { timeout: slow(5000) });
  // The stack's Discard is held since #606: `discardTile` activates it as a screen reader does.
  for (let i = 0; i < TUTORIAL.levels[0]!.deck.length; i++) await discardTile();
  return screen.findByTestId("story-end");
}

describe("back targets (#614): a back button never lands in a game", { timeout: slow(30_000) }, () => {
  it("Levels after a level, then Back: the Play page, never a new game; Play's Back is Home", async () => {
    const router = open("/play", memoryStore({ [PRESENTED_KEY]: JSON.stringify(["1-1"]) }));
    await userEvent.click(await screen.findByText("Learn the rules level by level, then earn three stars on fixed decks.", {}, { timeout: slow(5000) }));
    await waitFor(() => expect(at(router)).toBe("/story"));
    await userEvent.click(await screen.findByRole("button", { name: /^Level 1, First stone$/ }, { timeout: slow(5000) }));
    await waitFor(() => expect(at(router)).toBe("/story/1/1"));

    const end = await finishLevelOne();
    await userEvent.click(within(end).getByRole("button", { name: "Levels" }));
    // The campaign's list, in place of the finished level's entry.
    await waitFor(() => expect(at(router)).toBe("/story?campaign=1"));
    await back();
    await waitFor(() => expect(at(router)).toBe("/play"));
    expect(await screen.findByRole("heading", { level: 1, name: "Choose a mode" })).toBeInTheDocument();

    // Back went back through the history to Play's own entry (BACK-RULE #783): the level and the lists after it are skipped,
    // never shown, and nothing before Play is the village, so its Back goes up in place.
    expect(router.state.historyAction).toBe("POP");
    // The page may still swap its Back for a new node right after the pop: a click on the old one reaches no handler (seen
    // about one run in two on a loaded machine), so the press is tried again until the page goes Home.
    await waitFor(async () => {
      if (at(router) === "/play") await back();
      expect(at(router)).toBe("/");
    });
  });

  it("the level list's Back is the Play page whatever route opened it", async () => {
    const router = open("/story?campaign=1");
    await screen.findByRole("region", { name: "Campaigns" }, { timeout: slow(5000) });
    await back();
    await waitFor(() => expect(at(router)).toBe("/play"));
  });

  it("a level's Back, on its intro and after Next, is its campaign's list, not the level before", async () => {
    const progress = recordRun(EMPTY_PROGRESS, TUTORIAL.levels[0]!, { campaignId: 1, levelIndex: 1, moves: [] }, TUTORIAL.levels[0]!.target);
    const router = open("/story/1/1", memoryStore({ [STORY_KEY]: JSON.stringify(progress), [PRESENTED_KEY]: JSON.stringify(["1-1"]) }));
    const end = await finishLevelOne();
    await userEvent.click(within(end).getByRole("button", { name: "Next level" }));
    await waitFor(() => expect(at(router)).toBe("/story/1/2"));
    // Level 2's deck presentation (the Story intro): its Back goes up.
    await screen.findByTestId("deck-presentation", {}, { timeout: slow(5000) });
    await back();
    await waitFor(() => expect(at(router)).toBe("/story?campaign=1"));
  });

  it("a locked level's Back is the level list", async () => {
    const router = open("/story/2/1");
    await screen.findByText("This level is locked", {}, { timeout: slow(5000) });
    await back();
    await waitFor(() => expect(at(router)).toBe("/story"));
  });
});

describe("Back to the village (#760): every page's top left", { timeout: slow(30_000) }, () => {
  // Opened directly (a link, a reload): no earlier in-app entry, so Back is the page's parent in the route map.
  it.each([
    ["/missions", "Missions", "/"],
    ["/missions/lifetime", "Missions", "/"],
    ["/vault", "Vault", "/"],
    ["/settings", "Settings", "/"],
  ])("%s opened directly: Back lands on %s's parent", async (path, title, parent) => {
    const router = open(path);
    const heading = await screen.findByRole("heading", { level: 1, name: title }, { timeout: slow(5000) });
    // Back is the header's first control, before the title.
    expect(heading.closest("header")!.querySelector("button")).toHaveAccessibleName("Back");
    await back();
    await waitFor(() => expect(at(router)).toBe(parent));
  });

  it("the welcome, a first visit: Back opens the village as a guest, and the welcome does not come back", async () => {
    localStorage.clear();
    resetWelcomedForTests();
    const router = open("/welcome");
    await screen.findByRole("heading", { level: 2, name: "Welcome to Paved" }, { timeout: slow(5000) });
    expect(screen.getByRole("banner").querySelector("button")).toHaveAccessibleName("Back");
    await back();
    await waitFor(() => expect(at(router)).toBe("/"));
  });

  it("from Settings reached through Vault, Back is the village, not Vault", async () => {
    const router = open("/vault");
    await screen.findByRole("heading", { level: 1, name: "Vault" }, { timeout: slow(5000) });
    await userEvent.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: "Settings" }));
    await screen.findByRole("heading", { level: 1, name: "Settings" }, { timeout: slow(5000) });
    await back();
    await waitFor(() => expect(at(router)).toBe("/"));
  });
});

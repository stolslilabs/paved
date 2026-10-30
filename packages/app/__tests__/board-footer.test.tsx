import { slow } from "../test-slow";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import { queryClient } from "../src/lib/query-client";
import { GAME_PLAYING } from "../src/mocks/games";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages } from "./route-helpers";

function open(path: string) {
  render(<App router={createTestRouter(path)} sources={fakeSources({ store: () => memoryStore() }).sources} connector={fakeWallet().load} />);
}

preloadPages("board", "play", "credits");

beforeEach(() => {
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

// jsdom has no layout: what keeps a page inside the viewport is its structure. The board's root is the viewport's height
// (`h-dvh`, overflow hidden) and the only element of the page in the flow; no page has a footer, and none mentions Cartridge
// (the notice is on the Credits page, #536). The PR's captures measure it in a browser at 375 and 1440 px.
describe("no footer, no Cartridge notice outside the Credits page (#536)", () => {
  // The Challenge board's own case is in `challenge-route.test.tsx`, on a game the fakes can replay.
  it.each(["/training", "/story/1/1"])("%s: nothing after the board, no notice", async (path) => {
    open(path);
    const board = (await screen.findByLabelText(/^Board of \d+ tiles$/, {}, { timeout: slow(5000) })).closest(".h-dvh");
    expect(screen.queryByRole("contentinfo")).toBeNull();
    expect(screen.queryByText(/Cartridge/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Third-party notices" })).toBeNull();
    expect(board).not.toBeNull();
    expect(board).toHaveClass("overflow-hidden");
    // After it, only the toaster's region, which is fixed and takes no room in the flow.
    const after: Element[] = [];
    for (let e = board!.nextElementSibling; e; e = e.nextElementSibling) after.push(e);
    expect(after.map((e) => e.getAttribute("aria-label") ?? e.tagName)).toEqual(after.length ? [expect.stringMatching(/^Notifications/)] : []);
  });

  it("/game/:id: no footer, no notice", async () => {
    open(`/game/${GAME_PLAYING.id}`);
    await waitFor(() => expect(screen.queryByText("Reading the game…")).toBeNull(), { timeout: slow(5000) });
    expect(screen.queryByRole("link", { name: "Third-party notices" })).toBeNull();
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });

  it("/play: no footer after the page", async () => {
    open("/play");
    await screen.findByRole("heading", { level: 1 }, { timeout: slow(5000) });
    expect(screen.queryByRole("contentinfo")).toBeNull();
    expect(screen.queryByText(/Cartridge/)).toBeNull();
  });

  it("/settings/credits: the notices link, and no Cartridge Controller notice since it left the client (#918)", async () => {
    open("/settings/credits");
    expect(await screen.findByRole("heading", { level: 1, name: "Credits" }, { timeout: slow(5000) })).toBeInTheDocument();
    expect(screen.queryByText(/Cartridge Controller/)).toBeNull();
    expect(screen.getByRole("link", { name: "Third-party notices" })).toHaveAttribute("href", "/THIRD_PARTY_NOTICES.txt");
  });
});

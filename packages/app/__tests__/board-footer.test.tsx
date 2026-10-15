import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import { queryClient } from "../src/lib/query-client";
import { GAME_PLAYING } from "../src/mocks/games";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";

function open(path: string) {
  render(<App router={createTestRouter(path)} sources={fakeSources({ store: () => memoryStore() }).sources} connector={fakeWallet().load} />);
}

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

// jsdom has no layout: what keeps a board page inside the viewport is its structure. The board's root is the viewport's
// height (`h-dvh`, overflow hidden) and the only element of the page in the flow, so nothing follows it to scroll to; the D-15
// notice is inside it. The PR's captures measure it in a browser at 360 and 1280 px.
describe("the board pages do not overflow the viewport (P6 review)", { timeout: 15_000 }, () => {
  // The Challenge board's own case is in `challenge-route.test.tsx`, on a game the fakes can replay.
  it.each(["/training", "/tutorial"])("%s: no footer after the board, the D-15 notice inside it", async (path) => {
    open(path);
    // The board itself, not the Challenge's "Reading the game" screen before it.
    await screen.findByLabelText(/^Board of \d+ tiles$/, {}, { timeout: 5000 });
    const link = screen.getByRole("link", { name: "Third-party notices" });
    expect(screen.queryByRole("contentinfo")).toBeNull();
    const board = link.closest(".h-dvh");
    expect(board).not.toBeNull();
    expect(board).toHaveClass("overflow-hidden");
    // After it, only the toaster's region, which is fixed and takes no room in the flow.
    const after: Element[] = [];
    for (let e = board!.nextElementSibling; e; e = e.nextElementSibling) after.push(e);
    expect(after.map((e) => e.getAttribute("aria-label") ?? e.tagName)).toEqual(after.length ? [expect.stringMatching(/^Notifications/)] : []);
  });

  it("/game/:id, once its game is read (or cannot be): no footer, the D-15 notice on the screen", async () => {
    open(`/game/${GAME_PLAYING.id}`);
    await waitFor(() => expect(screen.queryByText("Reading the game…")).toBeNull(), { timeout: 5000 });
    expect(await screen.findByRole("link", { name: "Third-party notices" })).toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });

  it("a page that scrolls keeps the footer after it", async () => {
    open("/play");
    const link = await screen.findByRole("link", { name: "Third-party notices" }, { timeout: 5000 });
    expect(link.closest("footer")).not.toBeNull();
  });
});

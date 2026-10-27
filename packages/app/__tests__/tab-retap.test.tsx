import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { queryClient } from "../src/lib/query-client";
import { useTabNavigate } from "../src/routes/ref";
import { createTestRouter } from "../src/routes/router";
import { TAB_SWIPE_MARK } from "../src/routes/tab-swipe";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages } from "./route-helpers";

// TAB-RETAP (#800, the owner's decision of 2026-10-26): a second tap on the bar's current item closes its page and returns to
// the village, up by the Back rule (#783), so a Back afterwards does not reopen the page; no swipe on the way.

preloadPages("home", "settings", "village-shop", "village-chests", "pvp-league");

const WAIT = { timeout: slow(5000) };
const html = document.documentElement;
const realMatchMedia = window.matchMedia;

/** Below `desktop`, motion allowed (or reduced): the widths where the bar shows and a pick may swipe. */
function phone({ reduced = false } = {}) {
  window.matchMedia = ((query: string) =>
    ({
      matches: query === "(width < 64rem)" || (reduced && query === "(prefers-reduced-motion: reduce)"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

/** `document.startViewTransition` (jsdom has none): runs the update at once. */
function viewTransitions() {
  const start = vi.fn((update: () => unknown) => {
    const done = Promise.resolve().then(update).then(() => undefined);
    return { finished: done, ready: done, updateCallbackDone: done, skipTransition() {}, types: new Set() };
  });
  Object.assign(document, { startViewTransition: start });
  return start;
}

beforeEach(() => {
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
  delete (document as { startViewTransition?: unknown }).startViewTransition;
  html.removeAttribute(TAB_SWIPE_MARK);
  vi.restoreAllMocks();
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

function open(path: string) {
  const router = createTestRouter(path);
  render(<App router={router} sources={fakeSources().sources} connector={fakeWallet().load} />);
  return router;
}

const bar = () => screen.getByRole("navigation", { name: "Main" });
/** The bar's current item, once its page is drawn (the League's, without a wallet, is its "connect" notice: no heading). */
const currentItem = async (name: string) => within(await screen.findByRole("navigation", { name: "Main" }, WAIT)).findByRole("button", { name, current: "page" }, WAIT);

/** The village: the home's bar, no item current. */
async function atVillage(router: ReturnType<typeof open>) {
  await waitFor(() => expect(router.state.location.pathname).toBe("/"), WAIT);
  await waitFor(() => expect(within(bar()).queryByRole("button", { current: "page" })).toBeNull(), WAIT);
}

describe("a second tap on the bar's current item", { timeout: slow(30_000) }, () => {
  it.each([
    ["Shop", "/village/shop"],
    ["Chests", "/village/chests"],
    ["League", "/pvp/league"],
    ["Settings", "/settings"],
  ])("on %s, opened by a link, returns to the village in place of its entry, with no swipe", async (item, path) => {
    phone();
    const start = viewTransitions();
    const router = open(path);
    const current = await currentItem(item);
    expect(current).toHaveAccessibleDescription("Tap again to return to the village");
    await userEvent.click(current);
    await atVillage(router);
    expect(router.state.historyAction).toBe("REPLACE");
    expect(start).not.toHaveBeenCalled();
    // Back afterwards: the page's entry is gone, so it does not reopen.
    await router.navigate(-1);
    expect(router.state.location.pathname).toBe("/");
  });

  it("on a page opened from the village, goes back to the village's entry: Back afterwards does not reopen it", async () => {
    phone({ reduced: true });
    const start = viewTransitions();
    const router = open("/");
    await atVillage(router);
    await userEvent.click(within(bar()).getByRole("button", { name: "League" }));
    await userEvent.click(await currentItem("League"));
    await atVillage(router);
    // Back through the history to the village's own entry, never a push of it (#783).
    expect(router.state.historyAction).toBe("POP");
    await router.navigate(-1);
    expect(router.state.location.pathname).toBe("/");
    expect(start).not.toHaveBeenCalled();
  });

  it("a tap on another item still swipes to its page", async () => {
    phone();
    const start = viewTransitions();
    const router = open("/pvp/league");
    await currentItem("League");
    const shop = within(bar()).getByRole("button", { name: "Shop" });
    expect(shop).not.toHaveAccessibleDescription();
    await userEvent.click(shop);
    await screen.findByRole("heading", { level: 1, name: "Tile shop" }, WAIT);
    expect(router.state.location.pathname).toBe("/village/shop");
    expect(router.state.historyAction).toBe("PUSH");
    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe("useTabNavigate on a page under the tab (open point 1 of #800)", () => {
  /** The page's path, and a pick of `tab` in its bar. */
  function Probe() {
    const onNavigate = useTabNavigate();
    return (
      <>
        <output>{useLocation().pathname}</output>
        <button type="button" onClick={() => onNavigate("settings")}>
          Settings
        </button>
      </>
    );
  }

  it("goes up to the tab's page first, then to the village, each in place of the entry", async () => {
    const router = createMemoryRouter([{ path: "*", element: <Probe /> }], { initialEntries: ["/settings/theme/medieval"] });
    render(<RouterProvider router={router} />);
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("status")).toHaveTextContent(/^\/settings$/);
    expect(router.state.historyAction).toBe("REPLACE");
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(router.state.location.pathname).toBe("/");
    expect(router.state.historyAction).toBe("REPLACE");
  });
});

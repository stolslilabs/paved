import { slow } from "../test-slow";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { createBrowserRouter, createMemoryRouter } from "react-router";
import { App } from "../src/App";
import { earlierEntryExists } from "../src/routes/history";
import { routes } from "../src/routes/router";
import { BAR_TABS, PAGES } from "../src/routes/pages";
import { withRef } from "../src/routes/ref";
import { createTestRouter } from "../src/routes/router";
import { hasWelcomed, markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages, routeOf } from "./route-helpers";

// A player id is an address (P8): the page of anything else is not found.
const concrete = (path: string) => "/" + path.replace(/\/?:\w+\?/, "").replace(/:id/g, "0x1").replace(/:theme/g, "forest").replace(/:(\w+)/g, "1");
/** A page whose heading is not its route's title: a theme's shop is titled with the theme's name. */
const HEADING: Record<string, string> = { "settings/theme/:theme": "Forest" };

/** The app on the chain's and indexer's fakes, with a wallet in memory that connects (P6). */
function open(path: string, wallet = fakeWallet()) {
  const router = createTestRouter(path);
  render(<App router={router} sources={fakeSources().sources} connector={wallet.load} />);
  return router;
}

// The Back button is the board's own: the real board is kept, loaded once before the first test.
preloadPages("board", "home", "quests", "play", "welcome");

beforeEach(() => {
  // Importing the router module creates the app's browser router, which writes `idx` into jsdom's history state: a memory
  // router (these tests) has none, so the state is cleared to let the tracked entries decide.
  window.history.replaceState(null, "", "/");
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetWelcomedForTests();
});

describe("the active tab comes from the route's own entry", () => {
  const TAB_LABEL = { home: "Home", quests: "Missions", vault: "Vault", shop: "Shop", chests: "Chests", play: "Play", league: "League", settings: "Settings" } as const;

  // The home has no tab bar (#753): its overlays replace it; the other tab pages keep theirs.
  it.each(PAGES.filter((p) => p.nav && p.path !== "").map((p) => [p.path, p] as const))("%s", async (_path, page) => {
    open(concrete(page.path));
    // The first page module of the file is imported cold: Home's now brings its data hooks (P6).
    // A guest's league is its connect prompt, under the bar (#763).
    if (page.path === "pvp/league") await screen.findByText("Connect to see your league.", undefined, { timeout: slow(5000) });
    else await screen.findByRole("heading", { level: 1, name: HEADING[page.path] ?? page.title }, { timeout: slow(5000) });
    // The bar's own tabs are current on their pages; Missions and the Vault are the home's overlay's, no item current (#763).
    const active = screen.queryAllByRole("button", { current: "page" });
    expect(active.map((b) => b.getAttribute("aria-label"))).toEqual(BAR_TABS.includes(page.nav!) ? [TAB_LABEL[page.nav!]] : []);
  });

  it("holds for the nested routes: /settings/theme and /referral are Settings, /pvp/defence is League", async () => {
    for (const [path, tab] of [
      ["/settings/theme", "Settings"],
      ["/referral", "Settings"],
      ["/pvp/defence", "League"],
    ] as const) {
      const { unmount } = render(<App router={createTestRouter(path)} />);
      await screen.findByRole("navigation", { name: "Main" }, { timeout: slow(5000) });
      expect(await screen.findByRole("button", { current: "page" })).toHaveAccessibleName(tab);
      unmount();
    }
  });

  it("is read from the handle, not the path: a route whose path says otherwise follows its entry", async () => {
    const router = createTestRouter("/settings", (rs) => {
      routeOf(rs, "settings").path = "shop-looking-path";
      return rs;
    });
    router.navigate("/shop-looking-path");
    render(<App router={router} />);
    await screen.findByRole("heading", { level: 1, name: "Settings" }, { timeout: slow(5000) });
    expect(screen.getByRole("button", { current: "page" })).toHaveAccessibleName("Settings");
  });

  it("is on the home with no item current (#763), beside the village's overlays", async () => {
    open("/");
    await screen.findByRole("heading", { level: 1, name: "Home" }, { timeout: slow(5000) });
    expect(await screen.findByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { current: "page" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "Village" })).toBeInTheDocument();
  });

  it("each item of the home's bar reaches its page and is current there (#763)", async () => {
    for (const [name, path, current] of [
      ["Shop", "/village/shop", "Shop"],
      ["Chests", "/village/chests", "Chests"],
      ["League", "/pvp/league", "League"],
      ["Settings", "/settings", "Settings"],
    ] as const) {
      const router = open("/");
      await screen.findByRole("heading", { level: 1, name: "Home" }, { timeout: slow(5000) });
      await userEvent.click(within(await screen.findByRole("navigation", { name: "Main" })).getByRole("button", { name: new RegExp(`^${name}`) }));
      await waitFor(() => expect(router.state.location.pathname).toBe(path), { timeout: slow(5000) });
      expect(await screen.findByRole("button", { current: "page" }, { timeout: slow(5000) })).toHaveAccessibleName(current);
      cleanup();
    }
    const router = open("/");
    await screen.findByRole("heading", { level: 1, name: "Home" }, { timeout: slow(5000) });
    await userEvent.click(within(await screen.findByRole("navigation", { name: "Main" })).getByRole("button", { name: "Play" }));
    await screen.findByRole("heading", { level: 1, name: "Choose a mode" }, { timeout: slow(5000) });
    expect(router.state.location.pathname).toBe("/play");
  });

  it("changes with a tab press and moves the page; Back lands on the village", async () => {
    const router = open("/settings");
    await screen.findByRole("heading", { level: 1, name: "Settings" }, { timeout: slow(5000) });
    await userEvent.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: "Shop" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/village/shop"), { timeout: slow(5000) });
    expect(await screen.findByRole("button", { current: "page" }, { timeout: slow(5000) })).toHaveAccessibleName("Shop");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    expect(router.state.location.pathname).toBe("/");
  });

  it("opens Choose a mode from the nav's Play, the centre item (#623)", async () => {
    const router = open("/vault");
    await screen.findByRole("heading", { level: 1, name: "Vault" });
    await userEvent.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: "Play" }));
    await screen.findByRole("heading", { level: 1, name: "Choose a mode" });
    expect(router.state.location.pathname).toBe("/play");
  });

  it("has no tab on a full-screen flow", async () => {
    open("/play");
    await screen.findByRole("heading", { level: 1, name: "Choose a mode" });
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });
});

describe("redirects of the old links", () => {
  it.each([
    ["/game?mode=challenge&id=7", "/game/7"],
    ["/game?mode=training", "/training"],
    ["/economy", "/vault"],
    // The ranks left the UI (#623): their links land Home.
    ["/leaderboard", "/"],
    ["/leaderboard/20300", "/"],
    ["/player/0x1", "/"],
  ])("%s goes to %s", async (from, to) => {
    const router = open(from);
    await waitFor(() => expect(router.state.location.pathname).toBe(to));
    expect(router.state.location.search).toBe("");
  });

  it("sends an unreadable /game link Home", async () => {
    const router = open("/game?mode=challenge&id=abc");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("keeps ?ref= across a redirect", async () => {
    for (const [from, to] of [
      ["/game?mode=challenge&id=7&ref=0xabc", "/game/7"],
      ["/game?mode=training&ref=0xabc", "/training"],
      ["/economy?ref=0xabc", "/vault"],
      ["/leaderboard/20300?ref=0xabc", "/"],
    ] as const) {
      const router = createTestRouter(from);
      const { unmount } = render(<App router={router} />);
      await waitFor(() => expect(router.state.location.pathname).toBe(to));
      expect(router.state.location.search).toBe("?ref=0xabc");
      unmount();
    }
  });

  it("shows 'not found' for an unknown path, with a way home", async () => {
    const router = open("/nowhere/at/all");
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back home" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
});

describe("?ref= survives", () => {
  it("withRef appends, joins and does not duplicate", () => {
    expect(withRef("/vault", "?ref=0xabc")).toBe("/vault?ref=0xabc");
    expect(withRef("/leaderboard?x=1", "?ref=0xabc")).toBe("/leaderboard?x=1&ref=0xabc");
    expect(withRef("/vault#top", "?ref=a b")).toBe("/vault?ref=a%20b#top");
    expect(withRef("/vault?ref=0xdef", "?ref=0xabc")).toBe("/vault?ref=0xdef");
    expect(withRef("/vault", "?other=1")).toBe("/vault");
    expect(withRef("/vault", "")).toBe("/vault");
  });

  it("is kept by the tab bar and by the error page's way home", async () => {
    const router = open("/?ref=0xabc");
    await screen.findByRole("heading", { name: "Home" });
    await userEvent.click(within(await screen.findByRole("navigation", { name: "Village" })).getByRole("button", { name: "Vault" }));
    await screen.findByRole("heading", { level: 1, name: "Vault" }, { timeout: slow(5000) });
    expect(router.state.location.search).toBe("?ref=0xabc");
    await userEvent.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: "Shop" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/village/shop"), { timeout: slow(5000) });
    expect(router.state.location.search).toBe("?ref=0xabc");
  });

  it("is kept from the first visit's redirect to the welcome, and by Training", async () => {
    localStorage.clear();
    resetWelcomedForTests();
    const router = open("/?ref=0xabc");
    await screen.findByRole("heading", { name: "Welcome to Paved" });
    expect(router.state.location.pathname).toBe("/welcome");
    expect(router.state.location.search).toBe("?ref=0xabc");
    await userEvent.click(screen.getByRole("button", { name: /Play Training/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/training"));
    expect(router.state.location.search).toBe("?ref=0xabc");
  });
});

describe("a page that throws", () => {
  it("shows the route's error boundary with a way home, the other routes unharmed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Boom(): never {
      throw new Error("the page blew up");
    }
    const router = createTestRouter("/vault", (rs) => {
      routeOf(rs, "vault").element = <Boom />;
      return rs;
    });
    render(<App router={router} />);
    expect(await screen.findByText("This page could not be shown")).toBeInTheDocument();
    expect(screen.getByText("the page blew up")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back home" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
  });
});

/** The welcome card's Connect: the header's balances (#781) carry a guest's Connect too, the home's. */
const welcomeConnect = () => within(screen.getByRole("heading", { name: "Welcome to Paved" }).closest<HTMLElement>('[data-slot="card"]')!).getByRole("button", { name: /Connect/ });

describe("the welcome", () => {
  beforeEach(() => {
    localStorage.clear();
    resetWelcomedForTests();
  });

  it("shows on the first visit to Home, and Connect connects, marks the visit and goes Home", async () => {
    const router = open("/");
    await screen.findByRole("heading", { name: "Welcome to Paved" });
    expect(router.state.location.pathname).toBe("/welcome");
    await userEvent.click(welcomeConnect());
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(localStorage.getItem("welcomed")).toBe("1");
    expect(router.state.location.pathname).toBe("/");
  });

  // The header's balances (#781) carry a guest's Connect: on the welcome it is the card's, so it completes the visit too.
  it.each([
    ["the pill", 0],
    ["the rail", 1],
  ])("the header's Connect (%s) connects, marks the visit and goes Home", async (_, i) => {
    const router = open("/");
    const heading = await screen.findByRole("heading", { level: 1, name: "Welcome" });
    const header = heading.closest<HTMLElement>('[data-slot="page-header"]')!;
    const buttons = await within(header).findAllByRole("button", { name: /Connect/ }, { timeout: slow(5000) });
    expect(buttons).toHaveLength(2);
    await userEvent.click(buttons[i]!);
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(localStorage.getItem("welcomed")).toBe("1");
    expect(router.state.location.pathname).toBe("/");
  });

  it("a refused connect stays on the welcome with its reason, the visit not marked", async () => {
    const router = open("/", fakeWallet({ refuse: "closed by the player" }));
    await screen.findByRole("heading", { name: "Welcome to Paved" });
    await userEvent.click(welcomeConnect());
    expect(await screen.findByText(/closed by the player/, { selector: "[data-slot=card] *" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/welcome");
    expect(hasWelcomed()).toBe(false);
  });

  it("shows once: a returning visitor skips it, on Home and on /welcome", async () => {
    markWelcomed();
    const first = open("/");
    await screen.findByRole("heading", { name: "Home" });
    expect(first.state.location.pathname).toBe("/");
    const second = createTestRouter("/welcome");
    render(<App router={second} />);
    await waitFor(() => expect(second.state.location.pathname).toBe("/"));
  });

  it("'Skip to Training' goes to /training and marks the visit", async () => {
    const router = open("/welcome");
    await userEvent.click(await screen.findByRole("button", { name: /Play Training/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/training"));
    expect(hasWelcomed()).toBe(true);
  });

  it("with storage off it shows and nothing breaks: a connect still goes Home, which does not loop back", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(hasWelcomed()).toBe(false);
    const router = open("/");
    await screen.findByRole("heading", { name: "Welcome to Paved" });
    await userEvent.click(welcomeConnect());
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });
});

describe("the toaster", () => {
  it("is mounted once above the pages: a toast shows on a tab page and on a full-screen flow", async () => {
    open("/");
    await screen.findByRole("heading", { name: "Home" });
    expect(document.querySelectorAll("[data-sonner-toaster]").length).toBeLessThanOrEqual(1);
    act(() => void toast("Mission completed: Daily Run"));
    expect(await screen.findByText("Mission completed: Daily Run")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-sonner-toaster]")).toHaveLength(1);
  });
});

describe("Back", () => {
  it("from an old link opened directly lands Home, not back in the redirect", async () => {
    const router = open("/game?mode=challenge&id=7");
    await waitFor(() => expect(router.state.location.pathname).toBe("/game/7"));
    await userEvent.click(await screen.findByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
  });

  it("from /welcome through 'Play Training' (a replace) lands Home", async () => {
    resetWelcomedForTests();
    localStorage.clear();
    const router = open("/welcome");
    await userEvent.click(await screen.findByRole("button", { name: /Play Training/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/training"));
    await userEvent.click(await screen.findByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
  });

  it("goes to the previous in-app entry when there is one", async () => {
    const router = open("/vault");
    await screen.findByRole("heading", { level: 1, name: "Vault" });
    await act(() => router.navigate("/game/7"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/game/7"));
    await userEvent.click(await screen.findByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/vault"));
  });
});

describe("?ref= on the error and not-found pages", () => {
  it("is kept by the error page's way home", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Boom(): never {
      throw new Error("boom");
    }
    const router = createTestRouter("/vault?ref=0xabc", (rs) => {
      routeOf(rs, "vault").element = <Boom />;
      return rs;
    });
    render(<App router={router} />);
    await userEvent.click(await screen.findByRole("button", { name: "Back home" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.location.search).toBe("?ref=0xabc");
  });

  it("is kept by the not-found page's way home", async () => {
    const router = open("/nowhere?ref=0xabc");
    await userEvent.click(await screen.findByRole("button", { name: "Back home" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.location.search).toBe("?ref=0xabc");
  });
});

describe("Back after a reload (the browser history's index)", () => {
  it("decides from idx when there is one, from the tracked entries otherwise", () => {
    expect(earlierEntryExists(0, ["a", "b"])).toBe(false);
    expect(earlierEntryExists(1, ["a"])).toBe(true);
    expect(earlierEntryExists(undefined, ["a"])).toBe(false);
    expect(earlierEntryExists(undefined, ["a", "b"])).toBe(true);
    expect(earlierEntryExists(null, ["a", "b"])).toBe(true);
  });

  it("a page opened by a reload at idx > 0 goes back in the history, not Home", async () => {
    window.history.replaceState({ usr: null, key: "k1", idx: 1 }, "", "/play/challenge");
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    const router = createBrowserRouter(routes);
    render(<App router={router} />);
    await userEvent.click(await screen.findByRole("button", { name: "Back" }));
    expect(go).toHaveBeenCalledWith(-1);
    router.dispose();
  });

  it("a page opened at idx 0 goes Home", async () => {
    window.history.replaceState({ usr: null, key: "k0", idx: 0 }, "", "/play/challenge");
    const router = createBrowserRouter(routes);
    render(<App router={router} />);
    await userEvent.click(await screen.findByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    router.dispose();
  });

  it("a pop to an entry the tracker never saw does not give it a predecessor", async () => {
    // The tracker sees only /play/challenge (index 1); /play is before it, as after a reload.
    const router = createMemoryRouter(routes, { initialEntries: ["/play", "/play/challenge"], initialIndex: 1 });
    render(<App router={router} />);
    await screen.findByRole("button", { name: "Back" });
    await act(() => router.navigate(-1));
    await waitFor(() => expect(router.state.location.pathname).toBe("/play"));
    await screen.findByRole("heading", { level: 1, name: "Choose a mode" });
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    router.dispose();
  });
});

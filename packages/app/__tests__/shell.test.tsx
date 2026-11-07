import { slow } from "../test-slow";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { createBrowserRouter, createMemoryRouter } from "react-router";
import { App } from "../src/App";
import { nextHistory, stepsBackTo } from "../src/routes/history";
import { routes } from "../src/routes/router";
import { PAGES } from "../src/routes/pages";
import { withRef } from "../src/routes/ref";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages, routeOf } from "./route-helpers";

// A player id is an address (P8): the page of anything else is not found.
const concrete = (path: string) => "/" + path.replace(/\/?:\w+\?/, "").replace(/:id/g, "0x1").replace(/:theme/g, "forest").replace(/:(\w+)/g, "1");
/** A page whose heading is not its route's title (none since a theme's shop became the Shop's, SHOP-PAGE). */
const HEADING: Record<string, string> = {};

/** The app on the chain's and indexer's fakes, with a wallet in memory that connects (P6). */
function open(path: string, wallet = fakeWallet()) {
  const router = createTestRouter(path);
  render(<App router={router} sources={fakeSources().sources} connector={wallet.load} />);
  return router;
}

// The Back button is the board's own: the real board is kept, loaded once before the first test.
preloadPages("board", "home", "missions", "play", "vault", "referral");

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

describe("the dock (#763; DOCK-UNDER-PAGES)", () => {
  // The home draws the dock; no page carries it (the owner's ask of 2026-11-04): a page's way out is its Back. A drawer's page
  // (MISSIONS-PAGE) is over the home: the home's dock under it, covered, none in the drawer.
  it.each(PAGES.filter((p) => p.nav && p.path !== "").map((p) => [p.path, p] as const))("%s carries no dock", async (_path, page) => {
    open(concrete(page.path));
    // The first page module of the file is imported cold: Home's now brings its data hooks (P6).
    // A drawer's page (MISSIONS-PAGE, LEAGUE-PAGE) is the HUD's drawer over the home, named by its title.
    if (page.drawer) {
      await screen.findByRole("dialog", { name: page.title }, { timeout: slow(5000) });
    } else await screen.findByRole("heading", { level: 1, name: HEADING[page.path] ?? page.title }, { timeout: slow(5000) });
    const dock = screen.queryByRole("navigation", { name: "Main", hidden: true });
    if (page.drawer) expect(within(screen.getByRole("dialog", { name: page.title })).queryByRole("navigation", { name: "Main", hidden: true })).toBeNull();
    else expect(dock).toBeNull();
  });

  it("is on the home with no item current (#763), beside the village's overlays", async () => {
    open("/");
    await screen.findByRole("heading", { level: 1, name: "Home" }, { timeout: slow(5000) });
    expect(await screen.findByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { current: "page" })).toBeNull();
    // The edges' buttons are a chunk of their own (HOME-EDGES): they may come after the dock.
    expect(await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) })).toBeInTheDocument();
  });

  it("each item of the home's dock reaches its page (#763), which carries no dock", async () => {
    // The Shop, the Leaderboard, the Guild and Settings are the HUD's drawer over the home (SHOP-PAGE, LEADERBOARD-PAGE, GUILD-PAGE,
    // SETTINGS-PAGE), named by their title; the others' headings are pages'.
    for (const [name, path, heading] of [
      ["Shop", "/village/shop", "Shop"],
      ["Ranking", "/ranking", "Ranking"],
      ["Guild", "/guild", "Guild"],
      ["Settings", "/settings", "Settings"],
    ] as const) {
      const router = open("/");
      await screen.findByRole("heading", { level: 1, name: "Home" }, { timeout: slow(5000) });
      await userEvent.click(within(await screen.findByRole("navigation", { name: "Main" })).getByRole("button", { name: new RegExp(`^${name}`) }));
      await waitFor(() => expect(router.state.location.pathname).toBe(path), { timeout: slow(5000) });
      if (name === "Shop" || name === "Ranking" || name === "Guild" || name === "Settings") await screen.findByRole("dialog", { name: heading }, { timeout: slow(5000) });
      else await screen.findByRole("heading", { level: 1, name: heading }, { timeout: slow(5000) });
      expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
      cleanup();
    }
    const router = open("/");
    await screen.findByRole("heading", { level: 1, name: "Home" }, { timeout: slow(5000) });
    await userEvent.click(within(await screen.findByRole("navigation", { name: "Main" })).getByRole("button", { name: "Play" }));
    // PLAY-PAGE: Play is the HUD's drawer over the village.
    await screen.findByRole("dialog", { name: "Play" }, { timeout: slow(5000) });
    expect(router.state.location.pathname).toBe("/play");
  });

  it("a page's Back lands on the village, its dock back", async () => {
    const router = open("/village/shop");
    await screen.findByRole("dialog", { name: "Shop" }, { timeout: slow(5000) });
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    expect(router.state.location.pathname).toBe("/");
    expect(await screen.findByRole("navigation", { name: "Main" }, { timeout: slow(5000) })).toBeInTheDocument();
  });

  it("has no tab within reach under a page (DOCK-UNDER-PAGES): Play's drawer covers the village's dock", async () => {
    open("/play");
    await screen.findByRole("dialog", { name: "Play" }, { timeout: slow(5000) });
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
  ])("%s goes to %s", async (from, to) => {
    const router = open(from);
    await waitFor(() => expect(router.state.location.pathname).toBe(to));
    expect(router.state.location.search).toBe("");
  });

  // SHOP-PAGE: the packs' page and a theme's shop are the Shop's tabs now.
  it.each([
    ["/cobbles", "?tab=cobbles"],
    ["/cobbles?ref=0xabc", "?tab=cobbles&ref=0xabc"],
    ["/settings/theme/forest", "?tab=themes&theme=forest"],
    ["/play/challenge?tab=cobbles", "?tab=cobbles"],
  ])("%s goes to the Shop's tab, %s", async (from, search) => {
    const router = open(from);
    await waitFor(() => expect(router.state.location.pathname).toBe("/village/shop"));
    expect(router.state.location.search).toBe(search);
  });

  it("/player/:id goes to / with that player's public profile asked for (#952)", async () => {
    const router = open("/player/0x1");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.location.search).toBe("?player=0x1");
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

  it("is kept by the home's overlay and by its dock", async () => {
    const router = open("/?ref=0xabc");
    await screen.findByRole("heading", { name: "Home" });
    await userEvent.click(within(await screen.findByRole("navigation", { name: "Village" })).getByRole("button", { name: "Vault" }));
    // The HUD's drawer over the home (VAULT-PAGE).
    await screen.findByRole("dialog", { name: "Vault" }, { timeout: slow(5000) });
    expect(router.state.location.search).toBe("?ref=0xabc");
    cleanup();
    const again = open("/?ref=0xabc");
    await screen.findByRole("heading", { name: "Home" });
    await userEvent.click(within(await screen.findByRole("navigation", { name: "Main" }, { timeout: slow(5000) })).getByRole("button", { name: "Shop" }));
    await waitFor(() => expect(again.state.location.pathname).toBe("/village/shop"), { timeout: slow(5000) });
    expect(again.state.location.search).toBe("?ref=0xabc");
  });

  it("is kept by the welcome's old link, which lands on the home (NO-GUEST: no welcome)", async () => {
    localStorage.clear();
    resetWelcomedForTests();
    const router = open("/welcome?ref=0xabc");
    await screen.findByRole("heading", { name: "Home" }, { timeout: slow(5000) });
    expect(router.state.location.pathname).toBe("/");
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

describe("no welcome (NO-GUEST, the owner's ruling of 2026-11-07: every player has an account, none is asked to connect)", () => {
  beforeEach(() => {
    localStorage.clear();
    resetWelcomedForTests();
  });

  it("a first visit opens the village, its account made at start; the welcome's old link lands there too", async () => {
    const wallet = fakeWallet();
    const router = open("/", wallet);
    expect(await screen.findByRole("heading", { name: "Home" }, { timeout: slow(5000) })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
    await waitFor(() => expect(wallet.calls).toEqual(expect.arrayContaining(["probe", "connect"])));
    expect(screen.queryByRole("button", { name: /Connect/ })).toBeNull();
    const again = createTestRouter("/welcome");
    render(<App router={again} />);
    await waitFor(() => expect(again.state.location.pathname).toBe("/"));
  });

  it("with storage off nothing breaks: the village opens", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const router = open("/");
    expect(await screen.findByRole("heading", { name: "Home" }, { timeout: slow(5000) })).toBeInTheDocument();
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

  it("a game opened from a page goes back to it, and that page's Back up to the village (BACK-RULE #783)", async () => {
    const router = open("/");
    await screen.findByRole("heading", { level: 1, name: "Home" });
    // A page of its own (the Referral: the Vault is the HUD's drawer since VAULT-PAGE).
    await act(() => router.navigate("/referral"));
    await screen.findByRole("heading", { level: 1, name: "Referral" }, { timeout: slow(5000) });
    await act(() => router.navigate("/game/7"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/game/7"));
    await userEvent.click(await screen.findByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/referral"));
    expect(router.state.historyAction).toBe("POP");
    await waitFor(async () => {
      if (router.state.location.pathname === "/referral") await userEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(router.state.location.pathname).toBe("/");
    });
    expect(router.state.historyAction).toBe("POP");
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

describe("Back after a reload (the tracked entries, BACK-RULE #783)", () => {

  it("tracks the entries as the browser keeps them, and finds the nearest earlier entry of a page", () => {
    const e = (key: string, path: string) => ({ key, path });
    let h = nextHistory(null, e("a", "/"), "POP");
    h = nextHistory(h, e("b", "/pvp/league"), "PUSH");
    h = nextHistory(h, e("c", "/pvp"), "PUSH");
    h = nextHistory(h, e("d", "/pvp/result/1"), "REPLACE");
    expect(h.entries.map((x) => x.path)).toEqual(["/", "/pvp/league", "/pvp/result/1"]);
    // Up from the result: one entry back is the league, two the village; a page the history does not hold is none.
    expect(stepsBackTo(h, "/pvp/league")).toBe(-1);
    expect(stepsBackTo(h, "/")).toBe(-2);
    expect(stepsBackTo(h, "/settings")).toBeNull();
    // The current entry never counts, and the referral's `?ref=` is not part of a page.
    expect(stepsBackTo({ entries: [e("a", "/?ref=0x1"), e("b", "/vault?ref=0x1")], at: 1 }, "/")).toBe(-1);
    expect(stepsBackTo({ entries: [e("a", "/vault")], at: 0 }, "/vault")).toBeNull();
    // A pop to a known entry keeps the ones after it (a Forward comes back to them); a push then drops them.
    const back = nextHistory(h, e("b", "/pvp/league"), "POP");
    expect(back).toEqual({ entries: h.entries, at: 1 });
    expect(stepsBackTo(back, "/pvp/result/1")).toBeNull();
    expect(nextHistory(back, e("f", "/vault"), "PUSH").entries.map((x) => x.key)).toEqual(["a", "b", "f"]);
    // A pop to an unknown entry (a reload came between) knows nothing around it.
    expect(nextHistory(h, e("z", "/vault"), "POP")).toEqual({ entries: [e("z", "/vault")], at: 0 });
  });

  it("a page opened by a link or a reload goes up to its parent in place of its entry", async () => {
    window.history.replaceState({ usr: null, key: "k0", idx: 0 }, "", "/play/challenge");
    const router = createBrowserRouter(routes);
    render(<App router={router} />);
    await userEvent.click(await screen.findByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/play"));
    expect(router.state.historyAction).toBe("REPLACE");
    router.dispose();
  });

  it("a pop to an entry the tracker never saw does not give it a predecessor", async () => {
    // The tracker sees only /play/challenge (index 1); /play is before it, as after a reload.
    const router = createMemoryRouter(routes, { initialEntries: ["/play", "/play/challenge"], initialIndex: 1 });
    render(<App router={router} />);
    await screen.findByRole("button", { name: "Back" });
    await act(() => router.navigate(-1));
    await waitFor(() => expect(router.state.location.pathname).toBe("/play"));
    await screen.findByRole("dialog", { name: "Play" });
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    router.dispose();
  });
});

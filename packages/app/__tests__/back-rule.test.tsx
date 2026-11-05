import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { queryClient } from "../src/lib/query-client";
import { PAGES } from "../src/routes/pages";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages } from "./route-helpers";

// BACK-RULE (#783, the owner's decisions of 2026-10-26): no page opens another page (Settings' pages are sheets over it, the
// lifetime missions on the Missions page (#832), the defence log a section of the League), and Back never cycles: it goes up toward the
// village and ends there, in two steps at most from any page.

preloadPages("home", "missions", "settings", "theme", "shop", "my-tiles", "credits", "referral", "play", "story", "board", "cobbles");

const WAIT = { timeout: slow(5000) };

beforeEach(() => {
  window.history.replaceState(null, "", "/");
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

function open(path: string, wallet = fakeWallet()) {
  const router = createTestRouter(path);
  render(<App router={router} sources={fakeSources().sources} connector={wallet.load} />);
  return router;
}

/** The sheet over Settings, a modal dialog named after its page. */
const sheet = (name: string) => screen.findByRole("dialog", { name }, WAIT);
/** Settings' own heading, under the sheet (hidden from assistive technology while the sheet is open). */
const settingsUnder = () => screen.getByRole("heading", { level: 1, name: "Settings", hidden: true });

describe("the route map", () => {
  it("names a parent only for a sheet over Settings or a flow, so Back reaches the village in two steps at most", () => {
    for (const page of PAGES) {
      if (!page.parent) continue;
      const parent = PAGES.find((p) => `/${p.path}` === page.parent);
      // The parent is a page of its own that goes up to the village.
      expect(parent?.parent, page.path).toBeUndefined();
      if (page.panel) expect(page.sheet, page.path).toBe(true);
    }
    expect(PAGES.filter((p) => p.sheet).map((p) => p.path)).toEqual(["story", "referral", "settings/theme", "settings/tiles", "settings/credits"]);
    expect(PAGES.some((p) => p.path === "pvp/defence")).toBe(false);
  });
});

describe("Settings' pages are sheets over it", { timeout: slow(30_000) }, () => {
  it.each([
    ["Themes", "/settings/theme", "Themes"],
    ["Referral", "/referral", "Referral"],
    ["Credits", "/settings/credits", "Credits"],
  ])("%s opens in a sheet over Settings; its Back goes back to Settings, whose Back is the village", async (row, path, title) => {
    const router = open("/settings");
    await screen.findByRole("heading", { level: 1, name: "Settings" }, WAIT);
    await userEvent.click(screen.getByRole("button", { name: new RegExp(`^${row}`) }));
    const dialog = await sheet(title);
    expect(router.state.location.pathname).toBe(path);
    expect(settingsUnder()).toBeInTheDocument();
    // A sheet's header has Back, which closes it (no close button since PAGES-SCROLL, #782).
    await userEvent.click(await within(dialog).findByRole("button", { name: "Back" }, WAIT));
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings"));
    // Back through the history to Settings' own entry: never a push of it.
    expect(router.state.historyAction).toBe("POP");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), WAIT);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  // SHOP-PAGE: a theme's tiles are the Shop's, its Themes tab's view of the theme, never a sheet over a sheet (the owner's ask).
  it("a theme's old link lands on the Shop's view of it: its Back is the Themes tab, the Shop's the village", async () => {
    const router = open("/settings/theme/forest");
    const view = await screen.findByRole("dialog", { name: "Forest" }, WAIT);
    expect(router.state.location.pathname).toBe("/village/shop");
    expect(router.state.location.search).toBe("?tab=themes&theme=forest");
    await userEvent.click(within(view).getByRole("button", { name: "Back" }));
    // No earlier entry: the tab takes the view's place.
    await screen.findByRole("dialog", { name: "Shop" }, WAIT);
    expect(router.state.location.search).toBe("?tab=themes");
    expect(router.state.historyAction).toBe("REPLACE");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("from Settings' themes to a theme's tiles in the Shop: its Back goes back to the themes", async () => {
    const router = open("/settings");
    await screen.findByRole("heading", { level: 1, name: "Settings" }, WAIT);
    await userEvent.click(screen.getByRole("button", { name: /^Themes/ }));
    const themes = await sheet("Themes");
    await userEvent.click(await within(themes).findByRole("button", { name: "Forest tiles" }, WAIT));
    const view = await screen.findByRole("dialog", { name: "Forest" }, WAIT);
    expect(router.state.location.pathname).toBe("/village/shop");
    await userEvent.click(within(view).getByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings/theme"));
    expect(router.state.historyAction).toBe("POP");
  });
});

describe("the lifetime missions are on the Missions page (#832)", { timeout: slow(30_000) }, () => {
  it("the old Lifetime tab's link lands on /missions, and Back from it reaches the village", async () => {
    const router = open("/");
    await screen.findByRole("heading", { level: 1, name: "Home" }, WAIT);
    await router.navigate("/missions/lifetime");
    await screen.findByRole("dialog", { name: "Missions" }, WAIT);
    await waitFor(() => expect(router.state.location.pathname).toBe("/missions"));
    expect(screen.queryByRole("tab")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    // The redirect replaced the entry, as a link from outside does: Back goes up to the village in place, never past it.
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("Missions opened from the village: Back goes back through the history to the village's own entry", async () => {
    const router = open("/");
    await screen.findByRole("heading", { level: 1, name: "Home" }, WAIT);
    await router.navigate("/missions");
    await screen.findByRole("dialog", { name: "Missions" }, WAIT);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.historyAction).toBe("POP");
  });
});

describe("Play's modes (BACK-RULE #783)", { timeout: slow(30_000) }, () => {
  it("Story's campaigns open in a sheet over Play; its close goes back to Play, whose Back is the village", async () => {
    const router = open("/");
    await screen.findByRole("heading", { level: 1, name: "Home" }, WAIT);
    await router.navigate("/play");
    await screen.findByRole("heading", { level: 1, name: "Choose a mode" }, WAIT);
    await userEvent.click(await screen.findByText("Learn the rules level by level, then earn three stars on fixed decks.", {}, WAIT));
    const dialog = await sheet("Story");
    expect(router.state.location.pathname).toBe("/story");
    expect(screen.getByRole("heading", { level: 1, name: "Choose a mode", hidden: true })).toBeInTheDocument();
    await userEvent.click(await within(dialog).findByRole("button", { name: "Back" }, WAIT));
    await waitFor(() => expect(router.state.location.pathname).toBe("/play"));
    expect(router.state.historyAction).toBe("POP");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), WAIT);
    await waitFor(async () => {
      if (router.state.location.pathname === "/play") await userEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(router.state.location.pathname).toBe("/");
    }, WAIT);
  });

  it("Training opened from Play goes back to Play, the page it was opened from", async () => {
    const router = open("/play");
    await screen.findByRole("heading", { level: 1, name: "Choose a mode" }, WAIT);
    await userEvent.click(screen.getByRole("button", { name: /Training/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/training"));
    await userEvent.click(await screen.findByRole("button", { name: "Back" }, WAIT));
    await waitFor(() => expect(router.state.location.pathname).toBe("/play"));
    expect(router.state.historyAction).toBe("POP");
    expect(await screen.findByRole("heading", { level: 1, name: "Choose a mode" }, WAIT)).toBeInTheDocument();
  });

  it("Training opened by a link goes up to the village", async () => {
    const router = open("/training");
    await userEvent.click(await screen.findByRole("button", { name: "Back" }, WAIT));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
});

describe("the Cobble packs open in place over a page (BACK-RULE #783)", { timeout: slow(30_000) }, () => {
  it("the header's Cobbles on Missions open the packs in a sheet: the URL stays, the close leaves Missions as it was", async () => {
    const router = open("/missions", fakeWallet({ restored: true }));
    await screen.findByRole("dialog", { name: "Missions" }, WAIT);
    const plate = (await screen.findAllByRole("button", { name: /Cobbles: Buy packs/ }, WAIT))[0]!;
    await userEvent.click(plate);
    await sheet("Cobbles");
    expect(router.state.location.pathname).toBe("/missions");
    // The packs' header may still swap its nodes as they load: Back is pressed again until the sheet goes.
    await waitFor(async () => {
      const open = screen.queryByRole("dialog", { name: "Cobbles" });
      if (open) await userEvent.click(within(open).getByRole("button", { name: "Back" }));
      expect(screen.queryByRole("dialog", { name: "Cobbles" })).toBeNull();
    }, WAIT);
    expect(router.state.location.pathname).toBe("/missions");
    // Missions is the HUD's drawer (MISSIONS-PAGE), still open under where the packs were.
    expect(screen.getByRole("dialog", { name: "Missions" })).toBeInTheDocument();
  });
});

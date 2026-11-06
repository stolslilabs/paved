import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { queryClient } from "../src/lib/query-client";
import { PAGE_LOADERS } from "../src/routes/page-loaders";
import { PAGES } from "../src/routes/pages";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages } from "./route-helpers";

// BACK-RULE (#783, the owner's decisions of 2026-10-26): no page opens another page (Settings' pages are views of its drawer since
// SETTINGS-PAGE, the lifetime missions on the Missions page (#832), the defence log a section of the League), and Back never cycles: it goes up toward the
// village and ends there, in two steps at most from any page.

preloadPages("home", "missions", "settings", "theme", "shop", "tiles", "referral", "play", "story", "board", "cobbles");

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

/** A sheet over its page (Story over Play, the Cobbles' packs), a modal dialog named after its page. */
const sheet = (name: string) => screen.findByRole("dialog", { name }, WAIT);
/** The HUD's drawer (Settings, SETTINGS-PAGE), a modal dialog named after the view it shows. */
const drawer = sheet;

describe("the route map", () => {
  it("names a parent only for a sheet over Play, Play's stake (a view of its drawer) or a flow, so Back reaches the village in two steps at most", () => {
    for (const page of PAGES) {
      if (!page.parent) continue;
      const parent = PAGES.find((p) => `/${p.path}` === page.parent);
      // The parent is a page of its own that goes up to the village.
      expect(parent?.parent, page.path).toBeUndefined();
      // A panel's page under a parent is a sheet over it, or a view of the parent's drawer (PLAY-PAGE: the stake, one loader with Play).
      const view = page.drawer === true && parent?.drawer === true && PAGE_LOADERS[page.path] === PAGE_LOADERS[parent.path];
      if (page.panel) expect(page.sheet === true || view, page.path).toBe(true);
    }
    expect(PAGES.filter((p) => p.sheet).map((p) => p.path)).toEqual(["story"]);
    expect(PAGES.some((p) => p.path === "pvp/defence")).toBe(false);
  });
});

describe("Settings' views are in its drawer (SETTINGS-PAGE)", { timeout: slow(30_000) }, () => {
  it.each([
    ["Themes", "/settings/theme"],
    ["Credits", "/settings/credits"],
  ])("%s opens in Settings' drawer, in its place; its Back goes back to Settings, whose Back is the village", async (row, path) => {
    const router = open("/settings");
    const settings = await drawer("Settings");
    await userEvent.click(await within(settings).findByRole("button", { name: new RegExp(`^${row}`) }, WAIT));
    // The same drawer, named after the view.
    const view = await drawer(row);
    expect(view).toBe(settings);
    expect(router.state.location.pathname).toBe(path);
    // A view's header has Back to Settings and the red cross that leaves.
    expect(within(view).getByRole("button", { name: "Close" })).toBeInTheDocument();
    await userEvent.click(within(view).getByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings"));
    // Back through the history to Settings' own entry: never a push of it.
    expect(router.state.historyAction).toBe("POP");
    await drawer("Settings");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("a view's red cross leaves the drawer at once, up to the village", async () => {
    const router = open("/");
    await screen.findByRole("heading", { level: 1, name: "Home" }, WAIT);
    await router.navigate("/settings");
    await userEvent.click(await within(await drawer("Settings")).findByRole("button", { name: /^Credits/ }, WAIT));
    const view = await drawer("Credits");
    await userEvent.click(within(view).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.historyAction).toBe("POP");
  });

  it("the referral is a page of its own (the profile's Invite, the book's), no longer a sheet over Settings: its Back is the village", async () => {
    const router = open("/referral");
    await screen.findByRole("heading", { level: 1, name: "Referral" }, WAIT);
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
    await userEvent.click(await within(await drawer("Settings")).findByRole("button", { name: /^Themes/ }, WAIT));
    const themes = await drawer("Themes");
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
    // PLAY-PAGE: Play is the HUD's drawer; Story's sheet opens over it, the drawer kept under it.
    const play = await screen.findByRole("dialog", { name: "Play" }, WAIT);
    await userEvent.click(await within(play).findByRole("button", { name: /^Story/ }, WAIT));
    const dialog = await sheet("Story");
    expect(router.state.location.pathname).toBe("/story");
    // Play's drawer stays under the sheet (hidden from assistive technology while the sheet is open).
    expect(document.querySelector('[data-hud-drawer="play"]')).toBeInTheDocument();
    await userEvent.click(await within(dialog).findByRole("button", { name: "Back" }, WAIT));
    await waitFor(() => expect(router.state.location.pathname).toBe("/play"));
    expect(router.state.historyAction).toBe("POP");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Story" })).toBeNull(), WAIT);
    // Play's drawer, under the sheet all along, is within reach again once the sheet has slid out.
    expect(await screen.findByRole("dialog", { name: "Play" }, WAIT)).toBeInTheDocument();
    await waitFor(async () => {
      if (router.state.location.pathname === "/play") await userEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(router.state.location.pathname).toBe("/");
    }, WAIT);
  });

  it("Training opened from Play goes back to Play, the page it was opened from", async () => {
    const router = open("/play");
    await screen.findByRole("dialog", { name: "Play" }, WAIT);
    await userEvent.click(screen.getByRole("button", { name: /^Training/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/training"));
    await userEvent.click(await screen.findByRole("button", { name: "Back" }, WAIT));
    await waitFor(() => expect(router.state.location.pathname).toBe("/play"));
    expect(router.state.historyAction).toBe("POP");
    expect(await screen.findByRole("dialog", { name: "Play" }, WAIT)).toBeInTheDocument();
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

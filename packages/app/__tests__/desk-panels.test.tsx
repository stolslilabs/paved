import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { BalancesProvider, type HeaderBalances } from "../src/components/containers/balances-context";
import { PagePanelProvider } from "../src/components/containers/page-panel-context";
import { TabPage } from "../src/components/containers/tab-page";
import { TopBar } from "../src/components/containers/top-bar";
import { DESKTOP_QUERY } from "../src/routes/home-layout";
import { nextTrail } from "../src/routes/home-panel-host";
import { PAGES } from "../src/routes/pages";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages } from "./route-helpers";

const realMatchMedia = window.matchMedia;

/** The widths from `desktop` (`desktop: true`), or under it: the side panel's query matches or not; reduced motion never does. */
function media(desktop: boolean) {
  window.matchMedia = ((query: string) =>
    ({
      matches: desktop && query === DESKTOP_QUERY,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

function open(path: string) {
  const router = createTestRouter(path);
  render(<App router={router} sources={fakeSources().sources} connector={fakeWallet().load} />);
  return router;
}

/** The panel (a modal dialog named after its page): the home behind it is hidden from assistive technology while it is open. */
const panel = (name: string) => screen.findByRole("dialog", { name }, { timeout: slow(5000) });
/** A click on the dimmed village outside the panel: the panel has no close button (#782). */
const clickOutside = async () => userEvent.click(document.querySelector<HTMLElement>("[data-slot=sheet-overlay]")!);
/** The home's village stays mounted under the panel (hidden behind the modal). */
const village = () => screen.getByRole("navigation", { name: "Village", hidden: true });

preloadPages("home", "quests", "vault", "settings", "theme", "play");

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
  vi.restoreAllMocks();
  localStorage.clear();
  resetWelcomedForTests();
});

describe("the route map (#762)", () => {
  it("puts the overlay's pages and the pages reached from them in the panel; the games, the purchase, the avatar and the visits stay full screen", () => {
    expect(PAGES.filter((p) => p.panel).map((p) => p.path)).toEqual([
      "play",
      "cobbles",
      "village/chests",
      "village/shop",
      "pvp/defence",
      "pvp/league",
      "missions/lifetime",
      "missions/:day?",
      "vault",
      "referral",
      "settings/theme",
      "settings/theme/:theme",
      "settings/tiles",
      "settings/credits",
      "settings",
    ]);
    // A page reached from another names its parent: its panel keeps Back to it.
    expect(PAGES.find((p) => p.path === "pvp/defence")?.parent).toBe("/pvp/league");
  });
});

describe("from desktop, the overlay's pages open in the side panel over the village (#762)", () => {
  beforeEach(() => media(true));

  it("the overlay's column holds Missions, Chests, Shop, Vault and League, with the gear and Play; the phone's bar is hidden there", async () => {
    open("/");
    const column = await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    expect(within(column).getAllByRole("button").map((b) => b.getAttribute("aria-label")?.split(",")[0])).toEqual(["Missions", "Chests", "Shop", "Vault", "League"]);
    expect(screen.getAllByRole("button", { name: "Play" }).filter((b) => !b.closest("nav"))).toHaveLength(1);
    // No bar from `desktop` (#763's is below it only); jsdom applies no media query, so its class tells.
    expect((await screen.findByRole("navigation", { name: "Main" })).parentElement).toHaveClass("desktop:hidden");
  });

  it.each([
    ["Missions", "/missions", "Missions"],
    ["Chests", "/village/chests", "Chests"],
    ["Shop", "/village/shop", "Tile shop"],
    ["Vault", "/vault", "Vault"],
    ["League", "/pvp/league", "League"],
  ] as const)("%s opens its page in the panel, the URL naming it, the village still mounted", async (button, path, title) => {
    const router = open("/");
    const column = await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    await userEvent.click(within(column).getByRole("button", { name: new RegExp(`^${button}`) }));
    const dialog = await panel(title);
    expect(router.state.location.pathname).toBe(path);
    expect(village()).toBeInTheDocument();
    // A page of the overlay itself: no Back, and no close button (#782): a click outside or Escape closes it.
    await waitFor(() => expect(dialog.querySelector("[data-slot=page-scroll]")?.childElementCount).toBeGreaterThan(0), { timeout: slow(5000) });
    expect(within(dialog).queryByRole("button", { name: "Close" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("the gear opens Settings in the panel, and Play its mode choice", async () => {
    const router = open("/");
    await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    await userEvent.click(screen.getAllByRole("button", { name: "Settings" }).find((b) => !b.closest("nav"))!);
    await panel("Settings");
    expect(router.state.location.pathname).toBe("/settings");
    await clickOutside();
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    // The village takes the pointer and assistive technology back once the panel has slid out.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: slow(5000) });
    await userEvent.click(screen.getAllByRole("button", { name: "Play" }).find((b) => !b.closest("nav"))!);
    const play = await panel("Play");
    expect(await within(play).findByRole("heading", { level: 1, name: "Choose a mode" }, { timeout: slow(5000) })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/play");
  });

  it("a reload with the panel open reopens it over the village; its close then replaces the entry with the home's", async () => {
    const router = open("/vault");
    await panel("Vault");
    await waitFor(() => expect(village()).toBeInTheDocument(), { timeout: slow(5000) });
    await panel("Vault");
    await clickOutside();
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.historyAction).toBe("REPLACE");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: slow(5000) });
  });

  it("has no close button; a click on the village closes it, and the focus goes back to the overlay's button that opened it (#782)", async () => {
    const router = open("/");
    const column = await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    const opener = within(column).getByRole("button", { name: /^League/ });
    await userEvent.click(opener);
    const dialog = await panel("League");
    // Its accessible name stays (the dialog's title), and the keyboard's way out is Escape.
    expect(dialog).toHaveAccessibleName("League");
    expect(within(dialog).queryByRole("button", { name: "Close" })).toBeNull();
    await clickOutside();
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: slow(5000) });
    await waitFor(() => expect(within(screen.getByRole("navigation", { name: "Village" })).getByRole("button", { name: /^League/ })).toHaveFocus());
  });

  it("closes on Escape, back to the home's own entry (Back does not reopen it), the focus on the button that opened it", async () => {
    const router = open("/");
    const column = await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    await userEvent.click(within(column).getByRole("button", { name: /^Missions/ }));
    await panel("Missions");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.historyAction).toBe("POP");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: slow(5000) });
    await waitFor(() => expect(within(screen.getByRole("navigation", { name: "Village" })).getByRole("button", { name: /^Missions/ })).toHaveFocus());
  });

  it("the browser's Back closes it", async () => {
    const router = open("/");
    const column = await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    await userEvent.click(within(column).getByRole("button", { name: /^Vault/ }));
    await panel("Vault");
    await router.navigate(-1);
    expect(router.state.location.pathname).toBe("/");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: slow(5000) });
  });

  it("a second-level page opens in the same panel, with Back to its parent; the close walks back past both", async () => {
    const router = open("/");
    await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    await userEvent.click(screen.getAllByRole("button", { name: "Settings" }).find((b) => !b.closest("nav"))!);
    await userEvent.click((await within(await panel("Settings")).findByRole("button", { name: /Themes/ }, { timeout: slow(5000) })));
    const themes = await panel("Themes");
    expect(router.state.location.pathname).toBe("/settings/theme");
    await userEvent.click(await within(themes).findByRole("button", { name: "Back" }, { timeout: slow(5000) }));
    await panel("Settings");
    expect(router.state.location.pathname).toBe("/settings");
    await userEvent.click((await within(await panel("Settings")).findByRole("button", { name: /Themes/ }, { timeout: slow(5000) })));
    await panel("Themes");
    await clickOutside();
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.historyAction).toBe("POP");
  });

  it("a panel reopened by Forward closes back to the home's entry too: Back then never reopens it", async () => {
    const router = open("/");
    await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    await userEvent.click(screen.getAllByRole("button", { name: "Settings" }).find((b) => !b.closest("nav"))!);
    await userEvent.click(await within(await panel("Settings")).findByRole("button", { name: /Themes/ }, { timeout: slow(5000) }));
    await panel("Themes");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    // Forward, Forward: Settings, then Themes, in the panel again.
    await router.navigate(1);
    await panel("Settings");
    await router.navigate(1);
    expect(router.state.location.pathname).toBe("/settings/theme");
    await panel("Themes");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.historyAction).toBe("POP");
    // The entries before are the home's alone: nothing of the panel's is behind it.
    await router.navigate(-1);
    expect(router.state.location.pathname).not.toMatch(/^\/settings/);
  });
});

describe("the panel's trail: the entries walked from the home's (#762)", () => {
  it("keeps the entries after the home's on a Back, so a Forward into the panel is placed again", () => {
    let t = nextTrail(null, "h", "POP", true);
    t = nextTrail(t, "s", "PUSH", false);
    t = nextTrail(t, "t", "PUSH", false);
    expect(t).toEqual({ keys: ["h", "s", "t"], at: 2 });
    // The close walks back to the home's entry; Forward and Forward come back into the panel.
    t = nextTrail(t, "h", "POP", true);
    expect(t).toEqual({ keys: ["h", "s", "t"], at: 0 });
    t = nextTrail(t, "s", "POP", false);
    t = nextTrail(t, "t", "POP", false);
    expect(t).toEqual({ keys: ["h", "s", "t"], at: 2 });
  });

  it("drops the entries after the current one on a new page, as the browser does", () => {
    let t = nextTrail({ keys: ["h", "s", "t"], at: 1 }, "v", "PUSH", false);
    expect(t).toEqual({ keys: ["h", "s", "v"], at: 2 });
    t = nextTrail(t, "w", "REPLACE", false);
    expect(t).toEqual({ keys: ["h", "s", "w"], at: 2 });
  });

  it("knows no way back from an entry it never saw (a link, a reload); a new home's entry starts it again", () => {
    expect(nextTrail(null, "s", "POP", false)).toBeNull();
    expect(nextTrail({ keys: ["h", "s"], at: 1 }, "x", "POP", false)).toBeNull();
    expect(nextTrail(null, "h2", "REPLACE", true)).toEqual({ keys: ["h2"], at: 0 });
    expect(nextTrail({ keys: ["h", "s"], at: 0 }, "h2", "PUSH", true)).toEqual({ keys: ["h2"], at: 0 });
  });
});

describe("below desktop the same routes are full pages (#762, #763)", () => {
  beforeEach(() => media(false));

  it("Missions is a page with the phone's bar, no panel and no village under it", async () => {
    open("/missions");
    await screen.findByRole("heading", { level: 1, name: "Missions" }, { timeout: slow(5000) });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Village" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });
});

describe("the panel's header (#762)", () => {
  const BALANCES = { state: { status: "ready", usdc: 0n, paved: 0n, cobbles: 640 }, faucet: false } as const;
  const inPanel = (show: HeaderBalances, page: React.ReactNode, top = true) =>
    render(
      <LazyMotion features={domMax}>
        <BalancesProvider value={{ ...BALANCES, show }}>
          <PagePanelProvider value={{ top }}>{page}</PagePanelProvider>
        </BalancesProvider>
      </LazyMotion>,
    );

  it("shows the Cobbles in the header only where the page's rule shows them, and never under it nor the desktop's rail", async () => {
    inPanel({ phone: true, desktop: "all" }, <TopBar title="Chests" onBack={vi.fn()} />);
    const header = screen.getByRole("heading", { level: 1, name: "Chests" }).closest("header")!;
    const regions = await screen.findAllByRole("region", { name: "Balances" });
    expect(regions).toHaveLength(1);
    expect(header).toContainElement(regions[0]!);
    // No close button in the panel's header (#782).
    expect(within(header).queryByRole("button", { name: "Close" })).toBeNull();
    expect(within(header).queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("shows none where the page's rule has none on a phone", () => {
    inPanel({ phone: false, desktop: "all" }, <TabPage tab="vault" title="Vault">Body</TabPage>);
    expect(screen.queryAllByRole("region", { name: "Balances" })).toHaveLength(0);
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("keeps Back on a page reached from another", () => {
    inPanel({ phone: true, desktop: "all" }, <TabPage tab="settings" title="Themes" onBack={vi.fn()}>Body</TabPage>, false);
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });
});

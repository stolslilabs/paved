import { slow } from "../test-slow";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { BalancesProvider } from "../src/components/containers/balances-context";
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

preloadPages("home", "missions", "vault", "settings", "theme", "play");

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
      "pvp/league",
      "story",
      "missions",
      "vault",
      "referral",
      "settings/theme",
      "settings/theme/:theme",
      "settings/tiles",
      "settings/credits",
      "settings",
    ]);
    // No page opens another (BACK-RULE #783): only the sheets over Settings and over Play name a parent.
    expect(PAGES.filter((p) => p.panel && p.parent).every((p) => p.sheet && ["/settings", "/play"].includes(p.parent!))).toBe(true);
  });
});

describe("from desktop, the overlay's pages open in the side panel over the village (#762)", () => {
  beforeEach(() => media(true));

  it("the overlay's column holds Missions, Chests, Shop and Vault, no League (#856), with the gear and Play; the phone's bar is hidden there", async () => {
    open("/");
    const column = await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    expect(within(column).getAllByRole("button").map((b) => b.getAttribute("aria-label")?.split(",")[0])).toEqual(["Missions", "Chests", "Shop", "Vault"]);
    expect(screen.getAllByRole("button", { name: "Play" }).filter((b) => !b.closest("nav"))).toHaveLength(1);
    // No bar from `desktop` (#763's is below it only); jsdom applies no media query, so its class tells.
    expect((await screen.findByRole("navigation", { name: "Main" })).parentElement).toHaveClass("desktop:hidden");
  });

  it.each([
    ["Missions", "/missions", "Missions", "right"],
    ["Chests", "/village/chests", "Chests", "right"],
    ["Shop", "/village/shop", "Tile shop", "right"],
    ["Vault", "/vault", "Vault", "right"],
  ] as const)("%s opens its page in the panel, the URL naming it, the village still mounted", async (button, path, title, side) => {
    const router = open("/");
    const column = await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    await userEvent.click(within(column).getByRole("button", { name: new RegExp(`^${button}`) }));
    const dialog = await panel(title);
    expect(router.state.location.pathname).toBe(path);
    expect(dialog).toHaveAttribute("data-side", side);
    expect(village()).toBeInTheDocument();
    // A page of the overlay itself: no Back, and no close button (#782): a click outside or Escape closes it.
    await waitFor(() => expect(dialog.querySelector("[data-slot=page-scroll]")?.childElementCount).toBeGreaterThan(0), { timeout: slow(5000) });
    expect(within(dialog).queryByRole("button", { name: "Close" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("the League control under the profile opens the League's panel from the left (#829)", async () => {
    const router = open("/");
    await userEvent.click(await screen.findByRole("button", { name: /^League: / }, { timeout: slow(5000) }));
    const dialog = await panel("League");
    expect(router.state.location.pathname).toBe("/pvp/league");
    expect(dialog).toHaveAttribute("data-side", "left");
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
    const opener = within(column).getByRole("button", { name: /^Vault/ });
    await userEvent.click(opener);
    const dialog = await panel("Vault");
    // Its accessible name stays (the dialog's title), and the keyboard's way out is Escape.
    expect(dialog).toHaveAccessibleName("Vault");
    expect(within(dialog).queryByRole("button", { name: "Close" })).toBeNull();
    await clickOutside();
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: slow(5000) });
    await waitFor(() => expect(within(screen.getByRole("navigation", { name: "Village" })).getByRole("button", { name: /^Vault/ })).toHaveFocus());
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

  it("the themes open in a sheet over Settings' panel (BACK-RULE #783): its close goes back to Settings, the panel's to the village", async () => {
    const router = open("/");
    await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    await userEvent.click(screen.getAllByRole("button", { name: "Settings" }).find((b) => !b.closest("nav"))!);
    await userEvent.click((await within(await panel("Settings")).findByRole("button", { name: /Themes/ }, { timeout: slow(5000) })));
    const themes = await panel("Themes");
    expect(router.state.location.pathname).toBe("/settings/theme");
    // Settings stays in its panel under the sheet; the sheet's Back closes it, back to Settings.
    expect(screen.getByRole("dialog", { name: "Settings", hidden: true })).toBeInTheDocument();
    await userEvent.click(await within(themes).findByRole("button", { name: "Back" }, { timeout: slow(5000) }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings"));
    expect(router.state.historyAction).toBe("POP");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Themes" })).toBeNull(), { timeout: slow(5000) });
    // The panel has no close button (#782): a click on the village outside it.
    await panel("Settings");
    await clickOutside();
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.historyAction).toBe("POP");
  });

  it("a sheet reopened by Forward closes back to Settings, and the panel to the home's entry: Back then never reopens it", async () => {
    const router = open("/");
    await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    await userEvent.click(screen.getAllByRole("button", { name: "Settings" }).find((b) => !b.closest("nav"))!);
    await userEvent.click(await within(await panel("Settings")).findByRole("button", { name: /Themes/ }, { timeout: slow(5000) }));
    await panel("Themes");
    await act(() => router.navigate(-2));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    // Forward, Forward: Settings, then the themes over it, again.
    await act(() => router.navigate(1));
    await panel("Settings");
    await act(() => router.navigate(1));
    expect(router.state.location.pathname).toBe("/settings/theme");
    // Escape closes the sheet (back to Settings), then the panel (to the home's entry).
    await panel("Themes");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings"));
    expect(router.state.historyAction).toBe("POP");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Themes" })).toBeNull(), { timeout: slow(5000) });
    await panel("Settings");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.historyAction).toBe("POP");
    // The entries before are the home's alone: nothing of the panel's is behind it.
    await act(() => router.navigate(-1));
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

describe("the panel's header (#762, #781)", () => {
  const BALANCES = { state: { status: "ready", usdc: 0n, paved: 0n, cobbles: 640 }, faucet: false } as const;
  const inPanel = (page: React.ReactNode, top = true) =>
    render(
      <LazyMotion features={domMax}>
        <BalancesProvider value={BALANCES}>
          <PagePanelProvider value={{ top }}>{page}</PagePanelProvider>
        </BalancesProvider>
      </LazyMotion>,
    );

  // In the panel the `desktop` variant does not apply (`data-page-panel`, theme.css): the pill shows, the rail stays hidden.
  it.each([
    ["a flow's top bar", () => <TopBar title="Chests" onBack={vi.fn()} />, "Chests"],
    ["a tab page", () => <TabPage tab="vault" title="Vault">Body</TabPage>, "Vault"],
  ])("%s: the home's balances in the header and no close button (#782), nothing under it, no Back on the overlay's own page", async (_, page, title) => {
    inPanel(page());
    const header = screen.getByRole("heading", { level: 1, name: title }).closest("header")!;
    const regions = await screen.findAllByRole("region", { name: "Balances" });
    expect(regions).toHaveLength(2);
    for (const region of regions) expect(header).toContainElement(region);
    // No close button in the panel's header (#782).
    expect(within(header).queryByRole("button", { name: "Close" })).toBeNull();
    expect(within(header).queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("keeps Back on a page reached from another", () => {
    inPanel(<TabPage tab="settings" title="Themes" onBack={vi.fn()}>Body</TabPage>, false);
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });
});

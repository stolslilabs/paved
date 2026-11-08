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

/** Every width query matches (a desktop's window): the HUD's drawer is a side panel too (its `tablet` query); reduced motion never. */
function wide() {
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes("min-width"),
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

preloadPages("home", "chat", "guild", "friends", "ranking", "missions", "vault", "settings", "theme", "play", "purchase", "referral", "home-panel");

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
  it("puts the overlay's pages and the pages reached from them in the panel; the games, the purchase and the visits stay full screen", () => {
    expect(PAGES.filter((p) => p.panel).map((p) => p.path)).toEqual([
      "play",
      "play/challenge",
      "avatar",
      "village/shop",
      "pvp/league",
      "story",
      "missions",
      "tiles",
      "vault",
      "chat",
      "chat/private/:player",
      "chat/:tab",
      "guild",
      "friends",
      "ranking",
      "referral",
      "settings/theme",
      "settings/credits",
      "settings",
    ]);
    // No page opens another (BACK-RULE #783): only the sheet over Play and Play's stake (a view of its drawer, PLAY-PAGE) name a
    // parent (Settings' views have none, SETTINGS-PAGE).
    expect(PAGES.filter((p) => p.panel && p.parent).every((p) => (p.sheet || p.drawer) && p.parent === "/play")).toBe(true);
    // MISSIONS-PAGE, LEAGUE-PAGE, COLLECTION-PAGE, VAULT-PAGE, CHAT-PAGE, GUILD-PAGE, FRIENDS-PAGE, SETTINGS-PAGE, PLAY-PAGE, LEADERBOARD-PAGE: the League,
    // Missions, Tiles, the Vault, the Chat, the Guild, Friends, the Leaderboard, Settings (its Themes and Credits) and Play are the HUD's drawer over the
    // home at every width, never the side panel; children of the home's route. Play's stake is a view of its drawer, Story's campaigns
    // a sheet over it (the drawer kept under the sheet). AVATAR-PAGE: the avatar editor too, docked at the left as the Profile that
    // opens it.
    expect(PAGES.filter((p) => p.drawer).map((p) => p.path)).toEqual([
      "play",
      "play/challenge",
      "avatar",
      "village/shop",
      "pvp/league",
      "story",
      "missions",
      "tiles",
      "vault",
      "chat",
      "chat/private/:player",
      "chat/:tab",
      "guild",
      "friends",
      "ranking",
      "settings/theme",
      "settings/credits",
      "settings",
    ]);
    expect(PAGES.filter((p) => p.drawer && !["play/challenge", "story"].includes(p.path)).every((p) => p.panel && !p.parent && !p.sheet)).toBe(true);
  });
});

describe("from desktop, the overlay's pages open in the side panel over the village (#762)", () => {
  beforeEach(() => media(true));

  it("the overlay's column holds Missions, Vault, Friends and Tiles, no League (#856, HOME-EDGES); the dock has Shop, Ranking, Play, Guild and Settings (HOME-DOCK; END-CHEST: Ranking in the Chests' place)", async () => {
    open("/");
    const column = await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    expect(within(column).getAllByRole("button").map((b) => b.getAttribute("aria-label")?.split(",")[0])).toEqual(["Missions", "Vault", "Friends", "Tiles"]);
    // Play is the dock's alone, and the dock shows from `desktop` too; jsdom applies no media query, so its classes tell.
    expect(screen.getAllByRole("button", { name: "Play" }).filter((b) => !b.closest("nav"))).toHaveLength(0);
    const dock = await screen.findByRole("navigation", { name: "Main" });
    expect(dock.parentElement).not.toHaveClass("desktop:hidden");
    expect(within(dock).getAllByRole("button").map((b) => b.getAttribute("aria-label")?.split(",")[0])).toEqual(["Shop", "Ranking", "Play", "Allegiance", "Settings"]);
  });

  it("the Referral, reached from the profile's Invite, opens in the panel: the URL naming it, the village still mounted, no close button", async () => {
    // The last page of the side panel (VAULT-PAGE: the Vault, the overlay column's last page, is the HUD's drawer).
    const router = open("/");
    await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    await act(() => router.navigate("/referral"));
    const dialog = await panel("Referral");
    expect(dialog).toHaveAttribute("data-side", "right");
    expect(village()).toBeInTheDocument();
    // No close button (#782): a click outside or Escape closes it.
    await waitFor(() => expect(dialog.querySelector("[data-slot=page-scroll]")?.childElementCount).toBeGreaterThan(0), { timeout: slow(5000) });
    expect(within(dialog).queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("the overlay's Vault opens the HUD's drawer at the right (VAULT-PAGE), not the panel: its title, PAVED and vPAVED, the red cross; its tabs at the foot", async () => {
    wide();
    const router = open("/");
    const column = await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    await userEvent.click(within(column).getByRole("button", { name: /^Vault/ }));
    const drawer = await panel("Vault");
    expect(router.state.location.pathname).toBe("/vault");
    expect(drawer).toHaveAttribute("data-hud-drawer", "vault");
    expect(drawer).toHaveAttribute("data-side", "right");
    expect(village()).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const header = drawer.querySelector<HTMLElement>('[data-slot="sheet-header"]')!;
    expect([...header.children].map((el) => el.getAttribute("data-slot"))).toEqual(["hud-drawer-title", "hud-drawer-end", "hud-drawer-close"]);
    expect(await within(drawer).findByRole("tablist", { name: "Vault" }, { timeout: slow(5000) })).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.historyAction).toBe("POP");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: slow(5000) });
    await waitFor(() => expect(within(screen.getByRole("navigation", { name: "Village" })).getByRole("button", { name: /^Vault/ })).toHaveFocus());
  });

  it("Missions opens the HUD's drawer at the right (MISSIONS-PAGE), not the panel: the URL naming it, the village still mounted, the title on the left, the red cross at the right end", async () => {
    // From `tablet` the drawer is a side panel (`hud-drawer.tsx`'s query): every width query matches here.
    wide();
    const router = open("/");
    const column = await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    await userEvent.click(within(column).getByRole("button", { name: /^Missions/ }));
    const drawer = await panel("Missions");
    expect(router.state.location.pathname).toBe("/missions");
    expect(drawer).toHaveAttribute("data-hud-drawer", "missions");
    expect(drawer).toHaveAttribute("data-side", "right");
    expect(village()).toBeInTheDocument();
    // One dialog: the side panel stays closed under it.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    // One row: the title first, the Cobbles after it, the close last; no Back.
    const header = drawer.querySelector<HTMLElement>('[data-slot="sheet-header"]')!;
    expect([...header.children].map((el) => el.getAttribute("data-slot"))).toEqual(["hud-drawer-title", "hud-drawer-end", "hud-drawer-close"]);
    expect(within(drawer).queryByRole("button", { name: "Back" })).toBeNull();
    // No room kept for the dock at its body's end (DOCK-UNDER-PAGES): the dock is under the page.
    expect(drawer.querySelector<HTMLElement>("[data-hud-drawer-body]")!.style.paddingBottom).toBe("");
    await userEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.historyAction).toBe("POP");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: slow(5000) });
    await waitFor(() => expect(within(screen.getByRole("navigation", { name: "Village" })).getByRole("button", { name: /^Missions/ })).toHaveFocus());
  });

  it("the dock's Shop opens the HUD's drawer at the right (SHOP-PAGE), not the panel: its tabs, the Cobbles, the red cross", async () => {
    wide();
    const router = open("/");
    const dock = await screen.findByRole("navigation", { name: "Main" }, { timeout: slow(5000) });
    await userEvent.click(within(dock).getByRole("button", { name: /^Shop/ }));
    const drawer = await panel("Shop");
    expect(router.state.location.pathname).toBe("/village/shop");
    expect(drawer).toHaveAttribute("data-hud-drawer", "shop");
    expect(drawer).toHaveAttribute("data-side", "right");
    expect(village()).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(within(drawer).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Tiles", "Cobbles", "Themes"]);
    // A tab is the URL's, its entry replaced: the close still goes back to the village's own entry.
    await userEvent.click(within(drawer).getByRole("tab", { name: "Cobbles" }));
    await waitFor(() => expect(router.state.location.search).toBe("?tab=cobbles"));
    expect(router.state.historyAction).toBe("REPLACE");
    await userEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.historyAction).toBe("POP");
  });

  it("the dock's Guild opens the HUD's drawer at the right (GUILD-PAGE), not the panel: the red cross, the focus back on the dock's Guild", async () => {
    wide();
    const router = open("/");
    const dock = await screen.findByRole("navigation", { name: "Main" }, { timeout: slow(5000) });
    await userEvent.click(within(dock).getByRole("button", { name: /^Allegiance/ }));
    const drawer = await panel("Allegiance");
    expect(router.state.location.pathname).toBe("/guild");
    expect(drawer).toHaveAttribute("data-hud-drawer", "guild");
    expect(drawer).toHaveAttribute("data-side", "right");
    expect(village()).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const header = drawer.querySelector<HTMLElement>('[data-slot="sheet-header"]')!;
    expect([...header.children].map((el) => el.getAttribute("data-slot"))).toEqual(["hud-drawer-title", "hud-drawer-close"]);
    await userEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.historyAction).toBe("POP");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: slow(5000) });
    await waitFor(() => expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: /^Allegiance/ })).toHaveFocus());
  });

  it("the dock's Ranking opens the Leaderboard's HUD drawer at the right (LEADERBOARD-PAGE): its tabs at its foot, the tab the URL's", async () => {
    wide();
    const router = open("/");
    const dock = await screen.findByRole("navigation", { name: "Main" }, { timeout: slow(5000) });
    await userEvent.click(within(dock).getByRole("button", { name: /^Ranking/ }));
    const drawer = await panel("Ranking");
    expect(router.state.location.pathname).toBe("/ranking");
    expect(drawer).toHaveAttribute("data-hud-drawer", "ranking");
    expect(drawer).toHaveAttribute("data-side", "right");
    expect(village()).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    // The tabs in the drawer's footer, out of its scrolling body: Players, Guilds, Friends.
    const tabs = within(drawer).getAllByRole("tab");
    expect(tabs.map((t) => t.closest("[data-slot=hud-drawer-footer]") !== null)).toEqual([true, true, true]);
    // The chain's sources serve no social source: no ranking here (the lists: ranking.test.tsx).
    expect(within(drawer).getByText("Rankings are not on this network yet.")).toBeInTheDocument();
    // A tab is the URL's, its entry replaced: the close still goes back to the village's own entry.
    await userEvent.click(within(drawer).getByRole("tab", { name: /^Allegiances/ }));
    await waitFor(() => expect(router.state.location.search).toBe("?tab=guilds"));
    expect(router.state.historyAction).toBe("REPLACE");
    expect(within(drawer).getByRole("tab", { name: /^Allegiances/ })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.historyAction).toBe("POP");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: slow(5000) });
    await waitFor(() => expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: /^Ranking/ })).toHaveFocus());
  });

  it("the right column's Friends opens the HUD's drawer at the right (FRIENDS-PAGE), not the panel: the search, the red cross", async () => {
    wide();
    const router = open("/");
    const column = await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    await userEvent.click(within(column).getByRole("button", { name: /^Friends/ }));
    const drawer = await panel("Friends");
    expect(router.state.location.pathname).toBe("/friends");
    expect(drawer).toHaveAttribute("data-hud-drawer", "friends");
    expect(drawer).toHaveAttribute("data-side", "right");
    expect(village()).toBeInTheDocument();
    // One dialog: the side panel stays closed under it.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(within(drawer).getByRole("searchbox", { name: "Name or player ID" })).toHaveAttribute("placeholder", "Find a player by name or ID");
    expect(within(drawer).queryByRole("button", { name: "Back" })).toBeNull();
    await userEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.historyAction).toBe("POP");
  });

  it("the League control under the profile opens the League's HUD drawer at the left (#829, LEAGUE-PAGE), not the panel: the red cross, the focus back on the control", async () => {
    // From `tablet` the drawer is a side panel (`hud-drawer.tsx`'s query): every width query matches here.
    wide();
    const router = open("/");
    // NO-GUEST: the wallet makes the account as the app opens, and the home's overlays draw again with it; its village's score says
    // it is in, so the tap lands on the control that stays.
    await waitFor(() => expect(document.querySelector("[data-slot=village-score]")).not.toBeNull(), { timeout: slow(5000) });
    await userEvent.click(await screen.findByRole("button", { name: /^League: / }, { timeout: slow(5000) }));
    const drawer = await panel("League");
    expect(router.state.location.pathname).toBe("/pvp/league");
    expect(drawer).toHaveAttribute("data-hud-drawer", "league");
    expect(drawer).toHaveAttribute("data-side", "left");
    expect(village()).toBeInTheDocument();
    // One dialog: the side panel stays closed under it.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    // The title first, the close last (the League control between them once the standing is read); no Back.
    const header = [...drawer.querySelector<HTMLElement>('[data-slot="sheet-header"]')!.children].map((el) => el.getAttribute("data-slot"));
    expect([header[0], header.at(-1)]).toEqual(["hud-drawer-title", "hud-drawer-close"]);
    expect(within(drawer).queryByRole("button", { name: "Back" })).toBeNull();
    await userEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: slow(5000) });
    await waitFor(() => expect(screen.getByRole("button", { name: /^League: / })).toHaveFocus());
  });

  it("the dock's Settings opens the HUD's drawer at the right (SETTINGS-PAGE), not the panel, and its Play the mode choice (HOME-DOCK)", async () => {
    wide();
    const router = open("/");
    await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    await userEvent.click(within(await screen.findByRole("navigation", { name: "Main" }, { timeout: slow(5000) })).getByRole("button", { name: "Settings" }));
    const drawer = await panel("Settings");
    expect(router.state.location.pathname).toBe("/settings");
    expect(drawer).toHaveAttribute("data-hud-drawer", "settings");
    expect(drawer).toHaveAttribute("data-side", "right");
    expect(village()).toBeInTheDocument();
    // One dialog: the side panel stays closed under it.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(within(drawer).queryByRole("button", { name: "Back" })).toBeNull();
    await clickOutside();
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    // The village takes the pointer and assistive technology back once the drawer has slid out.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: slow(5000) });
    await waitFor(() => expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: "Settings" })).toHaveFocus());
    await userEvent.click(within(await screen.findByRole("navigation", { name: "Main" }, { timeout: slow(5000) })).getByRole("button", { name: "Play" }));
    // PLAY-PAGE: Play is the HUD's drawer, not the panel.
    const play = await panel("Play");
    expect(play).toHaveAttribute("data-hud-drawer", "play");
    expect(await within(play).findByRole("heading", { name: "Paid" }, { timeout: slow(5000) })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/play");
  });

  it("the dock's Play opens the HUD's drawer at the right (PLAY-PAGE); the Challenge's stake is a view of it, its Back to the modes, the red cross out", async () => {
    wide();
    const router = open("/play/challenge");
    const drawer = await panel("Challenge");
    expect(drawer).toHaveAttribute("data-hud-drawer", "play");
    expect(drawer).toHaveAttribute("data-side", "right");
    expect(village()).toBeInTheDocument();
    // One dialog: the stake is the drawer's own panel, not a sheet over it.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const header = drawer.querySelector<HTMLElement>('[data-slot="sheet-header"]')!;
    // Back, the title, the stake's USDC at the end (the drawers' rule), the red cross.
    expect([...header.children].map((el) => el.getAttribute("data-slot"))).toEqual(["hud-drawer-back", "hud-drawer-title", "hud-drawer-end", "hud-drawer-close"]);
    expect(await within(drawer).findByRole("button", { name: "Raise the stake" }, { timeout: slow(5000) })).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/play"));
    expect(await panel("Play")).toBe(drawer);
    expect(within(drawer).getByRole("heading", { name: "Paid" })).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("the dock stays under the panel (DOCK-UNDER-PAGES, the owner's ask of 2026-11-04): veiled and blurred, the page leaving it no room", async () => {
    const router = open("/");
    await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    await act(() => router.navigate("/referral"));
    const referral = await panel("Referral");
    // The page leaves the dock no room at its end.
    expect(referral.querySelector<HTMLElement>("[data-slot=page-scroll]")!.style.paddingBottom).toBe("");
    // The veil (the Sheet's, `z-50`) stands over the dock's band (`z-20`), nothing raising it, and blurs it with the village (as the
    // HUD drawer's veil). jsdom applies no stylesheet: the `Dock` stories of Scenes/Home/Panels check what the screen shows.
    const veil = document.querySelector("[data-slot=sheet-overlay]")!;
    expect(veil).toHaveClass("z-50", "backdrop-blur-sm");
    const dock = screen.getByRole("navigation", { name: "Main", hidden: true });
    expect(dock.closest(".fixed.z-20")).not.toBeNull();
    // A tap there lands on the veil, which closes the panel.
    await clickOutside();
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: slow(5000) });
  });

  it("a reload with the panel open reopens it over the village; its close then replaces the entry with the home's", async () => {
    const router = open("/referral");
    await panel("Referral");
    await waitFor(() => expect(village()).toBeInTheDocument(), { timeout: slow(5000) });
    await panel("Referral");
    await clickOutside();
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.historyAction).toBe("REPLACE");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: slow(5000) });
  });

  it("has no close button; a click on the village closes it (#782)", async () => {
    // No control of the home opens a page of the panel any more (VAULT-PAGE): the focus's way back is the drawers' (above).
    const router = open("/");
    await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    await act(() => router.navigate("/referral"));
    const dialog = await panel("Referral");
    // Its accessible name stays (the dialog's title), and the keyboard's way out is Escape.
    expect(dialog).toHaveAccessibleName("Referral");
    expect(within(dialog).queryByRole("button", { name: "Close" })).toBeNull();
    await clickOutside();
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: slow(5000) });
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
    await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    await act(() => router.navigate("/referral"));
    await panel("Referral");
    await router.navigate(-1);
    expect(router.state.location.pathname).toBe("/");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: slow(5000) });
  });

  it("Settings' Themes opens in its drawer, in its place (SETTINGS-PAGE): Back goes back to Settings, the red cross to the village", async () => {
    wide();
    const router = open("/");
    await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    await userEvent.click(within(await screen.findByRole("navigation", { name: "Main" }, { timeout: slow(5000) })).getByRole("button", { name: "Settings" }));
    const settings = await panel("Settings");
    await userEvent.click(await within(settings).findByRole("button", { name: /^Themes/ }, { timeout: slow(5000) }));
    const themes = await panel("Themes");
    expect(themes).toBe(settings);
    expect(router.state.location.pathname).toBe("/settings/theme");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await userEvent.click(within(themes).getByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings"));
    expect(router.state.historyAction).toBe("POP");
    await userEvent.click(await within(await panel("Settings")).findByRole("button", { name: /^Themes/ }));
    await userEvent.click(within(await panel("Themes")).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.historyAction).toBe("POP");
  });

  it("a view reopened by Forward goes back to Settings on Escape's close, and the drawer to the home's entry: Back then never reopens it", async () => {
    wide();
    const router = open("/");
    await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) });
    await userEvent.click(within(await screen.findByRole("navigation", { name: "Main" }, { timeout: slow(5000) })).getByRole("button", { name: "Settings" }));
    await userEvent.click(await within(await panel("Settings")).findByRole("button", { name: /^Credits/ }, { timeout: slow(5000) }));
    await panel("Credits");
    await act(() => router.navigate(-2));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    // Forward, Forward: Settings, then its Credits, again.
    await act(() => router.navigate(1));
    await panel("Settings");
    await act(() => router.navigate(1));
    expect(router.state.location.pathname).toBe("/settings/credits");
    await panel("Credits");
    // Escape leaves the drawer, view and all, to the home's own entry.
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.historyAction).toBe("POP");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: slow(5000) });
    // The entries before are the home's alone: nothing of the drawer's is behind it.
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

  it("Missions is the HUD's drawer over the village, a full page with Back (MISSIONS-PAGE, the profile's pattern), the home's dock under it", async () => {
    const router = open("/missions");
    const drawer = await panel("Missions");
    expect(drawer).toHaveAttribute("data-hud-drawer", "missions");
    expect(village()).toBeInTheDocument();
    // The home's dock is there, under the page (DOCK-UNDER-PAGES), hidden from assistive technology while the drawer is open.
    expect(screen.getByRole("navigation", { name: "Main", hidden: true })).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(within(drawer).queryByRole("button", { name: "Close" })).toBeNull();
    // Opened directly: its Back goes up to the village in place.
    await userEvent.click(within(drawer).getByRole("button", { name: "Back" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.historyAction).toBe("REPLACE");
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
    ["a tab page", () => <TabPage title="Vault">Body</TabPage>, "Vault"],
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
    inPanel(<TabPage title="Themes" onBack={vi.fn()}>Body</TabPage>, false);
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });
});

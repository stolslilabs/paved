import { slow } from "../test-slow";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { formatUnits } from "../src/components/elements/amount";
import { Background } from "../src/components/elements/background";
import { Countdown, formatRemaining } from "../src/components/elements/countdown";
import { Score } from "../src/components/elements/score";
import { StatRow } from "../src/components/elements/stat-row";
import { AppNav } from "../src/components/containers/app-nav";
import { TabPage } from "../src/components/containers/tab-page";
import { formatPoints } from "../src/components/elements/score";
import { planCode } from "../src/components/elements/tile-chip";
import { TileView } from "../src/components/containers/tile-view";
import { BoardScene } from "../src/components/scenes/board-scene";
import { HomeVillageScene } from "../src/components/scenes/home-village-scene";
import type { LayoutBoardView } from "../src/components/containers/layout-board";
import { LoadingScene } from "../src/components/scenes/loading-scene";
import { OverScene } from "../src/components/scenes/over-scene";
import { PlayScene } from "../src/components/scenes/play-scene";
import { PurchaseScene, breakEvenScore } from "../src/components/scenes/purchase-scene";
import { rewardMarks } from "../src/components/containers/reward-estimate";
import { GameHud } from "../src/components/containers/game-hud";
import { MOCK_MARK_TEXT, MockMarkProvider } from "../src/components/containers/mock-mark";
import { CURVE_PLAYING } from "../src/mocks/games";
import { SOURCE_ASSETS, originalTileArt } from "../src/mocks/assets";
import { BOARD_38, CLOSINGS_38 } from "../src/mocks/board";
import { DAY, MOCK_NOW } from "../src/mocks/clock";
import { BOARD, OVER, PLAY, PURCHASE } from "../src/mocks/scenes";
import { DRAFT_VALID, HOME_POINTS, HOME_VILLAGE, LAYOUT_FULL, LAYOUT_GROWING, LAYOUT_RIVAL, LAYOUT_START, WONDER_POINTS } from "../src/mocks/village-v2";
import { canLift, layoutPoints, layoutScore, legalSpots } from "../src/components/containers/layout-rules";
import { PLAN } from "../src/mocks/village";
import { sceneTilesOf } from "../src/components/containers/village-layout-canvas";
import { leagueOf } from "../src/lib/pvp-rules";

/** The app's providers in miniature: `m` components and the nav's `layoutId` need a LazyMotion with `domMax`. */
const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

/** Points as the Score writes them. */
const pts = (n: number) => formatPoints(n);

describe("element helpers", () => {
  it("writes points with a comma every three digits", () => {
    expect(formatPoints(1270)).toBe("1,270");
    expect(formatPoints(980)).toBe("980");
  });

  it("cuts token amounts to their fraction", () => {
    expect(formatUnits(6_000_000n, 6, 2)).toBe("6.00");
    expect(formatUnits(8_429_000_000_000_000_000n, 18, 2)).toBe("8.42");
    expect(formatUnits(12_345_678_900n, 6, 2)).toBe("12,345.67");
  });

  it("counts the time left down to 0:00:00", () => {
    expect(formatRemaining(19 * 3600 + 5)).toBe("19:00:05");
    expect(formatRemaining(-10)).toBe("0:00:00");
  });

  it("reads a chain plan id as its nine letters", () => {
    expect(planCode(1)).toBe("CCCCCCCCC");
    expect(planCode(0)).toBe("");
  });
});

describe("Loading", () => {
  it("shows an indeterminate bar while the app boots: no value, the length unknown", () => {
    render(wrap(<LoadingScene />));
    expect(screen.getByRole("progressbar", { name: "Loading" })).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});

describe("Home (#753): the village with its overlays", () => {
  // Load-bound: the stage's cold chunk, then ten overlay clicks. Measured 6.7 to 15.4 s on a loaded machine (2026-11-01, after
  // #974's currency icons), past the 15 s default: the ceiling is twice the slowest.
  it("shows the village full screen with the right column, the Chat tab and the mission in progress, the rest the dock's", { timeout: slow(30_000) }, async () => {
    const on = { onPlay: vi.fn(), onChat: vi.fn(), onGuild: vi.fn(), onFriends: vi.fn(), onMissions: vi.fn(), onShop: vi.fn(), onVault: vi.fn(), onTiles: vi.fn(), onLeague: vi.fn(), onSettings: vi.fn(), onEditingChange: vi.fn() };
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} {...on} />));
    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeInTheDocument();
    // The stage (the board, the editor) is its own chunk: it arrives after the overlays. The file's first test imports it cold:
    // 1.5 s on a quiet machine, past the 5 s default on CI once the HUD drew its relief icons (#844).
    expect(await screen.findByRole("img", { name: /^Village layout of \d+ tiles/ }, { timeout: slow(10_000) })).toBeInTheDocument();
    // HOME-EDGES (the Paved UX Book's main screen): the right column's four tiles, their own chunk, Missions and Friends with their counts.
    const column = await screen.findByRole("navigation", { name: "Village" });
    expect(within(column).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Missions, 3 waiting", "Vault", "Friends, 2 waiting", "Tiles"]);
    // The overlays outside the dock (the dock's own are tested below): no Ranking, Shop, Guild, Settings or Play of their own.
    const overlay = (name: string | RegExp) => screen.getAllByRole("button", { name }).find((b) => !b.closest("nav[aria-label=Main]"))!;
    for (const name of ["Ranking", "Shop", "Guild, 1 waiting", "Settings", "Play"]) expect(overlay(name), name).toBeUndefined();
    for (const [name, handler] of [
      ["Chat, 3 waiting", on.onChat],
      ["Friends, 2 waiting", on.onFriends],
      ["Missions, 3 waiting", on.onMissions],
      ["Vault", on.onVault],
      ["Tiles", on.onTiles],
      [/^League: /, on.onLeague],
    ] as const) {
      await userEvent.click(overlay(name));
      expect(handler).toHaveBeenCalledTimes(1);
    }
    // The mission in progress opens Missions too: its title and counts in its name.
    await userEvent.click(screen.getByRole("button", { name: "Public Works, 4 of 8" }));
    expect(on.onMissions).toHaveBeenCalledTimes(2);
    // No Edit button (HOME-EDGES, the book's): the village score's capsule opens edit mode.
    expect(screen.queryByRole("button", { name: "Edit village" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /^Edit village, score/ }));
    expect(on.onEditingChange).toHaveBeenCalledWith(true);
  });

  it("has the dock at every width (#763, HOME-DOCK): Shop, Ranking (no page yet, END-CHEST), Play, Guild, Settings, each reaching its page", async () => {
    const onNavigate = vi.fn();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} onNavigate={onNavigate} />));
    // The dock is its own chunk on the home: a stand-in of its size holds its place until it comes.
    const nav = await screen.findByRole("navigation", { name: "Main" });
    // At every width: from `desktop` too, centred (HOME-DOCK); its band takes no tap, only the dock.
    expect(nav.className).not.toContain("desktop:hidden");
    expect(nav.parentElement!.className.split(" ")).toEqual(expect.arrayContaining(["pointer-events-none", "[&>*]:pointer-events-auto"]));
    expect(nav.parentElement!.className).not.toContain("desktop:hidden");
    const items = within(nav).getAllByRole("button");
    expect(items.map((b) => b.getAttribute("aria-label"))).toEqual(["Shop", "Ranking", "Play", "Guild, 1 waiting", "Settings"]);
    // No item current on the home; the guild's count on Guild; Ranking opens the Leaderboard (LEADERBOARD-PAGE).
    expect(within(nav).queryByRole("button", { current: "page" })).toBeNull();
    expect(within(within(nav).getByRole("button", { name: "Guild, 1 waiting" })).getByText("1")).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Ranking" })).not.toHaveAttribute("aria-disabled");
    for (const item of items) await userEvent.click(item);
    expect(onNavigate.mock.calls.map(([tab]) => tab)).toEqual(["shop", "ranking", "play", "guild", "settings"]);
  });

  it("HOME-EDGES: the right column at every width; the dial, the Chat tab and the mission stacked at the bottom left, above the dock", async () => {
    const onMissions = vi.fn();
    const onVault = vi.fn();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} onMissions={onMissions} onVault={onVault} seasonWheel={{ state: "summer", onNext: vi.fn(), read: null }} />));
    // The right column at every width (no `hidden`), centred in the band under the balances; taller than it, it wraps leftwards.
    const column = await screen.findByRole("navigation", { name: "Village" });
    expect(column.className.split(" ")).not.toContain("hidden");
    expect(column.className.split(" ")).toEqual(expect.arrayContaining(["flex-col", "flex-wrap-reverse", "content-start", "gap-2"]));
    expect(column.parentElement!.className.split(" ")).toEqual(
      expect.arrayContaining(["right-(--hud-inset-right)", "top-(--right-top)", "bottom-(--right-bottom)", "justify-center-safe", "pointer-events-none", "[&>*]:pointer-events-auto"]),
    );
    // Each button its icon and its name alone (the owner's ask: no asset, no box), on a 64 px square hit box drawing nothing.
    for (const tile of within(column).getAllByRole("button")) {
      expect(tile.className.split(" ")).toContain("size-16");
      expect(tile.className).not.toMatch(/\b(bg|shadow|border|rounded)-/);
      expect(tile.querySelectorAll("img:not([data-slot=ui-icon])")).toHaveLength(0);
    }
    // The left column keeps the capsules and the chips: no Missions or Vault in it any more, clear of the tiles (80 px, 96 from `tablet`).
    const left = (await screen.findByRole("button", { name: /^League: / })).closest<HTMLElement>("[data-slot=scroll-region]")!;
    expect(within(left).queryByRole("button", { name: /^(Missions|Vault)/ })).toBeNull();
    expect(left.className.split(" ")).toEqual(expect.arrayContaining(["right-20", "tablet:right-24"]));
    // Settings and Play are the dock's alone, at every width (HOME-DOCK).
    for (const name of ["Settings", "Play"]) expect(screen.getAllByRole("button", { name }).every((b) => b.closest("nav[aria-label=Main]"))).toBe(true);
    // The bottom left (the owner's ask: the mission at the left, just above the dock, as the chat): the dial, the Chat tab, the
    // mission, in that order, clear of the dock's measured height below `desktop` and of its crest (the PLAY medallion) on a phone.
    const place = document.querySelector<HTMLElement>("[data-dial-place]")!;
    expect(place.className).toContain("bottom-[calc(var(--app-nav-h)+0.5rem)]");
    expect(place.style.marginBottom).toBe("var(--dock-crest)");
    const chat = await within(place).findByRole("button", { name: "Chat, 3 waiting" });
    const mission = within(place).getByRole("button", { name: "Public Works, 4 of 8" });
    const dial = await within(place).findByRole("button", { name: /^Season/ });
    expect(dial.compareDocumentPosition(chat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chat.compareDocumentPosition(mission) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(mission);
    expect(onMissions).toHaveBeenCalledTimes(1);
    // Its counts close ("4/8", the owner's ask) and its task under the title in place of a bar: the ring tells the progress.
    expect(mission.querySelector("[data-slot=mission-count]")).toHaveTextContent(/^4\/8$/);
    expect(mission).toHaveTextContent("Score roads and cities in a day");
    expect(mission.querySelector(".bg-medal-1")).toBeNull();
    // No HUD frame, no border (the owner's asks): a veil under it, blurred, its edges faded by a mask (jsdom keeps no `mask-image`:
    // the stories show it).
    expect(mission.querySelector("[data-slot=hud-frame]")).toBeNull();
    expect(mission.querySelector("[data-slot=mission-veil]")!.className.split(" ")).toEqual(expect.arrayContaining(["absolute", "-z-10", "backdrop-blur-sm"]));
  });

  it("HOME-EDGES: no mission tab without a mission in progress (none read, every daily done)", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} mission={null} />));
    await screen.findByRole("button", { name: "Chat, 3 waiting" });
    expect(screen.queryByRole("button", { name: /^Public Works/ })).toBeNull();
  });

  it("HOME-OVERLAYS (#856, #929, HOME-EDGES): the right column's tiles 8 px apart and centred in its band, the left one's controls 12 px apart at its top; no League in the right column; no Edit button", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.shielded} seasonWheel={{ state: "summer", onNext: vi.fn(), read: null }} />));
    await screen.findByRole("button", { name: /^League: / });
    const right = await screen.findByRole("navigation", { name: "Village" });
    const league = screen.getByRole("button", { name: /^League: / });
    const left = league.closest<HTMLElement>("[data-slot=scroll-region]")!;
    expect(right.className.split(" ")).toEqual(expect.arrayContaining(["flex-col", "gap-2"]));
    expect(left.className.split(" ")).toEqual(expect.arrayContaining(["flex-col", "gap-3"]));
    // HOME-UI-CAPSULES: in it, the crowns', the shield's and the village's capsules stretched to one width, 4 px apart.
    const capsules = league.parentElement!;
    expect(capsules).toHaveAttribute("data-slot", "home-capsules");
    expect(capsules.className.split(" ")).toEqual(expect.arrayContaining(["flex-col", "items-stretch", "gap-1"]));
    expect(capsules.parentElement).toBe(left);
    expect(right.parentElement!.className.split(" ")).toContain("justify-center-safe");
    // HOME-STACK (#929): the League control and the village score stacked at the top under the profile (flex's start), at every width.
    expect(left.className.split(" ")).not.toEqual(expect.arrayContaining([expect.stringMatching(/^justify-/)]));
    // Each column's band, measured off its neighbours (the browser's layout, the stories' captures): under the balances and above
    // the bottom row on the right, under the profile and above the bottom left's stack (the dial, Chat, the mission) on the left.
    expect(right.parentElement!.className.split(" ")).toEqual(expect.arrayContaining(["top-(--right-top)", "bottom-(--right-bottom)"]));
    expect(left.className.split(" ")).toEqual(expect.arrayContaining(["top-(--left-top)", "bottom-(--left-bottom)"]));
    // Taller than its band (shielded, the score unfolded, a short screen), the left column scrolls within it, never over the dial:
    // `ScrollRegion`'s box, its edge hint attached once the stage's chunk is in (the hint marks the axis that scrolls, none here).
    expect(left).toHaveAttribute("data-slot", "scroll-region");
    expect(left.className.split(" ")).toEqual(expect.arrayContaining(["scroll-hint", "overflow-y-auto", "overscroll-contain"]));
    // The left column holds the League control, the village score and the shield's capsule, in that order, then the chips.
    await waitFor(() => expect(left.querySelector("[data-slot=shield-plate]")).not.toBeNull());
    const order = [left.querySelector("[data-slot=league-control]"), left.querySelector("[data-slot=village-score]"), left.querySelector("[data-slot=shield-plate]")];
    for (const el of order) expect(el).not.toBeNull();
    for (let i = 1; i < order.length; i++) expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const el of order) expect(capsules.contains(el)).toBe(true);
    // No League in the right column (#856): the four tiles only (HOME-DOCK: Chests and Shop are the dock's).
    expect(within(right).queryByRole("button", { name: /^League/ })).toBeNull();
    // No Edit button (HOME-EDGES): the village score's capsule is the way to edit mode; Settings and Play the dock's (HOME-DOCK).
    expect(screen.queryByRole("button", { name: "Edit village" })).toBeNull();
    expect(screen.getByRole("button", { name: /^Edit village, score/ }).closest("[data-slot=village-score]")).not.toBeNull();
  });

  it("HOME-HUD-PADDING: one inset at the top and on both sides, the notch's safe area added to the token, the balances on the profile's painted edge", async () => {
    // The token: the spacing scale's 2 on a phone, its 4 from `tablet`, each edge's safe area added there, never by an element.
    const css = readFileSync(join(process.cwd(), "src/styles/theme.css"), "utf8");
    expect(css).toMatch(/--hud-inset: calc\(var\(--spacing\) \* 2\);\s*@media \(width >= 40rem\) \{\s*--hud-inset: calc\(var\(--spacing\) \* 4\);/);
    for (const edge of ["top", "left", "right"]) expect(css).toContain(`--hud-inset-${edge}: calc(var(--hud-inset) + env(safe-area-inset-${edge}));`);
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} seasonWheel={{ state: "summer", onNext: vi.fn(), read: null }} chat={3} />));
    const box = document.querySelector<HTMLElement>("[data-slot=home-overlays]")!;
    const classes = (el: Element | null | undefined) => el!.className.split(" ");
    // The top row: the profile and the balances off the top and both sides by the token alone.
    const balances = (await waitFor(() => box.querySelector("[data-slot=home-phone-balances]")!)).parentElement!;
    const row = balances.parentElement!.parentElement!;
    expect(classes(row)).toEqual(expect.arrayContaining(["pt-(--hud-inset-top)", "pr-(--hud-inset-right)", "pl-(--hud-inset-left)"]));
    expect(row.className).not.toMatch(/\b(tablet:)?p[tlrx]?-\d|safe-area/);
    // The phone's plates moved by their art's margin onto the profile's painted edge, only while plates are drawn (a guest's
    // Connect keeps the plain inset) and only below `desktop` (the wrapper is the phone's; the column and the rail stay put). The
    // alignment itself is measured on the painted pixels by the `HudInset*` stories' play (`stories/hud-inset-guide.tsx`).
    const phonePlates = box.querySelector("[data-slot=home-phone-balances]")!;
    expect(classes(phonePlates)).toEqual(expect.arrayContaining(["desktop:hidden", "has-[[data-slot=hud-frame]]:-mt-1.5", "has-[[data-slot=hud-frame]]:-mr-1"]));
    // The capsules on the same painted edge, below `desktop` only.
    expect(classes(box.querySelector("[data-slot=home-capsules]"))).toEqual(expect.arrayContaining(["-ml-0.75", "desktop:ml-0"]));
    expect(balances.className).not.toMatch(/(^|\s)(desktop:)?-m[trxy]?-/);
    expect(classes(balances)).toEqual(expect.arrayContaining(["top-0", "right-0"]));
    // The capsules' column, the dial, the mission, the right column and the bottom row on the same sides. The Chat tab alone runs
    // to the screen's edge (the book's), the left safe area inside it.
    expect(classes(box.querySelector("[data-slot=scroll-region]"))).toContain("pl-(--hud-inset-left)");
    const place = box.querySelector<HTMLElement>("[data-dial-place]")!;
    expect(classes(place)).toContain("left-0");
    expect(classes(place.firstElementChild)).toContain("pl-(--hud-inset-left)");
    const chat = await within(place).findByRole("button", { name: "Chat, 3 waiting" });
    // jsdom drops `env()`: the tab's safe area (its width and padding) is the stories' (HudInsetNotchSideways).
    expect(chat.parentElement).toBe(place);
    expect(classes(within(place).getByRole("button", { name: /^Public Works/ }).parentElement)).toContain("pl-(--hud-inset-left)");
    expect(classes((await screen.findByRole("navigation", { name: "Village" })).parentElement)).toContain("right-(--hud-inset-right)");
    expect(classes(place.parentElement!.nextElementSibling)).toContain("right-(--hud-inset-right)");
  });

  it("HOME-EDGES: Chat a tab on the screen's left edge, Friends a tile of the right column, each with its count; no Social nav (Guild the dock's)", async () => {
    const on = { onChat: vi.fn(), onFriends: vi.fn() };
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} {...on} seasonWheel={{ state: "summer", onNext: vi.fn(), read: null }} />));
    const chat = await screen.findByRole("button", { name: "Chat, 3 waiting" });
    const friends = within(await screen.findByRole("navigation", { name: "Village" })).getByRole("button", { name: "Friends, 2 waiting" });
    expect(screen.queryAllByRole("navigation", { name: "Social" })).toEqual([]);
    expect(screen.queryByRole("button", { name: /^Social/ })).toBeNull();
    // The book's orange tab (kept at the owner's ask), its icon and its count; Friends its icon alone.
    expect(chat.querySelector("img[src*='chat-tab']")).not.toBeNull();
    expect(chat.querySelector("[data-slot=ui-icon][data-icon=chat]")).not.toBeNull();
    expect(within(chat).getByText("3")).toBeInTheDocument();
    expect(friends.querySelector("[data-slot=ui-icon][data-icon=friends]")).not.toBeNull();
    expect(within(friends).getByText("2")).toBeInTheDocument();
    // Off the screen in the Camera mode by their nearest edges (CAMERA-EXPLORE): Chat with the bottom left, Friends with the right column.
    expect(chat.closest("[data-out]")).toHaveAttribute("data-out", "l0");
    expect(friends.closest("[data-out]")).toHaveAttribute("data-out", "r0");
    await userEvent.click(chat);
    await userEvent.click(friends);
    expect(on.onChat).toHaveBeenCalledTimes(1);
    expect(on.onFriends).toHaveBeenCalledTimes(1);
  });

  it("draws the edges' buttons with the HUD's icons (HOME-EDGES); no Edit button; Play is the dock's medallion (HOME-DOCK)", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} />));
    expect(screen.queryAllByRole("button", { name: "Play" }).filter((b) => !b.closest("nav[aria-label=Main]"))).toEqual([]);
    expect(screen.queryByRole("button", { name: "Edit village" })).toBeNull();
    // The book's art (#844's relief icons gave way to the HUD's): each button's icon a HUD icon, drawn at the first paint of its chunk.
    const column = await screen.findByRole("navigation", { name: "Village" });
    for (const [name, icon] of [
      [/^Missions/, "missions"],
      [/^Vault/, "vault"],
      [/^Friends/, "friends"],
      [/^Tiles/, "tile-stack"],
    ] as const) {
      expect(within(column).getByRole("button", { name }).querySelector(`[data-slot=ui-icon][data-icon=${icon}]`), String(name)).not.toBeNull();
    }
    expect(screen.getByRole("button", { name: /^Chat/ }).querySelector("[data-slot=ui-icon][data-icon=chat]")).not.toBeNull();
    expect(screen.getByRole("button", { name: /^Public Works/ }).querySelector("[data-slot=ui-icon][data-icon=hammer]")).not.toBeNull();
    for (const button of [...within(column).getAllByRole("button"), screen.getByRole("button", { name: /^Chat/ })]) expect(button.querySelector("[data-slot=game-icon]")).toBeNull();
    // The crowns' capsule (HOME-UI-CAPSULES): the HUD's crown, no game icon; the league's crest is the player card's.
    const league = screen.getByRole("button", { name: /^League: / });
    expect(league.querySelectorAll("[data-slot=game-icon]")).toHaveLength(0);
    expect(league.querySelector("[data-slot=ui-icon][data-icon=crown]")).not.toBeNull();
    // The defence log is the league page's: no overlay button. League is labelled plainly, the badge shows which.
    expect(screen.queryByRole("button", { name: /^Defence/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^League,/ })).toBeNull();
  });

  it("shows the League control under the profile: the crown and the crowns, no league name; a tap opens the league (#829)", async () => {
    const onLeague = vi.fn();
    const { unmount } = render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} onLeague={onLeague} />));
    const name = leagueOf(1_240).name;
    const standing = await screen.findByRole("button", { name: `League: ${name}, 1,240 crowns` });
    // The crowns in the capsule, the crown capping its left end; the league in its data and its accessible name only.
    expect(standing).toHaveTextContent(/^1,240$/);
    expect(standing).toHaveAttribute("data-league", leagueOf(1_240).id);
    expect(standing).toHaveAttribute("data-tier", leagueOf(1_240).id);
    expect(standing.querySelector("[data-icon=trophy]")).toBeNull();
    expect(standing.querySelector("[data-slot=ui-icon][data-icon=crown]")).not.toBeNull();
    await userEvent.click(standing);
    expect(onLeague).toHaveBeenCalledTimes(1);
    unmount();
    // Before any PvP: Wood with 0 crowns, still the way to the league.
    // Merged over the view's fixture, as the Start story's args are: its own `league: null` wins.
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} {...HOME_VILLAGE.start} onLeague={onLeague} />));
    await userEvent.click(await screen.findByRole("button", { name: `League: ${leagueOf(0).name}, 0 crowns` }));
    expect(onLeague).toHaveBeenCalledTimes(2);
  });

  it("the League control reads Unranked before any crown and any attack (#917)", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} {...HOME_VILLAGE.unranked} />));
    const standing = await screen.findByRole("button", { name: "League: Unranked, 0 crowns" });
    expect(standing).toHaveAttribute("data-tier", "unranked");
  });

  it("carries today's home content as chips: Resume and the spawn pause", async () => {
    const onResume = vi.fn();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.paused} onResume={onResume} />));
    await userEvent.click(screen.getByRole("button", { name: "Resume Challenge #1042" }));
    expect(onResume).toHaveBeenCalledWith(1042);
    expect(screen.getByText("New Challenge games are paused")).toBeInTheDocument();
  });

  it("asks no one to connect (NO-GUEST): a village to look at has no Edit and no guest's line", () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} readOnly />));
    expect(screen.queryByText(/guest/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit village" })).not.toBeInTheDocument();
  });

  it("offers Found in Edit's place before the village is founded", () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.unfounded} />));
    expect(screen.getByRole("button", { name: "Found" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit village" })).not.toBeInTheDocument();
  });

  it("paints the overlays while the village is on its way", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.loading} />));
    // The overlays are there (the right column's Missions, its own chunk, HOME-EDGES); Play is the dock's (its own chunk, HOME-DOCK).
    expect(within(await screen.findByRole("navigation", { name: "Village" })).getByRole("button", { name: /^Missions/ })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /^Village layout/ })).not.toBeInTheDocument();
  });

  it("the village score's capsule asks for edit mode; in it, the editor's overlays replace the view's in the same scene", async () => {
    const onEditingChange = vi.fn();
    const { rerender } = render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} onEditingChange={onEditingChange} />));
    await userEvent.click(screen.getByRole("button", { name: /^Edit village, score/ }));
    expect(onEditingChange).toHaveBeenCalledWith(true);
    rerender(wrap(<HomeVillageScene {...HOME_VILLAGE.view} editing onEditingChange={onEditingChange} />));
    // The bar's title: "Edit" on a phone; "Edit village" in the side menu's head from `tablet` (its second word from `desktop`).
    expect(await screen.findByRole("heading", { name: "Edit" }, { timeout: slow(5000) })).toBeInTheDocument();
    expect(await screen.findByRole("complementary", { name: "Editor" }, { timeout: slow(5000) })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Village" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Play/ })).not.toBeInTheDocument();
    // Edit mode has no bar (#763): the editor's panel takes the bottom.
    expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
    // Nothing changed: Back leaves edit mode at once.
    await userEvent.click(screen.getByRole("button", { name: "Leave edit mode" }));
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
  });

  it("holds the inventory alone in a phone's bottom sheet, the points at the top left, no tab and no fold (EDIT-VILLAGE)", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.editing} />));
    // jsdom has no wide screen: a phone's sheet, the inventory under its title, the slots used in a carved chip under it (TILE-COUNTS).
    const panel = await screen.findByRole("complementary", { name: "Editor" }, { timeout: slow(5000) });
    expect(panel).toHaveAttribute("data-edit-panel", "sheet");
    // The floating bar's title: "Edit" at every phone's width (the owner's ask: room down to 320 px).
    expect(screen.getByRole("heading", { name: "Edit" })).not.toHaveClass("hidden");
    expect(within(panel).getByRole("heading", { name: "Inventory" })).toBeInTheDocument();
    const slots = within(panel).getByRole("img", { name: /^\d+ of \d+ slots used$/ });
    expect(slots.closest('[data-slot="edit-slots"]')).not.toBeNull();
    expect(within(panel).getByRole("heading", { name: "Inventory" }).parentElement).not.toContainElement(slots);
    expect(within(panel).getByRole("region", { name: "Inventory tiles" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("button", { name: /editor/i })).toBeNull();
    // The points: the live score and its lines, out of the sheet.
    const points = screen.getByRole("region", { name: "Village points" });
    expect(panel).not.toContainElement(points);
    expect(within(points).getByRole("img", { name: /^Score [\d,]+$/ })).toBeInTheDocument();
  });

  it("from tablet, docks the bar in the side menu's head, the drawers' close at its end, the inventory under it (EDIT-VILLAGE, the owner's asks)", async () => {
    // A tablet's window: the tablet's width query matches, not the desktop's.
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("min-width: 40rem"), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    try {
      render(wrap(<HomeVillageScene {...HOME_VILLAGE.editing} />));
      const panel = await screen.findByRole("complementary", { name: "Editor" }, { timeout: slow(5000) });
      expect(panel).toHaveAttribute("data-edit-panel", "side");
      const bar = screen.getByRole("button", { name: "Leave edit mode" }).closest("[data-edit-bar]")!;
      expect(bar).toHaveAttribute("data-edit-bar", "docked");
      expect(within(bar as HTMLElement).getByRole("heading", { name: "Edit village" })).toBeInTheDocument();
      expect(within(bar as HTMLElement).getByRole("button", { name: /^Save$/ })).toBeInTheDocument();
      // The close last, as the drawers' side panel's: no Back before the title.
      const controls = within(bar as HTMLElement).getAllByRole("button");
      expect(controls[controls.length - 1]).toHaveAccessibleName("Leave edit mode");
      // The drawers' body under their band.
      expect(panel.firstElementChild).toHaveClass("bg-secondary");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("asks before leaving edit mode with changes, and keeps them on Keep editing", async () => {
    const onEditingChange = vi.fn();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.changed} onEditingChange={onEditingChange} />));
    await userEvent.click(screen.getByRole("button", { name: "Leave edit mode" }));
    const dialog = await screen.findByRole("dialog", { name: "Leave without saving?" });
    // In the HUD drawers' look (EDIT-VILLAGE): their red close keeps editing, Leave with the way out, nothing else.
    expect(within(dialog).getByRole("button", { name: "Keep editing" }).querySelector("[data-slot=ui-icon][data-icon=close]")).not.toBeNull();
    expect(within(dialog).getByRole("button", { name: "Leave" }).querySelector("[data-slot=ui-icon][data-icon=exit]")).not.toBeNull();
    expect(within(dialog).getAllByRole("button")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(onEditingChange).not.toHaveBeenCalled();
    // The dialog's exit over, the scene is reachable again.
    await userEvent.click(await screen.findByRole("button", { name: "Leave edit mode" }));
    await userEvent.click(await screen.findByRole("button", { name: "Leave" }));
    expect(onEditingChange).toHaveBeenCalledWith(false);
  });

  it("places tiles as the boards (#756): the 3D scene gets the bubble, clear of the bar and the panel; no Discard, Reset all in the bar", async () => {
    const views: LayoutBoardView[] = [];
    const renderCanvas = (view: LayoutBoardView) => {
      views.push(view);
      return <div data-testid="canvas" />;
    };
    const { unmount } = render(wrap(<HomeVillageScene {...HOME_VILLAGE.placing} renderCanvas={renderCanvas} />));
    await screen.findByTestId("canvas", {}, { timeout: slow(5000) });
    const view = views[views.length - 1]!;
    // The bubble goes to the scene, by the placed tile: Rotate and Back to the inventory, no Validate, no Cancel for an inventory tile.
    expect(view.bubble).toMatchObject({ cell: { x: view.pending!.x, y: view.pending!.y }, cancelButton: false });
    expect(view.bubble!.onReturn).toBeTypeOf("function");
    expect(view.bubble!.onConfirm).toBeUndefined();
    expect(screen.queryByRole("toolbar", { name: "Tile" })).toBeNull();
    expect(screen.getByRole("complementary", { name: "Editor" })).toHaveAttribute("data-bubble-avoid");
    expect(screen.getByRole("button", { name: "Leave edit mode" }).closest("[data-bubble-avoid]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Leave edit mode" }).closest("header")).toContainElement(screen.getByRole("button", { name: /^Hold to erase the layout/ }));
    // Erase and Save painted as the die (EDIT-VILLAGE): the eraser and the floppy disk on the HUD's disc, no Font Awesome glyph.
    expect(screen.getByRole("button", { name: /^Hold to erase the layout/ }).querySelector("[data-slot=ui-icon][data-icon=erase]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Save" }).querySelector("[data-slot=ui-icon][data-icon=save]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Save" }).querySelector(".fa-floppy-disk, svg")).toBeNull();
    expect(screen.queryByRole("button", { name: "Discard changes" })).toBeNull();
    unmount();
    // The plan view keeps the still bubble in the panel.
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.placing} />));
    const bubble = await screen.findByRole("toolbar", { name: "Tile" }, { timeout: slow(5000) });
    expect(bubble).toHaveAttribute("data-follows", "hand");
    expect(within(bubble).getByRole("button", { name: "Back to the inventory" })).toBeInTheDocument();
  });
});

describe("Home's points by structure (#758)", () => {
  /** The canvas's view, last drawn. */
  const canvas = () => {
    const views: LayoutBoardView[] = [];
    const renderCanvas = (view: LayoutBoardView) => {
      views.push(view);
      return <div data-testid="canvas" />;
    };
    return { renderCanvas, last: () => views[views.length - 1]! };
  };
  const lineButtons = () => within(screen.getByRole("list", { name: "Points by structure" })).getAllByRole("button");

  it("adds up to the score shown on the mock's villages, the most points first", () => {
    for (const tiles of [LAYOUT_START.tiles, LAYOUT_GROWING.tiles, LAYOUT_FULL.tiles, LAYOUT_RIVAL.tiles, DRAFT_VALID]) {
      const { lines, other, score } = layoutPoints(tiles);
      expect(score).toBe(layoutScore(tiles));
      expect(lines.reduce((sum, l) => sum + l.points, 0) + other).toBe(score);
      expect(lines.map((l) => l.points)).toEqual([...lines.map((l) => l.points)].sort((a, b) => b - a));
    }
  });

  it("in view, lights nothing and opens no panel: the structure lines are edit mode's (#758, HOME-UI-CAPSULES)", async () => {
    const { renderCanvas, last } = canvas();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} renderCanvas={renderCanvas} />));
    await screen.findByTestId("canvas", {}, { timeout: slow(5000) });
    expect(screen.queryByRole("list", { name: "Score by kind" })).toBeNull();
    expect(last().lit).toBeNull();
    expect(screen.queryByRole("region", { name: "Village points" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Points by structure" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lights a Wonder's tile alone in edit mode, its line still counting the whole structure (#792)", async () => {
    const wonder = WONDER_POINTS.lines.find((l) => l.category === "Wonder")!;
    expect(wonder.tiles).toBe(9);
    expect(wonder.areas).toHaveLength(9);
    expect(wonder.lit).toHaveLength(1);
    const [centre] = wonder.lit;
    const cells = new Set(wonder.areas.map((a) => `${a.x},${a.y}`));
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) expect(cells.has(`${centre!.x + dx},${centre!.y + dy}`)).toBe(true);
    // On the scene: its lit areas are the wonder's tile's.
    const { renderCanvas, last } = canvas();
    const { unmount } = render(wrap(<HomeVillageScene {...HOME_VILLAGE.editingPointsWonder} renderCanvas={renderCanvas} />));
    await screen.findByTestId("canvas", {}, { timeout: slow(5000) });
    expect(last().lit).toEqual(wonder.lit);
    expect(within(screen.getByRole("list", { name: "Points by structure" })).getByRole("button", { pressed: true })).toHaveTextContent(formatPoints(wonder.points));
    unmount();
    // On the plan view: the wonder's cell alone ringed.
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.editingPointsWonder} />));
    const plan = await screen.findByRole("group", { name: /^Village layout of/ }, { timeout: slow(5000) });
    expect([...plan.querySelectorAll("[data-lit]")].map((c) => c.getAttribute("data-cell"))).toEqual([`${centre!.x},${centre!.y}`]);
  });

  it("in edit mode, the points follow the draft live: the light stays while its structure does, else goes off", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.editingPoints} />));
    const plan = await screen.findByRole("group", { name: /^Village layout of/ }, { timeout: slow(5000) });
    await screen.findByRole("list", { name: "Points by structure" }, { timeout: slow(5000) });
    const line = HOME_POINTS.lines[1]!;
    const litCells = () => [...plan.querySelectorAll("[data-lit]")].map((c) => c.getAttribute("data-cell")).sort();
    const cells = line.areas.map((a) => `${a.x},${a.y}`).sort();
    expect(litCells()).toEqual(cells);
    expect(lineButtons()[1]).toHaveAttribute("aria-pressed", "true");
    // A road placed where the lit structure stays: the lines follow (the live score), the light stays.
    const spots = legalSpots(LAYOUT_GROWING.tiles, PLAN.road);
    const placed = (s: (typeof spots)[number]) => [...LAYOUT_GROWING.tiles, { id: 999, plan: PLAN.road, orientation: s.orientations.includes(1) ? 1 : s.orientations[0]!, x: s.x, y: s.y }];
    const spot = spots.find((s) => layoutPoints(placed(s)).lines.some((l) => l.key === line.key))!;
    const next = layoutPoints(placed(spot));
    // The tile from the inventory: the light stays.
    await userEvent.click(within(screen.getByRole("region", { name: "Inventory tiles" })).getByRole("button", { name: /^Long road, \d+ left$/ }));
    await userEvent.click(plan.querySelector<HTMLButtonElement>(`[data-kind="plate"][data-cell="${spot.x},${spot.y}"]`)!);
    expect(litCells()).toEqual(cells);
    expect(lineButtons()).toHaveLength(next.lines.length);
    expect(await screen.findByRole("img", { name: new RegExp(`^Score ${formatPoints(next.score)}(,|$)`) })).toBeInTheDocument();
    expect(litCells()).toEqual(cells);
    // A tile of the lit structure sent back to the inventory: the structure is gone, the light with it.
    const tile = LAYOUT_GROWING.tiles.find((t) => cells.includes(`${t.x},${t.y}`) && canLift(placed(spot), t.id))!;
    await userEvent.click(plan.querySelector<HTMLButtonElement>(`[data-tile="${tile.id}"]`)!);
    await userEvent.click(screen.getByRole("button", { name: "Back to the inventory" }));
    expect(litCells()).toEqual([]);
    expect(lineButtons().every((b) => b.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("in edit mode, lights the whole structure on the scene, the tile under the bubble included", async () => {
    const { renderCanvas, last } = canvas();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.editingPoints} renderCanvas={renderCanvas} />));
    await screen.findByTestId("canvas", {}, { timeout: slow(5000) });
    const line = HOME_POINTS.lines[1]!;
    const cells = line.areas.map((a) => `${a.x},${a.y}`).sort();
    const litIds = () => sceneTilesOf(last()).lit!.map((l) => l.id);
    expect(litIds()).toHaveLength(cells.length);
    // A tile of the lit structure lifted: under the bubble, it is no longer one of the layout's tiles, but the light keeps it.
    const tile = LAYOUT_GROWING.tiles.find((t) => cells.includes(`${t.x},${t.y}`) && canLift(LAYOUT_GROWING.tiles, t.id))!;
    act(() => last().onTile!(tile));
    expect(last().pending).toMatchObject({ id: tile.id, x: tile.x, y: tile.y });
    expect(last().tiles.some((t) => t.id === tile.id)).toBe(false);
    expect(last().lit).toEqual(line.areas);
    const drawn = sceneTilesOf(last());
    // Drawn as a placed tile while lit (the ghost takes no feature light), each cell of the structure lit.
    expect(drawn.ghost).toBeNull();
    expect(drawn.tiles.find((t) => t.id === tile.id)).toMatchObject({ x: tile.x, y: tile.y, plan: tile.plan });
    expect(drawn.lit!.map((l) => l.id)).toContain(tile.id);
    expect(drawn.lit!.map((l) => { const t = drawn.tiles.find((d) => d.id === l.id)!; return `${t.x},${t.y}`; }).sort()).toEqual(cells);
    // The light off: the tile under the bubble is the ghost again.
    await userEvent.click(lineButtons()[1]!);
    expect(sceneTilesOf(last())).toMatchObject({ ghost: { id: tile.id }, lit: null });
    expect(sceneTilesOf(last()).tiles.some((t) => t.id === tile.id)).toBe(false);
  });

  it("in edit mode, every structure's line stands at the top left, nothing lit first; the lit line's tap or leaving turns the light off", async () => {
    const { renderCanvas, last } = canvas();
    const onEditingChange = vi.fn();
    const props = { ...HOME_VILLAGE.editing, renderCanvas, onEditingChange };
    const { rerender } = render(wrap(<HomeVillageScene {...props} />));
    await screen.findByTestId("canvas", {}, { timeout: slow(5000) });
    // The lines always shown (EDIT-VILLAGE, the owner's choice of 2026-11-05), none lit.
    await screen.findByRole("list", { name: "Points by structure" }, { timeout: slow(5000) });
    expect(lineButtons()).toHaveLength(HOME_POINTS.lines.length);
    expect(last().lit).toBeNull();
    await userEvent.click(lineButtons()[0]!);
    expect(last().lit).toEqual(HOME_POINTS.lines[0]!.areas);
    // The lit line's tap turns it off.
    await userEvent.click(lineButtons()[0]!);
    expect(last().lit).toBeNull();
    await userEvent.click(lineButtons()[0]!);
    expect(last().lit).not.toBeNull();
    rerender(wrap(<HomeVillageScene {...props} editing={false} />));
    expect(last().lit).toBeNull();
  });
});

describe("Play", () => {
  // PLAY-PAGE: the Paved UX Book's "modes", then the owner's asks of 2026-11-06: Ranked before Paid, each mode's gift of what it pays,
  // no Free Challenge, a Limited section to come.
  it("lists the groups in the owner's order, each mode with its gift of rewards", async () => {
    const onChallenge = vi.fn();
    render(wrap(<PlayScene {...PLAY.connected} onChallenge={onChallenge} onAttack={() => {}} />));
    expect(screen.getByRole("dialog", { name: "Play" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Ranked", "Paid", "Free", "Limited"]);
    const challenge = screen.getByRole("button", { name: /^Challenge/ });
    expect(challenge).toHaveTextContent(/^ChallengeBeat the threshold$/);
    await userEvent.click(challenge);
    expect(onChallenge).toHaveBeenCalledOnce();
    expect(screen.getByRole("img", { name: "Rewards: PAVED, XP, chests" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Attack/ })).toHaveTextContent("Raid a rival village");
    expect(screen.getByRole("img", { name: "Rewards: crowns, XP, chests" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Training/ })).toHaveTextContent("TrainingA full game, just for practice");
    expect(screen.getByRole("button", { name: /^Training/ })).not.toHaveAccessibleName(/Rewards/);
    expect(screen.getByRole("button", { name: /^Story/ })).toHaveTextContent(/^StoryLearn the rules, level by level/);
    expect(screen.getByRole("button", { name: /^Story/ })).toHaveAccessibleName(/Rewards: XP, chests$/);
    expect(screen.getByRole("button", { name: "Coming soon" })).toBeDisabled();
    // No price tag, no free game, no Multiplayer.
    expect(screen.queryByText(/USDC|earn PAVED/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Free Challenge/ })).toBeNull();
    expect(screen.queryByText(/Multiplayer/)).toBeNull();
  });

  it("shows a running Challenge's time left and score in place of its gift, and resumes it", async () => {
    const onResume = vi.fn();
    const onChallenge = vi.fn();
    render(wrap(<PlayScene {...PLAY.running} onResume={onResume} onChallenge={onChallenge} />));
    expect(screen.queryByRole("img", { name: "Rewards: PAVED, XP, chests" })).toBeNull();
    expect(screen.getByText("19h 0m")).toBeInTheDocument();
    expect(screen.getByLabelText(`Score ${pts(PLAY.running.running.score)}`)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: `Resume Challenge #${PLAY.running.running.id}` }));
    expect(onResume).toHaveBeenCalledWith(PLAY.running.running.id);
    expect(onChallenge).not.toHaveBeenCalled();
  });

  it("opens the Challenge and Attack on a tap, no Connect first (NO-GUEST)", async () => {
    const onChallenge = vi.fn();
    const onAttack = vi.fn();
    render(wrap(<PlayScene {...PLAY.connected} onChallenge={onChallenge} onAttack={onAttack} />));
    await userEvent.click(screen.getByRole("button", { name: /^Challenge/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Attack/ }));
    expect([onChallenge, onAttack].map((f) => f.mock.calls.length)).toEqual([1, 1]);
    expect(screen.queryByText(/connect/i)).toBeNull();
  });

  // #1041: the gift is drawn above the card's stretched button (`after:inset-0`); it takes no pointer, so a tap on it is the button's.
  // jsdom has no layout: `tapAt` stands in for the browser's hit test, the topmost element under the point that takes pointers.
  it("a tap on Attack's or the Challenge's gift chooses that mode; Resume stays its own control", async () => {
    const tapAt = async (el: HTMLElement) => {
      const through = el.closest(".pointer-events-none");
      const beneath = through ? through.closest(".drawer-tile")!.querySelector<HTMLElement>("button[class*='after:inset-0']")! : el;
      await userEvent.click(beneath);
    };
    const onChallenge = vi.fn();
    const onAttack = vi.fn();
    const { unmount } = render(wrap(<PlayScene {...PLAY.connected} onChallenge={onChallenge} onAttack={onAttack} />));
    const gifts = [screen.getByRole("img", { name: "Rewards: crowns, XP, chests" }), screen.getByRole("img", { name: "Rewards: PAVED, XP, chests" })];
    for (const gift of gifts) {
      expect(gift).toHaveClass("pointer-events-none");
      // Each of its images too: none takes a tap of its own.
      for (const img of gift.querySelectorAll<HTMLElement>("*")) expect(img.closest(".pointer-events-none")).toBe(gift);
    }
    await tapAt(gifts[0]!.querySelector("img") ?? gifts[0]!);
    expect(onAttack).toHaveBeenCalledOnce();
    await tapAt(gifts[1]!.querySelector("img") ?? gifts[1]!);
    expect(onChallenge).toHaveBeenCalledOnce();
    unmount();

    const onResume = vi.fn();
    render(wrap(<PlayScene {...PLAY.running} onResume={onResume} onChallenge={onChallenge} />));
    const resume = screen.getByRole("button", { name: `Resume Challenge #${PLAY.running.running.id}` });
    expect(resume.closest(".pointer-events-none")).toBeNull();
    await tapAt(resume);
    expect(onResume).toHaveBeenCalledOnce();
    expect(onChallenge).toHaveBeenCalledOnce();
  });

  it("disables the Challenge while purchases are paused", () => {
    render(wrap(<PlayScene {...PLAY.paused} />));
    expect(screen.getByRole("button", { name: /^Challenge/ })).toBeDisabled();
    expect(screen.getByText("New Challenge games are paused. Training and Story mode stay open.")).toBeInTheDocument();
  });

  // The owner's ask of 2026-11-06: no sheet from the bottom; the stake is a panel of its own in the modes' place, at every width.
  it("opens the stake as the drawer's own panel in the modes' place, its Back to them and its cross out", async () => {
    const onBack = vi.fn();
    const onChallengeBack = vi.fn();
    render(wrap(<PlayScene {...PLAY.connected} challenge={<PurchaseScene {...PURCHASE.stake1} />} onBack={onBack} onChallengeBack={onChallengeBack} />));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const panel = screen.getByRole("dialog", { name: "Challenge" });
    expect(panel).toHaveAttribute("data-hud-drawer", "play");
    expect(within(panel).queryByRole("heading", { name: "Paid" })).toBeNull();
    expect(within(panel).getByRole("button", { name: /Confirm, pay .* and play/ })).toBeEnabled();
    await userEvent.click(within(panel).getByRole("button", { name: "Back" }));
    expect(onChallengeBack).toHaveBeenCalledOnce();
    await userEvent.click(within(panel).getByRole("button", { name: "Close" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe("Board", () => {
  it("draws the recorded board, the score, the tiles left and the time left", () => {
    render(wrap(<BoardScene {...BOARD.placing} />));
    expect(screen.getByRole("img", { name: `Board of ${BOARD_38.tiles.length} tiles` })).toBeInTheDocument();
    expect(screen.getByTestId("score-value")).toHaveTextContent(pts(BOARD.placing.score));
    expect(screen.getByTestId("tiles-left")).toHaveTextContent("12");
    expect(screen.queryByText(/discarded/)).not.toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "Expires in 19:00:00" })).toBeInTheDocument();
  });

  it("the queue (#645): the two coming tiles beside the hand; a move on its way waits for the chain's draw", () => {
    const { unmount } = render(wrap(<BoardScene {...BOARD.queue} />));
    const coming = within(screen.getByRole("region", { name: "Your tile" })).getByRole("list", { name: "Coming tiles" });
    expect(within(coming).getAllByRole("listitem")).toHaveLength(2);
    unmount();
    render(wrap(<BoardScene {...BOARD.queueDrawing} />));
    const waiting = within(screen.getByRole("region", { name: "Your tile" })).getByRole("list", { name: "Coming tiles" });
    expect(within(waiting).getAllByRole("listitem")).toHaveLength(2);
    expect(within(waiting).getByRole("img", { name: "The chain draws this tile" })).toBeInTheDocument();
    expect(screen.getByText("Placing…")).toBeInTheDocument();
  });

  it("the season dial (#682): at the bottom left, out of the top HUD, the stack kept clear of it; read-only boards too", () => {
    // The wrapper and its placeholder render at once; the dial itself is a lazy chunk, not awaited here.
    const wheel = { state: "summer" as const, onNext: vi.fn(), read: null };
    const { container, unmount } = render(wrap(<BoardScene {...BOARD.queue} seasonWheel={wheel} coach="wheel" />));
    const place = container.querySelector<HTMLElement>("[data-dial-place]")!;
    expect(place).toHaveAttribute("data-bubble-avoid");
    expect(place).toHaveAttribute("data-coach", "wheel");
    expect(place.className).toMatch(/\bleft-2\b/);
    expect(place.className).toMatch(/bottom-\[max\(0\.5rem,env\(safe-area-inset-bottom\)\)\]/);
    // Not in the top HUD block, nor in the stack's: a child of the board itself.
    expect(place.parentElement?.className).toMatch(/\bh-dvh\b/);
    expect(screen.getByRole("region", { name: "Your tile" }).className).toMatch(/calc\(100vw-8\.25rem\)/);
    unmount();
    const readOnly = render(wrap(<BoardScene {...BOARD.placing} readOnly seasonWheel={wheel} />));
    expect(readOnly.container.querySelector("[data-dial-place]")).not.toBeNull();
    expect(screen.getByRole("region", { name: "Deck" })).toBeInTheDocument();
  });

  it("shows the tile in hand with the board's art, turned to its orientation", () => {
    render(wrap(<BoardScene {...BOARD.placing} />));
    const chip = within(screen.getByRole("region", { name: "Your tile" })).getByRole("img", { name: /^Tile / });
    expect(chip).toHaveAttribute("data-view", "art");
    const art = chip.querySelector("img");
    expect(art).toHaveAttribute("src", `${SOURCE_ASSETS}/assets/tiles/${planCode(BOARD_38.next.plan).toLowerCase()}.png`);
    expect(art?.style.transform).toBe(`rotate(${(BOARD_38.next.orientation - 1) * 90}deg)`);
  });

  it("falls back to the tile art when there is no WebGL, without an error", () => {
    // jsdom has no WebGL: the renderer's tile view shows the PNG chip.
    const { unmount } = render(wrap(<TileView plan={BOARD_38.next.plan} orientation={2} basePath={SOURCE_ASSETS} tileArt={originalTileArt(SOURCE_ASSETS)} />));
    const chip = screen.getByRole("img", { name: /^Tile / });
    expect(chip).toHaveAttribute("data-view", "art");
    expect(chip.querySelector("img")).toHaveAttribute("src", `${SOURCE_ASSETS}/assets/tiles/${planCode(BOARD_38.next.plan).toLowerCase()}.png`);
    expect(document.querySelector("canvas")).toBeNull();
    unmount();
  });

  it("falls back to the plan's nine areas without the art", () => {
    render(wrap(<BoardScene {...BOARD.placing} tileArt={undefined} />));
    expect(within(screen.getByRole("region", { name: "Your tile" })).getByRole("img", { name: /^Tile / })).toHaveAttribute("data-view", "areas");
  });

  it("has no Place tile: no bubble before a slot, then the bubble's hold places and the HUD shows the points (#568)", async () => {
    const { unmount } = render(wrap(<BoardScene {...BOARD.placing} />));
    expect(screen.queryByRole("button", { name: /Place tile/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hold to place the tile" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("score-preview")).not.toBeInTheDocument();
    unmount();
    const onConfirm = vi.fn();
    render(wrap(<BoardScene {...BOARD.slotChosen} bubble={{ ...BOARD.slotChosen.bubble, onConfirm }} />));
    expect(screen.getByTestId("score-preview")).toHaveTextContent("(+30)");
    const validate = await screen.findByRole("button", { name: "Hold to place the tile" });
    // A tap does not place: the ring starts and rewinds.
    await userEvent.click(validate);
    expect(onConfirm).not.toHaveBeenCalled();
    // A screen reader's activation (no press before it) places at once.
    fireEvent.click(validate);
    expect(onConfirm).toHaveBeenCalledOnce();
    // The hand has no Rotate and no Place: they are the bubble's, on the tile.
    const hand = screen.getByRole("region", { name: "Your tile" });
    expect(within(hand).queryByRole("button", { name: /Rotate|Place/ })).not.toBeInTheDocument();
  });

  it("the bubble (plan view): Rotate only with several valid rotations, Close always, and the R and Escape keys", async () => {
    const onRotate = vi.fn();
    const onClose = vi.fn();
    const cell = { x: 0, y: 0 };
    const { unmount } = render(wrap(<BoardScene {...BOARD.slotChosen} bubble={{ cell, rotations: 1, onRotate, onClose }} />));
    await screen.findByRole("button", { name: "Cancel placement" });
    expect(screen.queryByRole("button", { name: "Rotate tile" })).not.toBeInTheDocument();
    await userEvent.keyboard("r");
    expect(onRotate).not.toHaveBeenCalled();
    unmount();

    render(wrap(<BoardScene {...BOARD.slotChosen} bubble={{ cell, rotations: 2, onRotate, onClose }} />));
    await userEvent.click(await screen.findByRole("button", { name: "Rotate tile" }));
    await userEvent.keyboard("R");
    expect(onRotate).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole("button", { name: "Cancel placement" }));
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("the stack: the tile and the hint, its Discard held while no cell is chosen; then the bubble has Discard (#606)", async () => {
    const onDiscard = vi.fn();
    const { unmount } = render(wrap(<BoardScene {...BOARD.placing} onDiscard={onDiscard} />));
    const stack = screen.getByRole("region", { name: "Your tile" });
    expect(screen.getByTestId("hand-hint")).toHaveTextContent("Tap a lit slot on the board.");
    const discard = within(stack).getByRole("button", { name: /^Hold to discard the tile/ });
    // The score is above 50: a discard costs 50, and its name says so.
    expect(discard).toHaveAccessibleName("Hold to discard the tile (costs 50 points)");
    // A tap does not discard; a screen reader's activation does.
    await userEvent.click(discard);
    expect(onDiscard).not.toHaveBeenCalled();
    fireEvent.click(discard);
    expect(onDiscard).toHaveBeenCalledOnce();
    // No Surrender on the board: it is in the settings.
    expect(screen.queryByRole("button", { name: /Surrender/ })).not.toBeInTheDocument();
    unmount();
    render(wrap(<BoardScene {...BOARD.slotChosen} bubble={{ ...BOARD.slotChosen.bubble, onDiscard }} />));
    expect(within(screen.getByRole("region", { name: "Your tile" })).queryByRole("button", { name: /discard/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("hand-hint")).not.toBeInTheDocument();
    const names = (await screen.findByRole("toolbar", { name: "Tile" })).querySelectorAll("button");
    expect([...names].map((b) => b.getAttribute("aria-label"))).toEqual(["Cancel placement", "Hold to place the tile", "Rotate tile", "Hold to discard the tile (costs 50 points)"]);
  });

  it("says when the tile fits nowhere, its Discard still offered", () => {
    render(wrap(<BoardScene {...BOARD.placing} hand={{ ...BOARD.placing.hand, fitsNowhere: true }} />));
    expect(screen.getByTestId("stack-discard")).toHaveTextContent("This tile fits nowhere");
    expect(within(screen.getByTestId("stack-discard")).getByRole("button", { name: /^Hold to discard/ })).toBeEnabled();
  });

  it("the stack: the tiles left on its badge, a tap opens the deck sheet; a read-only board keeps it", async () => {
    const { unmount } = render(wrap(<BoardScene {...BOARD.placing} />));
    await userEvent.click(screen.getByRole("button", { name: "Tiles left: 12. Show the deck" }));
    expect(await screen.findByRole("dialog", { name: "Deck" }, { timeout: slow(5000) })).toBeInTheDocument();
    unmount();
    render(wrap(<BoardScene {...BOARD.placing} readOnly />));
    expect(screen.queryByRole("region", { name: "Your tile" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Deck" })).getByTestId("tiles-left")).toHaveTextContent("12");
  });

  it("shows the closing points of the last move", () => {
    render(wrap(<BoardScene {...BOARD.closing} />));
    expect(screen.getByText("City")).toBeInTheDocument();
    expect(screen.getByText("+320")).toBeInTheDocument();
    expect(screen.getByText("+370")).toBeInTheDocument();
  });

  it("locks the hand while a move is pending, and the bubble's Validate and Discard wait", async () => {
    const { unmount } = render(wrap(<BoardScene {...BOARD.slotChosen} bubble={{ ...BOARD.slotChosen.bubble, onDiscard: vi.fn(), busy: true }} />));
    expect(await screen.findByRole("button", { name: "Hold to place the tile" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: /^Hold to discard/ })).toBeDisabled();
    unmount();
    render(wrap(<BoardScene {...BOARD.pending} />));
    expect(screen.getByTestId("hand-hint")).toHaveTextContent("Placing…");
    expect(screen.queryByRole("button", { name: /discard/i })).not.toBeInTheDocument();
  });

  it("says why a move was refused, in a banner above the stack, and lets the player try again", () => {
    render(wrap(<BoardScene {...BOARD.refused} hand={{ ...BOARD.refused.hand, slotChosen: false }} />));
    expect(within(screen.getByRole("region", { name: "Your tile" })).getByRole("alert")).toHaveTextContent("Move refused");
    expect(screen.getByRole("button", { name: /^Hold to discard/ })).toBeEnabled();
  });

  it("asks to surrender an expired game from its banner and allows nothing else", async () => {
    const onSurrender = vi.fn();
    render(wrap(<BoardScene {...BOARD.expired} onSurrender={onSurrender} />));
    expect(screen.getByRole("timer", { name: "Expired" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /discard/i })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Game expired");
    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: /Surrender/ }));
    expect(onSurrender).not.toHaveBeenCalled();
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Surrender this game?" })).getByRole("button", { name: "Surrender" }));
    expect(onSurrender).toHaveBeenCalledOnce();
  });

  it("asks before a surrender, from the settings (#606); Esc and Keep playing close the dialog without surrendering (P3)", async () => {
    const onSurrender = vi.fn();
    render(wrap(<BoardScene {...BOARD.placing} onSurrender={onSurrender} />));
    const surrender = async () => {
      await userEvent.click(screen.getByRole("button", { name: "Settings" }));
      await userEvent.click(within(await screen.findByRole("dialog", { name: "Settings" }, { timeout: slow(5000) })).getByRole("button", { name: /^Surrender/ }));
    };
    await surrender();
    expect(await screen.findByRole("dialog", { name: "Surrender this game?" })).toHaveTextContent(pts(BOARD.placing.score));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await surrender();
    await userEvent.click(await screen.findByRole("button", { name: "Keep playing" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onSurrender).not.toHaveBeenCalled();
    await surrender();
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Surrender this game?" })).getByRole("button", { name: "Surrender" }));
    expect(onSurrender).toHaveBeenCalledOnce();
  });

  it.each([
    ["training", "Restart", "Restart this game?"],
    ["story", "Restart level", "Restart this level?"],
  ] as const)("%s: Restart in the settings, confirmed first; no Surrender", async (mode, row, title) => {
    const onRestart = vi.fn();
    render(wrap(<BoardScene {...BOARD.training} mode={mode} onRestart={onRestart} />));
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    const sheet = await screen.findByRole("dialog", { name: "Settings" }, { timeout: slow(5000) });
    expect(within(sheet).queryByRole("button", { name: /Surrender/ })).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: new RegExp(`^${row}`) }));
    const dialog = await screen.findByRole("dialog", { name: title });
    expect(onRestart).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Restart" }));
    expect(onRestart).toHaveBeenCalledOnce();
  });

  it("plays on the plan view's slots", async () => {
    const onSlotClick = vi.fn();
    const slot = { x: BOARD_38.next.x, y: BOARD_38.next.y };
    render(wrap(<BoardScene {...BOARD.training} slots={[slot]} onSlotClick={onSlotClick} />));
    expect(screen.getByRole("group", { name: `Board of ${BOARD_38.tiles.length} tiles` })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Slot / }));
    expect(onSlotClick).toHaveBeenCalledWith(slot);
  });

  it("the plan view draws its plates only while the placement highlight is on; off, the slots stay buttons", async () => {
    const onSlotClick = vi.fn();
    const slot = { x: BOARD_38.next.x, y: BOARD_38.next.y };
    const plate = () => screen.getByRole("button", { name: /^Slot / }).querySelector("[data-plate]");
    const { rerender } = render(wrap(<BoardScene {...BOARD.training} slots={[{ ...slot, fits: false }]} onSlotClick={onSlotClick} />));
    expect(screen.getByRole("button", { name: /^Slot / })).toHaveAttribute("data-lit", "true");
    // One playable plate whether or not the current rotation fits (PLACEMENT-TINTS).
    expect(plate()).toHaveAttribute("data-plate", "playable");
    rerender(wrap(<BoardScene {...BOARD.training} slots={[{ ...slot, fits: true }]} onSlotClick={onSlotClick} />));
    expect(plate()).toHaveAttribute("data-plate", "playable");
    expect(screen.getByRole("button", { name: /^Slot / })).toHaveAttribute("data-fits", "true");
    rerender(wrap(<BoardScene {...BOARD.training} slots={[slot]} onSlotClick={onSlotClick} placementHighlight={false} />));
    const plain = screen.getByRole("button", { name: /^Slot / });
    expect(plain).toHaveAttribute("data-lit", "false");
    expect(plain.querySelector("[data-plate]")).toBeNull();
    await userEvent.click(plain);
    expect(onSlotClick).toHaveBeenCalledWith(slot);
  });

  it("a Training game shows no deadline and no storage notice (#718)", () => {
    render(wrap(<BoardScene {...BOARD.training} />));
    expect(screen.getByRole("heading", { name: "Training" })).toBeInTheDocument();
    expect(screen.queryByText("Storage is off")).not.toBeInTheDocument();
    expect(screen.queryByText(/Expires in/)).not.toBeInTheDocument();
  });

  it("warns in Story when storage is off: its progress is not saved", () => {
    render(wrap(<BoardScene {...BOARD.storageDisabled} />));
    expect(screen.getByText("Storage is off")).toBeInTheDocument();
  });

  it("draws the 72-tile board and the canvas a page gives instead of the plan view", () => {
    const { unmount } = render(wrap(<BoardScene {...BOARD.large} />));
    expect(screen.getByRole("img", { name: "Board of 72 tiles" })).toBeInTheDocument();
    unmount();
    render(wrap(<BoardScene {...BOARD.placing} canvas={<canvas data-testid="renderer" />} />));
    expect(screen.getByTestId("renderer")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Board of/ })).not.toBeInTheDocument();
  });
});

describe("Over", () => {
  it("shows the final score, the metrics, every closing and the reward", () => {
    render(wrap(<OverScene {...OVER.rewarded} />));
    expect(within(screen.getByTestId("final-score")).getByTestId("score-value")).toHaveTextContent(pts(OVER.rewarded.game.score));
    expect(screen.getByText("New best")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Closings" })).getAllByRole("listitem")).toHaveLength(CLOSINGS_38.length);
    const reward = screen.getByRole("region", { name: "Reward" });
    expect(reward).toHaveAttribute("data-state", "rewarded");
    expect(reward).toHaveTextContent("8.42");
    expect(reward).toHaveTextContent("beaten by 120");
  });

  it.each([
    ["awaiting", /after the day closes/],
    ["settle", /Settle and claim/],
    ["below", /stake is lost/],
    ["expired", /within 24 h/],
    ["training", /no stake, no reward/],
  ] as const)("tells the %s reward state", (state, text) => {
    render(wrap(<OverScene {...OVER[state]} />));
    expect(screen.getByRole("region", { name: "Reward" })).toHaveTextContent(text);
  });

  it("says so when the game closed nothing", () => {
    render(wrap(<OverScene {...OVER.noClosing} />));
    expect(screen.getByText("No structure closed in this game.")).toBeInTheDocument();
  });
});

describe("Purchase", () => {
  // PLAY-PAGE, the owner's asks of 2026-11-06: the stake in USDC between the League's arrows, the break-even score and the max gain
  // under it, the reward by score, the split of the USDC, Confirm.
  it("prices the stake in USDC, its boost and split, the 24 h validity and what it can win", async () => {
    const onStakeChange = vi.fn();
    render(wrap(<PurchaseScene {...PURCHASE.stake3Referred} onStakeChange={onStakeChange} />));
    const stake = screen.getByRole("region", { name: "Stake" });
    expect(within(stake).getByRole("status", { name: "Stake: 6 USDC" })).toBeInTheDocument();
    expect(screen.getByTestId("stake-value")).toHaveTextContent("6");
    expect(screen.getByText("+3%")).toBeInTheDocument();
    // The referrer's address is cut in the middle, whole in its title (WRAP360).
    const referrer = screen.getByTitle("0x0456bb00000000000000000000000000000000000000000000000000000beef");
    expect(referrer).toHaveTextContent("0x0456…beef");
    expect(referrer.parentElement).toHaveTextContent(/^To 0x0456…beef/);
    // split_bps 7,368 / 2,632 / 500 of 6 USDC: the referral comes out of the Vault's part, and the parts shown add up
    // to the price shown (4.42 + 1.28 + 0.30 = 6.00).
    const flow = screen.getByRole("region", { name: "Split" });
    expect(within(flow).getByText("Burned").closest("li")).toHaveTextContent("4.42");
    expect(within(flow).getByText("Vault").closest("li")).toHaveTextContent("1.28");
    expect(within(flow).getByText("Referral").closest("li")).toHaveTextContent("0.30");
    expect(within(flow).getByRole("img", { name: "Burned 73.68%, Vault 21.32%, Referral 5%" })).toBeInTheDocument();
    // The deadline is UTC with its label, under the Paris process zone too, the relative time first.
    const expiry = document.querySelector("time")!;
    expect(expiry).toHaveTextContent("in 24 h · Thu, Oct 15, 15:00 UTC");
    expect(expiry).toHaveAttribute("dateTime", "2026-10-15T15:00:00.000Z");
    // What the table means, out of its box, a line each.
    const rules = within(screen.getByRole("region", { name: "Rewards" })).getByRole("list", { name: "How the reward works" });
    expect(within(rules).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      `Under ${pts(1150)} points, the stake is lost.`,
      expect.stringMatching(/^Estimates: your purchase sets the PAVED per point, and the day's scores set the winning score when it closes \(today's average: [\d,]+\)\.$/),
    ]);
    expect(screen.getByRole("button", { name: "Confirm, pay 6 USDC and play" })).toBeEnabled();
    // The arrows: the value is the scene's (a prop), so each moves one step from 3.
    await userEvent.click(within(stake).getByRole("button", { name: "Raise the stake" }));
    expect(onStakeChange).toHaveBeenLastCalledWith(4);
    await userEvent.click(within(stake).getByRole("button", { name: "Lower the stake" }));
    expect(onStakeChange).toHaveBeenLastCalledWith(2);
  });

  it("stops each arrow at its end: no lower than one stake, no higher than the highest", () => {
    const { unmount } = render(wrap(<PurchaseScene {...PURCHASE.stake1} />));
    expect(screen.getByRole("button", { name: "Lower the stake" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Raise the stake" })).toBeEnabled();
    unmount();
    render(wrap(<PurchaseScene {...PURCHASE.stake10} />));
    expect(screen.getByRole("status", { name: "Stake: 20 USDC" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Raise the stake" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Lower the stake" })).toBeEnabled();
  });

  // The score whose reward wins the price back at the guard's rate (stake 1: 2 USDC is 160 PAVED at 80 a USDC, R = 113.11 PAVED,
  // c 1.222: R x c x score / 1,150 reaches 160 PAVED at 1,332 points), and the cap's R x H; both tiles alike, score and gain.
  it("shows break even and max gain alike, the score to make and its PAVED, and one PAVED's price in USD", () => {
    render(wrap(<PurchaseScene {...PURCHASE.stake1} />));
    const even = breakEvenScore(PURCHASE.stake1.quote, PURCHASE.stake1.reference, PURCHASE.stake1.priceInPaved);
    expect(even).toBe(1332);
    expect(screen.getByRole("group", { name: "Break even" })).toHaveTextContent(new RegExp(`^Break even${pts(1332)}16\\d$`));
    expect(screen.getByRole("group", { name: "Max gain" })).toHaveTextContent(`Max gain${pts(4706)}565`);
    // 80 PAVED a USDC: one PAVED is 0.0125 USDC.
    expect(screen.getByText("$0.0125")).toBeInTheDocument();
  });

  it("says so when even the cap does not win the price back, and waits for the price's worth", () => {
    const { unmount } = render(wrap(<PurchaseScene {...PURCHASE.stake1} priceInPaved={10n ** 24n} />));
    expect(screen.getByRole("group", { name: "Break even" })).toHaveTextContent("Break even——");
    unmount();
    render(wrap(<PurchaseScene {...PURCHASE.stake1} priceInPaved={null} />));
    expect(screen.getByRole("group", { name: "Break even" })).toHaveTextContent("Break even……");
    expect(screen.queryByText(/1 PAVED ≈/)).toBeNull();
  });

  it("boosts the burn by 10% at the highest stake", () => {
    render(wrap(<PurchaseScene {...PURCHASE.stake10} />));
    expect(screen.getByText("+10%")).toBeInTheDocument();
    expect(screen.getByText(/No referrer: the Vault keeps it/)).toBeInTheDocument();
    const flow = screen.getByRole("region", { name: "Split" });
    expect(within(flow).getByText("Burned").closest("li")).toHaveTextContent("14.73");
    expect(within(flow).getByText("Vault").closest("li")).toHaveTextContent("5.27");
    expect(within(flow).getByText("Referral").closest("li")).toHaveTextContent("0.00");
  });

  it("refuses to pay with too little USDC, or while purchases are paused", () => {
    const { unmount } = render(wrap(<PurchaseScene {...PURCHASE.short} />));
    expect(screen.getByRole("alert")).toHaveTextContent("Not enough USDC");
    expect(screen.getByRole("button", { name: /^Confirm/ })).toBeDisabled();
    unmount();
    render(wrap(<PurchaseScene {...PURCHASE.paused} />));
    expect(screen.getByText("Purchases paused")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Confirm/ })).toBeDisabled();
  });

  it("is busy while the purchase is on its way", () => {
    render(wrap(<PurchaseScene {...PURCHASE.buying} />));
    expect(screen.getByRole("button", { name: /Confirm in your wallet/ })).toHaveAttribute("aria-busy", "true");
  });

  // #705: what a score earns, not only the score to beat. Stake 1 at the mocks' pool: R = 113.11 PAVED, c 1.222, H 5.
  it("shows the estimated reward by score, from the threshold to the cap", () => {
    render(wrap(<PurchaseScene {...PURCHASE.stake1} />));
    const table = screen.getByRole("table", { name: "Estimated reward by score" });
    expect(table).toHaveAttribute("aria-busy", "false");
    const rows = within(table).getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(rows).toEqual([
      `${pts(1150)}138.22PAVED`,
      `${pts(1438)}172.84PAVED`,
      `${pts(1725)}207.33PAVED`,
      `${pts(2300)}276.44PAVED`,
      `${pts(4706)}+565.56PAVED`,
    ]);
    // Its meaning sits under its box, not in it.
    expect(table.closest(".drawer-carved")).not.toHaveTextContent(/Estimates/);
    expect(screen.getByRole("list", { name: "How the reward works" })).toHaveTextContent(/^Under .*Estimates: your purchase sets the PAVED per point/);
  });

  it("scales the reward by score with the stake", () => {
    render(wrap(<PurchaseScene {...PURCHASE.stake10} />));
    const table = screen.getByRole("table", { name: "Estimated reward by score" });
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("1,505.41");
    expect(within(table).getAllByRole("row").at(-1)).toHaveTextContent("6,159.64");
  });

  it("keeps the rows of the reward by score while its figures wait", () => {
    render(wrap(<PurchaseScene {...PURCHASE.estimating} />));
    const table = screen.getByRole("table", { name: "Estimated reward by score" });
    expect(table).toHaveAttribute("aria-busy", "true");
    expect(within(table).getAllByRole("row")).toHaveLength(6);
    expect(within(table).queryByText("PAVED")).not.toBeInTheDocument();
    // Pay never waits for the estimate.
    expect(screen.getByRole("button", { name: /^Confirm/ })).toBeEnabled();
    expect(screen.queryByText("The reward cannot be estimated")).toBeNull();
  });

  it("says why the reward cannot be estimated instead of waiting for ever, with Retry", async () => {
    const onRetryReference = vi.fn();
    render(wrap(<PurchaseScene {...PURCHASE.estimateFailed} onRetryReference={onRetryReference} />));
    const table = screen.getByRole("table", { name: "Estimated reward by score" });
    expect(table).toHaveAttribute("aria-busy", "false");
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("—");
    expect(screen.getByText("The reward cannot be estimated")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetryReference).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /^Confirm/ })).toBeEnabled();
  });
});

// #705 during and after the game: the curve of the mocks' game (R = 4.2 PAVED, c 1.222, H 5, threshold 1,150), its score 1,270.
describe("Challenge reward on the HUD and the over page (#705)", () => {
  const hud = (props: Partial<React.ComponentProps<typeof GameHud>>) => render(wrap(<GameHud title="Challenge #1042" score={1270} now={0} reward={CURVE_PLAYING} {...props} />));

  it("shows the Mock mark beside the title while the shell says the game is the mock's (#927), and none otherwise", () => {
    const { unmount } = render(wrap(<MockMarkProvider value><GameHud title="Challenge #1042" score={0} now={0} /></MockMarkProvider>));
    expect(screen.getByRole("heading", { level: 1, name: "Challenge #1042" })).toBeInTheDocument();
    expect(screen.getByLabelText(`Mock. ${MOCK_MARK_TEXT}`)).toHaveTextContent("Mock");
    unmount();
    hud({});
    expect(screen.queryByText("Mock")).toBeNull();
  });

  it("shows on the HUD what the score earns past the threshold, the score to beat under it, and max from the cap", () => {
    const { unmount } = hud({});
    expect(screen.getByTestId("hud-reward")).toHaveTextContent(/^Estimated reward ≈ 5\.66 PAVED$/);
    unmount();
    const below = hud({ score: 640 });
    expect(screen.getByTestId("hud-reward")).toHaveTextContent(`Beat ${pts(1150)}`);
    below.unmount();
    const cap = hud({ score: 5_000 });
    expect(screen.getByTestId("hud-reward")).toHaveTextContent(/≈ 21\.00 PAVED\s*max$/);
    cap.unmount();
    // From 10,000 PAVED the figure is compact, so the header keeps its width (WRAP360).
    hud({ score: 999_999, reward: { ...CURVE_PLAYING, reference: 123_456_789n * 10n ** 18n } });
    expect(screen.getByTestId("hud-reward")).toHaveTextContent(/≈ 617\.3M PAVED\s*max$/);
  });

  it("shows no reward on the HUD without a curve, nor on a Training board", () => {
    const { unmount } = hud({ reward: null });
    expect(screen.queryByTestId("hud-reward")).toBeNull();
    unmount();
    render(wrap(<BoardScene {...BOARD.queueTraining} />));
    expect(screen.queryByTestId("hud-reward")).toBeNull();
  });

  it("shows it on the Challenge board's HUD", () => {
    render(wrap(<BoardScene {...BOARD.belowThreshold} />));
    expect(screen.getByTestId("hud-reward")).toHaveTextContent(`Beat ${pts(1150)}`);
  });

  it("estimates the reward of a game whose day is open, with the threshold it is measured against", () => {
    render(wrap(<OverScene {...OVER.awaitingEstimate} />));
    const panel = screen.getByRole("region", { name: "Reward" });
    expect(within(panel).getByTestId("reward-coming")).toHaveTextContent(/^≈About5\.66PAVED$/);
    expect(panel).toHaveTextContent(`At today's threshold ${pts(1150)} · beaten by ${pts(120)}`);
  });

  it("gives the exact reward once the day's mean is fixed, before the settle", () => {
    render(wrap(<OverScene {...OVER.settle} />));
    const panel = screen.getByRole("region", { name: "Reward" });
    expect(within(panel).getByTestId("reward-coming")).toHaveTextContent(/^5\.66PAVED$/);
    expect(panel).not.toHaveTextContent("At today's threshold");
    expect(panel).toHaveTextContent(`Threshold ${pts(1150)}`);
  });
});

describe("RewardEstimate rows (#705)", () => {
  it("leaves out the steps at or past the cap's score", () => {
    expect(rewardMarks(1_150_000, 12_220, 5)).toEqual([
      { score: 1150, capped: false },
      { score: 1438, capped: false },
      { score: 1725, capped: false },
      { score: 2300, capped: false },
      { score: 4706, capped: true },
    ]);
    // c 3: the cap from 1,917, before 2x the threshold.
    expect(rewardMarks(1_150_000, 30_000, 5)).toEqual([
      { score: 1150, capped: false },
      { score: 1438, capped: false },
      { score: 1725, capped: false },
      { score: 1917, capped: true },
    ]);
    // c of H or more: the cap from the threshold, one row.
    expect(rewardMarks(1_150_000, 50_000, 5)).toEqual([{ score: 1150, capped: true }]);
  });
});

describe("no wiring (SC1, SC2)", () => {
  const src = join(__dirname, "../src");
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));

  const tiers = () => ["components/elements", "components/containers", "components/scenes", "mocks"].flatMap((d) => files(join(src, d)));

  it("imports only types from @paved/chain in the scenes, containers, elements and mocks", () => {
    const valueImports = tiers().filter((f) => /^import (?!type )[^;]*from "@paved\/chain"/m.test(readFileSync(f, "utf8")));
    expect(valueImports).toEqual([]);
  });

  // SC2: the quests, achievements and referral read the indexer's answers. Its package is the daemon (SQLite, starknet.js):
  // never a value import, and no request (fetch, the chain package's IndexerClient, a session) from these tiers.
  it("imports only types from @paved/indexer, and calls no indexer, chain or session", () => {
    const valueImports = tiers().filter((f) => /^import (?!type )[^;]*from "@paved\/indexer[^"]*"/m.test(readFileSync(f, "utf8")));
    expect(valueImports).toEqual([]);
    const calls = tiers().filter((f) => /\bfetch\(|IndexerClient|createEconomyClient|RpcEconomyViews|EconomyWriter|PageSession|LocalSession|useAsyncRead|useIndexerRead/.test(readFileSync(f, "utf8")));
    expect(calls).toEqual([]);
  });

  // P1 put the shell on the routes: the pages import their scenes, lazily (routes/pages/*). The first bundle's own files
  // (the entry, the app, the router table) hold no scene and no mock; the lazy modules are checked by the built chunk list.
  it("keeps the entry, the app and the router table free of scenes and mocks", () => {
    for (const f of ["main.tsx", "App.tsx", "routes/router.tsx"]) expect(readFileSync(join(src, f), "utf8")).not.toMatch(/components\/scenes|mocks\//);
  });

  it("reaches the page modules only through import(), never statically", () => {
    const outside = files(join(src, "routes")).filter((f) => !f.includes(join("routes", "pages")) && !f.endsWith("pages.ts"));
    for (const f of outside) expect(readFileSync(f, "utf8")).not.toMatch(/^\s*(import|export)\b[^;]*from\s+["']\.\/pages\//m);
    // The page loaders (`page-loaders.ts`) are the one table of `import()`s; the router and the prefetch go through it.
    const loaders = readFileSync(join(src, "routes/page-loaders.ts"), "utf8");
    const dynamic = [...loaders.matchAll(/import\("\.\/pages\/[\w-]+"\)/g)].length;
    expect(dynamic).toBeGreaterThanOrEqual(14);
    expect(loaders.match(/\.\/pages\//g)).toHaveLength(dynamic);
    const router = readFileSync(join(src, "routes/router.tsx"), "utf8");
    expect(router).toMatch(/PAGE_LOADERS/);
    // The router's own `import()` is the not-found page, which is in no route of the table.
    expect(router.match(/\.\/pages\//g)).toHaveLength([...router.matchAll(/import\("\.\/pages\/[\w-]+"\)/g)].length);
  });
});

describe("Element feedback (EL)", () => {
  it("puts the icon on the value's row, under the title", () => {
    const { container } = render(<Score value={1270} label="Score" icon="star" />);
    const value = screen.getByTestId("score-value");
    const icon = container.querySelector("[data-icon='star']")!;
    expect(value.parentElement).toBe(icon.parentElement!.parentElement);
    expect(screen.getByText("Score").parentElement).not.toBe(value.parentElement);
  });

  it("keeps a stat row's hint under its label, the icon and the value on the first row", () => {
    const { container } = render(<StatRow icon="castle" label="Cities closed" hint="450 pts" value={4} />);
    const row = container.firstElementChild!;
    expect(row.className).toContain("grid");
    expect(screen.getByText("450 pts").className).toContain("col-start-2");
  });

  it("hides the countdown's label and keeps its accessible name", () => {
    render(<Countdown expiresAt={MOCK_NOW + 9 * 3600} now={MOCK_NOW} label="Closes in" hideLabel />);
    expect(screen.queryByText("Closes in")).not.toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "Closes in 9:00:00" })).toBeInTheDocument();
  });

  it("draws Ranking with the HUD's trophy (END-CHEST: in the Chests' place), and no Vault (the home's overlay's, #763; no header from desktop, #762)", () => {
    render(wrap(<AppNav />));
    expect(screen.getByRole("button", { name: "Ranking" }).querySelector("img[data-slot='ui-icon'][data-icon='trophy']")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Vault" })).toBeNull();
  });

  it("draws the dock's Play as the medallion, the swords and PLAY on it (#807, HOME-DOCK)", () => {
    render(wrap(<AppNav />));
    const play = screen.getByRole("button", { name: "Play" });
    expect(play.querySelector("img[src*='play-medallion']")).not.toBeNull();
    expect(play.querySelector("[data-icon='swords']")).not.toBeNull();
    expect(play).toHaveTextContent("Play");
    expect(play.querySelector("[data-icon='hammer']")).toBeNull();
  });

  it("draws the dock's icons as the mockup's (HOME-DOCK), its own colours", () => {
    render(wrap(<AppNav />));
    for (const [tab, icon] of [["Shop", "shop"], ["Ranking", "trophy"], ["Play", "swords"], ["Guild", "guild"], ["Settings", "settings"]]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${tab}`) }).querySelector(`[data-slot=ui-icon][data-icon=${icon}]`), tab).not.toBeNull();
    }
  });

  it("draws a tab page in its own scrolling region, one viewport tall, with no dock (#611, DOCK-UNDER-PAGES)", () => {
    render(wrap(<TabPage title="Settings"><p>Body</p></TabPage>));
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    const region = screen.getByText("Body").closest("[data-slot=page-scroll]")!;
    expect(region.className).toMatch(/overflow-y-auto/);
    expect(region.className).toMatch(/overscroll-contain/);
    expect(region.parentElement!.className).toMatch(/\bh-dvh\b/);
    // The region runs to the screen's foot, the safe area under the page's last line.
    expect(region.className).toContain("pb-[env(safe-area-inset-bottom)]");
    expect(region.className).not.toContain("--app-nav-h");
  });

  it("serves the background as AVIF, WebP and a JPEG fallback from this host", () => {
    const { container } = render(<Background base="/" />);
    const sources = [...container.querySelectorAll("source")].map((e) => [e.type, e.srcset] as const);
    expect(sources.map(([t]) => t)).toEqual(["image/avif", "image/webp"]);
    expect(sources[0]![1]).toContain("/backgrounds/placeholder-720.avif 720w");
    expect(container.querySelector("img")).toHaveAttribute("src", "/backgrounds/placeholder-1440.jpg");
    expect(container.innerHTML).not.toMatch(/https?:/);
  });
});

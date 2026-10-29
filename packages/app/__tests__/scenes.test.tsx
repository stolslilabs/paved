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
import { PurchaseScene } from "../src/components/scenes/purchase-scene";
import { rewardMarks } from "../src/components/containers/reward-estimate";
import { GameHud } from "../src/components/containers/game-hud";
import { CURVE_PLAYING } from "../src/mocks/games";
import { WelcomeScene } from "../src/components/scenes/welcome-scene";
import { SOURCE_ASSETS, originalTileArt } from "../src/mocks/assets";
import { BOARD_38, CLOSINGS_38 } from "../src/mocks/board";
import { DAY, MOCK_NOW } from "../src/mocks/clock";
import { BOARD, LOADING, OVER, PLAY, PURCHASE, WELCOME } from "../src/mocks/scenes";
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

describe("Welcome", () => {
  it("offers connect and Training without a wallet", async () => {
    const onConnect = vi.fn();
    const onTraining = vi.fn();
    render(wrap(<WelcomeScene {...WELCOME.firstVisit} onConnect={onConnect} onTraining={onTraining} />));
    await userEvent.click(screen.getByRole("button", { name: /connect/i }));
    await userEvent.click(screen.getByRole("button", { name: /play training/i }));
    expect(onConnect).toHaveBeenCalledOnce();
    expect(onTraining).toHaveBeenCalledOnce();
  });

  it("has Back at its top left, to the village (#760)", async () => {
    const onBack = vi.fn();
    render(wrap(<WelcomeScene {...WELCOME.firstVisit} onBack={onBack} />));
    const header = screen.getByRole("banner");
    expect(header.querySelector("button")).toHaveAccessibleName("Back");
    await userEvent.click(within(header).getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("is busy while connecting, and says why a connect failed", () => {
    const { unmount } = render(wrap(<WelcomeScene {...WELCOME.connecting} />));
    expect(screen.getByRole("button", { name: /connecting/i })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: /play training/i })).toBeDisabled();
    unmount();
    render(wrap(<WelcomeScene {...WELCOME.failed} />));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not connect");
  });
});

describe("Loading", () => {
  it("shows an indeterminate bar while booting and the percentage while assets load", () => {
    const { unmount } = render(wrap(<LoadingScene {...LOADING.booting} />));
    expect(screen.getByRole("progressbar", { name: "Starting" })).not.toHaveAttribute("aria-valuenow");
    unmount();
    render(wrap(<LoadingScene {...LOADING.assets} />));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "64");
    expect(screen.getByText("64%")).toBeInTheDocument();
  });
});

describe("Home (#753): the village with its overlays", () => {
  it("shows the village full screen with the right column, Play and Edit from desktop", async () => {
    const on = { onPlay: vi.fn(), onMissions: vi.fn(), onChests: vi.fn(), onShop: vi.fn(), onVault: vi.fn(), onLeague: vi.fn(), onSettings: vi.fn() };
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} {...on} />));
    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeInTheDocument();
    // The stage (the board, the editor) is its own chunk: it arrives after the overlays. The file's first test imports it cold:
    // 1.5 s on a quiet machine, past the 5 s default on CI once the HUD drew its relief icons (#844).
    expect(await screen.findByRole("img", { name: /^Village layout of \d+ tiles/ }, { timeout: slow(10_000) })).toBeInTheDocument();
    const column = screen.getByRole("navigation", { name: "Village" });
    expect(within(column).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Missions, 3 waiting", "Chests, 2 waiting", "Shop", "Vault"]);
    // The overlays outside the bar (the bar's own are tested below).
    const overlay = (name: string | RegExp) => screen.getAllByRole("button", { name }).find((b) => !b.closest("nav[aria-label=Main]"))!;
    for (const [name, handler] of [
      ["Missions, 3 waiting", on.onMissions],
      ["Chests, 2 waiting", on.onChests],
      ["Shop", on.onShop],
      ["Vault", on.onVault],
      [/^League: /, on.onLeague],
      ["Settings", on.onSettings],
      [/^Play/, on.onPlay],
    ] as const) {
      await userEvent.click(overlay(name));
      expect(handler).toHaveBeenCalledTimes(1);
    }
    expect(screen.getByRole("button", { name: "Edit village" })).toBeInTheDocument();
  });

  it("has the phone's bar below desktop (#763): Shop, Chests, Play, League, Settings, each reaching its page", async () => {
    const onNavigate = vi.fn();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} onNavigate={onNavigate} />));
    // The bar is its own chunk on the home: a stand-in of its size holds its place until it comes.
    const nav = await screen.findByRole("navigation", { name: "Main" });
    // Below `desktop` only: from it the overlay's column, gear and Play stay (#762).
    expect(nav.className).toContain("desktop:hidden");
    const items = within(nav).getAllByRole("button");
    expect(items.map((b) => b.getAttribute("aria-label"))).toEqual(["Shop", "Chests, 2 waiting", "Play", "League", "Settings"]);
    // No item current on the home; the chests waiting on Chests.
    expect(within(nav).queryByRole("button", { current: "page" })).toBeNull();
    expect(within(within(nav).getByRole("button", { name: "Chests, 2 waiting" })).getByText("2")).toBeInTheDocument();
    for (const item of items) await userEvent.click(item);
    expect(onNavigate.mock.calls.map(([tab]) => tab)).toEqual(["shop", "chests", "play", "league", "settings"]);
  });

  it("keeps Missions and Vault in the column below desktop, with no gear and no large Play; Edit and the dial above the bar (#763)", () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} seasonWheel={{ state: "summer", onNext: vi.fn(), read: null }} />));
    const column = screen.getByRole("navigation", { name: "Village" });
    const below = within(column).getAllByRole("button").filter((b) => !b.className.split(" ").includes("hidden"));
    expect(below.map((b) => b.getAttribute("aria-label"))).toEqual(["Missions, 3 waiting", "Vault"]);
    const outside = (name: string) => screen.getAllByRole("button", { name }).find((b) => !b.closest("nav[aria-label=Main]"))!;
    // Settings above Play from `desktop` (#856): their stack is hidden below it.
    expect(outside("Settings").parentElement).toBe(outside("Play").parentElement);
    expect(outside("Play").parentElement!.className.split(" ")).toEqual(expect.arrayContaining(["hidden", "desktop:flex"]));
    // Edit's row and the dial clear the bar's measured height below `desktop`.
    expect(screen.getByRole("button", { name: "Edit village" }).parentElement!.className).toContain("bottom-[calc(var(--app-nav-h)+0.5rem)]");
    expect(document.querySelector("[data-dial-place]")!.className).toContain("bottom-[calc(var(--app-nav-h)+0.5rem)]");
  });

  it("HOME-OVERLAYS (#856): one 12 px gap for both columns, each centred in its band; no League in the right column; Settings above Play, Edit's size", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.shielded} seasonWheel={{ state: "summer", onNext: vi.fn(), read: null }} />));
    await screen.findByRole("button", { name: /^League: / });
    const right = screen.getByRole("navigation", { name: "Village" });
    const left = screen.getByRole("button", { name: /^League: / }).parentElement!;
    for (const column of [right, left]) expect(column.className.split(" ")).toEqual(expect.arrayContaining(["flex-col", "gap-3", "justify-center-safe"]));
    // Each column's band, measured off its neighbours (the browser's layout, the stories' captures): under the balances and above
    // Edit (Settings and Play) on the right, under the profile and above the season dial on the left.
    expect(right.className.split(" ")).toEqual(expect.arrayContaining(["top-(--right-top)", "bottom-(--right-bottom)"]));
    expect(left.className.split(" ")).toEqual(expect.arrayContaining(["top-(--left-top)", "bottom-(--left-bottom)"]));
    // The left column holds the League control, the shield's plate and the village score, in that order.
    expect(within(left).getByRole("button", { name: /^League: / })).toBeInTheDocument();
    expect(left.querySelector("[data-slot=village-score]")).not.toBeNull();
    // From `desktop` no League in the right column (#856): only Missions, Chests, Shop and Vault, at any width.
    expect(within(right).queryByRole("button", { name: /^League/ })).toBeNull();
    // Settings above Play, right-aligned, the size of Edit (56 px, round); none at the top right any more.
    const settings = screen.getAllByRole("button", { name: "Settings" }).find((b) => !b.closest("nav[aria-label=Main]"))!;
    const play = screen.getAllByRole("button", { name: "Play" }).find((b) => !b.closest("nav[aria-label=Main]"))!;
    expect(settings.nextElementSibling).toBe(play);
    expect(settings.parentElement!.className.split(" ")).toEqual(expect.arrayContaining(["flex-col", "items-end", "gap-3"]));
    const edit = screen.getByRole("button", { name: "Edit village" });
    for (const size of ["size-14", "rounded-full"]) {
      expect(edit.className.split(" ")).toContain(size);
      expect(settings.className.split(" ")).toContain(size);
    }
    // In the bottom row, with Edit, not at the top right.
    expect(edit.parentElement!.contains(settings)).toBe(true);
  });

  it("draws Play as the two swords with no text and Edit as a hammer, both large and named (#755, #807)", () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} />));
    const play = screen.getAllByRole("button", { name: "Play" }).find((b) => !b.closest("nav[aria-label=Main]"))!;
    expect(play).toHaveTextContent("");
    expect(play.querySelector("[data-icon=swords]")).not.toBeNull();
    expect(play.className).toMatch(/\bsize-16\b/);
    const edit = screen.getByRole("button", { name: "Edit village" });
    expect(edit.querySelector("[data-icon=hammer]")).not.toBeNull();
    expect(edit.className).toMatch(/\bsize-14\b/);
    // 8 px apart below `desktop`, 16 from it (#845); Play under Settings in its own stack (#856).
    expect(edit.parentElement).toBe(play.parentElement!.parentElement);
    expect(edit.parentElement!.className.split(" ")).toEqual(expect.arrayContaining(["gap-2", "desktop:gap-4"]));
    // The game icons (#844): the HUD's icons in relief, drawn at the first paint, not Font Awesome's flat ones.
    for (const name of ["Play", "Edit village", "Missions", "Vault", "Settings"]) {
      for (const button of screen.getAllByRole("button", { name: new RegExp(`^${name}`) })) expect(button.querySelector("[data-slot=game-icon]"), name).not.toBeNull();
    }
    expect(screen.getByRole("button", { name: /^League: / }).querySelectorAll("[data-slot=game-icon]")).toHaveLength(2);
    // The defence log is the league page's: no overlay button. League is labelled plainly, the badge shows which.
    expect(screen.queryByRole("button", { name: /^Defence/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^League,/ })).toBeNull();
  });

  it("shows the League control under the profile: the crowns and the crest, no league name; a tap opens the league (#829)", async () => {
    const onLeague = vi.fn();
    const { unmount } = render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} onLeague={onLeague} />));
    const name = leagueOf(1_240).name;
    const standing = await screen.findByRole("button", { name: `League: ${name}, 1,240 crowns` });
    // The crowns at the plate's centre, the crest closing it in its group's colour; the name only in the accessible name.
    expect(standing).toHaveTextContent(/^1,240$/);
    expect(standing).toHaveAttribute("data-league", leagueOf(1_240).id);
    expect(standing.querySelector("[data-icon=trophy]")).not.toBeNull();
    expect(standing.querySelector("[data-icon=shield-halved]")).toHaveClass(`text-league-${leagueOf(1_240).id}`);
    await userEvent.click(standing);
    expect(onLeague).toHaveBeenCalledTimes(1);
    unmount();
    // Before any PvP: Wood with 0 crowns, still the way to the league.
    // Merged over the view's fixture, as the Start story's args are: its own `league: null` wins.
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} {...HOME_VILLAGE.start} onLeague={onLeague} />));
    await userEvent.click(await screen.findByRole("button", { name: `League: ${leagueOf(0).name}, 0 crowns` }));
    expect(onLeague).toHaveBeenCalledTimes(2);
  });

  it("carries today's home content as chips: Resume and the spawn pause", async () => {
    const onResume = vi.fn();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.paused} onResume={onResume} />));
    await userEvent.click(screen.getByRole("button", { name: "Resume Challenge #1042" }));
    expect(onResume).toHaveBeenCalledWith(1042);
    expect(screen.getByText("New Challenge games are paused")).toBeInTheDocument();
  });

  it("shows a guest a starter village to look at and no Edit", () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.guest} />));
    expect(screen.getByText("Playing as a guest: connect to build your village")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit village" })).not.toBeInTheDocument();
  });

  it("offers Found in Edit's place before the village is founded", () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.unfounded} />));
    expect(screen.getByRole("button", { name: "Found" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit village" })).not.toBeInTheDocument();
  });

  it("paints the overlays while the village is on its way", () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.loading} />));
    expect(screen.getAllByRole("button", { name: /^Play/ })).toHaveLength(2);
    expect(screen.queryByRole("img", { name: /^Village layout/ })).not.toBeInTheDocument();
  });

  it("Edit asks for edit mode; in it, the editor's overlays replace the view's in the same scene", async () => {
    const onEditingChange = vi.fn();
    const { rerender } = render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} onEditingChange={onEditingChange} />));
    await userEvent.click(screen.getByRole("button", { name: "Edit village" }));
    expect(onEditingChange).toHaveBeenCalledWith(true);
    rerender(wrap(<HomeVillageScene {...HOME_VILLAGE.view} editing onEditingChange={onEditingChange} />));
    // The bar's title: "Edit village", its second word shown from `tablet` (#803).
    expect(screen.getByText((_, el) => el?.tagName === "SPAN" && el.classList.contains("font-display") && el.textContent === "Edit village")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Editor" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Village" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Play/ })).not.toBeInTheDocument();
    // Edit mode has no bar (#763): the editor's panel takes the bottom.
    expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
    // Nothing changed: Back leaves edit mode at once.
    await userEvent.click(screen.getByRole("button", { name: "Leave edit mode" }));
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
  });

  it("asks before leaving edit mode with changes, and keeps them on Keep editing", async () => {
    const onEditingChange = vi.fn();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.changed} onEditingChange={onEditingChange} />));
    await userEvent.click(screen.getByRole("button", { name: "Leave edit mode" }));
    expect(await screen.findByRole("dialog", { name: "Leave without saving?" })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Leave edit mode" }).closest("header")).toContainElement(screen.getByRole("button", { name: /^Hold to reset all/ }));
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

  it("in view, lights nothing and opens no panel: the structure lines are edit mode's (#831)", async () => {
    const { renderCanvas, last } = canvas();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.scoreOpen} renderCanvas={renderCanvas} />));
    await screen.findByTestId("canvas", {}, { timeout: slow(5000) });
    await screen.findByRole("list", { name: "Score by kind" }, { timeout: slow(5000) });
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

  it("in edit mode, the fold follows the draft live: the light stays while its structure does, else goes off", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.editingPoints} />));
    const plan = await screen.findByRole("group", { name: /^Village layout of/ }, { timeout: slow(5000) });
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
    await userEvent.click(within(screen.getByRole("region", { name: "Inventory tiles" })).getByRole("button", { name: /^Tile 10, \d+ left$/ }));
    await userEvent.click(plan.querySelector<HTMLButtonElement>(`[data-kind="plate"][data-cell="${spot.x},${spot.y}"]`)!);
    expect(lineButtons()).toHaveLength(next.lines.length);
    expect(screen.getByRole("button", { name: /^Points/ })).toHaveTextContent(formatPoints(next.score));
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

  it("in edit mode, the fold is folded on a phone, the bar's score unfolds it; folding or leaving turns the light off", async () => {
    const { renderCanvas, last } = canvas();
    const onEditingChange = vi.fn();
    const props = { ...HOME_VILLAGE.editing, renderCanvas, onEditingChange };
    const { rerender } = render(wrap(<HomeVillageScene {...props} />));
    await screen.findByTestId("canvas", {}, { timeout: slow(5000) });
    // jsdom has no wide screen: a phone's fold, the total alone.
    const fold = screen.getByRole("button", { name: /^Points/ });
    expect(fold).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list", { name: "Points by structure" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /^Score .*: show the points$/ }));
    expect(fold).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(lineButtons()[0]!);
    expect(last().lit).toEqual(HOME_POINTS.lines[0]!.areas);
    await userEvent.click(fold);
    expect(last().lit).toBeNull();
    await userEvent.click(fold);
    await userEvent.click(lineButtons()[0]!);
    expect(last().lit).not.toBeNull();
    rerender(wrap(<HomeVillageScene {...props} editing={false} />));
    expect(last().lit).toBeNull();
  });
});

describe("Play", () => {
  it("lists the four modes, Multiplayer disabled", async () => {
    const onChallenge = vi.fn();
    render(wrap(<PlayScene {...PLAY.connected} onChallenge={onChallenge} />));
    await userEvent.click(screen.getByRole("button", { name: /^Challenge/ }));
    expect(onChallenge).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /Training/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Story/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Multiplayer/ })).toBeDisabled();
  });

  it("connects a guest who picks the Challenge", async () => {
    const onConnect = vi.fn();
    const onChallenge = vi.fn();
    render(wrap(<PlayScene {...PLAY.guest} onConnect={onConnect} onChallenge={onChallenge} />));
    await userEvent.click(screen.getByRole("button", { name: /^Challenge/ }));
    expect(onConnect).toHaveBeenCalledOnce();
    expect(onChallenge).not.toHaveBeenCalled();
  });

  it("disables the Challenge while purchases are paused", () => {
    render(wrap(<PlayScene {...PLAY.paused} />));
    expect(screen.getByRole("button", { name: /^Challenge/ })).toBeDisabled();
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
    // jsdom has no WebGL: the renderer's tile view and the board scene's hand both show the PNG chip.
    const { unmount } = render(wrap(<TileView plan={BOARD_38.next.plan} orientation={2} basePath={SOURCE_ASSETS} tileArt={originalTileArt(SOURCE_ASSETS)} />));
    const chip = screen.getByRole("img", { name: /^Tile / });
    expect(chip).toHaveAttribute("data-view", "art");
    expect(chip.querySelector("img")).toHaveAttribute("src", `${SOURCE_ASSETS}/assets/tiles/${planCode(BOARD_38.next.plan).toLowerCase()}.png`);
    expect(document.querySelector("canvas")).toBeNull();
    unmount();
    render(wrap(<BoardScene {...BOARD.placing} renderHandTile={(t) => <TileView {...t} basePath={SOURCE_ASSETS} tileArt={originalTileArt(SOURCE_ASSETS)} />} />));
    const hand = screen.getByRole("region", { name: "Your tile" });
    expect(within(hand).getByRole("img", { name: /^Tile / })).toHaveAttribute("data-view", "art");
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
    expect([...names].map((b) => b.getAttribute("aria-label"))).toEqual(["Cancel placement", "Hold to discard the tile (costs 50 points)", "Rotate tile", "Hold to place the tile"]);
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
  it("prices the stake, its boost and split, the 24 h validity and the threshold", async () => {
    const onStakeChange = vi.fn();
    render(wrap(<PurchaseScene {...PURCHASE.stake3Referred} onStakeChange={onStakeChange} />));
    const slider = screen.getByRole("slider", { name: "Stake" });
    expect(slider).toHaveAttribute("aria-valuenow", "3");
    expect(slider).toHaveAttribute("aria-valuemin", "1");
    expect(slider).toHaveAttribute("aria-valuemax", "10");
    expect(screen.getByTestId("stake-value")).toHaveTextContent("3");
    expect(screen.getByTestId("stake-price")).toHaveTextContent("6.00");
    expect(screen.getByText("+3%")).toBeInTheDocument();
    // The referrer's address is cut in the middle, whole in its title (WRAP360).
    const referrer = screen.getByTitle("0x0456bb00000000000000000000000000000000000000000000000000000beef");
    expect(referrer).toHaveTextContent("0x0456…beef");
    expect(referrer.parentElement).toHaveTextContent(/^To 0x0456…beef/);
    // split_bps 7,368 / 2,632 / 500 of 6 USDC: the referral comes out of the Vault's part, and the parts shown add up
    // to the price shown (4.42 + 1.28 + 0.30 = 6.00).
    const price = screen.getByRole("region", { name: "Price" });
    expect(within(price).getByText("Burned").closest("div")).toHaveTextContent("4.42");
    expect(within(price).getByText("Vault").closest("div")).toHaveTextContent("1.28");
    expect(within(price).getByText("Referral").closest("div")).toHaveTextContent("0.30");
    // The deadline is UTC with its label, under the Paris process zone too, the relative time first.
    const expiry = document.querySelector("time")!;
    expect(expiry).toHaveTextContent("in 24 h · Thu, Oct 15, 15:00 UTC");
    expect(expiry).toHaveAttribute("dateTime", "2026-10-15T15:00:00.000Z");
    expect(screen.getByText("Score to beat").nextElementSibling).toHaveTextContent(pts(1150));
    expect(screen.getByRole("button", { name: /Pay.*6\.00.*USDC.*and play/ })).toBeEnabled();
    // Keyboard: the value is the scene's (a prop), so each key moves one step from 3.
    slider.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onStakeChange).toHaveBeenLastCalledWith(4);
    await userEvent.keyboard("{End}");
    expect(onStakeChange).toHaveBeenLastCalledWith(10);
    await userEvent.keyboard("{Home}");
    expect(onStakeChange).toHaveBeenLastCalledWith(1);
  });

  it("boosts the burn by 10% at the highest stake", () => {
    render(wrap(<PurchaseScene {...PURCHASE.stake10} />));
    expect(screen.getByText("+10%")).toBeInTheDocument();
    expect(screen.getByText(/No referrer: the Vault keeps it/)).toBeInTheDocument();
    const price = screen.getByRole("region", { name: "Price" });
    expect(within(price).getByText("Burned").closest("div")).toHaveTextContent("14.73");
    expect(within(price).getByText("Vault").closest("div")).toHaveTextContent("5.27");
    expect(within(price).getByText("Referral").closest("div")).toHaveTextContent("0.00");
  });

  it("refuses to pay with too little USDC, or while purchases are paused", () => {
    const { unmount } = render(wrap(<PurchaseScene {...PURCHASE.short} />));
    expect(screen.getByRole("alert")).toHaveTextContent("Not enough USDC");
    expect(screen.getByRole("button", { name: /Pay/ })).toBeDisabled();
    unmount();
    render(wrap(<PurchaseScene {...PURCHASE.paused} />));
    expect(screen.getByText("Purchases paused")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pay/ })).toBeDisabled();
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
      `${pts(4706)}+max565.56PAVED`,
    ]);
    expect(screen.getByText(/Estimates at today's threshold/)).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: /Pay/ })).toBeEnabled();
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
    expect(screen.getByRole("button", { name: /Pay/ })).toBeEnabled();
  });
});

// #705 during and after the game: the curve of the mocks' game (R = 4.2 PAVED, c 1.222, H 5, threshold 1,150), its score 1,270.
describe("Challenge reward on the HUD and the over page (#705)", () => {
  const hud = (props: Partial<React.ComponentProps<typeof GameHud>>) => render(wrap(<GameHud title="Challenge #1042" score={1270} now={0} reward={CURVE_PLAYING} {...props} />));

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

  it("draws the Chests tab with the treasure chest (issue 873), and no Vault (the home's overlay's, #763; no header from desktop, #762)", () => {
    render(wrap(<AppNav active="home" />));
    expect(screen.getByRole("button", { name: "Chests" }).querySelector("svg[data-slot='game-icon'][data-icon='treasure-chest']")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Vault" })).toBeNull();
  });

  it("draws the bar's Play as the two swords, with no text (#807)", () => {
    render(wrap(<AppNav active="home" />));
    const play = screen.getByRole("button", { name: "Play" });
    expect(play.querySelector("[data-icon='swords']")).not.toBeNull();
    expect(play.querySelector("[data-icon='hammer']")).toBeNull();
  });

  it("draws the bar's icons as game icons, in relief and their own colours (#844)", () => {
    render(wrap(<AppNav active="home" />));
    for (const tab of ["Shop", "Chests", "Play", "League", "Settings"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${tab}`) }).querySelector("[data-slot=game-icon]"), tab).not.toBeNull();
    }
  });

  it("keeps a tab page's navigation out of its scrolling region, fixed to the viewport's bottom below desktop (#611)", () => {
    render(wrap(<TabPage tab="settings" title="Settings"><p>Body</p></TabPage>));
    const nav = screen.getByRole("navigation", { name: "Main" });
    const region = screen.getByText("Body").closest("[data-slot=page-scroll]")!;
    expect(region.className).toMatch(/overflow-y-auto/);
    expect(region.className).toMatch(/overscroll-contain/);
    expect(region.contains(nav)).toBe(false);
    expect(nav.parentElement).toBe(region.parentElement);
    expect(nav.parentElement!.className).toMatch(/\bh-dvh\b/);
    expect(nav.className).toMatch(/(^| )fixed inset-x-0 bottom-0 /);
    // From `desktop` no bar: the page is in the home's side panel (#762).
    expect(nav.className).toContain("desktop:hidden");
    // The region ends at the bar's top: its measured height.
    expect(region.className).toContain("mb-(--app-nav-h)");
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

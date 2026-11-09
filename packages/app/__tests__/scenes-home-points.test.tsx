import { slow } from "../test-slow";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, describe, expect, it, vi } from "vitest";
import { formatPoints } from "../src/components/elements/score";
import { HomeVillageScene } from "../src/components/scenes/home-village-scene";
import type { LayoutBoardView } from "../src/components/containers/layout-board";
import { DRAFT_VALID, HOME_POINTS, HOME_VILLAGE, LAYOUT_FULL, LAYOUT_GROWING, LAYOUT_RIVAL, LAYOUT_START, WONDER_POINTS } from "../src/mocks/village-v2";
import { canLift, layoutPoints, layoutScore, legalSpots } from "../src/components/containers/layout-rules";
import { PLAN } from "../src/mocks/village";
import { sceneTilesOf } from "../src/components/containers/village-layout-canvas";
import { settleHomeChunks, wrap } from "./scenes-helpers";

describe("Home's points by structure (#758)", () => {
  // Every chunk the scene started loaded before the file ends (`settleHomeChunks`).
  afterAll(settleHomeChunks, slow(30_000));

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
    // Awaited: in its own file this is the first test to draw the list, so its lazy chunk loads cold here (before the split, the
    // Home tests had loaded it).
    const list = await screen.findByRole("list", { name: "Points by structure" }, { timeout: slow(5000) });
    expect(within(list).getByRole("button", { pressed: true })).toHaveTextContent(formatPoints(wonder.points));
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

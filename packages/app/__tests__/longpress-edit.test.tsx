import { slow } from "../test-slow";
import { useEffect, type ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameCanvasProps } from "@paved/renderer/react";
import { BoardViewport, type BoardPress } from "../src/components/containers/board-viewport";
import { LayoutBoard, type LayoutBoardView } from "../src/components/containers/layout-board";
import { HomeVillageScene } from "../src/components/scenes/home-village-scene";
import { PRESS_FADE_MS, PRESS_LINGER_MS, PRESS_SHOW_MS } from "../src/lib/use-press-action";
import { HOME_VILLAGE } from "../src/mocks/village-v2";

// LONGPRESS-EDIT (#799): a long press on a tile of the player's own village, in view, shows a bubble by the tile with Edit and
// its ring; held to its end, edit mode opens as from the Edit button. On the plan view (pointer events on its cells) and on the
// 3D board (the renderer's presses, its canvas mocked as the boards' tests do).

const canvas = vi.hoisted(() => ({ props: null as GameCanvasProps | null }));
vi.mock("@paved/renderer/react", () => ({
  GameCanvas: (props: GameCanvasProps) => {
    canvas.props = props;
    useEffect(() => props.onReady?.({ projectCell: () => ({ x: 200, y: 300, visible: true }), onCameraChange: () => () => {} } as never), []);
    return <canvas data-testid="renderer" />;
  },
}));

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;
const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));
const HOLD = 200;
const WAIT = { timeout: slow(5000) };
/** The press bubble's Edit (the scene's own Edit, at the bottom right, has the same name). */
const bubbleEdit = () => document.querySelector<HTMLElement>("[data-press-bubble]")?.querySelector("button") ?? null;
const bubblePhase = () => document.querySelector("[data-press-bubble]")?.getAttribute("data-press-bubble") ?? null;

beforeAll(async () => {
  await Promise.all([import("../src/components/containers/press-bubble"), import("../src/components/containers/village-stage")]);
}, slow(60_000));
beforeEach(() => {
  canvas.props = null;
});

describe("the plan view: a long press on a tile into edit mode (#799)", () => {
  const plan = () => screen.findByRole("img", { name: /^Village layout/ }, WAIT);
  const starter = async () => (await plan()).querySelector<HTMLElement>("[data-kind=starter]")!;

  it("shows Edit by the tile once the press lasts, fills its ring, and opens edit mode at the hold's end", async () => {
    const onEditingChange = vi.fn();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} holdMs={slow(1500)} onEditingChange={onEditingChange} />));
    const tile = await starter();
    fireEvent.pointerDown(tile, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    expect(bubbleEdit()).toBeNull();
    await waitFor(() => expect(bubbleEdit()).not.toBeNull(), WAIT);
    expect(bubbleEdit()).toHaveAccessibleName("Edit village");
    expect(bubbleEdit()).toHaveAttribute("data-state", "holding");
    expect(bubblePhase()).toBe("holding");
    expect(onEditingChange).not.toHaveBeenCalled();
    await waitFor(() => expect(onEditingChange).toHaveBeenCalledWith(true), WAIT);
    fireEvent.pointerUp(tile, { button: 0, pointerId: 1 });
    expect(onEditingChange).toHaveBeenCalledTimes(1);
  });

  it("let go early: the ring rewinds, Edit stays tappable a while, then fades", async () => {
    const onEditingChange = vi.fn();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} holdMs={2000} onEditingChange={onEditingChange} />));
    const tile = await starter();
    fireEvent.pointerDown(tile, { button: 0, pointerId: 1 });
    await waitFor(() => expect(bubbleEdit()).not.toBeNull(), WAIT);
    fireEvent.pointerUp(tile, { button: 0, pointerId: 1 });
    expect(bubblePhase()).toBe("lingering");
    expect(bubbleEdit()).toHaveAttribute("data-state", "idle");
    expect(onEditingChange).not.toHaveBeenCalled();
    // A tap on it opens edit mode.
    await userEvent.click(bubbleEdit()!);
    expect(onEditingChange).toHaveBeenCalledWith(true);
    expect(bubbleEdit()).toBeNull();
    // Again, left alone: it fades out after the linger.
    fireEvent.pointerDown(tile, { button: 0, pointerId: 2 });
    await waitFor(() => expect(bubbleEdit()).not.toBeNull(), WAIT);
    fireEvent.pointerUp(tile, { button: 0, pointerId: 2 });
    // Still there through most of the linger, then gone after its fade (a loaded machine may run both timers at once).
    await wait(PRESS_LINGER_MS / 2);
    expect(bubblePhase()).toBe("lingering");
    await waitFor(() => expect(bubbleEdit()).toBeNull(), { timeout: slow(PRESS_LINGER_MS + PRESS_FADE_MS + 2000) });
    expect(onEditingChange).toHaveBeenCalledTimes(1);
  }, slow(15_000));

  it("a tap elsewhere or Escape hides a lingering bubble at once", async () => {
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} holdMs={2000} onEditingChange={vi.fn()} />));
    const tile = await starter();
    const press = async () => {
      fireEvent.pointerDown(tile, { button: 0, pointerId: 1 });
      await waitFor(() => expect(bubbleEdit()).not.toBeNull(), WAIT);
      fireEvent.pointerUp(tile, { button: 0, pointerId: 1 });
    };
    await press();
    fireEvent.pointerDown(screen.getByRole("navigation", { name: "Village" }), { button: 0 });
    expect(bubbleEdit()).toBeNull();
    await press();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(bubbleEdit()).toBeNull();
  });

  it("a pan, a second finger or a short tap never shows it", async () => {
    const onEditingChange = vi.fn();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} holdMs={HOLD} onEditingChange={onEditingChange} />));
    const tile = await starter();
    fireEvent.pointerDown(tile, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(tile, { pointerId: 1, clientX: 30, clientY: 10 });
    await wait(PRESS_SHOW_MS + 50);
    expect(bubbleEdit()).toBeNull();
    fireEvent.pointerUp(tile, { button: 0, pointerId: 1 });
    fireEvent.pointerDown(tile, { button: 0, pointerId: 1 });
    fireEvent.pointerDown(tile, { button: 0, pointerId: 2 });
    await wait(PRESS_SHOW_MS + 50);
    expect(bubbleEdit()).toBeNull();
    fireEvent.pointerDown(tile, { button: 0, pointerId: 3 });
    fireEvent.pointerUp(tile, { button: 0, pointerId: 3 });
    await wait(PRESS_SHOW_MS + HOLD);
    expect(bubbleEdit()).toBeNull();
    expect(onEditingChange).not.toHaveBeenCalled();
  });

  it("a guest's, a read-only, an unfounded village and a visit (no action) show no bubble", async () => {
    for (const props of [HOME_VILLAGE.guest, { ...HOME_VILLAGE.view, readOnly: true }, HOME_VILLAGE.unfounded]) {
      const onEditingChange = vi.fn();
      const { unmount } = render(wrap(<HomeVillageScene {...props} holdMs={HOLD} onEditingChange={onEditingChange} />));
      const tile = await starter();
      fireEvent.pointerDown(tile, { button: 0, pointerId: 1 });
      await wait(PRESS_SHOW_MS + HOLD + 50);
      expect(bubbleEdit()).toBeNull();
      expect(onEditingChange).not.toHaveBeenCalled();
      unmount();
    }
    // A visit draws the plan with no action (`VillageLayoutScene`).
    render(wrap(<LayoutBoard tiles={HOME_VILLAGE.view.village.tiles} fit />));
    fireEvent.pointerDown((await plan()).querySelector("[data-kind=starter]")!, { button: 0, pointerId: 1 });
    await wait(PRESS_SHOW_MS + 50);
    expect(bubbleEdit()).toBeNull();
  });
});

describe("the 3D board: the renderer's presses into the action (#799)", () => {
  const tiles = HOME_VILLAGE.view.village.tiles.map((t) => ({ ...t, x: t.x + 2_147_483_647, y: t.y + 2_147_483_647 }));
  /** A tile's grid cell, as the renderer names it (y south). */
  const cell = { x: tiles[0]!.x - 2_147_483_647, y: 2_147_483_647 - tiles[0]!.y };
  const press = (x: number, y: number, phase: "down" | "released" | "cancelled") => {
    let acted: boolean | void = undefined;
    act(() => void (acted = canvas.props!.onTilePress!(x, y, phase)));
    return acted;
  };
  const setup = (action: Partial<BoardPress> = {}) => {
    const onAct = vi.fn();
    const onCellClick = vi.fn();
    const props = { tiles, onCellClick, press: { label: "Edit village", icon: "hammer", onAct, holdMs: HOLD, ...action } };
    const view = render(<BoardViewport {...props} />);
    return { onAct, onCellClick, rerender: (p: Partial<Parameters<typeof BoardViewport>[0]>) => view.rerender(<BoardViewport {...props} {...p} />) };
  };

  it("a press held on a tile shows Edit by it and acts at the hold's end; its let go clicks nothing", async () => {
    const { onAct } = setup();
    await screen.findByTestId("renderer");
    press(cell.x, cell.y, "down");
    await waitFor(() => expect(bubbleEdit()).not.toBeNull(), WAIT);
    expect(document.querySelector("[data-press-bubble]")).toHaveAttribute("data-follows", "tile");
    await waitFor(() => expect(onAct).toHaveBeenCalledTimes(1), WAIT);
    expect(press(cell.x, cell.y, "released")).toBe(true);
  });

  it("let go early: Edit lingers and a tap acts; a pan before it shows nothing, after it hides it; a free cell shows nothing", async () => {
    const { onAct } = setup({ holdMs: 2000 });
    await screen.findByTestId("renderer");
    press(cell.x, cell.y, "down");
    press(cell.x, cell.y, "cancelled");
    await wait(PRESS_SHOW_MS + 50);
    expect(bubbleEdit()).toBeNull();
    // A free cell, far from the village.
    press(cell.x + 40, cell.y, "down");
    await wait(PRESS_SHOW_MS + 50);
    expect(bubbleEdit()).toBeNull();
    press(cell.x + 40, cell.y, "released");
    press(cell.x, cell.y, "down");
    await waitFor(() => expect(bubbleEdit()).not.toBeNull(), WAIT);
    press(cell.x, cell.y, "cancelled");
    expect(bubbleEdit()).toBeNull();
    press(cell.x, cell.y, "down");
    await waitFor(() => expect(bubbleEdit()).not.toBeNull(), WAIT);
    // The press showed the bubble: its let go clicks nothing.
    expect(press(cell.x, cell.y, "released")).toBe(true);
    expect(bubblePhase()).toBe("lingering");
    await userEvent.click(within(document.querySelector<HTMLElement>("[data-press-bubble]")!).getByRole("button", { name: "Edit village" }));
    expect(onAct).toHaveBeenCalledTimes(1);
  });

  it("no action: a press shows nothing", async () => {
    const { onAct, rerender } = setup();
    await screen.findByTestId("renderer");
    rerender({ press: null });
    press(cell.x, cell.y, "down");
    await wait(PRESS_SHOW_MS + HOLD + 50);
    expect(bubbleEdit()).toBeNull();
    press(cell.x, cell.y, "released");
    expect(onAct).not.toHaveBeenCalled();
  });

  it("the home hands the canvas its press in view only: none in edit mode, for a guest or read only", async () => {
    const views: LayoutBoardView[] = [];
    const renderCanvas = (view: LayoutBoardView) => (views.push(view), <div data-testid="canvas" />);
    const onEditingChange = vi.fn();
    const { rerender } = render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} renderCanvas={renderCanvas} onEditingChange={onEditingChange} />));
    await screen.findByTestId("canvas", {}, WAIT);
    const view = views[views.length - 1]!;
    expect(view.press).toMatchObject({ label: "Edit village", icon: "hammer" });
    act(() => view.press!.onAct());
    expect(onEditingChange).toHaveBeenCalledWith(true);
    rerender(wrap(<HomeVillageScene {...HOME_VILLAGE.view} editing renderCanvas={renderCanvas} onEditingChange={onEditingChange} />));
    expect(views[views.length - 1]!.press).toBeNull();
    for (const props of [HOME_VILLAGE.guest, { ...HOME_VILLAGE.view, readOnly: true }]) {
      rerender(wrap(<HomeVillageScene {...props} renderCanvas={renderCanvas} />));
      expect(views[views.length - 1]!.press).toBeNull();
    }
  });
});

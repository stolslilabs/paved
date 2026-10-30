import { slow } from "../test-slow";
import { fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { LayoutBoardView } from "../src/components/containers/layout-board";
import { useLayoutCanvas } from "../src/components/containers/village-layout-canvas";
import { HomeVillageScene } from "../src/components/scenes/home-village-scene";
import { HOME_VILLAGE } from "../src/mocks/village-v2";

const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

/** The 3D village's stand-in: the views the stage hands it, the last one drawn. */
function canvas() {
  const views: LayoutBoardView[] = [];
  const renderCanvas = (view: LayoutBoardView) => {
    views.push(view);
    return <div data-testid="canvas" />;
  };
  return { renderCanvas, last: () => views[views.length - 1]! };
}

const DIAL = { seasonWheel: { state: "summer" as const, onNext: vi.fn(), read: null } };

describe("Home's Camera mode (#875)", () => {
  it("puts the Camera button beside Edit, Edit's size, on the 3D village only", async () => {
    const scene = canvas();
    const { unmount } = render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} {...DIAL} renderCanvas={scene.renderCanvas} />));
    const camera = await screen.findByRole("button", { name: "Camera" }, { timeout: slow(5000) });
    const edit = screen.getByRole("button", { name: "Edit village" });
    expect(camera).toHaveClass("size-14");
    // Taps reach it: the nearest pointer-events rule above it is its own control's `auto`, not the overlays' box's `none`.
    expect(camera.closest(".pointer-events-auto, .pointer-events-none")).toHaveClass("pointer-events-auto");
    // In Edit's row, at its left: Edit stays where it was as the button comes.
    expect(camera.closest("div.absolute")).toBe(edit.parentElement);
    expect(edit.compareDocumentPosition(camera) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(scene.last().camera).toBe(false);
    unmount();
    // The plan view (no WebGL, the low quality) has no camera to free.
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} {...DIAL} />));
    await screen.findByRole("button", { name: "Edit village" });
    expect(screen.queryByRole("button", { name: "Camera" })).toBeNull();
  });

  it("frees the camera and fades the overlays to the profile, the balances and Exit camera; a second tap leaves", async () => {
    const user = userEvent.setup();
    const scene = canvas();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} {...DIAL} chests={2} renderCanvas={scene.renderCanvas} />));
    await user.click(await screen.findByRole("button", { name: "Camera" }, { timeout: slow(5000) }));

    expect(scene.last().camera).toBe(true);
    const exit = screen.getByRole("button", { name: "Exit camera" });
    expect(exit).toHaveFocus();
    expect(exit.closest(".pointer-events-auto, .pointer-events-none")).toHaveClass("pointer-events-auto");
    expect(screen.getByText("One finger turns and tilts, two pinch, pan and twist")).toBeInTheDocument();
    const box = document.querySelector("[data-slot=home-overlays]")!;
    expect(box).toHaveAttribute("data-camera", "true");
    // Faded (theme.css: then hidden, out of reach): the right column, the left one, the dial, the phone's bar.
    const faded = (el: Element) => el.closest("[data-fade]");
    expect(faded(screen.getByRole("navigation", { name: "Village" }))).not.toBeNull();
    expect(faded(document.querySelector("[data-slot=scroll-region]")!)).not.toBeNull();
    expect(faded(document.querySelector("[data-dial-place]")!)).not.toBeNull();
    // The column's Shop and the phone bar's.
    for (const shop of screen.getAllByRole("button", { name: "Shop" })) expect(faded(shop)).not.toBeNull();
    // Out of the row, so Exit camera takes the corner: Edit, Settings and Play.
    const row = within(exit.closest("div.absolute") as HTMLElement);
    for (const name of ["Edit village", "Settings", "Play"]) expect(row.getByRole("button", { name }).closest("[data-collapse]")).not.toBeNull();
    // Kept: the top row (the profile, the balances) and Exit camera.
    const top = box.firstElementChild!;
    expect(top).toContainElement(document.querySelector("[data-slot=home-phone-balances]") as HTMLElement);
    expect(top.closest("[data-fade]")).toBeNull();
    expect(top.querySelector("[data-fade],[data-collapse]")).toBeNull();
    expect(exit.closest("[data-fade],[data-collapse]")).toBeNull();

    await user.click(exit);
    expect(scene.last().camera).toBe(false);
    expect(box).not.toHaveAttribute("data-camera");
    expect(screen.getByRole("button", { name: "Camera" })).toHaveFocus();
    expect(screen.queryByText("One finger turns and tilts, two pinch, pan and twist")).toBeNull();
  });

  it("leaves with Escape", async () => {
    const scene = canvas();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} renderCanvas={scene.renderCanvas} initialCamera />));
    await screen.findByRole("button", { name: "Exit camera" }, { timeout: slow(5000) });
    expect(scene.last().camera).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(await screen.findByRole("button", { name: "Camera" })).toBeInTheDocument();
    expect(scene.last().camera).toBe(false);
  });

  it("is the view's alone: edit mode has none, and a guest's starter village has it too", async () => {
    const scene = canvas();
    const { rerender, unmount } = render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} renderCanvas={scene.renderCanvas} initialCamera />));
    await screen.findByRole("button", { name: "Exit camera" }, { timeout: slow(5000) });
    rerender(wrap(<HomeVillageScene {...HOME_VILLAGE.view} renderCanvas={scene.renderCanvas} initialCamera editing />));
    expect(scene.last().camera).toBe(false);
    expect(screen.queryByRole("button", { name: "Exit camera" })).toBeNull();
    unmount();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.guest} renderCanvas={scene.renderCanvas} />));
    expect(await screen.findByRole("button", { name: "Camera" }, { timeout: slow(5000) })).toBeInTheDocument();
  });
});

describe("the village's canvas in the Camera mode (#875)", () => {
  const press = { label: "Edit village", icon: "hammer", onAct: vi.fn() };
  const view = (over: Partial<LayoutBoardView>): LayoutBoardView => ({ tiles: [], editing: false, plates: [], pending: null, shaking: null, press, ...over });

  it("frees the board's camera and drops the long press, whose drag turns the camera instead", () => {
    const { result, rerender } = renderHook((v: LayoutBoardView) => useLayoutCanvas(v), { initialProps: view({}) });
    expect(result.current.cameraMode).toBe("play");
    expect(result.current.press).toBe(press);
    rerender(view({ camera: true }));
    expect(result.current.cameraMode).toBe("free");
    expect(result.current.press).toBeNull();
  });

  it("keeps the play camera in edit mode (the game boards never ask for it)", () => {
    const { result } = renderHook(() => useLayoutCanvas(view({ camera: true, editing: true })));
    expect(result.current.cameraMode).toBe("play");
  });
});

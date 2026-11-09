import { slow } from "../test-slow";
import { fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LazyMotion, domMax } from "motion/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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


describe("Home's Camera mode (#875)", () => {
  it("puts the Camera mode's button, Explore, in the bottom right's row, its icon and its word on a 64 px hit box (CAMERA-EXPLORE), on the 3D village only", async () => {
    const scene = canvas();
    const { unmount } = render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} renderCanvas={scene.renderCanvas} />));
    const camera = await screen.findByRole("button", { name: "Explore" }, { timeout: slow(5000) });
    expect(camera).toHaveClass("size-16");
    expect(camera).toHaveTextContent("Explore");
    expect(camera.querySelector("[data-slot=ui-icon][data-icon=explore]")).not.toBeNull();
    // Taps reach it: the nearest pointer-events rule above it is its own control's `auto`, not the overlays' box's `none`.
    expect(camera.closest(".pointer-events-auto, .pointer-events-none")).toHaveClass("pointer-events-auto");
    // The bottom right's row (Edit left with HOME-EDGES: the village score's capsule opens edit mode).
    expect(camera.closest("div.absolute")).toHaveClass("right-(--hud-inset-right)");
    expect(scene.last().camera).toBe(false);
    unmount();
    // The plan view (no WebGL, the low quality) has no camera to free.
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} />));
    await screen.findByRole("button", { name: /^Edit village, score/ });
    expect(screen.queryByRole("button", { name: "Explore" })).toBeNull();
  });

  it("frees the camera and sends every overlay but Exit off the screen by its nearest edge, in three waves; a second tap leaves", async () => {
    const user = userEvent.setup();
    const scene = canvas();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} chests={2} renderCanvas={scene.renderCanvas} />));
    await user.click(await screen.findByRole("button", { name: "Explore" }, { timeout: slow(5000) }));

    expect(scene.last().camera).toBe(true);
    // Exit (CAMERA-EXPLORE): an icon over its word, named Exit camera, in the corner's row (theme.css moves it down, the dock gone).
    const exit = screen.getByRole("button", { name: "Exit camera" });
    expect(exit).toHaveFocus();
    expect(exit).toHaveTextContent("Exit");
    expect(exit.querySelector("[data-slot=ui-icon][data-icon=exit]")).not.toBeNull();
    expect(exit.closest(".pointer-events-auto, .pointer-events-none")).toHaveClass("pointer-events-auto");
    expect(exit.closest("[data-corner]")).not.toBeNull();
    expect(screen.getByText("One finger turns and tilts, two pinch, pan and twist")).toBeInTheDocument();
    const box = document.querySelector("[data-slot=home-overlays]")!;
    expect(box).toHaveAttribute("data-camera", "true");
    // Off the screen (theme.css: sliding by their nearest edge, fading, then hidden, out of reach), each group its edge and its wave:
    // the dock and the edges first, the capsules' column, then the profile and the balances (the owner's ask: they go too).
    const out = (el: Element) => el.closest("[data-out]")?.getAttribute("data-out");
    expect(out(await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) }))).toBe("r0");
    expect(out(document.querySelector("[data-bottom-left]")!)).toBe("l0");
    expect(out(screen.getByRole("button", { name: /^Chat/ }))).toBe("l0");
    for (const shop of screen.getAllByRole("button", { name: "Shop" })) expect(out(shop)).toBe("d0");
    expect(out(document.querySelector("[data-slot=scroll-region]")!)).toBe("l1");
    // The top row's two (the profile, the balances), each its own.
    expect(box.querySelectorAll("[data-out=u2]")).toHaveLength(2);
    expect(out(document.querySelector("[data-slot=home-phone-balances]")!)).toBe("u2");
    expect(exit.closest("[data-out],[data-collapse]")).toBeNull();

    await user.click(exit);
    expect(scene.last().camera).toBe(false);
    expect(box).not.toHaveAttribute("data-camera");
    expect(screen.getByRole("button", { name: "Explore" })).toHaveFocus();
    expect(screen.queryByText("One finger turns and tilts, two pinch, pan and twist")).toBeNull();
  });

  it("CAMERA-EXPLORE: the waves' rules, out and back in the reverse order, a cut under reduced motion", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/theme.css"), "utf8");
    // Out: the wave's delay (0, 90, 180 ms); back: the reverse (a transition takes the delays of the state it goes to).
    expect(css).toContain("transition: 450ms cubic-bezier(0.55, 0, 0.25, 1) calc(180ms - var(--w, 0ms));");
    expect(css).toMatch(/\[data-out\$="1"\] \{\s*--w: 90ms;\s*\}\s*\[data-out\$="2"\] \{\s*--w: 180ms;/);
    expect(css).toMatch(/\[data-camera\] :is\(\[data-out\], \[data-corner\]\) \{\s*transition-delay: var\(--w, 0ms\);/);
    for (const [edge, shift] of [["l", "calc(-100% - 2rem)"], ["r", "calc(100% + 2rem)"], ["u", "0 calc(-100% - var(--hud-inset-top) - 2rem)"], ["d", "0 calc(100% + 2rem)"]])
      expect(css).toContain(`[data-camera] [data-out^="${edge}"] {\n    translate: ${shift};`);
    expect(css).toMatch(/\[data-camera\] \[data-corner\] \{\s*bottom: calc\(var\(--hud-inset\) \+ env\(safe-area-inset-bottom\)\);/);
    expect(css).toMatch(/transition-property: translate, bottom, opacity, visibility;\s*@media \(prefers-reduced-motion: reduce\) \{\s*transition: none;/);
  });

  it("leaves with Escape", async () => {
    const scene = canvas();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} renderCanvas={scene.renderCanvas} initialCamera />));
    await screen.findByRole("button", { name: "Exit camera" }, { timeout: slow(5000) });
    expect(scene.last().camera).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(await screen.findByRole("button", { name: "Explore" })).toBeInTheDocument();
    expect(scene.last().camera).toBe(false);
  });

  it("is the view's alone: edit mode has none, and a starter village read only has it too", async () => {
    const scene = canvas();
    const { rerender, unmount } = render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} renderCanvas={scene.renderCanvas} initialCamera />));
    await screen.findByRole("button", { name: "Exit camera" }, { timeout: slow(5000) });
    rerender(wrap(<HomeVillageScene {...HOME_VILLAGE.view} renderCanvas={scene.renderCanvas} initialCamera editing />));
    expect(scene.last().camera).toBe(false);
    expect(screen.queryByRole("button", { name: "Exit camera" })).toBeNull();
    unmount();
    render(wrap(<HomeVillageScene {...HOME_VILLAGE.view} readOnly renderCanvas={scene.renderCanvas} />));
    expect(await screen.findByRole("button", { name: "Explore" }, { timeout: slow(5000) })).toBeInTheDocument();
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

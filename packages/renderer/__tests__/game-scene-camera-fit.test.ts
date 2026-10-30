import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GameScene } from "../src/core/GameScene";
import { CameraController, OPENING_DISTANCE, type CameraInputAdapter } from "../src/core/CameraController";
import { computeCameraFit } from "../src/core/camera-fit";
import type { RenderSurfaceAdapter, TileRenderData } from "../src/core/types";
import { outlineStroke, tilePixels } from "../src/core/outlines";
import { placementStubs } from "./helpers/placement-stubs";

/** OrbitControls' events and fields, without the DOM: the test plays the player's drag with `emit`. */
function fakeInput(camera: THREE.PerspectiveCamera) {
  const listeners = new Map<string, Array<() => void>>();
  const saved = camera.position.clone();
  const input = {
    target: new THREE.Vector3(),
    touches: { ONE: 0, TWO: 0 },
    mouseButtons: { LEFT: 0, MIDDLE: 0, RIGHT: 0 },
    addEventListener: (name: string, cb: () => void) => listeners.set(name, [...(listeners.get(name) ?? []), cb]),
    update: () => false,
    reset: vi.fn(() => camera.position.copy(saved)),
    dispose: vi.fn(),
  } as unknown as CameraInputAdapter;
  const emit = (name: string) => listeners.get(name)?.forEach((cb) => cb());
  return { input, emit };
}

const tile = (worldX: number, worldZ: number): TileRenderData => ({
  game_id: 1, id: worldX * 100 + worldZ, player_id: "0x1", plan: 9, orientation: 1, x: 0, y: 0, worldX, worldZ,
});

function harness(size = { width: 375, height: 812 }) {
  let resize: () => void = () => undefined;
  const surface: RenderSurfaceAdapter = {
    getSize: () => size,
    getDevicePixelRatio: () => 1,
    onResize: (cb) => {
      resize = cb;
      return vi.fn();
    },
    bindInput: vi.fn(),
    unbindInput: vi.fn(),
  };
  let emit!: (name: string) => void;
  const renderer = {
    forceContextLoss: vi.fn(), setPixelRatio: vi.fn(), setSize: vi.fn(), dispose: vi.fn(), shadowMap: { enabled: false, type: 0 },
    domElement: { width: size.width, height: size.height }, outputColorSpace: "", toneMapping: 0, toneMappingExposure: 1,
  };
  const scene = new GameScene({
    createRenderer: vi.fn(() => renderer as any),
    createCameraController: vi.fn(
      (s: RenderSurfaceAdapter) =>
        new CameraController(s.getSize(), {}, (camera) => {
          const fake = fakeInput(camera);
          emit = fake.emit;
          return fake.input;
        }),
    ),
  });
  (scene as any).assets.preloadAll = vi.fn().mockResolvedValue(undefined);
  (scene as any).effects = { setLook: vi.fn(), init: vi.fn(), setCapabilities: vi.fn(), setProfile: vi.fn(), setAntialiasing: vi.fn(), resize: vi.fn(), render: vi.fn(), dispose: vi.fn() };
  (scene as any).tiles = { ...placementStubs(), setLook: vi.fn(), updateTiles: vi.fn(), setStrategyMode: vi.fn(), getGroup: () => new THREE.Group() };
  const view = () => {
    const controls = scene.controls;
    return { target: controls.controls.target.clone(), distance: controls.camera.position.distanceTo(controls.controls.target) };
  };
  /** The player drags the board: the controls' start, a change, the end. */
  const drag = () => {
    scene.controls.controls.target.x += 5;
    scene.controls.camera.position.x += 5;
    emit("start");
    emit("change");
    emit("end");
  };
  return { scene, surface, size, view, drag, resize: () => resize(), emit: (name: string) => emit(name) };
}

const expectFrame = (view: { target: THREE.Vector3; distance: number }, fit: ReturnType<typeof computeCameraFit>) => {
  expect(view.distance).toBeCloseTo(fit.distance, 6);
  expect(view.target.x).toBeCloseTo(fit.target.x, 6);
  expect(view.target.z).toBeCloseTo(fit.target.z, 6);
};

describe("GameScene camera fit (CAMERA-FIT, #678)", () => {
  it("opens framed on the tiles handed before init, closer than 240", async () => {
    const h = harness();
    const tiles = [tile(0, 0), tile(1, 0), tile(1, 1)];
    h.scene.updateTiles(tiles);
    await h.scene.init({ surface: h.surface, shadows: false });
    const fit = computeCameraFit({ cells: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, width: 375, height: 812 });
    expectFrame(h.view(), fit);
    expect(fit.distance).toBeLessThan(OPENING_DISTANCE);
    expect(h.scene.getCameraFit()).toEqual(fit);
  });

  it("frames the starter's floor on an empty board, then the first tiles when they come; later moves do not refit", async () => {
    const h = harness();
    await h.scene.init({ surface: h.surface, shadows: false });
    expectFrame(h.view(), computeCameraFit({ cells: null, width: 375, height: 812 }));
    h.scene.updateTiles([tile(0, 0), tile(1, 0), tile(2, 0), tile(3, 0)]);
    const opening = computeCameraFit({ cells: { minX: 0, maxX: 3, minZ: 0, maxZ: 0 }, width: 375, height: 812 });
    expectFrame(h.view(), opening);
    h.scene.updateTiles([tile(0, 0), tile(1, 0), tile(2, 0), tile(3, 0), tile(-3, 0)]);
    expectFrame(h.view(), opening);
  });

  it("frames the first tiles in the Camera mode too, entered before they came (#875); turned, a resize keeps the view", async () => {
    const h = harness();
    await h.scene.init({ surface: h.surface, shadows: false });
    h.scene.setCameraMode("free");
    h.scene.updateTiles([tile(0, 0), tile(1, 0), tile(2, 0), tile(3, 0)]);
    expectFrame(h.view(), computeCameraFit({ cells: { minX: 0, maxX: 3, minZ: 0, maxZ: 0 }, width: 375, height: 812 }));
    h.scene.setCameraAngles(Math.PI / 4, Math.PI);
    const turned = h.view();
    h.size.width = 812;
    h.size.height = 375;
    h.resize();
    expect(h.view()).toEqual(turned);
    expect(h.scene.controls.getAngles().polar).toBeCloseTo(Math.PI / 4, 9);
  });

  it("follows the board after each move only with `followBoard`, and only while the player has not moved", async () => {
    const h = harness();
    h.scene.updateTiles([tile(0, 0)]);
    await h.scene.init({ surface: h.surface, shadows: false, settings: { cameraFit: { followBoard: true } } });
    h.scene.updateTiles([tile(0, 0), tile(-4, 0), tile(4, 0)]);
    expectFrame(h.view(), computeCameraFit({ cells: { minX: -4, maxX: 4, minZ: 0, maxZ: 0 }, width: 375, height: 812 }));
    h.drag();
    const moved = h.view();
    h.scene.updateTiles([tile(0, 0), tile(-4, 0), tile(4, 0), tile(0, 3)]);
    expect(h.view()).toEqual(moved);
  });

  it("frames again on a resize or a turn of the screen until the player moves the camera; a tap that moves nothing does not count", async () => {
    const h = harness();
    h.scene.updateTiles([tile(0, 0), tile(1, 1)]);
    await h.scene.init({ surface: h.surface, shadows: false });
    const cells = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };
    // The phone turned sideways.
    Object.assign(h.size, { width: 812, height: 375 });
    h.resize();
    expectFrame(h.view(), computeCameraFit({ cells, width: 812, height: 375 }));
    // A tap: start and end, no change.
    h.emit("start");
    h.emit("end");
    Object.assign(h.size, { width: 375, height: 812 });
    h.resize();
    expectFrame(h.view(), computeCameraFit({ cells, width: 375, height: 812 }));
    // A drag: the next resize keeps the player's view.
    h.drag();
    const moved = h.view();
    Object.assign(h.size, { width: 1440, height: 900 });
    h.resize();
    expect(h.view()).toEqual(moved);
  });

  it("re-centres on the board with `recenter`, and resizes follow the frame again; `reset` comes back to the frame", async () => {
    const h = harness();
    h.scene.updateTiles([tile(0, 0), tile(2, -1)]);
    await h.scene.init({ surface: h.surface, shadows: false });
    const cells = { minX: 0, maxX: 2, minZ: -1, maxZ: 0 };
    h.drag();
    h.scene.recenter();
    expectFrame(h.view(), computeCameraFit({ cells, width: 375, height: 812 }));
    Object.assign(h.size, { width: 768, height: 1024 });
    h.resize();
    const fit = computeCameraFit({ cells, width: 768, height: 1024 });
    expectFrame(h.view(), fit);
    h.drag();
    h.scene.controls.reset();
    expectFrame(h.view(), fit);
  });

  it("`reset` frames the screen of now, after the player moved the camera and the screen changed", async () => {
    const h = harness();
    h.scene.updateTiles([tile(0, 0), tile(2, -1)]);
    await h.scene.init({ surface: h.surface, shadows: false });
    const cells = { minX: 0, maxX: 2, minZ: -1, maxZ: 0 };
    h.drag();
    Object.assign(h.size, { width: 1440, height: 900 });
    h.resize();
    // The resize keeps the player's view; the reset frames the board for 1440 x 900, not the phone's frame.
    h.scene.controls.reset();
    const fit = computeCameraFit({ cells, width: 1440, height: 900 });
    expectFrame(h.view(), fit);
    expect(h.scene.getCameraFit()!.distance).toBeCloseTo(fit.distance, 6);
  });

  it("turning the frame off goes back to today's opening over the starter, and on frames the board again", async () => {
    const h = harness();
    h.scene.updateTiles([tile(0, 0), tile(2, -1)]);
    await h.scene.init({ surface: h.surface, shadows: false });
    const fit = computeCameraFit({ cells: { minX: 0, maxX: 2, minZ: -1, maxZ: 0 }, width: 375, height: 812 });
    expectFrame(h.view(), fit);
    h.scene.setSettings({ cameraFit: { enabled: false } });
    expect(h.view().distance).toBeCloseTo(OPENING_DISTANCE, 6);
    expect(h.view().target.toArray()).toEqual([0, 0, 0]);
    // Off, `reset` stays at today's opening.
    h.drag();
    h.scene.controls.reset();
    expect(h.view().distance).toBeCloseTo(OPENING_DISTANCE, 6);
    expect(h.view().target.toArray()).toEqual([0, 0, 0]);
    // On again, even after a drag: the board's frame.
    h.drag();
    h.scene.setSettings({ cameraFit: { enabled: true } });
    expectFrame(h.view(), fit);
  });

  it("turning the frame on in a scene that opened with it off loads the fit and frames the board", async () => {
    const h = harness();
    h.scene.updateTiles([tile(0, 0), tile(2, -1)]);
    await h.scene.init({ surface: h.surface, shadows: false, settings: { cameraFit: { enabled: false } } });
    expect(h.view().distance).toBeCloseTo(OPENING_DISTANCE, 6);
    expect(h.scene.getCameraFit()).toBeNull();
    h.scene.setSettings({ cameraFit: { enabled: true } });
    const fit = computeCameraFit({ cells: { minX: 0, maxX: 2, minZ: -1, maxZ: 0 }, width: 375, height: 812 });
    await vi.waitFor(() => expectFrame(h.view(), fit));
    expect(h.scene.getCameraFit()!.distance).toBeCloseTo(fit.distance, 6);
  });

  it("applies new frame settings at once (the story's floor), and does nothing with the frame off", async () => {
    const h = harness({ width: 1440, height: 900 });
    h.scene.updateTiles([tile(0, 0)]);
    await h.scene.init({ surface: h.surface, shadows: false });
    h.scene.setSettings({ cameraFit: { floorCells: 9 } });
    expectFrame(h.view(), computeCameraFit({ cells: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }, width: 1440, height: 900, floorCells: 9 }));
    const off = harness({ width: 1440, height: 900 });
    off.scene.updateTiles([tile(0, 0)]);
    await off.scene.init({ surface: off.surface, shadows: false, settings: { cameraFit: { enabled: false } } });
    expect(off.view().distance).toBeCloseTo(OPENING_DISTANCE, 6);
    expect(off.view().target.toArray()).toEqual([0, 0, 0]);
  });

  it("opens a phone on the phone's floor and margin, re-centres on it, and keeps the five cells from the tablet breakpoint (#791)", async () => {
    const h = harness();
    h.scene.updateTiles([tile(0, 0)]);
    await h.scene.init({ surface: h.surface, shadows: false });
    const fit = computeCameraFit({ cells: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }, width: 375, height: 812, floorCells: 3, marginCells: 1 / 3 });
    expectFrame(h.view(), fit);
    expect(h.scene.getCameraFit()!.area.maxX).toBeCloseTo(5.5, 9);
    h.drag();
    h.scene.recenter();
    expectFrame(h.view(), fit);
    const wide = harness({ width: 640, height: 900 });
    wide.scene.updateTiles([tile(0, 0)]);
    await wide.scene.init({ surface: wide.surface, shadows: false });
    expectFrame(wide.view(), computeCameraFit({ cells: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }, width: 640, height: 900, floorCells: 5, marginCells: 0 }));
  });

  it("keeps the outlines' opening tile size S at the reference distance, whatever the frame", async () => {
    const h = harness();
    h.scene.updateTiles([tile(0, 0)]);
    await h.scene.init({ surface: h.surface, shadows: false });
    const zoom = h.scene.getZoom();
    expect(zoom.distance).toBeLessThan(OPENING_DISTANCE);
    // S is the tile's size at 240, so at the closer opening the tile is larger than S: the outlines are at least as strong
    // as at today's opening, never fainter.
    expect(zoom.tilePx).toBeGreaterThan(zoom.openingTilePx);
    expect(zoom.openingTilePx).toBeCloseTo(tilePixels(h.scene.camera, OPENING_DISTANCE, 812), 9);
    expect(zoom.outline.opacity).toBeGreaterThan(outlineStroke(zoom.openingTilePx, undefined, 1, zoom.openingTilePx).opacity);
  });

  it("a frame drops the pan a drag left to damp (real OrbitControls), so the re-centre stays on the board", () => {
    // OrbitControls on a stand-in surface: only the listeners and sizes it reads.
    const doc = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const element = {
      ...doc, style: {}, ownerDocument: doc, getRootNode: () => doc, clientWidth: 375, clientHeight: 812,
      setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(),
    };
    const controller = new CameraController({ width: 375, height: 812, inputTarget: element } as never);
    expect(controller.controls.enableDamping).toBe(true);
    const fit = computeCameraFit({ cells: null, width: 375, height: 812 });
    controller.frame(fit.target, fit.distance);
    // A drag of 60 px to the right, released: the pan is still damping.
    (controller.controls as unknown as { _pan(x: number, y: number): void })._pan(60, 0);
    controller.update();
    controller.frame(fit.target, fit.distance);
    for (let i = 0; i < 300; i++) controller.update();
    expect(controller.controls.target.x).toBeCloseTo(fit.target.x, 6);
    expect(controller.controls.target.z).toBeCloseTo(fit.target.z, 6);
    expect(controller.camera.position.distanceTo(controller.controls.target)).toBeCloseTo(fit.distance, 6);
    expect(controller.controls.enableDamping).toBe(true);
    expect(controller.userMoved).toBe(false);
  });
});

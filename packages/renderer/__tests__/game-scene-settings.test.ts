import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GameScene } from "../src/core/GameScene";
import { DEFAULT_RENDERER_SETTINGS } from "../src/core/settings";
import { openingTilePixels, tilePixels } from "../src/core/outlines";

function sceneWithCamera() {
  const scene = new GameScene();
  const camera = new THREE.PerspectiveCamera(50, 1.6, 1, 2000);
  camera.zoom = 5;
  camera.position.set(0, 120, 0);
  const controls = { target: new THREE.Vector3(), minDistance: 0, maxDistance: Infinity };
  (scene as any).camera = camera;
  (scene as any).controls = { camera, controls };
  (scene as any).surface = { getSize: () => ({ width: 1440, height: 900 }), getDevicePixelRatio: () => 1 };
  return { scene, camera, controls };
}

describe("GameScene settings", () => {
  it("starts from the defaults", () => {
    expect(new GameScene().getSettings()).toEqual(DEFAULT_RENDERER_SETTINGS);
  });

  it("gives the camera's controls the zoom limits, with the zoom-out cap when it is on", () => {
    const { scene, controls } = sceneWithCamera();
    const requestRender = vi.spyOn(scene, "requestRender");
    scene.setSettings({ camera: { minDistance: 8, maxDistance: 250 } });
    expect(controls).toMatchObject({ minDistance: 8, maxDistance: 250 });
    scene.setSettings({ camera: { capZoomOut: true, zoomOutCapDistance: 120 } });
    expect(controls).toMatchObject({ minDistance: 8, maxDistance: 120 });
    scene.setSettings({});
    expect(controls).toMatchObject({ minDistance: 8, maxDistance: 300 });
    expect(requestRender).toHaveBeenCalled();
  });

  it("turns the faces' antialiasing on and off with the multisampling setting: MSAA on a GPU that multisamples, SMAA otherwise", () => {
    const { scene } = sceneWithCamera();
    const setAntialiasing = vi.fn();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    (scene as any).effects = { setLook: vi.fn(), setAntialiasing };
    (scene as any).renderer = { capabilities: { maxSamples: 4 } };
    (scene as any).webgl = { renderer: "ANGLE (Apple, Metal)", software: false, reason: "GPU renderer" };
    scene.setSettings({ multisampling: true });
    expect(setAntialiasing).toHaveBeenLastCalledWith("msaa", 4);
    scene.setSettings({ multisampling: false });
    expect(setAntialiasing).toHaveBeenLastCalledWith("off", 4);
    // No WebGL 2 multisampling: SMAA.
    (scene as any).renderer = { capabilities: { maxSamples: 0 } };
    scene.setSettings({ multisampling: true });
    expect(setAntialiasing).toHaveBeenLastCalledWith("smaa", 4);
    // Software WebGL multisamples on the CPU: SMAA.
    (scene as any).renderer = { capabilities: { maxSamples: 16 } };
    (scene as any).webgl = { renderer: "SwiftShader", software: true, reason: "software renderer" };
    scene.setSettings({ multisampling: true });
    expect(setAntialiasing).toHaveBeenLastCalledWith("smaa", 4);
    // The path is logged once per change.
    scene.setSettings({ multisampling: true });
    expect(info.mock.calls.filter(([m]) => String(m).includes("face antialiasing")).map(([m]) => m)).toEqual([
      "[renderer] face antialiasing msaa: 4 samples, 4 available on GPU renderer",
      "[renderer] face antialiasing off: disabled by the settings",
      "[renderer] face antialiasing smaa: multisampling unavailable (0 samples)",
      "[renderer] face antialiasing smaa: software renderer",
    ]);
    info.mockRestore();
  });

  it("reports the zoom and the outlines' stroke at it", () => {
    const { scene, camera } = sceneWithCamera();
    const zoom = scene.getZoom();
    expect(zoom.distance).toBeCloseTo(120, 6);
    expect(zoom.tilePx).toBeCloseTo(tilePixels(camera, 120, 900), 6);
    expect(zoom.outline.opacity).toBeGreaterThan(0);
    scene.setSettings({ outlines: { fadeOffFactor: 10, fadeFullFactor: 11 } });
    expect(scene.getZoom().outline).toEqual({ width: 0, opacity: 0 });
  });

  it("sets the outlines' stroke on every frame it draws", () => {
    const { scene } = sceneWithCamera();
    const setOutlineStroke = vi.fn();
    (scene as any).tiles = { setOutlineStroke, setLook: vi.fn() };
    (scene as any).renderer = { shadowMap: {} };
    (scene as any).effects = { setLook: vi.fn(), render: vi.fn() };
    scene.render();
    expect(setOutlineStroke).toHaveBeenCalledWith(scene.getZoom().outline, DEFAULT_RENDERER_SETTINGS.outlines.color);
  });

  it("sets the stroke again only when the zoom or the settings change", () => {
    const { scene, camera } = sceneWithCamera();
    const setOutlineStroke = vi.fn();
    (scene as any).tiles = { setOutlineStroke, setLook: vi.fn() };
    (scene as any).renderer = { shadowMap: {} };
    (scene as any).effects = { setLook: vi.fn(), render: vi.fn(), setAntialiasing: vi.fn() };
    scene.render();
    scene.render();
    expect(setOutlineStroke).toHaveBeenCalledTimes(1);
    camera.position.set(0, 60, 0);
    scene.render();
    expect(setOutlineStroke).toHaveBeenCalledTimes(2);
    expect(setOutlineStroke).toHaveBeenLastCalledWith(scene.getZoom().outline, "#2a2928");
    scene.setSettings({ outlines: { maxWidthPx: 3, color: "#2a2a2a" } });
    scene.render();
    expect(setOutlineStroke).toHaveBeenCalledTimes(3);
    expect(setOutlineStroke).toHaveBeenLastCalledWith(scene.getZoom().outline, "#2a2a2a");
    // A new pixel ratio (the window moved to another screen) changes the stroke's device width.
    (scene as any).pixelRatio = 2;
    scene.render();
    expect(setOutlineStroke).toHaveBeenCalledTimes(4);
  });

  it("follows a resize: the opening tile size S is recomputed from the new height, and the stroke with it", () => {
    const { scene, camera } = sceneWithCamera();
    const setOutlineStroke = vi.fn();
    (scene as any).tiles = { setOutlineStroke, setLook: vi.fn() };
    (scene as any).renderer = { shadowMap: {} };
    (scene as any).effects = { setLook: vi.fn(), render: vi.fn() };
    camera.position.set(0, 240, 0); // the opening view
    const desktop = scene.getZoom();
    expect(desktop.openingTilePx).toBeCloseTo(openingTilePixels(camera, 900), 9);
    expect(desktop.openingTilePx).toBeCloseTo(60.3, 1);
    expect(desktop.outline.opacity).toBe(1);
    scene.render();
    (scene as any).surface = { getSize: () => ({ width: 360, height: 780 }) };
    const phone = scene.getZoom();
    expect(phone.openingTilePx).toBeCloseTo(52.3, 1);
    // The opening view stays fully on: the tile and S shrink together.
    expect(phone.outline.opacity).toBe(1);
    scene.render();
    expect(setOutlineStroke).toHaveBeenCalledTimes(2);
  });

  it("draws no outlines on software WebGL unless forced on, and logs the path once", () => {
    const { scene } = sceneWithCamera();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    (scene as any).renderer = { shadowMap: {} };
    (scene as any).webgl = { renderer: "Google SwiftShader", software: true, reason: 'software renderer "Google SwiftShader"' };
    expect(scene.getWebGL().software).toBe(true);
    expect(scene.getZoom().outline).toEqual({ width: 0, opacity: 0 });
    scene.setSettings({ outlines: { force: "on" } });
    expect(scene.getZoom().outline.opacity).toBeGreaterThan(0);
    const outlinePaths = () => info.mock.calls.map(([m]) => String(m)).filter((m) => m.includes("outlines"));
    expect(outlinePaths()).toEqual(["[renderer] outlines on: forced on"]);
    scene.setSettings({ outlines: { force: "on" } });
    expect(outlinePaths()).toHaveLength(1);
    scene.setSettings({});
    expect(outlinePaths().at(-1)).toBe('[renderer] outlines off: software renderer "Google SwiftShader"');
    (scene as any).webgl = { renderer: "Apple GPU", software: false, reason: 'GPU renderer "Apple GPU"' };
    expect(scene.getZoom().outline.opacity).toBeGreaterThan(0);
    scene.setSettings({ outlines: { force: "off" } });
    expect(scene.getZoom().outline).toEqual({ width: 0, opacity: 0 });
    info.mockRestore();
  });
});

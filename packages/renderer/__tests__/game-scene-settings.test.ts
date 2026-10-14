import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GameScene } from "../src/core/GameScene";
import { DEFAULT_RENDERER_SETTINGS } from "../src/core/settings";
import { tilePixels } from "../src/core/outlines";

function sceneWithCamera() {
  const scene = new GameScene();
  const camera = new THREE.PerspectiveCamera(50, 1.6, 1, 2000);
  camera.zoom = 5;
  camera.position.set(0, 120, 0);
  const controls = { target: new THREE.Vector3(), minDistance: 0, maxDistance: Infinity };
  (scene as any).camera = camera;
  (scene as any).controls = { camera, controls };
  (scene as any).surface = { getSize: () => ({ width: 1440, height: 900 }) };
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
    expect(controls).toMatchObject({ minDistance: 5, maxDistance: 120 });
    scene.setSettings({});
    expect(controls).toMatchObject({ minDistance: 5, maxDistance: 300 });
    expect(requestRender).toHaveBeenCalled();
  });

  it("reports the zoom and the outlines' stroke at it", () => {
    const { scene, camera } = sceneWithCamera();
    const zoom = scene.getZoom();
    expect(zoom.distance).toBeCloseTo(120, 6);
    expect(zoom.tilePx).toBeCloseTo(tilePixels(camera, 120, 900), 6);
    expect(zoom.outline.opacity).toBeGreaterThan(0);
    scene.setSettings({ outlines: { fadeThresholdTilePx: 1000 } });
    expect(scene.getZoom().outline).toEqual({ width: 0, opacity: 0 });
  });

  it("sets the outlines' stroke on every frame it draws", () => {
    const { scene } = sceneWithCamera();
    const setOutlineStroke = vi.fn();
    (scene as any).tiles = { setOutlineStroke };
    (scene as any).renderer = { shadowMap: {} };
    (scene as any).effects = { render: vi.fn() };
    scene.render();
    expect(setOutlineStroke).toHaveBeenCalledWith(scene.getZoom().outline);
  });
});

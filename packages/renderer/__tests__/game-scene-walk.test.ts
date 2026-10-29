import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GameScene } from "../src/core/GameScene";
import { CLOSEST_DISTANCE } from "../src/core/CameraController";
import { SOURCES, loadMesh } from "./helpers/model-meshes";

/** Reading and voxelizing the models: well under a second here, but CI runs every package's tests at once. */
const HEAVY_TEST_MS = 60_000;

/** A scene with a camera, still controls and two straight road tiles on its board (no WebGL: the walk needs none). */
async function sceneWithRoad() {
  const mesh = await loadMesh(`${SOURCES}/rfffrfffr.glb`);
  const board = new THREE.Group();
  const sources = [0, 1].map((n) => {
    const tile = new THREE.Group();
    const copy = new THREE.Mesh(mesh.geometry);
    copy.applyMatrix4(mesh.matrixWorld);
    tile.add(copy);
    tile.scale.setScalar(0.75);
    tile.position.set(n * 3, 0, 0);
    board.add(tile);
    return { key: "rfffrfffr", tile };
  });
  const scene = new GameScene();
  const camera = new THREE.PerspectiveCamera(50, 1, 5, 2000);
  camera.position.set(1.5, 40, 20);
  camera.lookAt(1.5, 0, 0);
  const controls = { enabled: true, update: vi.fn(() => false), target: new THREE.Vector3(1.5, 0, 0) };
  Object.assign(scene as object, {
    camera,
    controls: { controls, camera },
    surface: {},
    tiles: { getGroup: () => board, smokeSources: () => sources },
  });
  return { scene, camera, controls };
}

describe("GameScene's walk (V4-WALK-1)", () => {
  it(
    "takes the camera from the orbit controls for the walk and gives it back after the lift",
    async () => {
      const { scene, camera, controls } = await sceneWithRoad();
      const control = await scene.startWalk({ easeMs: 100 });
      expect(control).not.toBeNull();
      expect(controls.enabled).toBe(false);
      expect(scene.getWalk()?.phase).toBe("entering");
      // One walk at a time.
      expect(await scene.startWalk()).toBeNull();
      // The outlines are drawn as at the closest zoom while walking.
      expect((scene as any).cameraDistance()).toBe(CLOSEST_DISTANCE);

      const session = (scene as any).walkSession;
      session.update(performance.now() + 200);
      expect(scene.getWalk()?.phase).toBe("walking");
      expect(camera.near).toBe(0.02);

      const left = scene.stopWalk();
      session.update(performance.now() + 1000);
      expect(session.done).toBe(true);
      // The loop's tick hands the camera back once the lift is over.
      (scene as any).endWalk();
      await left;
      expect(controls.enabled).toBe(true);
      expect(controls.update).toHaveBeenCalled();
      expect(scene.getWalk()).toBeNull();
      expect(camera.near).toBe(5);
    },
    HEAVY_TEST_MS,
  );

  it(
    "cancels a walk still loading when asked to stop",
    async () => {
      const { scene, controls } = await sceneWithRoad();
      const started = scene.startWalk();
      await scene.stopWalk();
      expect(await started).toBeNull();
      expect(scene.getWalk()).toBeNull();
      expect(controls.enabled).toBe(true);
      // A new walk after the cancelled one starts.
      expect(await scene.startWalk()).not.toBeNull();
    },
    HEAVY_TEST_MS,
  );

  it(
    "gives a still walker's eye a new field of view at once",
    async () => {
      const { scene, camera } = await sceneWithRoad();
      await scene.startWalk({ easeMs: 0 });
      const session = (scene as any).walkSession;
      const now = performance.now();
      session.update(now);
      session.update(now + 16);
      expect(scene.getWalk()?.phase).toBe("walking");
      expect(camera.fov).toBe(70);
      scene.setWalkSettings({ fov: 90 });
      expect(camera.fov).toBe(90);
      // Still: no frame of the walk's own moves it back.
      expect(session.update(now + 32)).toBe(false);
      expect(camera.fov).toBe(90);
    },
    HEAVY_TEST_MS,
  );

  it("starts no walk on a board with no tile drawn", async () => {
    const scene = new GameScene();
    Object.assign(scene as object, {
      camera: new THREE.PerspectiveCamera(),
      controls: { controls: { enabled: true } },
      surface: {},
      tiles: { getGroup: () => new THREE.Group(), smokeSources: () => [] },
    });
    expect(await scene.startWalk()).toBeNull();
    expect(scene.getWalk()).toBeNull();
  });
});

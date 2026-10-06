import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GameScene } from "../src/core/GameScene";
import type { CharacterRenderData, RenderSurfaceAdapter, TileRenderData } from "../src/core/types";

const adapter: RenderSurfaceAdapter = {
  getSize: () => ({ width: 320, height: 200 }),
  getDevicePixelRatio: () => 1,
  onResize: () => vi.fn(),
  bindInput: vi.fn(),
  unbindInput: vi.fn(),
};

const tile = (id: number): TileRenderData => ({
  game_id: 1, id, player_id: "0x1", plan: 9, orientation: 1, x: 0, y: 0, occupied_spot: 0, worldX: id, worldZ: 0,
});

function sceneWithPendingModels() {
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 2000);
  const controller = {
    camera,
    controls: { addEventListener: vi.fn(), target: new THREE.Vector3() },
    update: vi.fn(() => false),
    resize: vi.fn(),
    setMode: vi.fn(),
    setBoardBounds: vi.fn(),
    dispose: vi.fn(),
  };
  const renderer = {
    setPixelRatio: vi.fn(), setSize: vi.fn(), dispose: vi.fn(), shadowMap: { enabled: false, type: 0 },
    domElement: { width: 320, height: 200 }, outputColorSpace: "", toneMapping: 0, toneMappingExposure: 1,
  };
  const scene = new GameScene({
    createRenderer: vi.fn(() => renderer as any),
    createCameraController: vi.fn(() => controller as any),
  });
  let loaded!: () => void;
  (scene as any).assets.preloadAll = vi.fn(() => new Promise<void>((r) => (loaded = r)));
  (scene as any).effects = { init: vi.fn(), setCapabilities: vi.fn(), setProfile: vi.fn(), resize: vi.fn(), render: vi.fn(), dispose: vi.fn() };
  const tiles = { updateTiles: vi.fn(), setStrategyMode: vi.fn(), getGroup: () => new THREE.Group() };
  const characters = { updateCharacters: vi.fn(), getGroup: () => new THREE.Group() };
  (scene as any).tiles = tiles;
  (scene as any).characters = characters;
  return { scene, tiles, characters, finishLoading: () => loaded() };
}

describe("GameScene draws what it was given while its models loaded", () => {
  it("redraws the last tiles and characters once init is done", async () => {
    const { scene, tiles, characters, finishLoading } = sceneWithPendingModels();
    const init = scene.init({ surface: adapter });
    // The React wrapper hands the board over before init has finished, and again only on change.
    scene.updateTiles([tile(1)]);
    scene.updateTiles([tile(1), tile(2)]);
    const chars = [{ id: 1 }] as unknown as CharacterRenderData[];
    scene.updateCharacters(chars);
    tiles.updateTiles.mockClear();
    characters.updateCharacters.mockClear();

    finishLoading();
    await init;

    expect(tiles.updateTiles).toHaveBeenCalledTimes(1);
    expect(tiles.updateTiles.mock.calls[0][0].map((t: TileRenderData) => t.id)).toEqual([1, 2]);
    expect(characters.updateCharacters).toHaveBeenCalledWith(chars);
  });

  it("with nothing given, init draws an empty board", async () => {
    const { scene, tiles, finishLoading } = sceneWithPendingModels();
    const init = scene.init({ surface: adapter });
    finishLoading();
    await init;
    expect(tiles.updateTiles).toHaveBeenCalledWith([]);
  });
});

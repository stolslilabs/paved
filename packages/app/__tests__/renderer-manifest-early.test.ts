import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetLoader, provideManifest } from "@paved/renderer";
import { loadTileArt, resetTileArt } from "../src/data/tile-art";
import { manifestBody } from "../src/data/renderer-manifest";
import { PAGE_LOADERS } from "../src/routes/page-loaders";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const fetchMock = vi.fn<typeof fetch>();
const MANIFEST = { models: { ccccccccc: "models/ccccccccc.778825054e.glb" }, tiles: { "256": { ccccccccc: "tiles/ccccccccc.256.9a48178562.png" } } };
let base = 0;

beforeEach(() => {
  resetTileArt();
  fetchMock.mockReset().mockImplementation(async () => json(MANIFEST));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("the board's manifest: one request, started with the board's code (LOAD-FAST)", () => {
  it("serves the tile chips and the renderer from one request", async () => {
    const at = `/assets-${++base}`;
    provideManifest(at, manifestBody(at));
    expect(await loadTileArt(at)).toEqual(MANIFEST.tiles["256"]);
    // `AssetLoader.preloadModels` reads the manifest: the provided one, with no request of its own.
    const load = vi.spyOn(AssetLoader.prototype as unknown as { loadModel: (url: string) => Promise<unknown> }, "loadModel");
    load.mockRejectedValue(new Error("no network in tests"));
    await expect(new AssetLoader(at).preloadModels()).rejects.toThrow();
    expect(load).toHaveBeenCalledWith(`${at}/models/ccccccccc.778825054e.glb`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${location.origin}${at}/manifest.json`, { cache: "no-cache" });
  });

  it("asks for the manifest when the board's route starts loading", async () => {
    void PAGE_LOADERS.training!().catch(() => {});
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/renderer-assets\/manifest\.json$/), { cache: "no-cache" }));
  });

  it("drops a failed read, so the next caller asks again; a 404 is no manifest", async () => {
    const at = `/assets-${++base}`;
    fetchMock.mockResolvedValueOnce(json({}, 503));
    await expect(manifestBody(at)).rejects.toThrow("503");
    expect(await manifestBody(at)).toEqual(MANIFEST);
    const none = `/assets-${++base}`;
    fetchMock.mockResolvedValueOnce(json({}, 404));
    expect(await manifestBody(none)).toBeNull();
  });
});

import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TileChip } from "../src/components/elements/tile-chip";
import { resetTileArt, useTileArt } from "../src/data/tile-art";
import { originalTileArt } from "../src/mocks/assets";

const BASE = "/renderer-assets";
const HASHED = "tiles/ccccccccc.256.9a48178562.png";
// Plan 1 is the first of `PlanType` after None: its nine letters are `ccccccccc`.
const PLAN = 1;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  resetTileArt();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const listed = () => json({ models: {}, tiles: { "256": { ccccccccc: HASHED } } });

describe("the tile chip only draws what it is given (TILE-CHIP)", () => {
  it("draws the image the page resolved, turned to its orientation", () => {
    render(<TileChip plan={PLAN} orientation={2} art={() => `${BASE}/${HASHED}`} />);
    const chip = screen.getByRole("img", { name: /^Tile / });
    expect(chip).toHaveAttribute("data-view", "art");
    expect(chip.querySelector("img")).toHaveAttribute("src", `${BASE}/${HASHED}`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("draws the plan's areas when there is no art, when the plan has none, and in the areas view", () => {
    render(
      <>
        <TileChip plan={PLAN} />
        <TileChip plan={PLAN} art={() => null} />
        <TileChip plan={PLAN} art={() => "/x.png"} view="areas" />
      </>,
    );
    expect(screen.getAllByRole("img", { name: /^Tile / }).map((c) => c.getAttribute("data-view"))).toEqual(["areas", "areas", "areas"]);
    expect(document.querySelector("img")).toBeNull();
  });

  it("draws the originals when a story names them", () => {
    render(<TileChip plan={PLAN} art={originalTileArt(BASE)} />);
    expect(document.querySelector("img")).toHaveAttribute("src", `${BASE}/assets/tiles/ccccccccc.png`);
  });
});

describe("useTileArt, the page's read of the manifest", () => {
  it("resolves the manifest's hashed 256 px copy, read once with no-cache", async () => {
    fetchMock.mockResolvedValue(listed());
    const { result } = renderHook(() => useTileArt(BASE));
    expect(result.current?.("ccccccccc")).toBeNull();
    await waitFor(() => expect(result.current?.("ccccccccc")).toBe(`${BASE}/${HASHED}`));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/renderer-assets\/manifest\.json$/), { cache: "no-cache" });
    renderHook(() => useTileArt(BASE));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("answers at once, with no frame of the areas, once a read has ended", async () => {
    fetchMock.mockResolvedValue(listed());
    const first = renderHook(() => useTileArt(BASE));
    await waitFor(() => expect(first.result.current?.("ccccccccc")).toBe(`${BASE}/${HASHED}`));
    const later = renderHook(() => useTileArt(BASE));
    expect(later.result.current?.("ccccccccc")).toBe(`${BASE}/${HASHED}`);
  });

  it.each([
    ["has no manifest (404)", () => new Response("", { status: 404 })],
    ["gets a page that is not JSON", () => new Response("<html></html>", { status: 200 })],
    ["gets a manifest that lists no 256 px copies", () => json({ models: {} })],
    ["gets a manifest that lists no copy of the plan", () => json({ models: {}, tiles: { "256": { fffffffff: "tiles/x.png" } } })],
    ["fails with a server error", () => new Response("", { status: 500 })],
  ])("gives no image, and asks for no assets/tiles path, when the host %s", async (_, response) => {
    fetchMock.mockImplementation(async () => response());
    const { result } = renderHook(() => useTileArt(BASE));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current?.("ccccccccc")).toBeNull();
    render(<TileChip plan={PLAN} art={result.current} />);
    expect(screen.getByRole("img", { name: /^Tile / })).toHaveAttribute("data-view", "areas");
    expect(document.querySelector("img")).toBeNull();
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("assets/tiles"))).toBe(true);
  });

  it("gives no image when the read fails, and reads again for the next page", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    const first = renderHook(() => useTileArt(BASE));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(first.result.current?.("ccccccccc")).toBeNull();
    first.unmount();
    fetchMock.mockResolvedValue(listed());
    const next = renderHook(() => useTileArt(BASE));
    await waitFor(() => expect(next.result.current?.("ccccccccc")).toBe(`${BASE}/${HASHED}`));
  });

  it("reads nothing without a base path", () => {
    const { result } = renderHook(() => useTileArt(undefined));
    expect(result.current).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

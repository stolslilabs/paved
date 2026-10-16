import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TileChip } from "../src/components/elements/tile-chip";
import { resetTileArt } from "../src/data/tile-art";

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

const src = () => screen.getByRole("img", { name: /^Tile / }).querySelector("img")?.getAttribute("src");

describe("the tile chip's image (TILE-CHIP)", () => {
  it("draws the manifest's hashed 256 px copy, the file the board draws", async () => {
    fetchMock.mockResolvedValue(json({ models: {}, tiles: { "256": { ccccccccc: HASHED } } }));
    render(<TileChip plan={PLAN} artBase={BASE} />);
    await waitFor(() => expect(src()).toBe(`${BASE}/${HASHED}`));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/renderer-assets\/manifest\.json$/), { cache: "no-cache" });
  });

  it("reads the manifest once for all the chips of a base path", async () => {
    fetchMock.mockResolvedValue(json({ models: {}, tiles: { "256": { ccccccccc: HASHED } } }));
    render(
      <>
        <TileChip plan={PLAN} artBase={BASE} />
        <TileChip plan={PLAN} artBase={BASE} />
      </>,
    );
    await waitFor(() => expect(screen.getAllByRole("img", { name: /^Tile / }).every((c) => c.querySelector("img"))).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the plan's areas, not the original, while the manifest is read", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<TileChip plan={PLAN} artBase={BASE} />);
    expect(screen.getByRole("img", { name: /^Tile / })).toHaveAttribute("data-view", "areas");
  });

  it.each([
    ["has no manifest (404)", () => new Response("", { status: 404 })],
    ["gets a page that is not JSON", () => new Response("<html></html>", { status: 200 })],
    ["gets a manifest that lists no 256 px copies", () => json({ models: {} })],
    ["gets a manifest that lists no copy of the plan", () => json({ models: {}, tiles: { "256": { fffffffff: "tiles/x.png" } } })],
  ])("asks for the original when the host %s", async (_, response) => {
    fetchMock.mockImplementation(async () => response());
    render(<TileChip plan={PLAN} artBase={BASE} />);
    await waitFor(() => expect(src()).toBe(`${BASE}/assets/tiles/ccccccccc.png`));
  });

  it("asks for the original, never a blank chip, when the read fails, and reads again for the next chip", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    const first = render(<TileChip plan={PLAN} artBase={BASE} />);
    await waitFor(() => expect(src()).toBe(`${BASE}/assets/tiles/ccccccccc.png`));
    first.unmount();
    fetchMock.mockResolvedValue(json({ models: {}, tiles: { "256": { ccccccccc: HASHED } } }));
    render(<TileChip plan={PLAN} artBase={BASE} />);
    await waitFor(() => expect(src()).toBe(`${BASE}/${HASHED}`));
  });

  it("asks for the original when the server fails (500)", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    render(<TileChip plan={PLAN} artBase={BASE} />);
    await waitFor(() => expect(src()).toBe(`${BASE}/assets/tiles/ccccccccc.png`));
  });

  it("reads nothing without an art base or in the areas view", () => {
    render(
      <>
        <TileChip plan={PLAN} />
        <TileChip plan={PLAN} artBase={BASE} view="areas" />
      </>,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getAllByRole("img", { name: /^Tile / }).map((c) => c.getAttribute("data-view"))).toEqual(["areas", "areas"]);
  });
});

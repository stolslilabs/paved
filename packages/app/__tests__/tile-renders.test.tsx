import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TileRender } from "../src/components/elements/tile-render";
import { resetManifestBodies } from "../src/data/renderer-manifest";
import { readRenders, resetTileRenders, useThemeVariants, useTileRenders } from "../src/data/tile-renders";

// THEMES-RENDERS: the theme pages' images come from the manifest's `renders` (one read of the page), never a WebGL context.

const BASE = "/renderer-assets";
const RENDER = "renders/ccccccccc.1.0123456789.webp";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  resetTileRenders();
  resetManifestBodies();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("the tiles' renders", () => {
  it("reads the manifest's renders and each theme's variant counts, and skips what is not one", () => {
    expect(readRenders({ renders: { "1": { ccccccccc: RENDER, bad: 3 } }, themes: { "1": { ccccccccc: ["a", "b"], bad: "x" } } })).toEqual({
      renders: { "1": { ccccccccc: RENDER } },
      variants: { "1": { ccccccccc: 2 } },
    });
    expect(readRenders(null)).toBeNull();
  });

  it("resolves a plan's render in a theme once the manifest is read, null for one it does not list", async () => {
    fetchMock.mockResolvedValue(json({ models: {}, renders: { "1": { ccccccccc: RENDER } }, themes: { "1": { ccccccccc: ["a", "b", "c"] } } }));
    const { result } = renderHook(() => ({ renders: useTileRenders(BASE), variants: useThemeVariants(BASE, 1) }));
    expect(result.current.renders?.(1, "ccccccccc")).toBeNull();
    await waitFor(() => expect(result.current.renders?.(1, "ccccccccc")).toBe(`${BASE}/${RENDER}`));
    expect(result.current.renders?.(0, "ccccccccc")).toBeNull();
    expect(result.current.variants).toEqual({ ccccccccc: 3 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("draws the render as one lazy image, and the plan's chip without one", () => {
    const { unmount } = render(<TileRender plan={1} theme={1} renders={() => `${BASE}/${RENDER}`} />);
    const img = screen.getByRole("img", { name: "Tile 1" });
    expect(img).toHaveAttribute("src", `${BASE}/${RENDER}`);
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("draggable", "false");
    unmount();
    render(<TileRender plan={1} theme={1} />);
    expect(screen.getByRole("img", { name: /^Tile / })).toHaveAttribute("data-view", "areas");
    expect(document.querySelector("canvas")).toBeNull();
  });
});

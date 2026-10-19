import { act, renderHook, waitFor } from "@testing-library/react";
import type { GameScene, HoverState, TileRenderData } from "@paved/renderer";
import { describe, expect, it, vi } from "vitest";
import { useDropThenConfirm } from "../src/components/containers/board-viewport";

// PLACE-POLISH (#568): the voxel drop when the session accepts a move, then the green.
const tile = (id: number, x: number, y: number) => ({ game_id: 1, id, player_id: "0x0", plan: 3, orientation: 1, x, y, worldX: x, worldZ: y }) as TileRenderData;
const confirm = (key: number, x = 1, y = 0) => ({ x, y, valid: true, idle: true, placed: false, planIndex: 3, orientation: 1, key }) as HoverState & { key: number };

function fakeScene(result: "started" | "skipped") {
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => (finish = resolve));
  const dropTile = vi.fn(async () => (result === "started" ? { status: "started" as const, info: {}, finished } : { status: "skipped" as const, reason: "reduced-motion" }));
  return { scene: { dropTile } as unknown as GameScene, dropTile, finish: () => act(() => finish()) };
}

type Props = { tiles: TileRenderData[]; confirmed: (HoverState & { key: number }) | null };
const setup = (scene: GameScene, initial: Props) =>
  renderHook(({ tiles, confirmed }: Props) => useDropThenConfirm(scene, tiles, confirmed, 100), { initialProps: initial });

describe("useDropThenConfirm", () => {
  it("drops the landed tile, then hands the green on once the drop is over, then lets it go", async () => {
    const { scene, dropTile, finish } = fakeScene("started");
    const { result, rerender } = setup(scene, { tiles: [tile(1, 0, 0)], confirmed: null });
    rerender({ tiles: [tile(1, 0, 0), tile(2, 1, 0)], confirmed: confirm(1) });
    await waitFor(() => expect(dropTile).toHaveBeenCalledWith(expect.objectContaining({ id: 2 })));
    expect(result.current).toBeNull();
    await finish();
    await waitFor(() => expect(result.current).toMatchObject({ x: 1, y: 0, key: 1 }));
    await waitFor(() => expect(result.current).toBeNull(), { timeout: 1000 });
  });

  it("a skipped drop (reduced motion, no model) goes straight to the green", async () => {
    const { scene } = fakeScene("skipped");
    const { result, rerender } = setup(scene, { tiles: [], confirmed: null });
    rerender({ tiles: [tile(2, 1, 0)], confirmed: confirm(1) });
    await waitFor(() => expect(result.current).toMatchObject({ key: 1 }));
  });

  it("a failed drop (its chunk did not download) still gives the green, this move's and the next's", async () => {
    const dropTile = vi.fn(async () => {
      throw new Error("Failed to fetch dynamically imported module");
    });
    const scene = { dropTile } as unknown as GameScene;
    const { result, rerender } = setup(scene, { tiles: [], confirmed: null });
    rerender({ tiles: [tile(2, 1, 0)], confirmed: confirm(1) });
    await waitFor(() => expect(result.current).toMatchObject({ key: 1 }));
    rerender({ tiles: [tile(2, 1, 0), tile(3, 2, 0)], confirmed: confirm(2, 2, 0) });
    await waitFor(() => expect(result.current).toMatchObject({ key: 2, x: 2 }));
    expect(dropTile).toHaveBeenCalledTimes(2);
  });

  it("a refused move rolled back while it dropped: no green on the empty cell", async () => {
    const { scene, finish } = fakeScene("started");
    const { result, rerender } = setup(scene, { tiles: [], confirmed: null });
    rerender({ tiles: [tile(2, 1, 0)], confirmed: confirm(1) });
    // The rollback removes the tile (which cuts its drop in the renderer).
    rerender({ tiles: [], confirmed: confirm(1) });
    await finish();
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toBeNull();
  });

  it("never plays at the first frame or a reload: the key the board opens with is not dropped", async () => {
    const { scene, dropTile } = fakeScene("started");
    const { result } = setup(scene, { tiles: [tile(2, 1, 0)], confirmed: confirm(7) });
    await new Promise((r) => setTimeout(r, 20));
    expect(dropTile).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("does not hold the next tile: a newer confirm's green wins over an older drop's", async () => {
    const first = fakeScene("started");
    const { result, rerender } = setup(first.scene, { tiles: [], confirmed: null });
    rerender({ tiles: [tile(2, 1, 0)], confirmed: confirm(1) });
    rerender({ tiles: [tile(2, 1, 0), tile(3, 2, 0)], confirmed: confirm(2, 2, 0) });
    await waitFor(() => expect(first.dropTile).toHaveBeenCalledTimes(2));
    await first.finish();
    await waitFor(() => expect(result.current).toMatchObject({ key: 2, x: 2 }));
  });
});

import { act, render } from "@testing-library/react";
import type { TileRenderData } from "@paved/renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StackView, type StackTile } from "../src/components/containers/stack-view";

// STACK-3D: the stack's canvas recorded instead of drawn (jsdom has no WebGL): the tiles it is handed, frame by frame.
const canvas = vi.hoisted(() => ({ tiles: [] as TileRenderData[][], onError: undefined as (() => void) | undefined }));
vi.mock("@paved/renderer/react", () => ({
  GameCanvas: (props: { tiles: TileRenderData[]; onError?: () => void }) => {
    canvas.tiles.push(props.tiles);
    canvas.onError = props.onError;
    return null;
  },
}));

const view = (tiles: StackTile[], onError?: () => void) => (
  <StackView tiles={tiles} enterLift={0} target={[0, 0, 0]} heightPx={300} unitPx={20} onError={onError} />
);
const lift = () => canvas.tiles.at(-1)?.[0]?.lift ?? NaN;
const ease = (k: number) => 1 - (1 - k) ** 3;

beforeEach(() => {
  canvas.tiles.length = 0;
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
});
afterEach(() => vi.useRealTimers());

describe("the stack's 3D view", () => {
  it("glides a tile from where it was, on the easing of the time since the glide began (not compounded frame by frame)", () => {
    const tile: StackTile = { id: 1, plan: 3, orientation: 1, lift: 0, scale: 1 };
    const { rerender } = render(view([tile]));
    act(() => vi.advanceTimersByTime(400));
    expect(lift()).toBe(0);
    rerender(view([{ ...tile, lift: 10 }]));
    act(() => vi.advanceTimersByTime(130));
    // Halfway in time: within the easing of 40 % and 60 % of it, not near its end (a compounded glide is past 9.9 by now).
    expect(lift()).toBeGreaterThan(10 * ease(0.4));
    expect(lift()).toBeLessThan(10 * ease(0.6));
    act(() => vi.advanceTimersByTime(400));
    expect(lift()).toBe(10);
  });

  it("tells the stack when its scene cannot start", () => {
    const onError = vi.fn();
    render(view([{ id: 1, plan: 3, orientation: 1, lift: 0, scale: 1 }], onError));
    canvas.onError?.();
    expect(onError).toHaveBeenCalledOnce();
  });
});

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RENDERER_SETTINGS, PIXEL_RATIO_CAPS, capPixelRatio, resolveMaxPixelRatio } from "@paved/renderer";
import type { GameCanvasProps } from "@paved/renderer/react";
import { BoardViewport } from "../src/components/containers/board-viewport";

// The renderer's canvas, as the board gives it its props. jsdom has no WebGL.
const canvas = vi.hoisted(() => ({ props: null as GameCanvasProps | null }));
vi.mock("@paved/renderer/react", () => ({
  GameCanvas: (props: GameCanvasProps) => {
    canvas.props = props;
    return <canvas data-testid="renderer" />;
  },
}));

beforeEach(() => {
  canvas.props = null;
});

describe("the board's pixel ratio (OUT-LOD)", () => {
  it("leaves the cap to the renderer's \"auto\"", () => {
    render(<BoardViewport tiles={[]} basePath="/renderer-assets" />);
    expect(canvas.props).not.toBeNull();
    expect(canvas.props?.settings?.maxPixelRatio).toBeUndefined();
    expect(DEFAULT_RENDERER_SETTINGS.maxPixelRatio).toBe("auto");
  });

  it("draws a Retina desktop at 1.5 and a phone at 2", () => {
    expect(PIXEL_RATIO_CAPS).toEqual({ coarse: 2, fine: 1.5 });
    const desktop = { coarsePointer: false, width: 1440, height: 900 };
    const phone = { coarsePointer: true, width: 390, height: 844 };
    expect(capPixelRatio(2, resolveMaxPixelRatio("auto", desktop))).toBe(1.5);
    expect(capPixelRatio(1, resolveMaxPixelRatio("auto", desktop))).toBe(1);
    expect(capPixelRatio(3, resolveMaxPixelRatio("auto", phone))).toBe(2);
  });
});

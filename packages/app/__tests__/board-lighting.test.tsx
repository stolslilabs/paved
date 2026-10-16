import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOOK_PRESETS, resolveRendererSettings } from "@paved/renderer";
import type { GameCanvasProps } from "@paved/renderer/react";
import { BoardViewport } from "../src/components/containers/board-viewport";
import { LOOK_FIELDS, lookArgTypes, lookInput } from "../src/stories/renderer/lighting-look";

// The renderer's canvas, as the board gives it its props. jsdom has no WebGL.
const canvas = vi.hoisted(() => ({ props: null as GameCanvasProps | null }));
vi.mock("@paved/renderer/react", () => ({
  GameCanvas: (props: GameCanvasProps) => {
    canvas.props = props;
    return <canvas data-testid="renderer" />;
  },
}));

describe("the board's lighting (LIGHT)", () => {
  beforeEach(() => {
    canvas.props = null;
  });

  it("leaves the look and the quality to the renderer's defaults: the Mockup preset, quality \"auto\"", () => {
    render(<BoardViewport tiles={[]} />);
    const settings = resolveRendererSettings(canvas.props?.settings ?? {});
    expect(settings.lookPreset).toBe("mockup");
    expect(settings.look).toEqual(LOOK_PRESETS.mockup);
    expect(settings.quality).toBe("auto");
  });

  it("gives the Lighting story a control for every field of the look", () => {
    const types = lookArgTypes();
    for (const group of Object.keys(LOOK_PRESETS.mockup)) {
      const fields = Object.keys(LOOK_PRESETS.mockup[group as keyof typeof LOOK_PRESETS.mockup] as object);
      for (const field of typeof LOOK_PRESETS.mockup[group as keyof typeof LOOK_PRESETS.mockup] === "object" ? fields : [""]) {
        const arg = field ? `${group}${field[0].toUpperCase()}${field.slice(1)}` : group;
        expect(types[arg], arg).toBeDefined();
      }
    }
    expect(Object.keys(types)).toHaveLength(LOOK_FIELDS.length);
  });

  it("turns the story's args into a partial look: unset args keep the preset's value", () => {
    expect(lookInput({})).toEqual({});
    expect(lookInput({ bloomStrength: 0.4, aoEnabled: false, background: "#000000", other: 1 })).toEqual({
      bloom: { strength: 0.4 },
      ao: { enabled: false },
      background: "#000000",
    });
  });
});

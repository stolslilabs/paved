import type { Meta, StoryObj } from "@storybook/react-vite";
import { OutlinesBoard, SETTINGS_DEFAULTS } from "./outlines-board";
import { MAX_DISTANCE, MIN_DISTANCE, VIEWS } from "./outlines-tour";

/**
 * The voxel tiles' outlines on the recorded 72-tile board (R-OUT): they thin as the camera zooms out until they vanish,
 * stop at a maximum width zoomed in, and never flicker while the camera pans. The tour goes through the views where the
 * old 1-pixel lines failed; stop it to hold one view and set its distance. Under reduced motion nothing moves by itself.
 */
const meta = {
  title: "Renderer/Outlines",
  component: OutlinesBoard,
  parameters: { layout: "fullscreen" },
  argTypes: {
    tour: { control: "boolean", description: "Pan and zoom through the views by itself (off under reduced motion)" },
    view: { control: "select", options: VIEWS, description: "The view held while the tour is off" },
    distance: {
      control: { type: "range", min: MIN_DISTANCE, max: MAX_DISTANCE, step: 1 },
      description: `Camera distance while the tour is off: ${MIN_DISTANCE} fully zoomed in, ${MAX_DISTANCE} fully zoomed out`,
    },
    redraw: { control: "boolean", description: "Draw every frame even when nothing moves (frame-time measures)" },
    readout: { control: "boolean", description: "Show the zoom (camera distance, tile size on screen) and the outlines' stroke" },
    fadeThresholdTilePx: {
      control: { type: "range", min: 0, max: 300, step: 1 },
      description: "Outlines off at or below this tile size on screen (CSS px): read it off the readout",
      table: { category: "Outlines" },
    },
    fadeRangeTilePx: { control: { type: "range", min: 0, max: 200, step: 1 }, description: "Fade-in range above the threshold (tile px)", table: { category: "Outlines" } },
    maxWidthPx: { control: { type: "range", min: 1, max: 6, step: 0.25 }, description: "Maximum outline width (CSS px)", table: { category: "Outlines" } },
    maxWidthTilePx: { control: { type: "range", min: 100, max: 2000, step: 10 }, description: "Tile size (px) at which the width reaches its maximum", table: { category: "Outlines" } },
    minDistance: { control: { type: "range", min: 1, max: 60, step: 1 }, description: "Closest camera distance (fully zoomed in)", table: { category: "Camera" } },
    maxDistance: { control: { type: "range", min: 60, max: 600, step: 5 }, description: "Farthest camera distance (fully zoomed out)", table: { category: "Camera" } },
    capZoomOut: { control: "boolean", description: "Fallback: stop zooming out at the cap distance instead", table: { category: "Camera" } },
    zoomOutCapDistance: { control: { type: "range", min: 20, max: 600, step: 5 }, description: "Farthest distance while the cap is on", table: { category: "Camera" } },
  },
  args: { tour: true, view: "default", redraw: false, readout: true, ...SETTINGS_DEFAULTS },
} satisfies Meta<typeof OutlinesBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The tour: default view, top view, a pan, fully zoomed out, fully zoomed in, and back. */
export const Tour: Story = {};

/** One view held, its distance on the control. */
export const Held: Story = { args: { tour: false, view: "top" } };

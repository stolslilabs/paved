import type { Meta, StoryObj } from "@storybook/react-vite";
import { OutlinesBoard, SETTINGS_DEFAULTS } from "./outlines-board";
import { MAX_DISTANCE, MIN_DISTANCE, VIEWS } from "./outlines-tour";

/**
 * The voxel tiles' outlines on the recorded 72-tile board (R-OUT, R-VIS): dark grey antialiased strokes whose width is a
 * share of a voxel (a hairline over most of the zoom range, capped zoomed in), fading out as the camera zooms out (fully
 * on at the tile size the board opens at on this screen, off at 0.85 of it), and never flickering while it pans. The
 * tour goes through the views where the old 1-pixel lines failed; stop it to hold one view and set its distance. Under
 * reduced motion nothing moves by itself.
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
    force: {
      control: "inline-radio",
      options: ["auto", "on", "off"],
      description: "Outlines on software WebGL (SwiftShader, llvmpipe...): auto turns them off there; on and off force them whatever the detection says. The console logs the path taken",
      table: { category: "Outlines" },
    },
    fadeFullFactor: {
      control: { type: "range", min: 0.5, max: 2, step: 0.01 },
      description: "Outlines fully on from this share of the tile size the board opens at on this screen (the readout's \"opens at\")",
      table: { category: "Outlines" },
    },
    fadeOffFactor: {
      control: { type: "range", min: 0.3, max: 2, step: 0.01 },
      description: "Outlines off at or below this share of the opening tile size; linear fade up to the fully-on share",
      table: { category: "Outlines" },
    },
    widthVoxels: {
      control: { type: "range", min: 0, max: 0.2, step: 0.005 },
      description: "Width in the world, as a fraction of a voxel's width (0.015: 1.5 %); a tile is 40 voxels a side",
      table: { category: "Outlines" },
    },
    minWidthDevicePx: {
      control: { type: "range", min: 0.25, max: 3, step: 0.25 },
      description: "Thinnest stroke (device px): the width never draws thinner. Under 1, a 1 px line at that share of its opacity",
      table: { category: "Outlines" },
    },
    maxWidthPx: { control: { type: "range", min: 0.5, max: 6, step: 0.25 }, description: "Widest stroke (CSS px): the cap zoomed in", table: { category: "Outlines" } },
    color: { control: "color", description: "Outline colour as it shows on screen; converted to the value the outline pass writes for the default (Mockup) look, so another look shifts it", table: { category: "Outlines" } },
    segmentOffDevicePx: {
      control: { type: "range", min: 0, max: 4, step: 0.25 },
      description: "Screen-size cut: a segment shorter on screen than this (device px) is not drawn. 0 with the next at 0: no cut",
      table: { category: "Outlines" },
    },
    segmentFullDevicePx: {
      control: { type: "range", min: 0, max: 4, step: 0.25 },
      description: "A segment at least this long on screen (device px) is drawn fully; it fades in from the cut",
      table: { category: "Outlines" },
    },
    minDistance: { control: { type: "range", min: 1, max: 60, step: 1 }, description: "Closest camera distance (fully zoomed in)", table: { category: "Camera" } },
    maxDistance: { control: { type: "range", min: 60, max: 600, step: 5 }, description: "Farthest camera distance (fully zoomed out)", table: { category: "Camera" } },
    capZoomOut: { control: "boolean", description: "Fallback: stop zooming out at the cap distance instead", table: { category: "Camera" } },
    zoomOutCapDistance: { control: { type: "range", min: 20, max: 600, step: 5 }, description: "Farthest distance while the cap is on", table: { category: "Camera" } },
    multisampling: {
      // `on` and `off` map to the booleans; a URL may also give `multisampling:!true`.
      control: { type: "select", labels: { auto: "auto", on: "on", off: "off" } },
      options: ["auto", "on", "off"],
      mapping: { auto: "auto", on: true, off: false },
      description: "Face antialiasing: MSAA (4 samples) where WebGL 2 multisamples on a GPU, SMAA at the end of the chain otherwise (software WebGL, no multisampling). auto: on on a coarse pointer or a small screen, off elsewhere (MSAA misses 12 ms on the Mac profile)",
      table: { category: "Quality" },
    },
    maxPixelRatio: {
      // Keys without a dot, so a URL can name one (`args=maxPixelRatio:x1_5`); `mapping` gives the renderer the number.
      control: { type: "select", labels: { auto: "auto", x1: "1", x1_5: "1.5", x2: "2", x3: "3" } },
      options: ["auto", "x1", "x1_5", "x2", "x3"],
      mapping: { auto: "auto", x1: 1, x1_5: 1.5, x2: 2, x3: 3 },
      description: "Highest pixel ratio the board is drawn at: min(screen's, this). auto: 2 on a coarse pointer or a small screen, 1 elsewhere. Under the screen's, the board is upscaled and a hairline shows wider and soft",
      table: { category: "Quality" },
    },
  },
  args: { tour: true, view: "default", redraw: false, readout: true, ...SETTINGS_DEFAULTS },
} satisfies Meta<typeof OutlinesBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The tour: default view, top view, a pan, fully zoomed out, fully zoomed in, and back. */
export const Tour: Story = {};

/** One view held, its distance on the control. */
export const Held: Story = { args: { tour: false, view: "top" } };

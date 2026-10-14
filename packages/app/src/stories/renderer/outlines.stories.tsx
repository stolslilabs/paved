import type { Meta, StoryObj } from "@storybook/react-vite";
import { OutlinesBoard } from "./outlines-board";
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
  },
  args: { tour: true, view: "default", redraw: false },
} satisfies Meta<typeof OutlinesBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The tour: default view, top view, a pan, fully zoomed out, fully zoomed in, and back. */
export const Tour: Story = {};

/** One view held, its distance on the control. */
export const Held: Story = { args: { tour: false, view: "top" } };

import type { Meta, StoryObj } from "@storybook/react-vite";
import { PressPlaceBoard } from "./press-place-board";

/**
 * Press and place (PRESS-PLACE, #680) on a Training game: with no tile shown, a long press on a lit cell shows the tile
 * there after 150 ms without a pan and starts Validate's hold at once, its ring filling; held 0.8 s, the tile is placed (the
 * drop, then the green). Let go early, the tile stays shown, as after a tap: rotate it and hold again (on the tile or on
 * Validate). A long press on another lit cell moves the tile there and holds it the same. A pan shows nothing, a cell
 * where the tile cannot go does nothing, and a tap is the tap it was.
 */
const meta = {
  title: "Renderer/Press and place",
  component: PressPlaceBoard,
  parameters: { layout: "fullscreen" },
  globals: { viewport: { value: "mobile", isRotated: false } },
} satisfies Meta<typeof PressPlaceBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const OnePress: Story = {};

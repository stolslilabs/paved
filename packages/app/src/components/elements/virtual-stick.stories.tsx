import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { VirtualStick } from "./virtual-stick";

/**
 * The first-person walk's virtual stick (V4-WALK-1, #876): on touch, one moves at the bottom left and one looks at the bottom
 * right. At least 120 px, translucent over the board; the knob follows the thumb to the rim and comes back when let go.
 */
const meta = {
  title: "Elements/VirtualStick",
  component: VirtualStick,
  parameters: { layout: "centered" },
  args: { label: "Move", onTilt: fn() },
} satisfies Meta<typeof VirtualStick>;
export default meta;
type Story = StoryObj<typeof meta>;

/** At rest: the knob in the centre. */
export const Idle: Story = {};
/** Tilted up and right, as a thumb holds it. */
export const Tilted: Story = { args: { label: "Look", initialTilt: { x: 0.55, y: 0.6 } } };
/** The smallest size it takes (120 px): a smaller `size` is raised to it. */
export const Smallest: Story = { args: { size: 80 } };

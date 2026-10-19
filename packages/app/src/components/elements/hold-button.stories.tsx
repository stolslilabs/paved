import type { Meta, StoryObj } from "@storybook/react-vite";
import { fireEvent, fn, within } from "storybook/test";
import { HOLD_MS, HoldButton } from "./hold-button";

/**
 * Held to act (PLACE-POLISH, #568): a ring fills around the icon over `holdMs` (about 0.8 s); letting go before the end
 * rewinds it and does nothing. With the mouse, a finger, or Enter and Space held. The bubble's Validate.
 */
const meta = {
  title: "Elements/HoldButton",
  component: HoldButton,
  parameters: { layout: "centered" },
  args: { label: "Hold to place the tile", icon: "check", holdMs: HOLD_MS, onComplete: fn(), className: "size-11 rounded-full" },
  argTypes: { holdMs: { control: { type: "range", min: 200, max: 3000, step: 50 }, description: "The hold's length, ms" } },
} satisfies Meta<typeof HoldButton>;
export default meta;
type Story = StoryObj<typeof meta>;

/** At rest: hold it to act. */
export const Default: Story = {};
/** Held: the ring fills (a 6 s hold here, so it can be looked at). */
export const Holding: Story = {
  args: { holdMs: 6000 },
  play: async ({ canvasElement }) => {
    fireEvent.pointerDown(within(canvasElement).getByRole("button"), { button: 0 });
  },
};
/** The move is on its way: a spinner, disabled. */
export const Busy: Story = { args: { busy: true } };
/** Nothing to act on yet. */
export const Disabled: Story = { args: { disabled: true } };
/** A slow hold, for a sensitive action elsewhere. */
export const SlowHold: Story = { args: { holdMs: 1500 } };

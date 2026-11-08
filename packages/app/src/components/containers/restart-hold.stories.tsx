import type { Meta, StoryObj } from "@storybook/react-vite";
import { fireEvent, fn, within } from "storybook/test";
import { HOLD_MS } from "../elements/hold-button";
import { HudFrame } from "../elements/hud-frame";
import { RestartHold } from "./restart-hold";

/**
 * Story's Restart on the board (GAME-OVERLAY): the painted red arrow, held as the tile's Discard (the red rail filling round it, the
 * charge's ticks, the burst); the hold is the confirmation. On the HUD's frame, as in the board's header.
 */
const meta = {
  title: "Containers/RestartHold",
  component: RestartHold,
  parameters: { layout: "centered" },
  args: { onRestart: fn(), holdMs: HOLD_MS, className: "size-11 shrink-0 rounded-full p-0" },
  argTypes: { holdMs: { control: { type: "range", min: 200, max: 6000, step: 50 }, description: "The hold's length, ms" } },
  decorators: [
    (Story) => (
      <div className="relative isolate flex items-center p-2">
        <HudFrame px={13} />
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RestartHold>;
export default meta;
type Story = StoryObj<typeof meta>;

/** At rest: hold it to restart the level. */
export const Default: Story = {};
/** Held: the red rail fills round the arrow (a 6 s hold here, so it can be looked at). */
export const Holding: Story = {
  args: { holdMs: 6000 },
  play: async ({ canvasElement }) => {
    fireEvent.pointerDown(within(canvasElement).getByRole("button"), { button: 0 });
  },
};
/** The level's intro or end over the board: it keeps its place, dimmed. */
export const Disabled: Story = { args: { disabled: true } };

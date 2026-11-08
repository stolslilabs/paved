import type { Meta, StoryObj } from "@storybook/react-vite";
import { UiIcon } from "./ui-icon";
import { CoachMark } from "./coach-mark";

/**
 * The coach mark (GAME-OVERLAY): the opened chest's light behind the control a Story tip names, the same on every target. The board's
 * own uses are in `Scenes/Board` (StoryCoach*) and `Containers/TileBubble` (Coached, CoachedDiscard).
 */
const meta = {
  title: "Elements/CoachMark",
  component: CoachMark,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <span className="relative isolate grid size-11 place-items-center">
        {Story()}
        <UiIcon name="settings" px={32} className="drawer-icon size-8" />
      </span>
    ),
  ],
} satisfies Meta<typeof CoachMark>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Behind a 44 px control (the gear): a flash as it comes, two fans turning either way, the glow breathing, the waves. */
export const OnAControl: Story = {};
/** Under reduced motion: the two fans and the glow, still. */
export const Reduced: Story = { parameters: { reducedMotion: "always" } };

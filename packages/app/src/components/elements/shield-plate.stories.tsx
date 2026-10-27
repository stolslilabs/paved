import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, screen, userEvent, within } from "storybook/test";
import { HOUR, MOCK_NOW } from "../../mocks/clock";
import { ShieldPlate } from "./shield-plate";

/** The home's left column, over the village's sky: where the plate sits, under the League control (#829). */
function Corner({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-32 flex-col items-start gap-3 bg-gradient-to-b from-background/40 to-board p-2 tablet:p-4">{children}</div>;
}

/**
 * The village's shield (#806, revised by #829 on 2026-10-27): the balances' plate (#828) mirrored, the shield over its left end,
 * the time left as `HHhMMm`, the minutes rounded up (never 00h00m while up). A tap opens until when, and the rule. `auto` (the
 * home's) is the phone's size below `desktop` and the larger from it.
 */
const meta = {
  title: "Elements/ShieldPlate",
  component: ShieldPlate,
  args: { endsAt: MOCK_NOW + 7 * HOUR + 42 * 60, now: MOCK_NOW },
  render: (args) => (
    <Corner>
      <ShieldPlate {...args} />
    </Corner>
  ),
} satisfies Meta<typeof ShieldPlate>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 7 hours 42 minutes left: 07h42m. */
export const Shielded: Story = {};
/** The popover open: until when, no one can attack, attacking drops it. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("button", { name: "Shielded, 7 hours 42 minutes left" }));
    await expect(await screen.findByRole("dialog", { name: "Shield" })).toHaveTextContent("Attacking drops your shield.");
  },
};
/** Under an hour left: 00h42m. */
export const UnderAnHour: Story = { args: { endsAt: MOCK_NOW + 42 * 60 - 20 } };
/** The last minute: 00h01m, never 00h00m while it is up. */
export const LastMinute: Story = { args: { endsAt: MOCK_NOW + 25 } };
/** The shield ended (or none): nothing. */
export const Ended: Story = { args: { endsAt: MOCK_NOW - 1 } };
/** Both fixed sizes: the phone's and `desktop`'s. */
export const Sizes: Story = {
  render: (args) => (
    <Corner>
      <ShieldPlate {...args} size="sm" />
      <ShieldPlate {...args} size="md" />
    </Corner>
  ),
};

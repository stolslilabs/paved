import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { MOCK_NOW, MOCK_TIME_ZONE } from "../../mocks/clock";
import { Deadline } from "./deadline";


/** The clock and the time zone are fixed, so every viewer reads the same text. */
const meta = {
  title: "Elements/Deadline",
  component: Deadline,
  parameters: { layout: "padded" },
  args: { now: MOCK_NOW, expiresAt: MOCK_NOW + 23 * 3600 + 12 * 60, timeZone: MOCK_TIME_ZONE },
} satisfies Meta<typeof Deadline>;
export default meta;
type Story = StoryObj<typeof meta>;

export const HoursLeft: Story = {};
/** A purchase now: 24 h. */
export const FullDay: Story = { args: { expiresAt: MOCK_NOW + 86_400 } };
export const MinutesLeft: Story = { args: { expiresAt: MOCK_NOW + 45 * 60 } };
/** Focus the local time: the tooltip gives it in UTC. */
export const UtcTooltip: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(within(canvasElement).getByText(/Oct/)).toHaveFocus();
  },
};
/** WRAP360: the widest relative time; the local time wraps to its own line when the line is full. */
export const Stress: Story = { args: { expiresAt: MOCK_NOW + 999 * 3600 + 59 * 60 }, decorators: [(Story) => <div className="max-w-40 text-sm"><Story /></div>] };

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TODAY } from "../../mocks/players";
import { DayPicker } from "./day-picker";

const meta = {
  title: "Elements/DayPicker",
  component: DayPicker,
  parameters: { layout: "padded" },
  args: { day: TODAY, today: TODAY, first: TODAY - 30, onChange: fn() },
  decorators: [(Story) => <div className="max-w-xs"><Story /></div>],
} satisfies Meta<typeof DayPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Today: no next day. */
export const Today: Story = {};
/** A closed day: back and forward. */
export const PastDay: Story = { args: { day: TODAY - 3 } };
/** The first day there is: no previous day. */
export const FirstDay: Story = { args: { day: TODAY - 30 } };

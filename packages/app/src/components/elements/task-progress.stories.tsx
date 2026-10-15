import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskProgress } from "./task-progress";
import { BIG_NUMBER, LONG_SENTENCE } from "../../mocks/stress";

const meta = {
  title: "Elements/TaskProgress",
  component: TaskProgress,
  parameters: { layout: "padded" },
  args: { unit: "points", count: 2_700, total: 3_000 },
  decorators: [(Story) => <div className="max-w-sm rounded-xl bg-card p-4"><Story /></div>],
} satisfies Meta<typeof TaskProgress>;
export default meta;
type Story = StoryObj<typeof meta>;

export const InProgress: Story = {};
export const NotStarted: Story = { args: { unit: "forests scored", count: 0, total: 3 } };
export const Complete: Story = { args: { unit: "Challenge games finished", count: 1, total: 1 } };
/** WRAP360: a long unit wraps beside the widest counts. */
export const Stress: Story = { args: { unit: LONG_SENTENCE, count: BIG_NUMBER - 1, total: BIG_NUMBER } };

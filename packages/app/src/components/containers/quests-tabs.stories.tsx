import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { QuestsTabs } from "./quests-tabs";

const meta = {
  title: "Containers/QuestsTabs",
  component: QuestsTabs,
  parameters: { layout: "padded" },
  args: { active: "quests", onSelect: fn() },
  decorators: [(Story) => <div className="max-w-md"><Story /></div>],
} satisfies Meta<typeof QuestsTabs>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Quests: Story = {};
export const Achievements: Story = { args: { active: "achievements" } };

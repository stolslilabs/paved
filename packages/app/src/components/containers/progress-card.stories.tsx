import type { Meta, StoryObj } from "@storybook/react-vite";
import { ACHIEVEMENTS_MIXED, QUESTS_TODAY } from "../../mocks/quests";
import { ProgressCard, type ProgressCardProps } from "./progress-card";
import { achievementText, questText } from "./quest-text";

const quest = (i: number): ProgressCardProps => {
  const q = QUESTS_TODAY.quests[i];
  return { kind: "quest", ...questText(q.questId), tasks: q.tasks, completed: q.completed, completedAt: q.completedAt, retired: q.retired };
};
const achievement = (i: number): ProgressCardProps => {
  const a = ACHIEVEMENTS_MIXED.achievements[i];
  return { kind: "achievement", ...achievementText(a.achievementId), tasks: a.tasks, completed: a.completed, completedAt: a.completedAt, points: a.points, retired: a.retired };
};

const meta = {
  title: "Containers/ProgressCard",
  component: ProgressCard,
  parameters: { layout: "padded" },
  args: quest(0),
  decorators: [(Story) => <div className="max-w-md"><Story /></div>],
} satisfies Meta<typeof ProgressCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const QuestComplete: Story = {};
export const QuestInProgress: Story = { args: quest(3) };
export const QuestToDo: Story = { args: quest(2) };
export const QuestRetired: Story = { args: { ...quest(1), retired: true } };
export const AchievementEarned: Story = { args: achievement(0) };
export const AchievementInProgress: Story = { args: achievement(5) };
export const AchievementLocked: Story = { args: achievement(8) };
/** An id the accepted list does not know: its number, no description. */
export const UnknownId: Story = { args: { ...quest(1), ...questText(42) } };

import type { Meta, StoryObj } from "@storybook/react-vite";
import { ACHIEVEMENTS_MIXED, QUESTS_TODAY } from "../../mocks/quests";
import { ProgressCard, type ProgressCardProps } from "./progress-card";
import { achievementText, questText } from "./quest-text";
import { BIG_NUMBER, LONG_LABEL, LONG_SENTENCE, LONG_WORD } from "../../mocks/stress";

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
/** WRAP360: a long title and rule with an unbroken compound, large points and counts. */
export const Stress: Story = {
  args: {
    ...achievement(0),
    title: LONG_LABEL,
    description: `${LONG_SENTENCE} ${LONG_WORD}`,
    points: BIG_NUMBER,
    tasks: achievement(0).tasks.map((t) => ({ ...t, count: BIG_NUMBER - 1, total: BIG_NUMBER })),
    retired: true,
  },
};
/** P-61: a complete quest's Cobbles to claim. */
export const QuestClaimable: Story = { args: { reward: { cobbles: 5, claimed: false } } };
/** ... its claim on its way. */
export const QuestClaiming: Story = { args: { reward: { cobbles: 5, claimed: false, claiming: true } } };
/** ... claimed. */
export const QuestClaimed: Story = { args: { reward: { cobbles: 5, claimed: true } } };
/** A quest in progress shows what it gives, nothing to claim yet. */
export const QuestRewardInProgress: Story = { args: { ...quest(3), reward: { cobbles: 10, claimed: false } } };
/** An earned achievement's Cobbles (its points) to claim. */
export const AchievementClaimable: Story = { args: { ...achievement(0), reward: { cobbles: 10, claimed: false } } };

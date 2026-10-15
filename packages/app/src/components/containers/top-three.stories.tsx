import type { Meta, StoryObj } from "@storybook/react-vite";
import { LEADERBOARD_TODAY, VIEWER_TODAY } from "../../mocks/players";
import { TopThree, TopThreeRow } from "./top-three";
import { STRESS_ENTRIES } from "../../mocks/stress";

const meta = {
  title: "Containers/TopThree",
  component: TopThree,
  parameters: { layout: "padded" },
  args: { entries: LEADERBOARD_TODAY.entries },
  decorators: [(Story) => <div className="max-w-sm rounded-xl bg-card p-4"><Story /></div>],
} satisfies Meta<typeof TopThree>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Podium: Story = {};
/** The viewer below the podium: their row follows, outlined. */
export const WithViewer: Story = { args: { viewer: VIEWER_TODAY } };
/** The viewer on the podium: their own row is outlined in place. */
export const ViewerOnPodium: Story = { args: { viewer: LEADERBOARD_TODAY.entries[1] } };
export const Empty: Story = { args: { entries: [] } };
/** One row alone (the podium's first, by username; the third has none: its short address). */
export const Row: Story = {
  render: () => (
    <ol className="flex flex-col gap-1.5">
      <TopThreeRow entry={LEADERBOARD_TODAY.entries[0]} />
      <TopThreeRow entry={LEADERBOARD_TODAY.entries[2]} />
      <TopThreeRow entry={VIEWER_TODAY} self />
    </ol>
  ),
};
/** WRAP360: the longest usernames and a full address, cut with their titles; the viewer's "(you)" stays. */
export const Stress: Story = { args: { entries: STRESS_ENTRIES.slice(0, 3), viewer: STRESS_ENTRIES[3] } };

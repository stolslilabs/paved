import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { DRAFT_VALID, LAYOUT_GROWING, fakeScore } from "../../mocks/village-v2";
import { VillageScore } from "./village-score";
import { bothThemes } from "../../stories/both-themes";
import { PHONE_375, WIDE_1440 } from "../scenes/viewports";

/** The home's left column, over the village's sky: where the capsule sits, under the crowns' (#829). */
function Corner({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-32 flex-col items-start gap-3 bg-gradient-to-b from-background/40 to-board p-2 tablet:p-4">{children}</div>;
}

/**
 * The village's capsule (#755, HOME-UI-2): the village's icon capping its left end, the total in it; a tap opens edit mode. A guest
 * or a village to look at shows the total alone. After a save the total counts to the new score (#802).
 */
const meta = {
  title: "Containers/VillageScore",
  component: VillageScore,
  args: { score: LAYOUT_GROWING.score, onEdit: fn() },
  decorators: [
    (Story) => (
      <Corner>
        <Story />
      </Corner>
    ),
  ],
} satisfies Meta<typeof VillageScore>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The player's village: a tap opens edit mode. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: `Edit village, score ${LAYOUT_GROWING.score}` }));
    await expect(args.onEdit).toHaveBeenCalled();
  },
};
/** A guest's starter village: the total alone, not a button. */
export const ReadOnly: Story = { args: { onEdit: undefined } };
/** A large score: the capsule grows with its figure. */
export const Large: Story = { args: { score: 128_450 } };
/** Back from a save (#802): the total counts up to the new score, green, a "+N" rising. */
export const Saved: Story = {
  args: { score: fakeScore(DRAFT_VALID), saved: { score: fakeScore(DRAFT_VALID), previous: LAYOUT_GROWING.score } },
  parameters: { reducedMotion: "never" },
};
export const DefaultPhone375: Story = { ...PHONE_375 };
export const DefaultWide1440: Story = { ...WIDE_1440 };
/** Both themes side by side. */
export const BothThemes: Story = { decorators: [bothThemes] };

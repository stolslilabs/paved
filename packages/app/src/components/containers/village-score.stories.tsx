import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { DRAFT_VALID, LAYOUT_GROWING, LAYOUT_START, LAYOUT_WONDER, fakeScore } from "../../mocks/village-v2";
import { VillageScore, type VillageScoreProps } from "./village-score";
import { bothThemes } from "../../stories/both-themes";

/** The home's left column, over the village's sky: where the score sits, under the League control (#829). */
function Corner({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-48 flex-col items-start gap-3 bg-gradient-to-b from-background/40 to-board p-2 tablet:p-4">{children}</div>;
}

/** The accordion with its own fold, as the home holds it: a tap folds or unfolds it. */
function Toggled(args: VillageScoreProps) {
  const [open, setOpen] = useState(args.open);
  return (
    <Corner>
      <VillageScore
        {...args}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          args.onOpenChange(next);
        }}
        className="ml-1"
      />
    </Corner>
  );
}

/**
 * The home's village score (#831, the owner's decisions of 2026-10-27): an inline accordion in the overlay, never a panel.
 * Folded, the total alone; a tap unfolds the four kinds' sums under it (roads, cities, forests, wonders, the most points first,
 * a kind with no structure at 0), with a short height animation (none under reduced motion). After a save the total counts up.
 */
const meta = {
  title: "Containers/VillageScore",
  component: VillageScore,
  args: { score: LAYOUT_GROWING.score, tiles: LAYOUT_GROWING.tiles, open: false, onOpenChange: fn() },
  render: (args) => <Toggled {...args} />,
} satisfies Meta<typeof VillageScore>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Folded: the house, the total, a chevron. */
export const Folded: Story = {};
/** Unfolded: the four kinds' sums under the total, adding up to it. */
export const Open: Story = { args: { open: true } };
/** A kind with no structure (the starter village has no Wonder): its sum shows 0, last. */
export const KindZero: Story = { args: { score: LAYOUT_START.score, tiles: LAYOUT_START.tiles, open: true } };
/** Around a closed Wonder: every kind scores. */
export const Wonder: Story = { args: { score: LAYOUT_WONDER.score, tiles: LAYOUT_WONDER.tiles, open: true } };
/** After a save (#802): the total counts up to the new score, a "+N" rising, the house popping; the kinds are the new layout's. */
export const Saved: Story = {
  args: { score: fakeScore(DRAFT_VALID), tiles: DRAFT_VALID, saved: { score: fakeScore(DRAFT_VALID), previous: LAYOUT_GROWING.score }, open: true },
  parameters: { reducedMotion: "never" },
};
/** A tap unfolds, another folds; the total is a button with `aria-expanded`, the kinds a list. */
export const Toggle: Story = {
  parameters: { reducedMotion: "never" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const total = canvas.getByRole("button", { name: /^Village score / });
    await userEvent.click(total);
    await expect(total).toHaveAttribute("aria-expanded", "true");
    await expect(within(await canvas.findByRole("list", { name: "Score by kind" })).getAllByRole("listitem")).toHaveLength(4);
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(true);
    await userEvent.click(total);
    await waitFor(() => expect(canvas.queryByRole("list", { name: "Score by kind" })).toBeNull());
  },
};
/** Reduced motion: the kinds come and go at once, the chevron turns without a transition. */
export const ToggleReducedMotion: Story = { ...Toggle, parameters: { reducedMotion: "always" } };

/** The village's house-tree and the kinds' game icons in both themes (issue 870): the app's dark theme and the light scope. */
export const OpenBothThemes: Story = { args: { open: true }, decorators: [bothThemes] };

import type { Meta, StoryObj } from "@storybook/react-vite";
import { SectionTitle } from "./section-title";
import { UiIcon } from "./ui-icon";

/**
 * A section's title in the HUD's drawer (PROFILE-PAGE, MISSIONS-PAGE): the display font, the engraved rule after it across the row,
 * and a control at its end if any. Drawn on the drawer's face. The title is a fixed word: no count, X/Y, total or timer in it nor at
 * its end (TILE-COUNTS, the owner's rule of 2026-11-07); `__tests__/section-title-rule.test.ts` enforces it.
 */
const meta = {
  title: "Elements/SectionTitle",
  component: SectionTitle,
  args: { children: "Hall of Fame" },
  decorators: [(Story) => <div className="max-w-md bg-secondary p-4"><Story /></div>],
} satisfies Meta<typeof SectionTitle>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The title alone, the rule to the row's end (the profile's Level, League, Hall of Fame). */
export const Plain: Story = {};

/** A painted icon before the word (Play's Ranked, Paid, Free, Limited). */
export const WithIcon: Story = {
  args: {
    children: (
      <>
        <UiIcon name="crown" px={28} className="drawer-icon size-7 self-center" />
        Ranked
      </>
    ),
  },
};

/** A control at the row's end (the profile's Stats span: a filter's chip and its cross), a gap either side of the rule. */
export const WithControl: Story = {
  args: {
    children: "Stats",
    end: (
      <span className="flex h-7 items-center gap-1 rounded-full bg-card/40 pr-1 pl-2.5 text-xs font-bold">
        <span className="text-outline pr-1.5">All time</span>
      </span>
    ),
  },
};

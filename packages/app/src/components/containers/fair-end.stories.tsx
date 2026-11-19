import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { FAIR_END } from "../../mocks/fair";
import { FairEnd } from "./fair-end";

/** A Fair try's end (the weekly individual event): the score against the player's best of the week, its place and tier, the next try. */
const meta = {
  title: "Containers/FairEnd",
  component: FairEnd,
  args: { onClose: fn(), onFair: fn(), onPlayAgain: fn(), instant: true },
} satisfies Meta<typeof FairEnd>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The result still read: the rows wait. */
export const Reading: Story = { args: FAIR_END.reading };
/** The week's first try: a new best, its place and tier. */
export const First: Story = { args: FAIR_END.first };
export const NewBest: Story = { args: FAIR_END.newBest };
/** Below the best: the place stands. */
export const Below: Story = { args: FAIR_END.below };
/** Under 1,000 points: the best does not count yet. */
export const UnderFloor: Story = { args: FAIR_END.underFloor };
/** The day's third try: none left, back to the Fair. */
export const Last: Story = { args: FAIR_END.last };
/** Ended past the week's end: it counts nowhere. */
export const Late: Story = { args: FAIR_END.late };

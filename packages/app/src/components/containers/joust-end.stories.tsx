import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { JOUST_END } from "../../mocks/joust";
import { PHONE_320, PHONE_375 } from "../scenes/viewports";
import { JoustEnd } from "./joust-end";

/** A Joust game's end (the weekly allegiance event): the score against the player's best, their allegiance's total, the next game. */
const meta = {
  title: "Containers/JoustEnd",
  component: JoustEnd,
  args: { onClose: fn(), onJoust: fn(), onPlayAgain: fn(), instant: true },
} satisfies Meta<typeof JoustEnd>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The result still read: the rows wait. */
export const Reading: Story = { args: JOUST_END.reading };
/** The first game of the joust: a new best, the total lifted. */
export const First: Story = { args: JOUST_END.first };
export const NewBest: Story = { args: JOUST_END.newBest };
/** Below the best: the total unchanged. */
export const Below: Story = { args: JOUST_END.below };
/** The third game: no game left, back to the joust. */
export const Last: Story = { args: JOUST_END.last };
/** A legal name of the most and widest letters: "+1,880 for …" wraps inside the carved card; at 320, 360 and 375. */
export const LongName320: Story = { args: JOUST_END.longName, ...PHONE_320 };
export const LongName360: Story = { args: JOUST_END.longName, globals: { viewport: { value: "mobile", isRotated: false } } };
export const LongName375: Story = { args: JOUST_END.longName, ...PHONE_375 };
/** Ended past the joust's end: it counts nowhere. */
export const Late: Story = { args: JOUST_END.late };

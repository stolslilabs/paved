import type { Meta, StoryObj } from "@storybook/react-vite";
import { GiftArt } from "./gift-art";

/**
 * The gift of the day's milestones (#869, the owner's decision of 2026-10-29): what a reward node shows instead of its figure. One
 * story per state, drawn large here (the graph draws it at 18 px); `Opening` plays the opening, `OpeningHeld` holds its last frame.
 */
const meta = {
  title: "Elements/GiftArt",
  component: GiftArt,
  args: { state: "ready", className: "text-[4rem]" },
  decorators: [(Story) => <div className="grid place-items-center p-10"><Story /></div>],
} satisfies Meta<typeof GiftArt>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Out of reach: greyed. */
export const Locked: Story = { args: { state: "locked" } };
/** Reached, no claim now (no wallet to sign, another claim on its way): lit, still. */
export const Lit: Story = { args: { state: "lit" } };
/** Reached: lit, a few shakes now and then. */
export const Ready: Story = { args: { state: "ready" } };
/** Its claim on its way: shaking fast. */
export const Shaking: Story = { args: { state: "shaking" } };
/** The claim landed: the box jumps, the lid pops off, the light bursts out. */
export const Opening: Story = { args: { state: "opening" } };
/** The opening's last frame, held. */
export const OpeningHeld: Story = { args: { state: "opening", held: true } };
/** Opened: the lid tilted off the box, its light inside. */
export const Open: Story = { args: { state: "open" } };

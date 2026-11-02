import type { Meta, StoryObj } from "@storybook/react-vite";
import { GiftArt } from "./gift-art";

/**
 * The gift of the milestones (#869, the owner's decision of 2026-10-29): what a reward node shows instead of its figure. One
 * story per state, drawn at 60 px here (the graph draws it at 18 px); `Opening` plays the opening, `OpeningHeld` holds its last frame.
 * The `Week*` ones are the week's gift (#976, `variant: "week"`): the same drawing and size, its ribbon the river blue with a gold
 * seam down each band (the owner's decision of 2026-11-01: colour or style, never size).
 */
const meta = {
  title: "Elements/GiftArt",
  component: GiftArt,
  args: { state: "ready", className: "text-6xl" },
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

/** The week's gift, out of reach: greyed, its seam kept. */
export const WeekLocked: Story = { args: { state: "locked", variant: "week" } };
/** The week's gift, reached, no claim now. */
export const WeekLit: Story = { args: { state: "lit", variant: "week" } };
/** The week's gift, reached: shaking now and then. */
export const WeekReady: Story = { args: { state: "ready", variant: "week" } };
/** The week's gift, its claim on its way. */
export const WeekShaking: Story = { args: { state: "shaking", variant: "week" } };
/** The week's gift opening, its last frame held. */
export const WeekOpeningHeld: Story = { args: { state: "opening", held: true, variant: "week" } };
/** The week's gift, opened. */
export const WeekOpen: Story = { args: { state: "open", variant: "week" } };
/** The day's gift beside the week's, ready: the same size, the ribbon apart. */
export const DayAndWeek: Story = {
  render: (args) => (
    <div className="flex gap-8">
      <GiftArt {...args} variant="day" />
      <GiftArt {...args} variant="week" />
    </div>
  ),
};

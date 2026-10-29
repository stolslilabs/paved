import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { BonusBurst, LeagueBonus } from "./league-bonus";

/** A league's first-time bonus (#833): its three states, and the moment of the one to celebrate. */
const meta = {
  title: "Elements/LeagueBonus",
  component: LeagueBonus,
  parameters: { layout: "padded" },
  args: { value: 10, league: "Bronze II", onCelebrate: fn() },
} satisfies Meta<typeof LeagueBonus>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Had this season: crossed out. */
export const Had: Story = { args: { state: "had" } };
/** The league not reached: grey. */
export const Locked: Story = { args: { state: "locked", league: "Silver II", value: 15 } };
/** Paid and still to be celebrated: active, with a glow; a tap plays the moment. */
export const Ready: Story = { args: { state: "ready" } };
/** Ready under reduced motion: the glow, no ring pulsing. */
export const ReadyReduced: Story = { args: { state: "ready" }, parameters: { reducedMotion: "always" } };
/** The moment held at its peak: the stones out, "+10" over the card. */
export const Moment: Story = {
  args: { state: "ready" },
  render: () => (
    <div className="relative rounded-lg bg-card" style={{ width: "18rem", height: "14rem" }}>
      <BonusBurst value={10} held />
    </div>
  ),
};

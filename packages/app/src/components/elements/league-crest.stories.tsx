import type { Meta, StoryObj } from "@storybook/react-vite";
import { LEAGUES } from "../../lib/pvp-rules";
import { LeagueCrest } from "./league-crest";

const meta = { title: "Elements/League crest", component: LeagueCrest, parameters: { layout: "padded" }, args: { league: LEAGUES[8]! } } satisfies Meta<typeof LeagueCrest>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** The 23 leagues of #644 (Wood, Iron III to Master I, Grand Master), at each size. */
export const All: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {(["sm", "md", "lg"] as const).map((size) => (
        <div key={size} className="flex flex-wrap gap-4">
          {LEAGUES.map((league) => (
            <LeagueCrest key={league.index} league={league} size={size} />
          ))}
        </div>
      ))}
    </div>
  ),
};
/** Emerald (#917, Platinum renamed), in green, beside Gold below it and Diamond above it: each tier's icon form, its numeral. */
export const Emerald: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      {LEAGUES.filter((l) => l.index >= 12 && l.index <= 16).map((league) => (
        <LeagueCrest key={league.index} league={league} size="lg" />
      ))}
    </div>
  ),
};
export const IconOnly: Story = { args: { iconOnly: true, size: "lg" } };
/** A player outside the leagues (#917): Unranked's crest and name, at each size. */
export const Unranked: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      {(["sm", "md", "lg"] as const).map((size) => (
        <LeagueCrest key={size} league={LEAGUES[0]!} unranked size={size} />
      ))}
    </div>
  ),
};

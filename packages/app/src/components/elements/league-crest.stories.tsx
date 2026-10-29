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
export const IconOnly: Story = { args: { iconOnly: true, size: "lg" } };

import type { Meta, StoryObj } from "@storybook/react-vite";
import { LEAGUES } from "../../lib/pvp-rules";
import { LeagueCrestIcon } from "./league-crest-art";
import { LEAGUE_TIERS, pipsOf, tierOf } from "./league-standards";
import { Grounds } from "./league-story-grounds";

/**
 * The crests' icon form (issue 917), for 16 to 40 px: the silhouette, the colours and the motif with fewer ornaments, and the division
 * as one to three pips (III one, I three; the issue's open point 3). The League control's plate, the battle logs, the attack's end and
 * the profile draw it in the third pull request.
 */
const meta = {
  title: "Elements/League crest icon",
  component: LeagueCrestIcon,
  parameters: { layout: "padded" },
  args: { tier: "silver", pips: 2, size: "xl", label: "Silver II league" },
} satisfies Meta<typeof LeagueCrestIcon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

const SIZES = [
  { size: "xs", px: 16 },
  { size: "sm", px: 20 },
  { size: "md", px: 24 },
  { size: "lg", px: 32 },
  { size: "xl", px: 40 },
] as const;

/** The ten icons at 16, 20, 24, 32 and 40 px. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {SIZES.map(({ size, px }) => (
        <div key={size} className="flex flex-wrap items-center gap-3">
          <span className="numeric w-10 text-xs">{px} px</span>
          {LEAGUE_TIERS.map((t) => (
            <LeagueCrestIcon key={t.id} tier={t.id} size={size} label={`${t.name} league`} />
          ))}
        </div>
      ))}
    </div>
  ),
};

/** The 23 leagues and Unranked, each with its pips, at 24 px and 16 px, beside its name. */
export const Divisions: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 tablet:grid-cols-4">
      {[null, ...LEAGUES].map((league) => (
        <div key={league?.index ?? "unranked"} className="flex items-center gap-2 text-sm">
          <LeagueCrestIcon tier={tierOf(league)} pips={league ? pipsOf(league) : 0} size="md" />
          <LeagueCrestIcon tier={tierOf(league)} pips={league ? pipsOf(league) : 0} size="xs" />
          <span>{league?.name ?? "Unranked"}</span>
        </div>
      ))}
    </div>
  ),
};

/** The icons at 24 px, with a division's pips, on each ground. */
export const OnGrounds: Story = {
  render: () => (
    <Grounds>
      <div className="flex flex-wrap items-center gap-3">
        {LEAGUE_TIERS.map((t, i) => (
          <LeagueCrestIcon key={t.id} tier={t.id} pips={i > 1 && i < 9 ? 3 : 0} size="md" label={`${t.name} league`} />
        ))}
      </div>
    </Grounds>
  ),
};

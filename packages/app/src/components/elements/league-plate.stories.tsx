import type { Meta, StoryObj } from "@storybook/react-vite";
import { LEAGUES } from "../../lib/pvp-rules";
import { LeaguePlate } from "./league-plate";
import { LEAGUE_TIERS, tierOf } from "./league-standards";
import { Grounds } from "./league-story-grounds";

/** The leagues' nameplate (issue 917): the name in `font-display` on a dark face, framed in the tier's metal. */
const meta = {
  title: "Elements/League plate",
  component: LeaguePlate,
  parameters: { layout: "padded" },
  args: { tier: "iron", name: "Iron II", size: "lg" },
} satisfies Meta<typeof LeaguePlate>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The ten tiers' plates. */
export const Tiers: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {LEAGUE_TIERS.map((t) => (
        <LeaguePlate key={t.id} tier={t.id} name={t.name} />
      ))}
    </div>
  ),
};

/** Every league's name with its division, and Unranked: the longest ("Emerald III", "Diamond III", "Grand Master") fit the face. */
export const Divisions: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {[null, ...LEAGUES].map((league) => (
        <LeaguePlate key={league?.index ?? "unranked"} tier={tierOf(league)} name={league?.name ?? "Unranked"} />
      ))}
    </div>
  ),
};

/** The sizes: names at 12, 14, 18 and 24 px. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-2">
      {(["sm", "md", "lg", "xl"] as const).map((size) => (
        <LeaguePlate key={size} tier="grandmaster" name="Grand Master" size={size} />
      ))}
    </div>
  ),
};

/** A long name, squeezed to the plate's face rather than past it. */
export const LongName: Story = { args: { tier: "emerald", name: "Emerald III Champion" } };

export const OnGrounds: Story = {
  render: () => (
    <Grounds>
      <div className="flex flex-wrap gap-2">
        {LEAGUE_TIERS.map((t) => (
          <LeaguePlate key={t.id} tier={t.id} name={t.name} size="sm" />
        ))}
      </div>
    </Grounds>
  ),
};

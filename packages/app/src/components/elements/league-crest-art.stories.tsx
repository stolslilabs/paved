import type { Meta, StoryObj } from "@storybook/react-vite";
import { LeagueCrestArt, type LeagueCrestArtSize } from "./league-crest-art";
import { LEAGUE_TIERS } from "./league-standards";
import { Grounds } from "./league-story-grounds";

/** The ten crests of issue 917 (after the owner's design), full form, from 64 px: Unranked's broken planks to the Grand Master's crown. */
const meta = {
  title: "Elements/League crest art",
  component: LeagueCrestArt,
  parameters: { layout: "padded" },
  args: { tier: "diamond", size: "lg", label: "Diamond league" },
} satisfies Meta<typeof LeagueCrestArt>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

const Ladder = ({ size }: { size: LeagueCrestArtSize }) => (
  <div className="flex flex-wrap gap-3">
    {LEAGUE_TIERS.map((t) => (
      <figure key={t.id} className="m-0 flex flex-col items-center gap-1">
        <LeagueCrestArt tier={t.id} size={size} label={`${t.name} league`} />
        <figcaption className="text-xs">{t.name}</figcaption>
      </figure>
    ))}
  </div>
);

/** The ten crests at 96 px. */
export const Tiers: Story = { render: () => <Ladder size="md" /> };

/** The full form's sizes: 64, 96, 128 and 160 px. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {(["sm", "md", "lg", "xl"] as const).map((size) => (
        <div key={size} className="flex flex-wrap items-end gap-3">
          {(["iron", "emerald", "grandmaster"] as const).map((tier) => (
            <LeagueCrestArt key={tier} tier={tier} size={size} />
          ))}
        </div>
      ))}
    </div>
  ),
};

/** The ten crests at 64 px on each ground. */
export const OnGrounds: Story = {
  render: () => (
    <Grounds>
      <Ladder size="sm" />
    </Grounds>
  ),
};

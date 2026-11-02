import type { Meta, StoryObj } from "@storybook/react-vite";
import { LeagueBanner } from "./league-banner";
import { LEAGUE_TIERS } from "./league-standards";
import { Grounds } from "./league-story-grounds";

/** The leagues' banners (issue 917): each tier's pennant with its emblem; Unranked's torn cloth. */
const meta = {
  title: "Elements/League banner",
  component: LeagueBanner,
  parameters: { layout: "padded" },
  args: { tier: "emerald", size: "lg" },
} satisfies Meta<typeof LeagueBanner>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The ten banners at 128 px. */
export const Tiers: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {LEAGUE_TIERS.map((t) => (
        <LeagueBanner key={t.id} tier={t.id} label={`${t.name} banner`} />
      ))}
    </div>
  ),
};

/** A divided tier's banners: plain, then III, II and I on the cloth. */
export const Divisions: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {([null, "III", "II", "I"] as const).map((division) => (
        <LeagueBanner key={division ?? "plain"} tier="bronze" division={division} label={division ? `Bronze ${division} banner` : "Bronze banner"} />
      ))}
    </div>
  ),
};

/** The sizes: 96, 128, 160 and 208 px high. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-end gap-3">
      {(["sm", "md", "lg", "xl"] as const).map((size) => (
        <LeagueBanner key={size} tier="gold" size={size} />
      ))}
    </div>
  ),
};

export const OnGrounds: Story = {
  render: () => (
    <Grounds>
      <div className="flex flex-wrap gap-2">
        {LEAGUE_TIERS.map((t) => (
          <LeagueBanner key={t.id} tier={t.id} size="sm" />
        ))}
      </div>
    </Grounds>
  ),
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { LeagueRim } from "./league-rim";
import { LEAGUE_TIERS } from "./league-standards";
import { Grounds } from "./league-story-grounds";

/** A stand-in portrait: the avatar's castle backdrop (the player's bust renders over it in the app). */
const PORTRAIT = <img src="/avatar/backdrops/castle.webp" alt="" draggable={false} className="size-full object-cover" />;

/** The avatar's rims (2026-11-01): the tier's material around the portrait, the same hole on every tier. */
const meta = {
  title: "Elements/League rim",
  component: LeagueRim,
  parameters: { layout: "padded" },
  args: { tier: "bronze", size: "lg", children: PORTRAIT },
} satisfies Meta<typeof LeagueRim>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The ten rims at 96 px, Unranked to Grand Master. */
export const Tiers: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {LEAGUE_TIERS.map((t) => (
        <LeagueRim key={t.id} tier={t.id} size="lg">
          {PORTRAIT}
        </LeagueRim>
      ))}
    </div>
  ),
};

/** The sizes: 40, 56 and 96 px wide. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-end gap-3">
      {(["sm", "md", "lg"] as const).map((size) => (
        <LeagueRim key={size} tier="gold" size={size}>
          {PORTRAIT}
        </LeagueRim>
      ))}
    </div>
  ),
};

export const OnGrounds: Story = {
  render: () => (
    <Grounds>
      <div className="flex flex-wrap gap-2">
        {LEAGUE_TIERS.map((t) => (
          <LeagueRim key={t.id} tier={t.id} size="md">
            {PORTRAIT}
          </LeagueRim>
        ))}
      </div>
    </Grounds>
  ),
};

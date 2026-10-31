import type { Meta, StoryObj } from "@storybook/react-vite";
import { LeagueStandard } from "./league-standard";
import { LEAGUE_TIERS } from "./league-standards";
import { CastleBackdrop, Grounds } from "./league-story-grounds";

/**
 * The leagues' standards (issue 917, PR 2 of 3, after the owner's design): for each of the ten tiers the crest over the plate over the
 * banner. Storybook only: the app draws them in the third pull request, after the owner's approval.
 */
const meta = {
  title: "Elements/League standard",
  component: LeagueStandard,
  parameters: { layout: "padded" },
  args: { tier: "gold", name: "Gold II", size: "md" },
} satisfies Meta<typeof LeagueStandard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The ten standards side by side on a castle, as the design shows them, Unranked to Grand Master. */
export const Ladder: Story = {
  render: () => (
    <CastleBackdrop className="py-6">
      {/* Each standard in its own square crest's width, side by side as the design shows them. */}
      <div className="flex flex-wrap justify-center" style={{ paddingInline: "1.25rem", gap: "1.5rem 0.5rem" }}>
        {LEAGUE_TIERS.map((t) => (
          <LeagueStandard key={t.id} tier={t.id} name={t.name} size="sm" />
        ))}
      </div>
    </CastleBackdrop>
  ),
};

/** The sizes, by the plate's name: 12, 14, 18 and 20 px. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-end gap-4">
      {(["sm", "md", "lg", "xl"] as const).map((size) => (
        <LeagueStandard key={size} tier="master" name="Master I" size={size} />
      ))}
    </div>
  ),
};

/** Each tier's standard on each ground: the app's page and card, a light ground, the sky by day and by night. */
export const OnGrounds: Story = {
  render: () => (
    <Grounds>
      <div className="flex flex-wrap gap-x-1 gap-y-4">
        {LEAGUE_TIERS.map((t) => (
          <LeagueStandard key={t.id} tier={t.id} name={t.name} size="sm" />
        ))}
      </div>
    </Grounds>
  ),
};

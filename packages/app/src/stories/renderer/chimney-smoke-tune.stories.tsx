import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChimneySmokeBoard } from "./chimney-smoke-board";
import { SMOKE_ARGS, SMOKE_ARG_TYPES } from "./chimney-smoke-args";
import { ChimneySmokeCompare, SMOKE_TUNE_START } from "./chimney-smoke-compare";

/**
 * The chimney smoke to tune (#801, PR 1): today's smoke (#770) beside the new one, on the recorded 72-tile board through the
 * Forest skin (its many smoking chimneys), the same season, light, camera and wind on both sides. Left, the look "puffs" as every
 * board draws it now; right, the knobs, started from the issue's proposal (`SMOKE_TUNE_START`): slower (a life of 8 s, a slower
 * rise, half the noise's roll and the sway), subtler (slightly smaller puffs, an opacity of 0.4), and each chimney its own plume,
 * seeded by its place on the board (the same on every load): its lean off the wind (±35°) and its drift, its shape (stretch,
 * billow, swirl and puff count) between "puffs" and "wisps", its tone a little whiter or darker (±12 %, each puff a little more),
 * its opacity and its pace. Every range at 0 gives today's look. Still one draw for all the smoke of a scene (the readout).
 *
 * Move the knobs (categories "Look" and "Variation"), then post the values: they become the defaults in PR 2. The seasons, the
 * tiers, reduced motion and the placement's fade are #770's, unchanged.
 */
const meta = {
  title: "Renderer/Chimney smoke tune",
  component: ChimneySmokeCompare,
  parameters: { layout: "fullscreen" },
  argTypes: SMOKE_ARG_TYPES,
  args: { ...SMOKE_ARGS, ...SMOKE_TUNE_START },
} satisfies Meta<typeof ChimneySmokeCompare>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Today's smoke beside the one to tune, autumn's day. */
export const AutumnDay: Story = { args: { season: "autumn" } };
/** Winter's day: the fires burn more (winter's amount), on both sides. */
export const WinterDay: Story = { args: { season: "winter" } };
/** Spring's day. */
export const SpringDay: Story = { args: { season: "spring" } };
/** Autumn's night: the smoke takes the scene's light, dimmer and bluer. */
export const AutumnNight: Story = { args: { season: "autumn", time: "night" } };
/** Winter's night. */
export const WinterNight: Story = { args: { season: "winter", time: "night" } };
/** Spring's night. */
export const SpringNight: Story = { args: { season: "spring", time: "night" } };
/** At a phone's play distance, winter's day: the plumes closer, their lean and tone apart. */
export const WinterPhonePlay: Story = { args: { season: "winter", view: "phone-play" } };
/** On one tile, close, winter: its two smoking chimneys and its bare one, each its own plume. */
export const WinterTile: Story = { args: { season: "winter", layout: "tile", view: "close", forest: false } };

/** The smoke to tune alone, full screen, autumn's day: the same knobs, one scene (the readout's CPU time without a second scene beside it). */
export const Alone: Story = {
  args: { season: "autumn" },
  render: (args) => <ChimneySmokeBoard {...args} />,
};

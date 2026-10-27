import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChimneySmokeBoard } from "./chimney-smoke-board";
import { SMOKE_ARGS, SMOKE_ARG_TYPES } from "./chimney-smoke-args";
import { ChimneySmokeCompare } from "./chimney-smoke-compare";

/**
 * The chimney smoke before and after #801, on the recorded 72-tile board through the Forest skin (its many smoking chimneys), the
 * same season, light, camera and wind on both sides. Left, #770's look "puffs"; right, the default look "varied", the owner's
 * (#801, PR 1's starting values kept): slower (a life of 8 s, a slower rise, half the noise's roll and the sway), subtler (slightly
 * smaller puffs, an opacity of 0.4), and each chimney its own plume, seeded by its place on the board (the same on every load): its
 * lean off the wind (±35°) and its drift, its shape (stretch, billow, swirl and puff count) between "puffs" and "wisps", its tone a
 * little whiter or darker (±12 %, each puff a little more), its opacity and its pace. Still one draw for all the smoke of a scene
 * (the readout).
 *
 * The knobs (categories "Look" and "Variation") move the right side over the default. The seasons, the tiers, reduced motion and
 * the placement's fade are #770's, unchanged.
 */
const meta = {
  title: "Renderer/Chimney smoke tune",
  component: ChimneySmokeCompare,
  parameters: { layout: "fullscreen" },
  argTypes: SMOKE_ARG_TYPES,
  args: SMOKE_ARGS,
} satisfies Meta<typeof ChimneySmokeCompare>;
export default meta;
type Story = StoryObj<typeof meta>;

/** #770's smoke beside the default, autumn's day. */
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

/** The default smoke alone, full screen, autumn's day: the same knobs, one scene (the readout's CPU time without a second scene beside it). */
export const Alone: Story = {
  args: { season: "autumn" },
  render: (args) => <ChimneySmokeBoard {...args} />,
};

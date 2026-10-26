import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, within } from "storybook/test";
import { PVP_V2_SCOUT } from "../../mocks/pvp-v2";
import { PvpScoutScene } from "./pvp-scout-scene";
import { PHONE_320, PHONE_375, WIDE_1440 } from "./viewports";

/**
 * The PvP v2 scout (#740): the rival's free village and its score, the points of each star at 80 / 90 / 100 %, and the deck
 * the attack will have, ceil(1.15 x S) tiles sized on the village's slots, played on an open board. Since #788 a light
 * overlay over the village, the same at every width; the deck chip opens the village's tile list (the attack's deck sheet,
 * #789) and the info button the rules and the crowns at stake.
 */
const meta = {
  title: "Scenes/PvP/Scout v2",
  component: PvpScoutScene,
  parameters: { layout: "fullscreen" },
  args: { ...PVP_V2_SCOUT.ready, onBack: fn(), onNext: fn(), onAttack: fn() },
} satisfies Meta<typeof PvpScoutScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A level-12 village: 20 slots, a deck of 23 tiles (its 19 tiles and 4 extras). */
export const Ready: Story = { args: PVP_V2_SCOUT.ready };
export const Attacking: Story = { args: PVP_V2_SCOUT.attacking };
/** A level-1 village: 9 slots, a deck of 11. */
export const Small: Story = { args: PVP_V2_SCOUT.small };
/** The attacker's own village is shielded: a chip says attacking drops it, with its countdown. */
export const Shielded: Story = { args: PVP_V2_SCOUT.shielded };

/** The overlay on the narrowest phone kept (320 x 568). */
export const Phone320: Story = { args: PVP_V2_SCOUT.ready, ...PHONE_320 };
/** The overlay at 375 x 812: the village in view between the two cards. */
export const Phone375: Story = { args: PVP_V2_SCOUT.ready, ...PHONE_375 };
export const Phone375Shielded: Story = { args: PVP_V2_SCOUT.shielded, ...PHONE_375 };
/** The same overlay on desktop, wider. */
export const Wide1440: Story = { args: PVP_V2_SCOUT.ready, ...WIDE_1440 };

const openList = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  await userEvent.click(within(canvasElement).getByRole("button", { name: /the village's tile list/ }));
  await expect(await screen.findByRole("heading", { name: "Deck" })).toBeInTheDocument();
};

/** The deck chip opens the village's tile list: its 19 tiles by plan, then the 4 extras as unknown tiles. */
export const ListOpen: Story = { args: PVP_V2_SCOUT.ready, ...PHONE_375, play: openList };
export const ListOpenWide: Story = { args: PVP_V2_SCOUT.ready, ...WIDE_1440, play: openList };

const openRules = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  await userEvent.click(within(canvasElement).getByRole("button", { name: "How an attack works" }));
  await expect(await screen.findByRole("heading", { name: "How an attack works" })).toBeInTheDocument();
};

/** The info button: how an attack works in a few lines, and the crowns each star wins or no star loses. */
export const RulesOpen: Story = { args: PVP_V2_SCOUT.shielded, ...PHONE_375, play: openRules };

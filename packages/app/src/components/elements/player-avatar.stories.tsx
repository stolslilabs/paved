import type { Meta, StoryObj } from "@storybook/react-vite";
import { PLAYER_ID } from "../../mocks/players";
import { LONG_NAME } from "../../mocks/stress";
import { PlayerAvatar } from "./player-avatar";

/** The player's avatar (#624): 40 px inside a 44 px box (the band is #625's ring), and the sheet's large one. */
const meta = {
  title: "Elements/PlayerAvatar",
  component: PlayerAvatar,
  parameters: { layout: "centered" },
  args: { player: { name: "bal7hazar", address: PLAYER_ID } },
} satisfies Meta<typeof PlayerAvatar>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A default avatar until the creator (#626): the initial on the secondary disc. */
export const Connected: Story = {};
/** No username: the address's first digit. */
export const NoUsername: Story = { args: { player: { name: null, address: PLAYER_ID } } };
/** A guest: the silhouette that invites to connect. */
export const Guest: Story = { args: { player: null } };
export const Loading: Story = { args: { loading: true } };
/** The profile sheet's size. */
export const Large: Story = { args: { size: "lg" } };
export const LargeGuest: Story = { args: { size: "lg", player: null } };
/** WRAP360: the initial of the longest name. */
export const Stress: Story = { args: { player: { name: LONG_NAME, address: PLAYER_ID } } };

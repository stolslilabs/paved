import type { Meta, StoryObj } from "@storybook/react-vite";
import { LONG_ADDRESS, LONG_NAME } from "../../mocks/stress";
import { NEW_PLAYER } from "../../mocks/new-player";
import { RIVAL } from "../../mocks/pvp";
import { PvpPlayerRow } from "./pvp-player-row";

const meta = { title: "Containers/PvP player row", component: PvpPlayerRow, parameters: { layout: "padded" }, args: { player: RIVAL } } satisfies Meta<typeof PvpPlayerRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** No username: the short address in the mono font. */
export const NoName: Story = { args: { player: { ...RIVAL, name: null, address: LONG_ADDRESS } } };
/** WRAP360: the longest name is cut, the crowns stay whole. */
export const LongName: Story = { args: { player: { ...RIVAL, name: LONG_NAME, crowns: 12_480 } } };
/** A new player on the mock (#926): the name and the look of free items drawn at their first connection, level 1. */
export const NewPlayer: Story = { args: { player: { ...RIVAL, name: NEW_PLAYER.name, level: 1, crowns: 0, look: NEW_PLAYER.look } } };

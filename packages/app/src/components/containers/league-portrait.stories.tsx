import type { Meta, StoryObj } from "@storybook/react-vite";
import { LEAGUES } from "../../lib/pvp-rules";
import { generatedLook } from "../../mocks/avatar";
import { LeaguePortrait } from "./league-control";

const PLAYER = { name: "FerventCrown28", address: "0x5eed00c0ffee" };

/**
 * Another player's portrait in the rim of their league with its crest at its lower left (CHAT-PAGE, shared with the League's battle
 * logs): a 1em square, the size its font size. No league known, a plain ring.
 */
const meta = {
  title: "Containers/League portrait",
  component: LeaguePortrait,
  parameters: { layout: "padded" },
  args: { player: PLAYER, look: generatedLook(PLAYER.address), league: LEAGUES[4], className: "text-[3rem]" },
} satisfies Meta<typeof LeaguePortrait>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Bronze III, at the chat's 48 px. */
export const Default: Story = {};
/** The top league. */
export const GrandMaster: Story = { args: { league: LEAGUES[22] } };
/** No league known: a plain ring. */
export const NoLeague: Story = { args: { league: undefined } };
/** No saved avatar: the initial. */
export const Initial: Story = { args: { look: null } };

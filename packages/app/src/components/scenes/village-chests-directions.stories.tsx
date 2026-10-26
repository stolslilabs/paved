import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { VILLAGE_CHESTS } from "../../mocks/village-v2";
import { VillageChestsScene } from "./village-chests-scene";

/**
 * The Chests page's two directions (#759), for the owner to choose, each in three states of the day's slots: some won, all won
 * (the countdown at the centre), and the reset reached. A, `pedestals` (kept by default): the slots first, a large chest on each
 * pedestal. B, `dial`: a dial of the day at the centre, the countdown inside it, the slots in a row under it. The chosen
 * direction's every state: `Scenes/Village v2/Chests`.
 */
const meta = {
  title: "Scenes/Village v2/Chests directions",
  component: VillageChestsScene,
  parameters: { layout: "fullscreen" },
  args: { ...VILLAGE_CHESTS.closed, tileArt: originalTileArt(SOURCE_ASSETS), onBack: fn(), onPlay: fn(), onOpen: fn() },
} satisfies Meta<typeof VillageChestsScene>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PedestalsSomeWon: Story = { args: { ...VILLAGE_CHESTS.closed, look: "pedestals" } };
export const PedestalsAllWon: Story = { args: { ...VILLAGE_CHESTS.capped, look: "pedestals" } };
export const PedestalsReady: Story = { args: { ...VILLAGE_CHESTS.ready, look: "pedestals" } };
export const DialSomeWon: Story = { args: { ...VILLAGE_CHESTS.closed, look: "dial" } };
export const DialAllWon: Story = { args: { ...VILLAGE_CHESTS.capped, look: "dial" } };
export const DialReady: Story = { args: { ...VILLAGE_CHESTS.ready, look: "dial" } };

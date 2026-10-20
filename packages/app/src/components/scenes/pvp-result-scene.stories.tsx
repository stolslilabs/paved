import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { PVP_RESULT } from "../../mocks/pvp";
import type { TileArt } from "../elements/tile-chip";
import { PvpResultScene } from "./pvp-result-scene";

const tileArt: TileArt = originalTileArt(SOURCE_ASSETS);

/** The end of a PvP attack (#647): the stars, the crowns, the league, and the village reward (#646's sheet opens on Choose). On fakes. */
const meta = {
  title: "Scenes/PvP/Result",
  component: PvpResultScene,
  parameters: { layout: "fullscreen" },
  args: { ...PVP_RESULT.twoStars, tileArt, onReward: fn(), onReplay: fn(), onAgain: fn(), onHome: fn() },
} satisfies Meta<typeof PvpResultScene>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TwoStars: Story = { args: PVP_RESULT.twoStars };
/** Past 110 %: three stars, and a promotion to Crystal. */
export const ThreeStarsPromoted: Story = { args: PVP_RESULT.threeStarsPromoted };
/** One star; the day's rewards already taken (the daily cap). */
export const OneStarCapped: Story = { args: PVP_RESULT.oneStarCapped };
/** Under 70 %: no star, crowns lost, no reward. */
export const Defeat: Story = { args: PVP_RESULT.defeat };
/** A defeat that drops the attacker to Silver. */
export const DefeatDropped: Story = { args: PVP_RESULT.defeatDropped };
/** The result on its way to the chain. */
export const Pending: Story = { args: PVP_RESULT.pending };
export const Failed: Story = { args: PVP_RESULT.error };

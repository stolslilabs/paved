import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PVP_LEAGUE } from "../../mocks/pvp";
import { PvpLeagueScene } from "./pvp-league-scene";
import { PHONE_375, WIDE_1440 } from "./viewports";

/** The league (#647): crowns, the league and the way to the next, the season's end and its rewards. On fakes; the leagues are a proposal until #644. */
const meta = {
  title: "Scenes/PvP/League",
  component: PvpLeagueScene,
  parameters: { layout: "fullscreen" },
  args: { ...PVP_LEAGUE.gold, onBack: fn(), onNavigate: fn(), onAttack: fn(), onDefence: fn() },
} satisfies Meta<typeof PvpLeagueScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Gold, 28 crowns from Crystal; the season ends in 4 days. */
export const Gold: Story = { args: PVP_LEAGUE.gold };
/** The season's last day: its timer. */
export const LastDay: Story = { args: PVP_LEAGUE.lastDay };
/** The top league. */
export const Legend: Story = { args: PVP_LEAGUE.legend };
/** No attack yet: no league. */
export const Unranked: Story = { args: PVP_LEAGUE.unranked };
/** The season has ended: its rewards on their way. */
export const Ended: Story = { args: PVP_LEAGUE.ended };

/** In the phone's bar (#763): the League current at 375 px; from 1440 px the page's top bar alone, as before (#762). */
export const GoldPhone: Story = { ...Gold, ...PHONE_375 };
export const GoldWide: Story = { ...Gold, ...WIDE_1440 };

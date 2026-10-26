import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DAY_PHASE_AT, type RendererSettingsInput } from "@paved/renderer";
import { APP_ASSETS, originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { BOARD_FOG } from "../../data/settings";
import { VillageViewport } from "../containers/village-viewport";
import type { VillageBoardProps } from "../containers/village-board";
import { REWARD, VILLAGE, VILLAGE_START } from "../../mocks/village";
import type { Village } from "../containers/village-rules";
import type { RewardOffer } from "../containers/reward-sheet";
import { VillageScene, type VillageSceneProps } from "./village-scene";

/**
 * The village (#646, part of #637), on fakes (the page wires it to the chain, `routes/pages/village.tsx`). One story per state of `VILLAGE`
 * (`mocks/village.ts`); the Viewport control reframes it (designed at 375 first; a side panel for the reward from `desktop`).
 * `Interactive` keeps its own state: drag a reward's tile, take Cobbles. The v2 village is `Scenes/Village v2/*` (#739).
 */
const meta = {
  title: "Scenes/Village",
  component: VillageScene,
  parameters: { layout: "fullscreen" },
  args: {
    ...VILLAGE.start,
    tileArt: originalTileArt(SOURCE_ASSETS),
    onBack: fn(),
    onPlace: fn(),
    onTakeCobbles: fn(),
  },
} satisfies Meta<typeof VillageScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A new village: the 9 cells of the start, two tiles, the fog lifted over the cells around it. */
export const Start: Story = { args: VILLAGE.start };
/** Halfway: 21 cells, 14 tiles. */
export const Growing: Story = { args: VILLAGE.growing };
/** A large village: 38 cells. */
export const Full: Story = { args: VILLAGE.full };
/** The fog off (#633's other side), to compare. */
export const FogOff: Story = { args: VILLAGE.fogOff };
/** After a game: the reward's three tiles under the board, "take 5 Cobbles" always there. */
export const Reward: Story = { args: VILLAGE.reward };
/** A reward's tile chosen (a tap, or held in a drag): its legal cells lit. */
export const RewardChosen: Story = { args: VILLAGE.rewardChosen };
/** A cramped village: one tile fits, two fit no free cell, greyed out. */
export const RewardCramped: Story = { args: VILLAGE.rewardCramped };
/** The choice on its way: every control waits. */
export const RewardBusy: Story = { args: VILLAGE.rewardBusy };
/** Not founded yet: the start it gets, and Found. */
export const Unfounded: Story = { args: VILLAGE.unfounded };
/** Rewards waiting after games: Open draws the next one's three tiles. */
export const Waiting: Story = { args: VILLAGE.waiting };
/** The chain refused a write: what happened, until dismissed. */
export const Refused: Story = { args: VILLAGE.refused };
/** The reward's read failed: what happened and Retry, never "no reward". */
export const RewardFailed: Story = { args: VILLAGE.rewardFailed };
/** The village on its way from the chain. */
export const Loading: Story = { args: VILLAGE.loading };
/** A guest: Connect to build a village. */
export const Guest: Story = { args: VILLAGE.guest };
/** A network without the village's contracts yet. */
export const Unavailable: Story = { args: VILLAGE.unavailable };
/** Someone else's village from their profile: read-only, their score and level. */
export const VisitProfile: Story = { args: VILLAGE.visitProfile };
/** The defender's village from the PvP scout (#647): the same, read-only. */
export const VisitScout: Story = { args: VILLAGE.visitScout };

/** The fakes played: place the reward's tile, a new reward after each; take Cobbles. */
function Playground(props: VillageSceneProps) {
  const [village, setVillage] = useState<Village>(VILLAGE_START);
  const [round, setRound] = useState(0);
  const offers: RewardOffer[] = [REWARD, { plans: [18, 9, 8], cobbles: 5 }, { plans: [13, 10, 17], cobbles: 5 }, { plans: [7, 12, 2], cobbles: 5 }];
  const [reward, setReward] = useState<RewardOffer | null>(REWARD);
  const next = () => {
    setRound((r) => r + 1);
    setReward(offers[(round + 1) % offers.length]!);
  };
  return (
    <VillageScene
      {...props}
      village={village}
      reward={reward}
      onPlace={(p) => {
        props.onPlace?.(p);
        setVillage((v) => {
          const tiles = [...v.tiles, { id: v.tiles.length + 1, plan: p.plan, orientation: p.orientation, x: p.x, y: p.y }];
          return { ...v, tiles, score: v.score + 120 };
        });
        next();
      }}
      onTakeCobbles={() => {
        setReward(null);
        props.onTakeCobbles?.();
      }}
    />
  );
}

/** Play it: drag a tile from the reward to a lit cell (or tap it, then a cell); take Cobbles. */
export const Interactive: Story = { render: (args) => <Playground {...args} /> };

/** The game's board settings with the fog (`BOARD_FOG`), the ambient effects on, held at a summer's day or night. */
const held = (phase: "day" | "night"): RendererSettingsInput => ({ ambient: { enabled: true }, fog: BOARD_FOG, dayNight: { enabled: true, season: "summer", freezeAt: DAY_PHASE_AT[phase] } });
const DAY = held("day");
const NIGHT = held("night");
/** The 3D village (`VillageViewport`) as the page gives it. */
const in3d = (settings: RendererSettingsInput) => (board: VillageBoardProps) => <VillageViewport {...board} settings={settings} basePath={APP_ASSETS} />;

/**
 * The village in 3D (#648): the real renderer, the fog of war lifted around the tiles as on every board (#739), the landscape
 * beyond. Held at a summer's day.
 */
export const Board3D: Story = { args: { ...VILLAGE.growing, renderBoard: in3d(DAY) } };
/** The same at night: the fog's moonlit blue. */
export const Board3DNight: Story = { args: { ...VILLAGE.growing, renderBoard: in3d(NIGHT) } };
/** A reward's tile chosen in 3D: its legal cells are the plates; a tap on one places it. */
export const Board3DReward: Story = { args: { ...VILLAGE.rewardChosen, renderBoard: in3d(DAY) } };
/** Play it in 3D: tap a reward's tile, then a lit cell (the fog lifts around it); take Cobbles. */
export const Board3DInteractive: Story = { args: { renderBoard: in3d(DAY) }, render: (args) => <Playground {...args} /> };

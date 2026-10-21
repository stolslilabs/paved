import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DAY_PHASE_AT, type RendererSettingsInput } from "@paved/renderer";
import { APP_ASSETS, originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { BOARD_FOG } from "../../data/settings";
import { VillageViewport } from "../containers/village-viewport";
import type { VillageBoardProps } from "../containers/village-board";
import { REWARD, VILLAGE, VILLAGE_START, parcelFor } from "../../mocks/village";
import { cellKey, type Cell, type Village } from "../containers/village-rules";
import type { RewardOffer } from "../containers/reward-sheet";
import { VillageScene, type VillageSceneProps } from "./village-scene";

/**
 * The village (#646, part of #637), on fakes: nothing is wired (#640, #642). One story per state of `VILLAGE`
 * (`mocks/village.ts`); the Viewport control reframes it (designed at 375 first; a side panel for the reward from `desktop`).
 * `Interactive` keeps its own state: drag a reward's tile, buy parcels, take Cobbles.
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
    onAddCopy: fn(),
    onTakeCobbles: fn(),
    onBuyParcel: fn(),
    onGetCobbles: fn(),
    onOpenSkins: fn(),
  },
} satisfies Meta<typeof VillageScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A new village: the 9 cells of the start, two tiles, the fog lifted over the cells around it. */
export const Start: Story = { args: VILLAGE.start };
/** Halfway: 21 cells, 14 tiles on their tier's base. */
export const Growing: Story = { args: VILLAGE.growing };
/** The most a village holds: 38 cells, no parcel left to buy. */
export const Full: Story = { args: VILLAGE.full };
/** The fog off (#633's other side), to compare. */
export const FogOff: Story = { args: VILLAGE.fogOff };
/** After a game: the reward's three tiles under the board, "take 15 Cobbles" always there. */
export const Reward: Story = { args: VILLAGE.reward };
/** A reward's tile chosen (a tap, or held in a drag): its legal cells lit, the tiles of its plan ringed for a copy. */
export const RewardChosen: Story = { args: VILLAGE.rewardChosen };
/** A wonder chosen: the placed wonders ringed, a copy takes its plan toward its next tier. */
export const RewardCopy: Story = { args: VILLAGE.rewardCopy };
/** A cramped village: one tile fits, two fit no free cell and have no tile to copy onto, greyed out. */
export const RewardCramped: Story = { args: VILLAGE.rewardCramped };
/** The choice on its way: every control waits. */
export const RewardBusy: Story = { args: VILLAGE.rewardBusy };
/** A parcel chosen, affordable and within the level: Buy. */
export const ParcelReady: Story = { args: VILLAGE.parcelReady };
/** A parcel past the player's level: "Level 5 needed", whatever the Cobbles. */
export const ParcelLevel: Story = { args: VILLAGE.parcelLevel };
/** A parcel within the level, short of Cobbles: the shortfall and the packs. */
export const ParcelCobbles: Story = { args: VILLAGE.parcelCobbles };
/** The tiers: the ladder of bases, each plan's progress to its next tier. */
export const Tiers: Story = { args: VILLAGE.tiers };
/** Someone else's village from their profile: read-only, their score, level and tiers. */
export const VisitProfile: Story = { args: VILLAGE.visitProfile };
/** The defender's village from the PvP scout (#647): the same, read-only. */
export const VisitScout: Story = { args: VILLAGE.visitScout };

/** The fakes played: place or copy the reward's tile, a new reward after each; buy parcels; take Cobbles. */
function Playground(props: VillageSceneProps) {
  const [village, setVillage] = useState<Village>(VILLAGE_START);
  const [cobbles, setCobbles] = useState(400);
  const [round, setRound] = useState(0);
  const offers: RewardOffer[] = [REWARD, { plans: [18, 9, 8], cobbles: 15 }, { plans: [13, 10, 17], cobbles: 15 }, { plans: [7, 12, 2], cobbles: 15 }];
  const [reward, setReward] = useState<RewardOffer | null>(REWARD);
  const next = () => {
    setRound((r) => r + 1);
    setReward(offers[(round + 1) % offers.length]!);
  };
  const buy = (cell: Cell) => {
    const offer = parcelFor(village.cells.length);
    if (!offer) return;
    setCobbles((c) => c - offer.price);
    setVillage((v) => ({ ...v, cells: [...v.cells, cell], level: Math.max(v.level, offer.level) }));
  };
  return (
    <VillageScene
      {...props}
      village={village}
      cobbles={cobbles}
      reward={reward}
      parcel={parcelFor(village.cells.length)}
      onPlace={(p) => {
        props.onPlace?.(p);
        setVillage((v) => {
          const tiles = [...v.tiles, { id: v.tiles.length + 1, plan: p.plan, orientation: p.orientation, x: p.x, y: p.y }];
          return { ...v, tiles, copies: { ...v.copies, [p.plan]: (v.copies[p.plan] ?? 0) + 1 }, score: v.score + 120 };
        });
        next();
      }}
      onAddCopy={(c) => {
        props.onAddCopy?.(c);
        setVillage((v) => ({ ...v, copies: { ...v.copies, [c.plan]: (v.copies[c.plan] ?? 0) + 1 } }));
        next();
      }}
      onTakeCobbles={() => {
        setCobbles((c) => c + (reward?.cobbles ?? 0));
        setReward(null);
        props.onTakeCobbles?.();
      }}
      onBuyParcel={(cell) => {
        props.onBuyParcel?.(cell);
        if (!village.cells.some((c) => cellKey(c) === cellKey(cell))) buy(cell);
      }}
    />
  );
}

/** Play it: drag a tile from the reward to a lit cell (or tap it, then a cell), onto a ringed tile for a copy; take Cobbles, then buy parcels. */
export const Interactive: Story = { render: (args) => <Playground {...args} /> };

/** The game's board settings with the fog (`BOARD_FOG`), the ambient effects on, held at a summer's day or night. */
const held = (phase: "day" | "night"): RendererSettingsInput => ({ ambient: { enabled: true }, fog: BOARD_FOG, dayNight: { enabled: true, season: "summer", freezeAt: DAY_PHASE_AT[phase] } });
const DAY = held("day");
const NIGHT = held("night");
/** The 3D village (`VillageViewport`) as the page gives it. */
const in3d = (settings: RendererSettingsInput) => (board: VillageBoardProps) => <VillageViewport {...board} settings={settings} basePath={APP_ASSETS} />;

/**
 * The village in 3D (#648): the real renderer, the fog of war over everything but the owned cells and the cells next to them
 * (the parcels), the landscape beyond; a tap on a parcel opens its sheet. Held at a summer's day.
 */
export const Board3D: Story = { args: { ...VILLAGE.growing, renderBoard: in3d(DAY) } };
/** The same at night: the fog's moonlit blue. */
export const Board3DNight: Story = { args: { ...VILLAGE.growing, renderBoard: in3d(NIGHT) } };
/** A reward's tile chosen in 3D: its legal cells are the plates; a tap on one places it. */
export const Board3DReward: Story = { args: { ...VILLAGE.rewardChosen, renderBoard: in3d(DAY) } };
/** Play it in 3D: tap a reward's tile, then a lit cell; take Cobbles, then tap a parcel; the fog lifts over a parcel bought. */
export const Board3DInteractive: Story = { args: { renderBoard: in3d(DAY) }, render: (args) => <Playground {...args} /> };

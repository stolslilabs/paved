import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { COLOSSUS, COLOSSUS_CARD } from "../../mocks/colossus";
import { PUZZLE_CARD } from "../../mocks/puzzle";
import { PLAY } from "../../mocks/scenes";
import { ColossusScene } from "./colossus-scene";
import { PlayScene } from "./play-scene";
import { PHONE_320, PHONE_375 } from "./viewports";

/**
 * The Colossus (`/play/colossus`, Play's Limited mode, the weekly collective event): its card in Play, then its views in Play's
 * drawer, "Colossus" and the Cobbles on the header: the site, the builders, a board. One story per state; the Viewport control
 * reframes it.
 */
const meta = {
  title: "Scenes/Colossus",
  component: PlayScene,
  args: { onBack: fn(), onChallenge: fn(), onResume: fn(), onTraining: fn(), onStory: fn(), onAttack: fn(), onPuzzle: fn(), onColossus: fn(), onColossusBack: fn() },
} satisfies Meta<typeof PlayScene>;
export default meta;
type Story = StoryObj<typeof meta>;

const tileArt = originalTileArt(SOURCE_ASSETS);

/** The Colossus's card (Limited, over the Puzzle's): the day, the monument, the gauge, the tiles in hand, the week's time left. */
export const Card: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.notPlayed, ...COLOSSUS_CARD.week } };
export const CardGuest: Story = { args: { ...PLAY.connected, ...PUZZLE_CARD.notPlayed, ...COLOSSUS_CARD.guest } };

const view = (state: keyof typeof COLOSSUS, colossusTitle?: string): Story => ({
  args: {
    ...PLAY.connected,
    colossusTitle,
    colossus: <ColossusScene tileArt={tileArt} onSelect={fn()} onPlace={fn()} onClaim={fn()} onLot={fn()} onBuilders={fn()} onOpenPlayer={fn()} onRetry={fn()} {...COLOSSUS[state]} />,
  },
});

/** Thursday evening, nine tiles in: the gauge and its tiers, the viewer's week, the map, the hard holes, last week's plaque, the rules. */
export const Site: Story = view("site");
export const Site320: Story = { ...view("site"), ...PHONE_320 };
/** Monday noon, no tile laid yet: the tiers pay whoever lays one. */
export const Newcomer: Story = view("newcomer");
/** Without an account: the site alone. */
export const Guest: Story = view("guest");
/** Last week's Cobbles to claim: the tiers and the place together. */
export const ToClaim: Story = view("toClaim");
export const Claiming: Story = view("claiming");
/** Every builder by stones set, the top 10 with their Cobbles. */
export const Builders: Story = view("builders", "Builders");
export const BuildersLoading: Story = view("buildersLoading", "Builders");
/** A district: its tiles, its holes, the hand. */
export const Board: Story = view("board", "District");
export const Board320: Story = { ...view("board", "District"), ...PHONE_320 };
/** A tile picked: each hole it may take with the stones it would set, the holes fair play refuses. */
export const Picked: Story = view("picked", "District");
/** The same on phones: each cell keeps the 44 px touch floor, the board scrolls sideways under the edge hint. */
export const Picked320: Story = { ...view("picked", "District"), ...PHONE_320 };
export const Picked375: Story = { ...view("picked", "District"), ...PHONE_375 };
/** A tile just laid: its stones, the gauge's move, the viewer's place. */
export const Placed: Story = view("placed", "District");
/** The heart, a quarter at a time. */
export const Heart: Story = view("heart", "The heart");
export const Loading: Story = view("loading");
export const Failed: Story = view("failed");

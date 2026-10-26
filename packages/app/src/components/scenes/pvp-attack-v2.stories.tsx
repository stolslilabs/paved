import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DAY_PHASE_AT, type RendererSettingsInput } from "@paved/renderer";
import { PVP_V2_ATTACK, V2_ATTACK_STEPS, attackV2At } from "../../mocks/pvp-v2";
import { squareGridSettings } from "../../data/settings";
import { sideSettings } from "../../data/board-settings";
import { APP_ASSETS, appRenders } from "../../mocks/assets";
import { BoardViewport } from "../containers/board-viewport";
import { StackView } from "../containers/stack-view";
import { PvpAttackScene, type PvpAttackSceneProps } from "./pvp-attack-scene";

/**
 * The PvP v2 attack (#740), played on the engine: a level-12 rival's free village (20 slots, the starter's included), the
 * attack's deck of ceil(1.15 x 20) = 23 tiles (game-core's `attackDeck`: the village's 19 tiles and 4 extras from the base
 * deck, shuffled) on an unbounded board from the starter, with no territory. The stack shows the tile in hand and the next
 * two; the meter's marks sit at 80 / 90 / 100 %. On fakes, the plan view of the game's board; mobile first (375 px).
 */
const meta = {
  title: "Scenes/PvP/Attack v2",
  component: PvpAttackScene,
  parameters: { layout: "fullscreen" },
  args: { ...PVP_V2_ATTACK.start, tileRenders: appRenders, onBack: fn(), onSlotClick: fn(), onDiscard: fn() },
} satisfies Meta<typeof PvpAttackScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The first tile: the starter alone, the deck whole (23), the next two tiles on the stack. */
export const Start: Story = { args: PVP_V2_ATTACK.start };
/** Halfway: the legal cells of the tile in hand lit anywhere next to the board. */
export const Midway: Story = { args: PVP_V2_ATTACK.midway };
/** A cell chosen: the bubble, and the points it would score over the HUD's score. */
export const Placed: Story = { args: PVP_V2_ATTACK.placed };
/** Past 80 % of the village: the first star lit. */
export const OneStar: Story = { args: PVP_V2_ATTACK.oneStar };
/** Past 90 %. */
export const TwoStars: Story = { args: PVP_V2_ATTACK.twoStars };
/** Two tiles left: the tile in hand and one coming. */
export const TwoLeft: Story = { args: PVP_V2_ATTACK.twoLeft };
/** The last tile: nothing coming. */
export const LastTile: Story = { args: PVP_V2_ATTACK.lastTile };
/** The deck played out: past 100 %, three stars. */
export const End: Story = { args: PVP_V2_ATTACK.end };

/** Plays the whole attack, a move every `ms`: the GIF of the pull request. */
function AutoPlay({ ms }: { ms: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % (V2_ATTACK_STEPS.length + 3)), ms);
    return () => clearInterval(id);
  }, [ms]);
  return <PvpAttackScene {...attackV2At(V2_ATTACK_STEPS, i)} tileRenders={appRenders} />;
}
/** The attack played through, a move every 600 ms, then again. */
export const Autoplay: StoryObj<{ ms: number }> = { args: { ms: 600 }, render: ({ ms }) => <AutoPlay ms={ms} /> };

/** The game's board settings on a rival's village (the red void, #772), a summer's day held. */
const DAY_3D: RendererSettingsInput = { ambient: { enabled: true }, ...sideSettings("rival", squareGridSettings(true, "")), dayNight: { enabled: true, season: "summer", freezeAt: DAY_PHASE_AT.day } };

/** The attack on the 3D board: the game's board (no territory, the fog following the tiles), the stack's tiles in 3D. */
function Attack3D(args: PvpAttackSceneProps) {
  return (
    <PvpAttackScene
      {...args}
      canvas={<BoardViewport tiles={args.tiles} slots={args.slots} ghost={args.ghost} bubble={args.bubble} basePath={APP_ASSETS} settings={DAY_3D} onCellClick={args.onSlotClick} />}
      renderHandStack={(v) => <StackView {...v} basePath={APP_ASSETS} skins={args.skins} />}
    />
  );
}

/** Halfway, in 3D. */
export const Board3D: Story = { args: PVP_V2_ATTACK.midway, render: (args) => <Attack3D {...args} /> };

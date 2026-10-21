import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ATTACK_STEPS, PVP_ATTACK, PVP_REPLAY, REPLAY_STEPS, attackAt, replayAt } from "../../mocks/pvp";
import { DAY_PHASE_AT, type RendererSettingsInput } from "@paved/renderer";
import { BOARD_FOG } from "../../data/settings";
import { APP_ASSETS } from "../../mocks/assets";
import { PvpAttackBoard } from "../containers/pvp-attack-board";
import { PvpAttackScene, type PvpAttackSceneProps } from "./pvp-attack-scene";

/**
 * A PvP attack (#647) on the rival's village, played on the engine: the defender's 37 tiles drawn at random, each placed on a
 * cell of the defender's territory (the dashed ground). The live score fills the star meter, its marks at 70 / 85 / 110 %.
 * The same scene replays an attack from the defence log. On fakes, the plan view of the game's board.
 */
const meta = {
  title: "Scenes/PvP/Attack",
  component: PvpAttackScene,
  parameters: { layout: "fullscreen" },
  args: { ...PVP_ATTACK.start, onBack: fn(), onSlotClick: fn(), onDiscard: fn() },
} satisfies Meta<typeof PvpAttackScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The first tile in hand: the starter alone on the territory, the meter empty. */
export const Start: Story = { args: PVP_ATTACK.start };
/** Halfway: the legal cells of the tile in hand lit, inside the territory only. */
export const Midway: Story = { args: PVP_ATTACK.midway };
/** A cell chosen: the bubble, and the points it would score over the HUD's score. */
export const Placed: Story = { args: PVP_ATTACK.placed };
/** A move closed a structure: its points over the board. */
export const Closing: Story = { args: PVP_ATTACK.closing };
/** Past 70 % of the village: the first star lit. */
export const OneStar: Story = { args: PVP_ATTACK.oneStar };
/** No cell of the territory takes the tile in any rotation: the stack's Discard says so. */
export const FitsNowhere: Story = { args: PVP_ATTACK.fitsNowhere };
/** The last tile in hand. */
export const LastTile: Story = { args: PVP_ATTACK.lastTile };
export const PendingMove: Story = { args: PVP_ATTACK.pending };
export const RefusedMove: Story = { args: PVP_ATTACK.refused };

/** Plays the whole attack, a move every `ms`: the GIF of the pull request. */
function AutoPlay({ ms }: { ms: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % (ATTACK_STEPS.length + 3)), ms);
    return () => clearInterval(id);
  }, [ms]);
  return <PvpAttackScene {...attackAt(ATTACK_STEPS, i)} />;
}
/** The attack played through, a move every 600 ms, then again. */
export const Autoplay: StoryObj<{ ms: number }> = { args: { ms: 600 }, render: ({ ms }) => <AutoPlay ms={ms} /> };

/** A replay from the defence log, at its start. */
export const ReplayStart: Story = { args: PVP_REPLAY.start };
/** Paused on move 20. */
export const ReplayPaused: Story = { args: PVP_REPLAY.paused };
/** The replay's last move: the attack's final score. */
export const ReplayEnd: Story = { args: PVP_REPLAY.end };

/** The replay's controls working: play, pause and step through the attack. */
function ReplayPlayer() {
  const [move, setMove] = useState(0);
  const [playing, setPlaying] = useState(true);
  const last = REPLAY_STEPS.length - 1;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setMove((n) => (n >= last ? n : n + 1)), 500);
    return () => clearInterval(id);
  }, [playing, last]);
  useEffect(() => {
    if (move >= last) setPlaying(false);
  }, [move, last]);
  const props = replayAt(move, playing);
  return (
    <PvpAttackScene
      {...props}
      replay={{ ...props.replay!, onPlay: () => setPlaying(true), onPause: () => setPlaying(false), onStep: (by) => setMove((n) => Math.max(0, Math.min(last, n + by))) }}
    />
  );
}
export const Replay: Story = { render: () => <ReplayPlayer /> };

/** The game's board settings with the fog (`BOARD_FOG`), the ambient effects on, a summer's day held. */
const DAY_3D: RendererSettingsInput = { ambient: { enabled: true }, fog: BOARD_FOG, dayNight: { enabled: true, season: "summer", freezeAt: DAY_PHASE_AT.day } };
const NIGHT_3D: RendererSettingsInput = { ...DAY_3D, dayNight: { enabled: true, season: "summer", freezeAt: DAY_PHASE_AT.night } };

/** The attack on the 3D board as the page gives it (`PvpAttackBoard`): the fog of war clear over the territory and its neighbours. */
function Attack3D({ settings, ...args }: PvpAttackSceneProps & { settings: RendererSettingsInput }) {
  return (
    <PvpAttackScene
      {...args}
      canvas={<PvpAttackBoard territory={args.territory} tiles={args.tiles} slots={args.slots} ghost={args.ghost} bubble={args.bubble} basePath={APP_ASSETS} settings={settings} onCellClick={args.onSlotClick} />}
    />
  );
}

/** Halfway, in 3D (#648): the fog over everything but the defender's territory and the cells next to it. */
export const Board3D: Story = { args: PVP_ATTACK.midway, render: (args) => <Attack3D {...args} settings={DAY_3D} /> };
/** The same at night. */
export const Board3DNight: Story = { args: PVP_ATTACK.midway, render: (args) => <Attack3D {...args} settings={NIGHT_3D} /> };

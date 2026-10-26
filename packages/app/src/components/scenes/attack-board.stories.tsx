import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import type { BoardTile } from "@paved/chain";
import { DAY_PHASE_AT, SEASONS, type DayPhase, type RendererSettingsInput, type Season } from "@paved/renderer";
import { sideSettings, type BoardSide } from "../../data/board-side";
import { squareGridSettings } from "../../data/settings";
import { APP_ASSETS, appRenders } from "../../mocks/assets";
import { PVP_REPLAY } from "../../mocks/pvp";
import { PVP_V2_ATTACK, PVP_V2_SCOUT, RIVAL_V2_VILLAGE } from "../../mocks/pvp-v2";
import { BOARD } from "../../mocks/scenes";
import { BoardViewport, type BoardBubble, type BoardGhost } from "../containers/board-viewport";
import { StackView } from "../containers/stack-view";
import type { StackFrame } from "../containers/tile-stack";
import { BoardScene, type BoardSceneProps } from "./board-scene";
import { PvpAttackScene } from "./pvp-attack-scene";
import { PvpScoutScene } from "./pvp-scout-scene";

/**
 * BOARD-MODULE-2 (#772): an attack is a Training game on someone else's village. The attack is `BoardScene`'s attack mode, so it
 * has the same 3D board, assets, stack, bubble, closing feed, season dial, weather and fog as Training. Only the attack's own
 * pieces differ (the star meter, the defender in the title, the deck's count) and the void: red around a rival's village,
 * green around the player's own.
 *
 * The board's settings are the module's: `useGameBoard`'s square grid and fog for the side (`sideSettings`). They are held at a
 * season and a time of day here, so the stories compare like with like. Open Attack and Training at 375 and 1440 px to compare
 * them. Voids shows the two voids side by side; pick a season and a time with the controls to tune the red (open point 7).
 */
const meta = { title: "Scenes/Board/Attack and Training", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;

/** The module's board settings for a side, held at a season and a time of day, the ambient effects on. */
function held(side: BoardSide, season: Season = "summer", phase: DayPhase = "day"): RendererSettingsInput {
  return { ambient: { enabled: true }, dayNight: { enabled: true, season, freezeAt: DAY_PHASE_AT[phase] }, ...sideSettings(side, squareGridSettings(true, "")) };
}

/** The dial held at the board's season, as `useGameBoard` gives it. */
const wheel = (season: Season): BoardSceneProps["seasonWheel"] => ({ state: season, onNext: fn(), read: null });

/** The 3D board and stack as the module draws them, for the stories (the routes draw them through `useGameBoard`). */
function board3d(side: BoardSide, b: { tiles: BoardTile[]; slots?: { x: number; y: number; fits?: boolean }[]; ghost?: BoardGhost | null; bubble?: BoardBubble | null }, season?: Season, phase?: DayPhase) {
  return {
    canvas: <BoardViewport tiles={b.tiles} slots={b.slots} ghost={b.ghost} bubble={b.bubble} basePath={APP_ASSETS} settings={held(side, season, phase)} />,
    renderHandStack: (v: StackFrame): ReactNode => <StackView {...v} basePath={APP_ASSETS} />,
    seasonWheel: wheel(season ?? "summer"),
  };
}

const bubble = (b: BoardBubble | null | undefined) => b && { ...b, onRotate: fn(), onClose: fn(), onConfirm: fn(), onDiscard: fn() };

/** An attack of PvP v2 halfway, its tile placed and the bubble up: the rival's village in its red void. */
export const Attack: StoryObj = {
  render: () => {
    const a = { ...PVP_V2_ATTACK.placed, bubble: bubble(PVP_V2_ATTACK.placed.bubble) };
    return <PvpAttackScene {...a} tileRenders={appRenders} {...board3d("rival", a)} onBack={fn()} onDiscard={fn()} />;
  },
};

/** A Training game, its tile placed and the bubble up, to compare with Attack: the same scene, the player's green void. */
export const Training: StoryObj = {
  render: () => {
    const t = { ...BOARD.slotChosen, mode: "training" as const, gameId: undefined, expiresAt: null, bubble: bubble(BOARD.slotChosen.bubble as BoardBubble) };
    return <BoardScene {...t} now={0} tileRenders={appRenders} {...board3d("own", t)} onBack={fn()} onDiscard={fn()} onRestart={fn()} />;
  },
};

/** A replay from the defence log on the same 3D board, read only: the replay's bar in the stack's place. */
export const Replay: StoryObj = {
  render: () => <PvpAttackScene {...PVP_REPLAY.paused} tileRenders={appRenders} {...board3d("rival", PVP_REPLAY.paused)} onBack={fn()} />,
};

/** The scout of a rival's village on the same 3D board, read only, in the red void. */
export const Scout: StoryObj = {
  render: () => <PvpScoutScene {...PVP_V2_SCOUT.ready} canvas={board3d("rival", { tiles: [...RIVAL_V2_VILLAGE.tiles] }).canvas} onBack={fn()} onNext={fn()} onAttack={fn()} />,
};

/**
 * The two voids side by side on the same village: the player's own (green, left) and a rival's (red, right), at the season and
 * the time of day the controls pick. `seasonShare` is 0.3 on the rival's side so the red holds in every season.
 */
export const Voids: StoryObj<{ season: Season; phase: DayPhase }> = {
  args: { season: "summer", phase: "day" },
  argTypes: { season: { control: "inline-radio", options: [...SEASONS] }, phase: { control: "inline-radio", options: Object.keys(DAY_PHASE_AT) } },
  render: ({ season, phase }) => (
    <div className="flex h-dvh flex-col bg-board tablet:flex-row">
      {(["own", "rival"] as const).map((side) => (
        <div key={side} data-side={side} className="relative min-h-0 flex-1">
          <BoardViewport key={`${season}-${phase}`} tiles={[...RIVAL_V2_VILLAGE.tiles]} basePath={APP_ASSETS} settings={held(side, season, phase)} />
          <span className="absolute top-2 left-2 rounded-md bg-card/90 px-2 py-1 text-xs font-semibold">{side === "own" ? "Own village: green" : "Rival's village: red"}</span>
        </div>
      ))}
    </div>
  ),
};

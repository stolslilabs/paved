import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DAY_PHASE_AT, type RendererSettingsInput } from "@paved/renderer";
import { sideSettings } from "../../data/board-side";
import { matchBoardSide } from "../../data/matches";
import { squareGridSettings } from "../../data/settings";
import { APP_ASSETS, appRenders } from "../../mocks/assets";
import { MATCH_ATTACK, MATCH_DEFENCE, PVP_MATCH, matchAt } from "../../mocks/pvp-match";
import { BoardViewport } from "../containers/board-viewport";
import { PvpMatchScene, type MatchView, type PvpMatchSceneProps } from "./pvp-match-scene";
import { PHONE_375, WIDE_1440 } from "./viewports";

/**
 * A match (#786, `/pvp/match/:id`), opened from a card of the League page: one board and two views, switched at the top by the
 * two-segment control (each view's score) or by a flick across the board. The village is the attacked village from the snapshot
 * kept at the attack's start; the build is the attack's moves, stepped through as a replay (step, play; open point 2). Its voids:
 * the player's attack on a rival, the village red and the build blue (open point 1); a rival's attack on the player's village,
 * the village green and the build red (open point 4). The plain stories draw the plan view; the 3D ones the board as the page
 * does, summer's day held. Mobile first (375 px), then 1440 px.
 */
const meta = {
  title: "Scenes/PvP/Match",
  component: PvpMatchScene,
  parameters: { layout: "fullscreen" },
  args: { ...PVP_MATCH.attackVillage, tileRenders: appRenders, onBack: fn(), onView: fn() },
} satisfies Meta<typeof PvpMatchScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The 3D board of a view, its void the side's, held on summer's day as the page holds it. */
function board3d(args: PvpMatchSceneProps): RendererSettingsInput {
  return { ambient: { enabled: true }, dayNight: { enabled: true, season: "summer", freezeAt: DAY_PHASE_AT.day }, ...sideSettings(matchBoardSide(args.side, args.view), squareGridSettings(true, "")) };
}

/** The scene on the 3D board: one viewport, its tiles and void following the view, as the page's single board. */
const in3d: Story["render"] = (args) => <PvpMatchScene {...args} canvas={<BoardViewport tiles={args.tiles} basePath={APP_ASSETS} settings={board3d(args)} />} />;

/** The player's attack: the rival's village as it was at the attack's start. */
export const AttackVillage: Story = { args: PVP_MATCH.attackVillage };
/** The player's attack: its build, whole, the replay at its end. */
export const AttackBuild: Story = { args: PVP_MATCH.attackBuild };
/** The build halfway through its replay, playing. */
export const AttackMidway: Story = { args: PVP_MATCH.attackMidway };
/** A rival's attack on the player's village: the village as it was then. */
export const DefenceVillage: Story = { args: PVP_MATCH.defenceVillage };
/** A rival's attack on the player's village: its build. */
export const DefenceBuild: Story = { args: PVP_MATCH.defenceBuild };

export const AttackVillagePhone: Story = { ...AttackVillage, ...PHONE_375 };
export const AttackBuildPhone: Story = { ...AttackBuild, ...PHONE_375 };
export const DefenceVillagePhone: Story = { ...DefenceVillage, ...PHONE_375 };
export const DefenceBuildPhone: Story = { ...DefenceBuild, ...PHONE_375 };
export const AttackVillageWide: Story = { ...AttackVillage, ...WIDE_1440 };
export const AttackBuildWide: Story = { ...AttackBuild, ...WIDE_1440 };
export const DefenceVillageWide: Story = { ...DefenceVillage, ...WIDE_1440 };
export const DefenceBuildWide: Story = { ...DefenceBuild, ...WIDE_1440 };

/** The 3D board: the rival's village in its red void. */
export const AttackVillage3d: Story = { ...AttackVillagePhone, render: in3d };
/** The 3D board: the player's own build in the blue void. */
export const AttackBuild3d: Story = { ...AttackBuildPhone, render: in3d };
/** The 3D board: the player's village in its green void. */
export const DefenceVillage3d: Story = { ...DefenceVillagePhone, render: in3d };
/** The 3D board: the rival's build in the red void. */
export const DefenceBuild3d: Story = { ...DefenceBuildPhone, render: in3d };
export const AttackBuild3dWide: Story = { ...AttackBuild, ...WIDE_1440, render: in3d };

/** The scene with its state: the switch by tap or flick, the replay's step and play, on the 3D board. */
function Live({ match, initial }: { match: typeof MATCH_ATTACK; initial: MatchView }) {
  const [view, setView] = useState<MatchView>(initial);
  const total = match.steps.length - 1;
  const [move, setMove] = useState(total);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    if (move >= total) return setPlaying(false);
    const timer = setTimeout(() => setMove((m) => m + 1), 700);
    return () => clearTimeout(timer);
  }, [playing, move, total]);
  const args = matchAt(match, view, move, playing);
  return (
    <PvpMatchScene
      {...args}
      tileRenders={appRenders}
      canvas={<BoardViewport tiles={args.tiles} basePath={APP_ASSETS} settings={board3d(args)} />}
      onView={setView}
      replay={{
        ...args.replay,
        onPlay: () => {
          if (move >= total) setMove(0);
          setPlaying(true);
        },
        onPause: () => setPlaying(false),
        onStep: (by) => {
          setPlaying(false);
          setMove((m) => Math.max(0, Math.min(total, m + by)));
        },
      }}
      onBack={fn()}
    />
  );
}

/** The player's attack, live: tap a segment or flick the board to switch; the board fades back in (a cut under reduced motion). */
export const AttackLive: Story = { ...AttackVillagePhone, render: () => <Live match={MATCH_ATTACK} initial="village" /> };
export const AttackLiveWide: Story = { ...AttackVillageWide, render: () => <Live match={MATCH_ATTACK} initial="village" /> };
/** A rival's attack on the player's village, live. */
export const DefenceLive: Story = { ...DefenceVillagePhone, render: () => <Live match={MATCH_DEFENCE} initial="village" /> };
/** Reduced motion: the switch cuts, no fade. */
export const ReducedMotion: Story = { ...AttackLive, parameters: { ...AttackLive.parameters, reducedMotion: "always" } };

import { useCallback, useEffect, useMemo, useState } from "react";
import { GameCanvas } from "@paved/renderer/react";
import { CENTER, CategoryType, EngineGame, OrientationType, PlanType, closedOf, type ScoredStructure } from "@paved/game-core";
import { DEFAULT_CLOSING_SETTINGS, type GameScene, type QualityTier, type RendererSettingsInput } from "@paved/renderer";
import { toClosedStructures, toRenderTiles } from "../../components/containers/board-viewport";
import { ClosingFeed } from "../../components/containers/closing-feed";
import { APP_ASSETS } from "../../mocks/assets";

type Move = readonly [plan: string, orientation: "N" | "E" | "S" | "W", x: number, y: number];

/**
 * Engine moves (each plan forced, every placement legal), found by a seeded search of the engine (#722). The last move of
 * `STAGGER` closes a road, a forest, a city and a road at once; `MANY` is a longer game with 17 structures closed.
 */
const STAGGER: readonly Move[] = [
  ["RFRFFFCFR", "S", -1, 0], ["WFFFFFFFF", "N", 0, -1], ["SFRFRFCFR", "N", 1, 0], ["SFRFRFFFR", "S", 2, 0], ["FFFFFFCFF", "E", 0, -2],
  ["WFFFFFFFR", "W", -2, 0], ["CCCCCFFFC", "E", 0, 1], ["RFRFFFFFR", "W", 3, 0], ["RFRFCCCFR", "S", 1, 1], ["SFRFRFCFR", "E", 3, -1],
  ["CFFFCFFFC", "E", 1, -2], ["RFRFRFCFF", "W", 3, -2], ["RFRFRFCFF", "N", 2, -2], ["RFRFCCCFR", "E", -2, -1], ["SFRFRFCFR", "W", 2, -1],
];
const MANY: readonly Move[] = [
  ["FFCFFFFFC", "S", 0, -1], ["RFRFRFCFF", "W", 1, 0], ["RFRFCCCFR", "E", 0, 1], ["FFCFFFCFF", "N", 0, -2], ["RFRFCCCFR", "S", -1, 0],
  ["CCCCCFRFC", "N", 0, -3], ["RFFFRFCFR", "E", 0, 2], ["RFRFCCCFR", "N", -2, 0], ["RFRFFFFFR", "W", -1, -2], ["RFRFRFCFF", "E", -2, -2],
  ["RFRFFFCFR", "S", 0, 3], ["SFRFRFCFR", "W", 1, 1], ["SFRFRFCFR", "W", -1, -3], ["RFRFCCCFR", "N", -1, 2], ["SFRFRFCFR", "N", -3, 0],
  ["SFRFRFRFR", "S", -3, 1], ["FFCFFFCFF", "S", 0, 4], ["FFCFFFFFC", "E", 1, 4], ["FFFFFFCFF", "N", 1, -2], ["CCCCCFFFC", "W", 2, 0],
  ["FFCFFFFFC", "N", 2, 4], ["CFFFCFFFC", "E", 2, -2], ["SFRFRFFFR", "S", 1, 3], ["WFFFFFFFR", "N", 2, 3], ["SFRFRFCFR", "W", -2, 1],
  ["RFRFCCCFR", "E", -2, -3], ["FFCFFFCFF", "S", 2, -1], ["WFFFFFFFR", "S", -4, 0], ["RFFFRFFFR", "E", -5, 0], ["RFRFFFFFR", "N", -6, 0],
  ["FFFFCCCFF", "W", -3, -2], ["RFRFFFCFR", "S", 3, -2], ["SFRFRFCFR", "E", -1, -4], ["FFCFFFCFF", "N", -3, -1], ["CFFFCFFFC", "W", -4, -2],
  ["SFRFRFRFR", "N", -7, 0], ["SFRFRFRFR", "E", 0, -4],
];

const ORIENTATION: Record<Move[1], OrientationType> = { N: OrientationType.North, E: OrientationType.East, S: OrientationType.South, W: OrientationType.West };
const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);
const CATEGORIES = Object.values(CategoryType);
const GAME_ID = 1;

/** The board after `moves` (the engine's), as the board scene draws it: its tiles, its closed structures, the last move's closings. */
function play(moves: readonly Move[]) {
  const game = EngineGame.start({ deck: "simple", seed: 0n });
  let last: ScoredStructure[] = [];
  for (const [plan, orientation, x, y] of moves) {
    game.force(plan as PlanType);
    last = game.build({ orientation: ORIENTATION[orientation], x, y }).scored.map((s) => ({ category: CATEGORIES.indexOf(s.category), size: s.size, points: s.points }));
  }
  const tiles = game.placed().map((t) => ({ id: t.id, plan: PLANS.indexOf(t.plan), orientation: ORIENTATIONS.indexOf(t.orientation), x: CENTER + t.x, y: CENTER + t.y }));
  return { tiles: toRenderTiles(tiles, GAME_ID), closed: toClosedStructures(closedOf(game.closings()), GAME_ID), lastScored: last };
}

const BEFORE = play(STAGGER.slice(0, -1));
const AFTER = play(STAGGER);
const WHOLE = play(MANY);

export const CLOSING_SCENARIOS = ["stagger", "many"] as const;
export type ClosingScenario = (typeof CLOSING_SCENARIOS)[number];

export interface ClosingBoardProps {
  /** "stagger": a move closes a road, a forest, a city and a road at once (Play); "many": 17 closed structures, each shining on its own clock. */
  scenario: ClosingScenario;
  quality: QualityTier | "auto";
  /** Reduced motion (the placement's, as the confirm): a short tint, no shine. */
  reducedMotion: boolean;
  pulseColor: string;
  pulseStrength: number;
  pulseGlow: number;
  pulseMs: number;
  reducedPulseMs: number;
  staggerMs: number;
  shine: boolean;
  shineColor: string;
  shineStrength: number;
  shineWidth: number;
  shineAngle: number;
  shineDurationMs: number;
  intervalMinMs: number;
  intervalMaxMs: number;
}

/** The defaults as the story's args: every closing setting (`RendererSettings.closing`) a control. */
export const CLOSING_ARGS: Omit<ClosingBoardProps, "scenario" | "quality" | "reducedMotion"> = {
  pulseColor: DEFAULT_CLOSING_SETTINGS.pulse.color,
  pulseStrength: DEFAULT_CLOSING_SETTINGS.pulse.strength,
  pulseGlow: DEFAULT_CLOSING_SETTINGS.pulse.glow,
  pulseMs: DEFAULT_CLOSING_SETTINGS.pulse.ms,
  reducedPulseMs: DEFAULT_CLOSING_SETTINGS.pulse.reducedMs,
  staggerMs: DEFAULT_CLOSING_SETTINGS.pulse.staggerMs,
  shine: DEFAULT_CLOSING_SETTINGS.shine.enabled,
  shineColor: DEFAULT_CLOSING_SETTINGS.shine.color,
  shineStrength: DEFAULT_CLOSING_SETTINGS.shine.strength,
  shineWidth: DEFAULT_CLOSING_SETTINGS.shine.width,
  shineAngle: DEFAULT_CLOSING_SETTINGS.shine.angle,
  shineDurationMs: DEFAULT_CLOSING_SETTINGS.shine.durationMs,
  intervalMinMs: DEFAULT_CLOSING_SETTINGS.shine.intervalMinMs,
  intervalMaxMs: DEFAULT_CLOSING_SETTINGS.shine.intervalMaxMs,
};

/**
 * The closed structures' pulse and shine (CLOSE-SHINE, #722) through the real renderer, on engine boards: the structures
 * already closed when the board opens shine at once; Play closes four more at once, which pulse in turn as their feed lines
 * appear, then shine. The readout counts the closed structures and those sweeping now.
 */
export function ClosingBoard({ scenario, quality, reducedMotion, ...knobs }: ClosingBoardProps) {
  const [scene, setScene] = useState<GameScene | null>(null);
  const [played, setPlayed] = useState(false);
  const [readout, setReadout] = useState("");
  const board = scenario === "many" ? WHOLE : played ? AFTER : BEFORE;
  const key = JSON.stringify([quality, reducedMotion, knobs]);
  const settings = useMemo<RendererSettingsInput>(
    () => ({
      quality,
      placement: { motion: { reducedMotion } },
      closing: {
        pulse: { color: knobs.pulseColor, strength: knobs.pulseStrength, glow: knobs.pulseGlow, ms: knobs.pulseMs, reducedMs: knobs.reducedPulseMs, staggerMs: knobs.staggerMs },
        shine: {
          enabled: knobs.shine,
          color: knobs.shineColor,
          strength: knobs.shineStrength,
          width: knobs.shineWidth,
          angle: knobs.shineAngle,
          durationMs: knobs.shineDurationMs,
          intervalMinMs: knobs.intervalMinMs,
          intervalMaxMs: knobs.intervalMaxMs,
        },
      },
    }),
    [key], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const onReady = useCallback((s: GameScene) => {
    // A capture script reads the layer through it (as the Lighting story's `__lightingScene`).
    (window as { __closingScene?: GameScene }).__closingScene = s;
    setScene(s);
  }, []);

  useEffect(() => {
    if (!scene) return;
    const id = setInterval(() => {
      const layer = scene.getClosedStructures();
      const now = performance.now();
      const sweeping = board.closed.filter((c) => layer.sweepingAt(c.id, now)).length;
      const pulsing = board.closed.filter((c) => layer.pulseAt(c.id, now) > 0).length;
      setReadout(`closed ${layer.size} · pulsing ${pulsing} · sweeping ${sweeping}`);
    }, 100);
    return () => clearInterval(id);
  }, [scene, board]);

  return (
    <div className="relative h-full min-h-dvh w-full bg-board" data-ready={scene ? true : undefined}>
      <GameCanvas tiles={board.tiles} closedStructures={board.closed} basePath={APP_ASSETS} settings={settings} onReady={onReady} style={{ position: "absolute", inset: 0 }} />
      {scenario === "stagger" && played && <ClosingFeed closings={AFTER.lastScored} className="absolute top-16 left-1/2 -translate-x-1/2" />}
      <div className="absolute top-3 left-3 flex items-center gap-2">
        {scenario === "stagger" && (
          <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground" onClick={() => setPlayed((p) => !p)}>
            {played ? "Undo the move" : "Play the move"}
          </button>
        )}
        {readout && (
          <output className="rounded-md bg-background/80 px-3 py-1.5 font-mono text-xs text-foreground" aria-live="off">
            {readout}
          </output>
        )}
      </div>
    </div>
  );
}

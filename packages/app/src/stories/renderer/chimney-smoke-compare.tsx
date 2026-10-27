import { ChimneySmokeBoard, LOOK_KEYS, VARIATION_KEYS, type ChimneySmokeBoardProps } from "./chimney-smoke-board";

/**
 * The smoke to tune (#801): a start from the issue's proposal (open point 1), for the owner to move in the story. Slower (a longer
 * life, a slower rise, half the roll and the sway), subtler (slightly smaller puffs, an opacity of 0.4), and each chimney its own
 * plume: ±35° of lean, its drift, its shape between "puffs" and "wisps", ±12 % of tone. Not a default: those come in PR 2 with
 * the values the owner picks.
 */
export const SMOKE_TUNE_START = {
  look: "puffs",
  opacity: 0.4,
  lifeSeconds: 8,
  rise: 2.4,
  sizeStart: 0.12,
  sizeEnd: 0.44,
  roll: 0.125,
  swaySpeed: 0.5,
  varyDirection: 35,
  varyDrift: 0.5,
  varyShape: 0.5,
  varyTone: 0.12,
  varyPuffTone: 0.04,
  varyOpacity: 0.2,
  varyPace: 0.25,
} as const satisfies Partial<ChimneySmokeBoardProps>;

/** The props with every knob of the look and its variation unset: the look "puffs" as #770 draws it. */
export function todayProps(props: ChimneySmokeBoardProps): ChimneySmokeBoardProps {
  const knobs = new Set<string>([...LOOK_KEYS, ...Object.keys(VARIATION_KEYS)]);
  return { ...(Object.fromEntries(Object.entries(props).filter(([key]) => !knobs.has(key))) as ChimneySmokeBoardProps), look: "puffs" };
}

/**
 * Today's smoke beside the one to tune (#801), on the same board, season, light, camera and wind: left, the look "puffs" as #770
 * draws it (no knob reaches it); right, the knobs. Two scenes, each its own WebGL context and its own readout (one smoke draw
 * each). Side by side on a wide window, one over the other on a tall one.
 */
export function ChimneySmokeCompare(props: ChimneySmokeBoardProps) {
  return (
    <div className="flex h-dvh w-full flex-col bg-board landscape:flex-row">
      <div className="relative min-h-0 flex-1 overflow-hidden border-border landscape:border-r portrait:border-b">
        <div className="absolute inset-0">
          <ChimneySmokeBoard {...todayProps(props)} label="Today (#770)" contained />
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-0">
          <ChimneySmokeBoard {...props} label="To tune (#801)" contained />
        </div>
      </div>
    </div>
  );
}

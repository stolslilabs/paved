import { ChimneySmokeBoard, LOOK_KEYS, VARIATION_KEYS, type ChimneySmokeBoardProps } from "./chimney-smoke-board";

/** The props with every knob of the look and its variation unset: the look "puffs" as #770 draws it. */
export function todayProps(props: ChimneySmokeBoardProps): ChimneySmokeBoardProps {
  const knobs = new Set<string>([...LOOK_KEYS, ...Object.keys(VARIATION_KEYS)]);
  return { ...(Object.fromEntries(Object.entries(props).filter(([key]) => !knobs.has(key))) as ChimneySmokeBoardProps), look: "puffs" };
}

/**
 * #770's smoke beside the one to tune (#801), on the same board, season, light, camera and wind: left, the look "puffs" as #770
 * drew it (no knob reaches it); right, the knobs, unset the default look "varied" (the owner's). Two scenes, each its own WebGL context and its own readout (one smoke draw
 * each). Side by side on a wide window, one over the other on a tall one.
 */
export function ChimneySmokeCompare(props: ChimneySmokeBoardProps) {
  return (
    <div className="flex h-dvh w-full flex-col bg-board landscape:flex-row">
      <div className="relative min-h-0 flex-1 overflow-hidden border-border landscape:border-r portrait:border-b">
        <div className="absolute inset-0">
          <ChimneySmokeBoard {...todayProps(props)} label="Before (#770)" contained />
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-0">
          <ChimneySmokeBoard {...props} label="Now (#801)" contained />
        </div>
      </div>
    </div>
  );
}

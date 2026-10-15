import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";
import { TileView } from "../../components/containers/tile-view";
import { RENDERER_ASSETS } from "../../mocks/assets";
import { setModelOverride } from "./model-override";
import { BASE_PLANS, EXTENDED_VARIANTS, planFile, planId, type Density } from "./tiles-data";

const SIDES = ["North", "East", "South", "West"] as const;

const button = "rounded-md border border-border bg-secondary px-2 py-1 text-sm text-foreground aria-pressed:border-primary aria-pressed:bg-accent";

/** The 2D tile image of a plan (the base set's `assets/tiles/`). */
function Png({ src, size = "size-24" }: { src: string; size?: string }) {
  return <img src={src} alt="" draggable={false} className={cn("rounded-md border border-border object-cover", size)} />;
}

export interface TileBrowserProps {
  /** Plan key: nine letters in lower case. */
  plan: string;
  /** 1 North to 4 West. */
  orientation: number;
  /** Set for an extended model: the density and variant shown instead of the base model. */
  variant?: { density: Density; n: number };
}

/**
 * One tile in the real renderer: exactly ONE live canvas (`TileView`), because a browser keeps about 16 WebGL contexts per
 * page. The picker beside it switches the tile, it never mounts a second canvas; the views of the other tiles are PNGs.
 * Nothing turns by itself: the orientation is the control's, so reduced motion has nothing to switch off.
 */
export function TileBrowser({ plan, orientation, variant }: TileBrowserProps) {
  const [side, setSide] = useState(orientation);
  useEffect(() => setSide(orientation), [orientation]);
  const code = BASE_PLANS.find((p) => planFile(p) === plan);
  const file = variant ? `${plan}_${variant.density}_${variant.n}` : plan;
  const model = variant ? `models/extended/${file}.glb` : `models/${plan}.glb`;

  // Set before the canvas mounts (its effect runs first), so the renderer's request is answered; cleared on unmount.
  setModelOverride(variant ? { from: `${RENDERER_ASSETS}/models/${plan}.glb`, to: `${RENDERER_ASSETS}/${model}` } : null);
  useEffect(() => () => setModelOverride(null), []);

  if (!code) return <p className="p-4 text-sm text-muted-foreground">No base plan {plan}.</p>;
  return (
    <div className="flex flex-wrap items-start gap-6 p-6" data-plan={plan} data-model={model}>
      <div className="size-72 overflow-hidden rounded-lg border border-border">
        {/* Remounted when the model changes: the renderer loads its models once, at init. */}
        <TileView key={file} plan={planId(code)} orientation={side} basePath={RENDERER_ASSETS} />
      </div>
      {/* The model's path wraps at 320 px rather than widen the page (WRAP360). */}
      <div className="flex min-w-0 flex-col gap-3 text-foreground">
        <p className="font-mono text-lg">{code}</p>
        <p className="font-mono text-sm wrap-anywhere text-muted-foreground">{model}</p>
        <Png src={`${RENDERER_ASSETS}/assets/tiles/${plan}.png`} />
        <div className="flex gap-1" role="group" aria-label="Orientation">
          {SIDES.map((name, i) => (
            <button key={name} type="button" className={button} aria-pressed={side === i + 1} onClick={() => setSide(i + 1)}>
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** All 19 base plans as PNGs with their codes: an overview with no canvas. */
export function BasePlanGrid({ selected, onSelect }: { selected?: string; onSelect?: (plan: string) => void }) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3 p-6">
      {BASE_PLANS.map((p) => (
        <li key={p}>
          <button type="button" className={cn(button, "flex w-full flex-col items-center gap-1 p-2")} aria-pressed={selected === planFile(p)} onClick={() => onSelect?.(planFile(p))}>
            <Png src={`${RENDERER_ASSETS}/assets/tiles/${planFile(p)}.png`} size="size-20" />
            <span className="font-mono text-xs">{p}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The browser with its picker: choose a base plan from the grid, one canvas shows it. */
export function BaseExplorer({ plan, orientation }: { plan: string; orientation: number }) {
  const [current, setCurrent] = useState(plan);
  useEffect(() => setCurrent(plan), [plan]);
  return (
    <div>
      <TileBrowser plan={current} orientation={orientation} />
      <BasePlanGrid selected={current} onSelect={setCurrent} />
    </div>
  );
}

/** The browser for the extended models, with every variant of the plan as a button. */
export function ExtendedExplorer({ plan, density, n, orientation }: { plan: string; density: Density; n: number; orientation: number }) {
  const [current, setCurrent] = useState({ plan, density, n });
  useEffect(() => setCurrent({ plan, density, n }), [plan, density, n]);
  const counts = EXTENDED_VARIANTS[current.plan];
  const variant = counts && current.n <= counts[current.density] ? { density: current.density, n: current.n } : { density: current.density, n: 1 };
  return (
    <div>
      <TileBrowser plan={current.plan} orientation={orientation} variant={variant} />
      <div className="flex flex-col gap-2 px-6 text-foreground">
        {(["LF", "HF"] as const).map((d) => (
          <div key={d} className="flex flex-wrap items-center gap-1" role="group" aria-label={d === "LF" ? "Low forest density" : "High forest density"}>
            <span className="w-8 font-mono text-xs">{d}</span>
            {Array.from({ length: counts?.[d] ?? 0 }, (_, i) => (
              <button key={i} type="button" className={button} aria-pressed={variant.density === d && variant.n === i + 1} onClick={() => setCurrent({ ...current, density: d, n: i + 1 })}>
                {i + 1}
              </button>
            ))}
          </div>
        ))}
      </div>
      <BasePlanGrid selected={current.plan} onSelect={(p) => setCurrent({ plan: p, density: current.density, n: 1 })} />
    </div>
  );
}

/** Every extended model by file name, grouped by plan, over the plan's PNG: an overview with no canvas. */
export function ExtendedIndex() {
  return (
    <ul className="flex flex-col gap-3 p-6 text-foreground">
      {BASE_PLANS.map((p) => {
        const counts = EXTENDED_VARIANTS[planFile(p)];
        return (
          <li key={p} className="flex items-start gap-4 rounded-lg border border-border p-3">
            <Png src={`${RENDERER_ASSETS}/assets/tiles/${planFile(p)}.png`} size="size-16" />
            <div className="flex flex-col gap-1">
              <p className="font-mono text-sm">{p}</p>
              {(["LF", "HF"] as const).map((d) => (
                <p key={d} className="font-mono text-xs text-muted-foreground">
                  {Array.from({ length: counts[d] }, (_, i) => `${planFile(p)}_${d}_${i + 1}.glb`).join("  ")}
                </p>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The 2D tiles of the old game that have no model, as PNGs. */
export function ExtraTiles({ tiles }: { tiles: readonly string[] }) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3 p-6 text-foreground">
      {tiles.map((t) => (
        <li key={t} className="flex flex-col items-center gap-1">
          <Png src={`${RENDERER_ASSETS}/models/extended/tiles/${t}.png`} size="size-20" />
          <span className="font-mono text-xs">{t.toUpperCase()}</span>
        </li>
      ))}
    </ul>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { chimneyOptionsOf, findChimneys, voxelize, type AssetLoader, type ChimneyReject, type FoundChimneys, type VoxelGrid } from "@paved/renderer";
import { drawIso, paletteRgb, type IsoBox } from "./night-windows-iso";
import { forestIds, modelId, useLoader, type TileSkin } from "./night-windows-tile";
import { VOXELIZER_PLANS, loadedOf } from "./voxelizer-readout";

export { VOXELIZER_PLANS as CHIMNEY_PLANS };

/** What the views mark: the two kinds of chimney, and the plumes and high points the detection rejected. */
export type ChimneyMark = "smoking" | "bare" | "plume" | "high point";

/** The marks' colours: the smoking chimneys' smoke and mouth, the bare ones' mouth, the rejected candidates. */
export const CHIMNEY_COLORS: Record<ChimneyMark, string> = { smoking: "#e879f9", bare: "#22d3ee", plume: "#fb923c", "high point": "#facc15" };

const MARK_LABELS: Record<ChimneyMark, string> = {
  smoking: "smoking chimney: its white smoke voxels boxed, its mouth filled",
  bare: "bare chimney (no smoke voxels): its mouth boxed (dashed: not in the chimneys' colours)",
  plume: "light voxels rejected as smoke (a wonder's white, a voxel on the ground)",
  "high point": "high point rejected as a chimney (a crenel, a tree top, a post, a spire)",
};

/** The rejected candidates' reasons, for the view's filter: crenels and tree tops are many, the story shows them on demand. */
export const CHIMNEY_REASONS: ChimneyReject[] = ["in a structure", "too large", "on the ground", "no stack", "wide support", "no roof", "vegetation", "wall", "wonder", "roof", "spire", "crenel", "override"];

interface Detected {
  id: string;
  grid: VoxelGrid;
  found: FoundChimneys;
  colors: Array<[number, number, number]>;
  voxelMs: number;
}

/** A model's short name: a plan key, or a variant's file name without its hash. */
export const shortName = (id: string) => id.slice(id.lastIndexOf("/") + 1).replace(/\.[0-9a-f]{10}\.glb$/, "");

function detect(loader: AssetLoader, id: string): Detected | null {
  const { source, palette } = loadedOf(loader, id);
  const began = performance.now();
  const grid = voxelize(source, { name: id });
  const voxelMs = performance.now() - began;
  if (!grid) return null;
  return { id, grid, found: findChimneys(grid, chimneyOptionsOf(id)), colors: paletteRgb(palette), voxelMs };
}

/** Loads the models (a Forest variant on demand) and detects their chimneys, in order; null while they come. */
function useDetected(loader: AssetLoader | null, ids: readonly string[]): Detected[] | null {
  const [out, setOut] = useState<Detected[] | null>(null);
  const key = ids.join(",");
  useEffect(() => {
    if (!loader) return;
    let alive = true;
    setOut(null);
    void (async () => {
      const rows: Detected[] = [];
      for (const id of key.split(",")) {
        if (!loader.has(id)) {
          await new Promise<void>((resolve) => {
            loader.onLoaded(() => loader.has(id) && resolve());
            loader.want([id]);
          });
          loader.onLoaded(null);
        }
        const row = detect(loader, id);
        if (row) rows.push(row);
      }
      if (alive) setOut(rows);
    })();
    return () => {
      alive = false;
    };
  }, [loader, key]);
  return out;
}

/** The marks of a detection on the iso view, and the smoke hidden (with the mouths' caps) when `hidden`. */
function marksOf(d: Detected, marks: ReadonlySet<ChimneyMark>, reasons: ReadonlySet<ChimneyReject>, hidden: boolean): { boxes: IsoBox[]; hide?: (x: number, y: number, l: number) => boolean } {
  const boxes: IsoBox[] = [];
  const smoke = new Set<number>();
  const n = d.grid.sizeX;
  for (const c of d.found.chimneys) {
    const { mouth } = c;
    const mouthBox = { x0: mouth.x, y0: mouth.y, layer0: mouth.layer, x1: mouth.x + mouth.width - 1, y1: mouth.y + mouth.depth - 1, layer1: mouth.layer };
    if (c.kind === "smoking") for (const [x, y, l] of c.smoke) smoke.add(x + n * (y + n * l));
    if (hidden && c.kind === "smoking") boxes.push({ ...mouthBox, color: "#2b2724", fill: "#2b2724" });
    if (!marks.has(c.kind)) continue;
    const color = CHIMNEY_COLORS[c.kind];
    if (c.kind === "smoking") {
      if (!hidden) for (const b of c.boxes) boxes.push({ ...b, color });
      boxes.push({ ...mouthBox, color, fill: hidden ? undefined : color });
    } else boxes.push({ ...mouthBox, layer1: mouth.layer + 2, color, dashed: !c.colour });
  }
  for (const r of d.found.rejected) {
    if (!marks.has(r.kind) || !reasons.has(r.reason)) continue;
    boxes.push({ ...r.bounds, color: CHIMNEY_COLORS[r.kind], dashed: true });
  }
  return { boxes, hide: hidden ? (x, y, l) => smoke.has(x + n * (y + n * l)) : undefined };
}

/** The counts of a detection, as one line. */
function countsOf(found: FoundChimneys): string {
  const smoking = found.chimneys.filter((c) => c.kind === "smoking").length;
  const bare = found.chimneys.filter((c) => c.kind === "bare");
  const reasons: Record<string, number> = {};
  for (const r of found.rejected) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  return `smoking ${smoking}, bare ${bare.length} (${bare.filter((c) => !c.colour).length} not in the chimneys' colours); rejected: ${Object.entries(reasons).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}`;
}

export interface ChimneysTileProps {
  plan: string;
  skin: TileSkin;
  variant: number;
  rotation: number;
  marks: ChimneyMark[];
  /** The rejected candidates shown, by reason. */
  reasons: ChimneyReject[];
  /** The smoke voxels left out and the mouths capped: what the board will draw where the real smoke is (#770 item 2). */
  hidden: boolean;
  scale: number;
}

/** One model: the iso view with its chimneys marked, the counts, and each chimney and rejected candidate. */
export function ChimneysTile({ plan, skin, variant, rotation, marks, reasons, hidden, scale }: ChimneysTileProps) {
  const wanted = useMemo(() => (skin === "forest" ? forestIds([plan]) : []), [plan, skin]);
  const loader = useLoader(wanted);
  const id = modelId(plan, skin, variant);
  const ids = useMemo(() => [id], [id]);
  const detected = useDetected(loader, ids)?.[0] ?? null;
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current || !detected) return;
    const { boxes, hide } = marksOf(detected, new Set(marks), new Set(reasons), hidden);
    drawIso(canvas.current, detected.grid, { rotation, colors: detected.colors, scale, night: false, windows: [], marks: new Set(), unlit: [], light: "none", volume: null, lightColor: "#ffffff", intensity: 0, boxes, hide });
  }, [detected, rotation, marks, reasons, hidden, scale]);
  return (
    <div className="flex min-h-dvh flex-wrap items-start gap-6 bg-background p-6 text-foreground" data-ready={detected ? "" : undefined}>
      <canvas ref={canvas} className="h-auto max-w-full border border-border" aria-label={`${shortName(id)} with its chimneys`} />
      <output className="min-w-0 max-w-full break-words font-mono text-xs leading-6" aria-live="off">
        {!detected && "loading the model"}
        {detected && (
          <>
            <div>
              {shortName(id)}: {detected.grid.sizeX} x {detected.grid.sizeY} x {detected.grid.layers} voxels; voxelizer {detected.voxelMs.toFixed(1)} ms, detection {detected.found.buildMs.toFixed(1)} ms
            </div>
            <div>{countsOf(detected.found)}</div>
            <ul className="mt-2 flex flex-col gap-1">
              {detected.found.chimneys.map((c, i) => (
                <li key={i}>
                  {c.kind} at {c.mouth.x},{c.mouth.y}, layer {c.mouth.layer}: {c.mouth.width} x {c.mouth.depth}, stack {c.stackHeight}, entry {c.entry}
                  {c.colour ? " (a chimney colour)" : ""}
                  {c.kind === "smoking" ? `, ${c.smoke.length} smoke voxels in ${c.boxes.length} boxes` : ""}
                  {c.overridden ? ", kept by an override" : ""}
                </li>
              ))}
            </ul>
            <ul className="mt-2 flex flex-col gap-1">
              {(Object.keys(CHIMNEY_COLORS) as ChimneyMark[]).map((kind) => (
                <li key={kind} className="flex items-center gap-2" style={{ opacity: marks.includes(kind) ? 1 : 0.4 }}>
                  <span className="inline-block size-3 border-2" style={{ borderColor: CHIMNEY_COLORS[kind] }} />
                  {MARK_LABELS[kind]}
                </li>
              ))}
            </ul>
          </>
        )}
      </output>
    </div>
  );
}

export interface ChimneysGalleryProps {
  skin: TileSkin;
  /** Only the models with a chimney or a rejected plume; off, every model. */
  only: boolean;
  rotation: number;
  marks: ChimneyMark[];
  reasons: ChimneyReject[];
  hidden: boolean;
  scale: number;
}

/** Every model of a skin, a small view each with its chimneys marked: the owner's check of the detection (#770 acceptance). */
export function ChimneysGallery({ skin, only, rotation, marks, reasons, hidden, scale }: ChimneysGalleryProps) {
  const ids = useMemo(() => (skin === "forest" ? forestIds(VOXELIZER_PLANS) : [...VOXELIZER_PLANS]), [skin]);
  const loader = useLoader(skin === "forest" ? ids : []);
  const detected = useDetected(loader, ids);
  const shown = detected?.filter((d) => !only || d.found.chimneys.length || d.found.rejected.some((r) => r.kind === "plume")) ?? null;
  const totals = detected?.reduce(
    (sum, d) => ({ smoking: sum.smoking + d.found.chimneys.filter((c) => c.kind === "smoking").length, bare: sum.bare + d.found.chimneys.filter((c) => c.kind === "bare").length }),
    { smoking: 0, bare: 0 },
  );
  return (
    <div className="min-h-dvh bg-background p-4 text-foreground" data-ready={shown ? "" : undefined}>
      {totals && (
        <div className="mb-3 font-mono text-xs">
          {detected!.length} models ({skin}): {totals.smoking} smoking chimneys, {totals.bare} bare; {shown!.length} shown
        </div>
      )}
      {!shown && <div className="font-mono text-xs">loading {skin === "forest" ? `${ids.length} Forest variants` : "the 19 models"}</div>}
      <div className="flex flex-wrap gap-3">
        {shown?.map((d) => (
          <GalleryCard key={d.id} detected={d} rotation={rotation} marks={marks} reasons={reasons} hidden={hidden} scale={scale} />
        ))}
      </div>
    </div>
  );
}

function GalleryCard({ detected, rotation, marks, reasons, hidden, scale }: { detected: Detected; rotation: number; marks: ChimneyMark[]; reasons: ChimneyReject[]; hidden: boolean; scale: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const { boxes, hide } = marksOf(detected, new Set(marks), new Set(reasons), hidden);
    drawIso(canvas.current, detected.grid, { rotation, colors: detected.colors, scale, night: false, windows: [], marks: new Set(), unlit: [], light: "none", volume: null, lightColor: "#ffffff", intensity: 0, boxes, hide });
  }, [detected, rotation, marks, reasons, hidden, scale]);
  const smoking = detected.found.chimneys.filter((c) => c.kind === "smoking").length;
  const bare = detected.found.chimneys.filter((c) => c.kind === "bare").length;
  return (
    <figure className="flex max-w-full flex-col gap-1">
      <canvas ref={canvas} className="h-auto max-w-full border border-border" aria-label={`${shortName(detected.id)} with its chimneys`} />
      <figcaption className="font-mono text-xs">
        {shortName(detected.id)} · smoking {smoking} · bare {bare}
      </figcaption>
    </figure>
  );
}

/** Every model of a skin, one line each: the chimneys by kind, their mouths, and the rejected candidates by reason. */
export function ChimneysTable({ skin }: { skin: TileSkin }) {
  const ids = useMemo(() => (skin === "forest" ? forestIds(VOXELIZER_PLANS) : [...VOXELIZER_PLANS]), [skin]);
  const loader = useLoader(skin === "forest" ? ids : []);
  const detected = useDetected(loader, ids);
  return (
    <div className="min-h-dvh bg-background p-6 text-foreground" data-ready={detected ? "" : undefined}>
      <ul className="flex flex-col gap-1 font-mono text-xs">
        {detected?.map((d) => (
          <li key={d.id} className="flex flex-wrap gap-x-4 break-words">
            <span className="w-40">{shortName(d.id)}</span>
            <span>{countsOf(d.found)}</span>
            <span>mouths {d.found.chimneys.map((c) => `${c.kind[0]}${c.mouth.x},${c.mouth.y},${c.mouth.layer}`).join(" ") || "none"}</span>
            <span>
              voxelize {d.voxelMs.toFixed(1)} ms, detect {d.found.buildMs.toFixed(1)} ms
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

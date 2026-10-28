import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import aStone from "../../assets/tokens/cobbles-study/a-stone.svg?no-inline";
import aStoneRaw from "../../assets/tokens/cobbles-study/a-stone.svg?raw";
import bPile from "../../assets/tokens/cobbles-study/b-pile.svg?no-inline";
import bPileRaw from "../../assets/tokens/cobbles-study/b-pile.svg?raw";
import cCoin from "../../assets/tokens/cobbles-study/c-coin.svg?no-inline";
import cCoinRaw from "../../assets/tokens/cobbles-study/c-coin.svg?raw";
import dPaving from "../../assets/tokens/cobbles-study/d-paving.svg?no-inline";
import dPavingRaw from "../../assets/tokens/cobbles-study/d-paving.svg?raw";
import eVoxel from "../../assets/tokens/cobbles-study/e-voxel.svg?no-inline";
import eVoxelRaw from "../../assets/tokens/cobbles-study/e-voxel.svg?raw";
import todayRaw from "../../assets/tokens/cobbles.svg?raw";
import pavedRelief from "../../assets/tokens/relief/paved.svg?no-inline";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Plate, PLATE_FIGURE, plateCoinClass, PlateDisc } from "./plate";
import { TOKEN_GAP, TOKEN_ICONS, TokenIcon } from "./token-icon";

/**
 * The Cobbles' new icon, the owner's pick (issue 849, PR 1): five directions drawn for Paved in #844's relief codes (a dark
 * outline, a lit gradient, a light on the upper edges, a shadow under), in `src/assets/tokens/cobbles-study/`. A study: the app
 * still draws `cobbles.svg`, and the direction picked replaces it in PR 2, so every place follows through `TokenIcon`.
 */
const meta = {
  title: "Elements/CobblesIcon",
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** A direction's criteria (issue 849): each is shown in the stories, these are the study's reading of them. */
interface Direction {
  key: string;
  name: string;
  idea: string;
  src: string;
  /** The file's text, for its size in bytes (ASCII: one byte a character). */
  raw: string;
  /** Legible at 16 px in a sentence. */
  legible: string;
  /** A silhouette unlike PAVED's coin. */
  silhouette: { ok: boolean; note: string };
  /** Clear over the plate's end. */
  plate: string;
}

const TODAY: Direction = {
  key: "today",
  name: "Today: cubes-stacked",
  idea: "Font Awesome Pro's solid cubes-stacked, flat stone with an outline (no relief).",
  src: TOKEN_ICONS.cobbles.src,
  raw: todayRaw,
  legible: "Six squares turn to a grey speck in a sentence.",
  silhouette: { ok: true, note: "A pyramid of squares." },
  plate: "Thin on the disc: its lines read as a pattern.",
};

const DIRECTIONS: readonly Direction[] = [
  {
    key: "a",
    name: "A. One cobblestone",
    idea: "One rounded granite stone, its top lit and speckled, a darker side: a precious nugget.",
    src: aStone,
    raw: aStoneRaw,
    legible: "One shape: reads as a stone at 16 px; the specks fade, the lit top and dark side stay.",
    silhouette: { ok: true, note: "Wider than tall, a lit top over a dark side: no rim, no letter." },
    plate: "Fills the disc as one mass, the clearest of the five.",
  },
  {
    key: "b",
    name: "B. A small pile",
    idea: "Three rounded cobbles of slightly different greys, one on two.",
    src: bPile,
    raw: bPileRaw,
    legible: "The three stones hold at 16 px; the greys merge into one.",
    silhouette: { ok: true, note: "A triangle of three lobes." },
    plate: "Clear; the gaps between the stones show the disc behind.",
  },
  {
    key: "c",
    name: "C. A cobble coin",
    idea: "A round coin stamped with four cobbles in a grid: it reads as money in the plates.",
    src: cCoin,
    raw: cCoinRaw,
    legible: "Reads as a coin; the four cobbles become a grid of dots under 24 px.",
    silhouette: { ok: false, note: "Round with a rim, as PAVED's coin: only the colour and the face tell them apart." },
    plate: "Sits on the disc like the other coins (USDC, PAVED).",
  },
  {
    key: "d",
    name: "D. A paving square",
    idea: "2 x 2 cobbles with their joints, in an isometric tilt, echoing Paved's tiles.",
    src: dPaving,
    raw: dPavingRaw,
    legible: "A flat lozenge at 16 px: the joints go, the slab stays.",
    silhouette: { ok: true, note: "A lozenge, wider than tall." },
    plate: "Low in the disc: the most room left above and below.",
  },
  {
    key: "e",
    name: "E. A voxel cobble",
    idea: "A small isometric stone of voxels in the board's stone colours, tying it to the 3D world.",
    src: eVoxel,
    raw: eVoxelRaw,
    legible: "The block reads at 16 px; the single voxels show from 24 px.",
    silhouette: { ok: true, note: "A stepped hexagon, the board's blocks." },
    plate: "Clear; the step gives it a side to tell it from a box.",
  },
];

const ALL = [...DIRECTIONS, TODAY];
const SIZES = [16, 24, 32, 48, 64] as const;
/** The study's limit for the file (issue 849). */
const MAX_BYTES = 2048;

/** The home's skies (theme.css, 3b): a day sky stands for the light surfaces, a night one beside the app's dark surface. */
const SURFACES = [
  { name: "Dark: the app's surface", className: "bg-background" },
  { name: "Dark: a card", className: "bg-card" },
  { name: "Light: spring day sky", style: { background: "linear-gradient(to bottom, var(--sky-spring-day-top), var(--sky-spring-day-bottom))" } },
  { name: "Light: summer day sky", style: { background: "linear-gradient(to bottom, var(--sky-summer-day-top), var(--sky-summer-day-bottom))" } },
  { name: "Night: winter night sky", style: { background: "linear-gradient(to bottom, var(--sky-winter-night-top), var(--sky-winter-night-bottom))" } },
] as const;

const Img = ({ src, className }: { src: string; className?: string }) => (
  <img src={src} alt="" aria-hidden draggable={false} className={cn("inline-block shrink-0 select-none", className)} />
);

/** A Cobble count as `Cobbles` draws it (the icon at `em`, the balances' gap, the figure in mono), with a direction's icon. */
function Count({ src, value, className }: { src: string; value: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap text-foreground", TOKEN_GAP, className)}>
      <Img src={src} className="size-[max(1rem,1.25em)]" />
      <span className="numeric font-semibold">{value}</span>
    </span>
  );
}

/** The four criteria of issue 849 for one direction, with its file's measured size. */
function Criteria({ d }: { d: Direction }) {
  const bytes = d.raw.length;
  const rows: [string, ReactNode, boolean][] = [
    ["Legible at 16 px", d.legible, true],
    ["Unlike PAVED's coin", d.silhouette.note, d.silhouette.ok],
    ["Clear over the plate's end", d.plate, true],
    ["Under 2 kB", <span className="numeric">{bytes.toLocaleString("en")} B</span>, bytes < MAX_BYTES],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      {rows.map(([term, text, ok]) => (
        <div key={term} className="contents">
          <dt className={cn("font-semibold", ok ? "text-success" : "text-warning")}>
            {ok ? "✓" : "✗"} {term}
          </dt>
          <dd className="text-muted-foreground">{text}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Each direction at its real sizes (16, 24, 32, 48, 64 px), beside PAVED's coin (today's and #844's relief) at 24 and 48 px, on
 * the app's dark surfaces and the home's day skies, with the issue's four criteria. Today's icon last, for comparison.
 */
export const Directions: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {ALL.map((d) => (
        <section key={d.key} aria-label={d.name} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 text-foreground">
          <h3 className="text-sm font-semibold">{d.name}</h3>
          <p className="text-xs text-muted-foreground">{d.idea}</p>
          <div className="flex flex-col gap-1">
            {SURFACES.map((s) => (
              <div key={s.name} className={cn("flex flex-wrap items-end gap-3 rounded-lg p-2", "className" in s && s.className)} style={"style" in s ? s.style : undefined}>
                {SIZES.map((px) => (
                  <Img key={px} src={d.src} className={{ 16: "size-4", 24: "size-6", 32: "size-8", 48: "size-12", 64: "size-16" }[px]} />
                ))}
                <span className="mx-1 self-stretch border-l border-border" />
                <TokenIcon kind="paved" size="md" />
                <Img src={d.src} className="size-6" />
                <Img src={pavedRelief} className="size-6" />
                <TokenIcon kind="paved" size="xl" />
                <Img src={d.src} className="size-12" />
                <Img src={pavedRelief} className="size-12" />
                <span className="rounded-md bg-background/70 px-1.5 text-xs text-foreground">{s.name}</span>
              </div>
            ))}
          </div>
          <Criteria d={d} />
        </section>
      ))}
    </div>
  ),
};

/** The balances' Cobbles plate (`ResourcePlate`, `tone="invite"`, with its "+"), the icon on the plate's disc over its end. */
function CobblesPlate({ src, size }: { src: string; size: "sm" | "md" }) {
  return (
    <Plate
      size={size}
      tone="invite"
      lead="plus"
      end={
        <PlateDisc size={size} tone="invite">
          <Img src={src} className={cn("relative", plateCoinClass(size))} />
        </PlateDisc>
      }
    >
      <span className={PLATE_FIGURE}>1,240</span>
    </Plate>
  );
}

/** A Cobble pack as `PackCard` lays it out: the count large, the discount, the price and the reference price struck through. */
function PackCard({ src }: { src: string }) {
  return (
    <span className="flex w-44 flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left text-foreground">
      <span className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <Count src={src} value="500" className="text-2xl" />
        <Badge variant="success">-10%</Badge>
      </span>
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="numeric text-xl font-semibold">$90</span>
        <s className="numeric text-sm text-muted-foreground">$100</s>
      </span>
      <span className="numeric text-xs text-muted-foreground">$0.18 a Cobble</span>
    </span>
  );
}

/** A shop item's price as the theme shop's cell draws it (`Cobbles size="sm"`) over its Buy button. */
function ShopPrice({ src }: { src: string }) {
  return (
    <span className="flex w-28 flex-col gap-1.5 rounded-xl border border-border bg-card p-2 text-foreground">
      <span className="text-xs font-semibold">Castle corner</span>
      <Count src={src} value="75" className="text-xs" />
      <Button size="sm" variant="outline" className="w-full" tabIndex={-1}>
        Buy
      </Button>
    </span>
  );
}

/**
 * Each direction in the real places, beside PAVED: an amount in a sentence (16 px, the `em` icon), the balances' plate at both
 * sizes next to PAVED's, a shop price and a pack card; on the app's dark surface and on a day sky. Today's icon last.
 */
export const InPlace: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {ALL.map((d) => (
        <section key={d.key} aria-label={d.name} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground">{d.name}</h3>
          {[SURFACES[0], SURFACES[2]].map((s) => (
            <div
              key={s.name}
              className={cn("flex flex-wrap items-center gap-4 rounded-xl p-3", "className" in s && s.className)}
              style={"style" in s ? s.style : undefined}
            >
              <p className="max-w-56 rounded-md bg-background/70 p-1.5 text-sm text-foreground">
                Win <Count src={d.src} value="15" /> for this quest, then spend <Count src={d.src} value="1,240" /> or pay with{" "}
                <span className={cn("inline-flex items-center whitespace-nowrap", TOKEN_GAP)}>
                  <TokenIcon kind="paved" size="em" />
                  <span className="numeric font-semibold">12.50</span>
                </span>
                .
              </p>
              <div className="flex flex-col items-end gap-3">
                <CobblesPlate src={d.src} size="sm" />
                <CobblesPlate src={d.src} size="md" />
                <Plate size="sm" lead="plus" end={<PlateDisc size="sm"><TokenIcon kind="paved" className={cn("relative", plateCoinClass("sm"))} /></PlateDisc>}>
                  <span className={PLATE_FIGURE}>142.35</span>
                </Plate>
              </div>
              <ShopPrice src={d.src} />
              <PackCard src={d.src} />
            </div>
          ))}
        </section>
      ))}
    </div>
  ),
};

/** The five side by side at 16 px in a sentence and at 48 px over a plate, and PAVED's coin: the pick at a glance. */
export const Lineup: Story = {
  render: () => (
    <div className="flex flex-col gap-3 rounded-xl bg-background p-3 text-foreground">
      {ALL.map((d) => (
        <div key={d.key} className="flex flex-wrap items-center gap-4">
          <span className="w-40 text-xs font-semibold">{d.name}</span>
          <span className="text-sm">
            Get <Count src={d.src} value="500" /> for $90
          </span>
          <CobblesPlate src={d.src} size="sm" />
          <Img src={d.src} className="size-12" />
          <TokenIcon kind="paved" size="xl" />
          <span className="numeric text-xs text-muted-foreground">{d.raw.length.toLocaleString("en")} B</span>
        </div>
      ))}
    </div>
  ),
};

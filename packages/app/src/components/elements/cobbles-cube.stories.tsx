import { formatInteger } from "@paved/game-core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import sharp from "../../assets/tokens/cobbles-cube-study/cube-sharp.svg?no-inline";
import sharpRaw from "../../assets/tokens/cobbles-cube-study/cube-sharp.svg?raw";
import stone from "../../assets/tokens/cobbles-cube-study/stone.svg?no-inline";
import stoneRaw from "../../assets/tokens/cobbles-cube-study/stone.svg?raw";
import wornRaw from "../../assets/tokens/cobbles.svg?raw";
import { cn } from "../../lib/utils";
import { Plate, plateBareIconClass, PLATE_FIGURE } from "./plate";
import { TOKEN_GAP, TOKEN_ICONS, TokenIcon } from "./token-icon";

/**
 * The Cobbles' icon as a hewn stone cube (issue 878): three faces in three-quarter view (the top lit, the left in mid tone, the
 * right darker), the stone's granite and #844's relief (a dark outline, a light along the upper edges, a shadow under). Two
 * variants beside the stone they replace (#849's pick): sharp edges, and worn rounded edges. Worn is the open point's default and
 * is the app's `cobbles.svg`; the stone and the sharp cube stay in `src/assets/tokens/cobbles-cube-study/` for the owner's look.
 */
const meta = {
  title: "Elements/CobblesCube",
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

interface Variant {
  key: string;
  name: string;
  src: string;
  /** The file's text, for its size in bytes (ASCII: one byte a character). */
  raw: string;
}

const VARIANTS: readonly Variant[] = [
  { key: "stone", name: "Before: the cobblestone (#849)", src: stone, raw: stoneRaw },
  { key: "sharp", name: "Cube, sharp edges", src: sharp, raw: sharpRaw },
  { key: "worn", name: "Cube, worn edges (the app's)", src: TOKEN_ICONS.cobbles.src, raw: wornRaw },
];

const SIZES = ["size-4", "size-5", "size-6", "size-8", "size-12", "size-16"] as const;

const SURFACES = [
  { name: "Dark", className: "bg-background text-foreground" },
  { name: "Light", className: "bg-foreground text-background" },
  { name: "Sky", className: "bg-[linear-gradient(to_bottom,var(--sky-spring-day-top),var(--sky-spring-day-bottom))] text-foreground" },
] as const;

const Img = ({ src, className }: { src: string; className?: string }) => (
  <img src={src} alt="" aria-hidden draggable={false} className={cn("inline-block shrink-0 select-none", className)} />
);

/** A Cobble count as `Cobbles` draws it (the icon at `em`, the balances' gap, the figure in mono), with a variant's icon. */
function Count({ src, value }: { src: string; value: string }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap", TOKEN_GAP)}>
      <Img src={src} className="size-[max(1rem,1.25em)]" />
      <span className="numeric font-semibold">{value}</span>
    </span>
  );
}

/** The balances' Cobbles plate as `ResourcePlate` draws it: the bare icon over the plate's end, the "+" at the other. */
function CobblesPlate({ src, size }: { src: string; size: "sm" | "md" }) {
  return (
    <Plate size={size} tone="invite" lead="plus" endFit="bare" end={<Img src={src} className={plateBareIconClass(size)} />}>
      <span className={PLATE_FIGURE}>1,240</span>
    </Plate>
  );
}

/** Each variant from 16 to 64 px (16, 20, 24, 32, 48, 64) on dark, on light and on a day sky, beside PAVED's coin, with its size. */
export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {VARIANTS.map((v) => (
        <section key={v.key} aria-label={v.name} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 text-foreground">
          <h3 className="text-sm font-semibold">{v.name}</h3>
          {SURFACES.map((s) => (
            <div key={s.name} className={cn("flex flex-wrap items-end gap-3 rounded-lg p-2", s.className)}>
              {SIZES.map((size) => (
                <Img key={size} src={v.src} className={size} />
              ))}
              <TokenIcon kind="paved" size="xl" />
              <span className="text-xs">{s.name}</span>
            </div>
          ))}
          <span className="numeric text-xs text-muted-foreground">{formatInteger(v.raw.length)} B (under 2,048)</span>
        </section>
      ))}
    </div>
  ),
};

/** Each variant in the real places: at 16 px in a sentence (12 px text) and at 17.5 px (14 px), and on the balances' plate at both sizes. */
export const InPlace: Story = {
  render: () => (
    <div className="flex flex-col gap-4 text-foreground">
      {VARIANTS.map((v) => (
        <section key={v.key} aria-label={v.name} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{v.name}</h3>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex max-w-60 flex-col gap-1">
              {(["text-xs", "text-sm"] as const).map((text) => (
                <p key={text} className={text}>
                  Win <Count src={v.src} value="15" /> for this quest, then spend <Count src={v.src} value="1,240" /> in the shop.
                </p>
              ))}
            </div>
            <div className="flex flex-col items-end gap-3">
              <CobblesPlate src={v.src} size="sm" />
              <CobblesPlate src={v.src} size="md" />
            </div>
          </div>
        </section>
      ))}
    </div>
  ),
};

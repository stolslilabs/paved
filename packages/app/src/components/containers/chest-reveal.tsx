import { useEffect, useId, useState, type CSSProperties } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { haptic } from "../../lib/haptics";
import { cn } from "../../lib/utils";
import { BLACK_OUTLINE } from "../elements/black-outline";
import { CHEST_NAME, type ChestRank } from "../elements/chest-designs";
import { CARD_GREY, GOLD_FILL } from "../elements/chest-designs";
import { CHEST_EFFECTS, chestEffectUrl, pickSize } from "../elements/chest-images";
import { goldPillStyle } from "../elements/friends-art";
import { LazyChestArt } from "../elements/lazy-chest-art";
import { RARITY_NAME, rarityOf } from "../elements/rarity-badge";
import { TileChip, planCode, type TileArt } from "../elements/tile-chip";
import { TILE_CUT } from "../elements/tile-cut";
import { tileName } from "../elements/tile-render";
import { Button } from "../ui/button";
import { useSfx } from "./audio-provider";

/** A chest opened (#736): its tiles drawn by rank (1, 2 or 3). A chest holds no Cobbles (the owner's ruling of 2026-11-06). */
export interface ChestDraw {
  rank: ChestRank;
  plans: readonly number[];
}

export interface ChestRevealProps {
  draw: ChestDraw;
  /** The tile chosen at first (the owner's ask of 2026-11-06: one always is); unset, the first. */
  initialChoice?: number | null;
  /** The choice on its way. */
  busy?: boolean;
  /** The tiles' pictures, by plan key: their angled renders in the player's skins (`TilePicture`). */
  tileArt?: TileArt;
  /** For the stories: the chest held open in its light. */
  held?: boolean;
  /** The tile kept (its index in `plans`): it goes to the inventory. */
  onTake?: (index: number) => void;
  className?: string;
}

/** When the first tile leaves the chest (s) and the time between two (s): the burst comes first. */
export const TILES_OUT_S = 0.5;
export const TILE_GAP_S = 0.14;

/** The reveal's heading, the book's: "Choose 1 of 3"; a basic chest's one tile, "Your new tile". */
export const revealTitle = (draw: ChestDraw): string => (draw.plans.length > 1 ? `Choose 1 of ${draw.plans.length}` : "Your new tile");

/**
 * Take and Claim (the owner's ask of 2026-11-06: more appealing): the book's gold pill (Follow back's, `friends-art.ts`) at 52 px,
 * glowing in the primary gold, a light crossing it now and then.
 */
const TAKE: CSSProperties = { ...goldPillStyle(52), textShadow: BLACK_OUTLINE, filter: "drop-shadow(0 0 12px color-mix(in oklab, var(--primary) 55%, transparent))" };
const SHINE: CSSProperties = { backgroundImage: "linear-gradient(90deg, transparent, color-mix(in oklab, var(--foreground) 55%, transparent), transparent)" };

/** A card's width at most (px), the same for 1, 2 or 3 cards: the book's, about square; the row's room between and around them. */
const CARD_PX = 120;
const rowStyle = (n: number): CSSProperties => ({ maxWidth: n * CARD_PX + (n - 1) * 6 + 16 });
/** The tile inside its card, its whole width (the owner's ask of 2026-11-06: closer), centred, its shadow under it; the name tucked under its point. */
const PICTURE: CSSProperties = { width: "100%", filter: "drop-shadow(0 5px 4px color-mix(in oklab, var(--hud-outline) 80%, transparent))" };
/** The rarity under the name, the book's: a word in see-through white (the owner's trial of 2026-11-06, the chests' cards only). */
const RARITY_WORD: CSSProperties = {
  color: "color-mix(in oklab, var(--foreground) 75%, transparent)",
  textShadow: "0 1px 2px color-mix(in oklab, var(--hud-outline) 75%, transparent), 0 0 1px color-mix(in oklab, var(--hud-outline) 60%, transparent)",
};
/**
 * The card chosen in its light (the owner's asks of 2026-11-06: the opened chest's light, fainter, as the book's chosen card glows):
 * behind it the chest's own rays (`chestEffectUrl("rays")`, self-hosted) in gold, turning slowly, two soft waves of them rising and
 * fading, and a gold halo that breathes; and its rim lit as by a light facing it, a metal gradient bright at its top left, a highlight
 * running round it. Inline, on the theme's tokens.
 */
const CARD_LIGHT_BOX: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  width: "190%",
  aspectRatio: "1",
  transform: "translate(-50%, -50%)",
  // Faded out before its edges: the light never shows a border.
  maskImage: "radial-gradient(closest-side, var(--hud-outline) 55%, transparent)",
  WebkitMaskImage: "radial-gradient(closest-side, var(--hud-outline) 55%, transparent)",
};
const raysMask = (url: string): CSSProperties => ({ maskImage: `url(${url})`, maskSize: "100% 100%", maskRepeat: "no-repeat", WebkitMaskImage: `url(${url})`, WebkitMaskSize: "100% 100%", WebkitMaskRepeat: "no-repeat" });
const CARD_HALO: CSSProperties = { position: "absolute", inset: "24%", borderRadius: "50%", backgroundImage: "radial-gradient(closest-side, color-mix(in oklab, var(--primary) 75%, transparent), transparent)" };
const CARD_WAVES = [0, 1] as const;
/** Only the rim shows: the mask keeps its border box less its content box. */
const RING = "linear-gradient(var(--hud-outline) 0 0)";
const RIM: CSSProperties = {
  padding: 3,
  backgroundImage:
    "linear-gradient(135deg, var(--foreground), color-mix(in oklab, var(--primary) 55%, var(--foreground)) 18%, var(--primary) 40%, color-mix(in oklab, var(--accent-scale-400) 65%, var(--warning)) 72%, color-mix(in oklab, var(--primary) 50%, var(--foreground)))",
  maskImage: `${RING}, ${RING}`,
  maskClip: "content-box, border-box",
  maskComposite: "exclude",
  WebkitMaskImage: `${RING}, ${RING}`,
  WebkitMaskClip: "content-box, border-box",
  WebkitMaskComposite: "xor",
};
const RIM_LIGHT: CSSProperties = {
  backgroundImage: "conic-gradient(transparent 0deg, transparent 220deg, var(--foreground) 290deg, transparent 360deg)",
};

/** The light crossing the card chosen, the book's shine. */
const CARD_SHINE: CSSProperties = { backgroundImage: "linear-gradient(90deg, transparent, color-mix(in oklab, var(--foreground) 45%, transparent), transparent)" };

/** The cards' tilt, the book's: the outer ones lean outwards, a little lower. The choice moves none (the owner's ask of 2026-11-06), it bounces. */
function tiltOf(i: number, n: number) {
  const side = n === 1 ? 0 : i === 0 ? -1 : i === n - 1 ? 1 : 0;
  return { rotate: side * 6, y: side === 0 ? 0 : 8 };
}

/**
 * A chest opened (#739, #784), after the Paved UX Book's reveal (CHESTS-PAGE, "the same reveal as after a victory": the games' ends'
 * (END-CHEST) and the home's prompt, through `ChestModal`): its tiles fly out of the chest one after the other once its lid has burst, and stand as cards
 * side by side (`TileCard`); the outer ones lean outwards, the one chosen takes the book's gold and its shine, in place. The first is chosen
 * from the start and one always is (the owner's ask of 2026-11-06): a tap on another moves the choice, none takes it back, so Take is
 * never off. Under them the chest open and glowing in its rank's light, and Take (basic: one
 * tile, kept as it is; rare one of 2; epic one of 3). The tile kept goes to the inventory, not onto the board: the layout is the
 * editor's. One sound per beat (`burst`, then `flip` per tile, `keep`) and a buzz with each (the owner's ask of 2026-11-06: firm with
 * the burst, light as each tile lands and on a choice, firm on Take). Its heading is the caller's (`revealTitle`): the modal's dialog
 * title, the victory screen's own.
 */
export function ChestReveal({ draw, initialChoice = null, busy, tileArt, held, onTake, className }: ChestRevealProps) {
  const play = useSfx();
  const tiles = draw.plans.length;
  const single = tiles === 1;
  const [choice, setChoice] = useState(single ? 0 : Math.min(Math.max(initialChoice ?? 0, 0), tiles - 1));
  const picked = draw.plans[choice];
  // The burst at once, a flip and a light buzz as each tile leaves the chest.
  useEffect(() => {
    play("burst");
    haptic("firm");
    const timers = Array.from({ length: tiles }, (_, i) =>
      setTimeout(
        () => {
          play("flip");
          haptic("light");
        },
        (TILES_OUT_S + TILE_GAP_S * i) * 1000,
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [play, tiles]);
  // Take lands once the last tile has.
  const takeAt = TILES_OUT_S + TILE_GAP_S * tiles + 0.15;
  return (
    <section aria-label={CHEST_NAME[draw.rank]} data-input-surface className={cn("flex w-full flex-col items-center gap-3", className)}>
      <ul aria-label="Chest tiles" style={rowStyle(tiles)} className={cn("grid w-full gap-1.5 px-2 pt-2", single ? "grid-cols-1" : tiles === 2 ? "grid-cols-2" : "grid-cols-3")}>
        {draw.plans.map((plan, i) => {
          const chosen = choice === i;
          return (
            // Out of the chest under them: each rises from it, small, then settles (under reduced motion a fade alone, `MotionConfig`).
            <m.li
              key={`${plan}-${i}`}
              initial={{ y: 160, scale: 0.3, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              transition={{ delay: TILES_OUT_S + TILE_GAP_S * i, type: "spring", stiffness: 260, damping: 18 }}
              // The chosen card's light spreads behind the others: they stand above it.
              className={cn("flex min-w-0", chosen ? "z-0" : "z-10")}
            >
              {/* Picked, it bounces (the owner's ask of 2026-11-06): a little larger, a touch smaller, back to its size, in its place. */}
              <m.div
                initial={false}
                animate={{ ...tiltOf(i, tiles), scale: chosen ? [1, 1.08, 0.97, 1] : 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 22, scale: { duration: 0.38, times: [0, 0.35, 0.7, 1], ease: "easeOut" } }}
                className="flex w-full"
              >
                <TileCard
                  plan={plan}
                  art={tileArt}
                  gold={chosen}
                  aria-pressed={single ? undefined : chosen}
                  aria-label={`${tileName(plan)}, ${rarityOf(plan)}`}
                  disabled={busy || single}
                  onClick={() => {
                    if (chosen) return;
                    setChoice(i);
                    haptic("light");
                  }}
                />
              </m.div>
            </m.li>
          );
        })}
      </ul>
      {/* The chest open under its tiles: it springs, its lid pops up on its hinges, the light bursts in the rank's colour. Its light
          reaches over the cards and Take: it lets the taps through. */}
      <div data-burst={draw.rank} className="pointer-events-none relative grid h-32 w-full place-items-center">
        <LazyChestArt rank={draw.rank} state={held ? "open" : "opening"} size="md" label={null} />
      </div>
      <BigPill
        label="Take"
        aria-label={picked === undefined ? "Take" : `Take ${tileName(picked)}`}
        at={takeAt}
        loading={busy}
        onClick={() => {
          play("keep");
          haptic("firm");
          onTake?.(choice);
        }}
      />
    </section>
  );
}

/**
 * A tile's card in the chests (the reveal's choices, the tile kept), after the book (the owner's asks of 2026-11-06): about square, the
 * tile inside it, nearly its width and centred, its shadow under it, its name on one line tucked under its point and its rarity in
 * see-through white under the name. Chosen (or kept) it takes the book's gold, a linear gradient lit along its top, and a light crosses
 * it now and then; otherwise the house's grey, a gradient too. No count held (the owner's ask of 2026-11-06: dropped). A button when
 * it chooses, a plain card otherwise (`as="div"`).
 */
export function TileCard({
  plan,
  art,
  gold,
  as = "button",
  className,
  ...props
}: {
  plan: number;
  art?: TileArt;
  gold?: boolean;
  as?: "button" | "div";
  className?: string;
  "aria-label"?: string;
  "aria-pressed"?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const face = (
    <>
      {gold && <ChosenLight />}
      {gold && (
        <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <m.span
            className="absolute inset-y-0 left-0 w-1/2"
            style={CARD_SHINE}
            initial={{ x: "-110%" }}
            animate={{ x: "220%" }}
            transition={{ delay: 0.3, duration: 1.1, repeat: Infinity, repeatDelay: 1.8, ease: "easeInOut" }}
          />
        </span>
      )}
      <span className="relative block aspect-square" style={PICTURE}>
        <TilePicture plan={plan} art={art} />
      </span>
      <span className="text-outline relative -mt-2.5 text-sm leading-tight font-bold whitespace-nowrap">{tileName(plan)}</span>
      <span className="relative text-xs leading-tight font-bold italic" style={RARITY_WORD}>
        {RARITY_NAME[rarityOf(plan)]}
      </span>
    </>
  );
  const look = cn("relative flex w-full flex-col items-center rounded-2xl px-0.5 pt-1 pb-2 text-center", className);
  if (as === "div")
    return (
      <span style={gold ? GOLD_FILL : CARD_GREY} className={look}>
        {face}
      </span>
    );
  return (
    <button type="button" {...props} style={gold ? GOLD_FILL : CARD_GREY} className={cn("state-layer outline-none disabled:opacity-100", look)}>
      {face}
    </button>
  );
}

/** The card chosen's light (`CARD_LIGHT_BOX`, `RIM`): under reduced motion the rays, the halo and the rim's highlight still. */
function ChosenLight() {
  const reduced = useReducedMotionConfig() ?? false;
  const rays = chestEffectUrl("rays", pickSize(CHEST_EFFECTS.rays.sizes, 480));
  return (
    <>
      <span aria-hidden data-slot="card-light" className="pointer-events-none -z-10" style={CARD_LIGHT_BOX}>
        <m.span
          className="absolute inset-0"
          style={{ ...raysMask(rays), backgroundColor: "color-mix(in oklab, var(--primary) 70%, var(--foreground))", opacity: 0.32 }}
          animate={reduced ? undefined : { rotate: 360 }}
          transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
        />
        {!reduced &&
          CARD_WAVES.map((i) => (
            <m.span
              key={i}
              className="absolute inset-0"
              style={{ ...raysMask(rays), backgroundColor: "color-mix(in oklab, var(--primary) 50%, var(--foreground))", rotate: `${i * 22}deg` }}
              initial={{ opacity: 0, scale: 0.55 }}
              animate={{ opacity: [0, 0.3, 0], scale: [0.55, 0.9, 1.15] }}
              transition={{ duration: 2.6, times: [0, 0.35, 1], repeat: Infinity, ease: "easeOut", delay: i * 1.3 }}
            />
          ))}
        <m.span style={CARD_HALO} initial={{ opacity: 0.5 }} animate={reduced ? undefined : { opacity: [0.45, 0.75, 0.45] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} />
      </span>
      <span aria-hidden data-slot="card-rim" className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" style={RIM}>
        <m.span
          className="absolute top-1/2 left-1/2 -mt-[100%] -ml-[100%] aspect-square w-[200%]"
          style={RIM_LIGHT}
          animate={{ rotate: 360 }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }}
        />
      </span>
    </>
  );
}

/**
 * The reveal's one answer, the book's gold pill made appealing (the owner's asks of 2026-11-06): Take, and Claim once the tile is kept.
 * It springs in at `at` (s), then breathes, a light crossing it now and then (motionless under reduced motion); its word outlined thick
 * in black.
 */
export function BigPill({ label, at = 0, loading, onClick, ...props }: { label: string; "aria-label"?: string; at?: number; loading?: boolean; onClick?: () => void }) {
  return (
    <m.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: at, type: "spring", stiffness: 380, damping: 14 }}>
      <m.div animate={{ scale: [1, 1.05, 1] }} transition={{ delay: at + 0.6, duration: 1.4, repeat: Infinity, repeatDelay: 0.6, ease: "easeInOut" }}>
        <Button variant="ghost" aria-label={props["aria-label"]} loading={loading} onClick={onClick} style={TAKE} className="relative h-13 min-w-48 gap-2 px-6 text-xl font-black text-foreground">
          <span aria-hidden className="pointer-events-none absolute inset-1 overflow-hidden rounded-full">
            <m.span
              className="absolute inset-y-0 left-0 w-1/3"
              style={SHINE}
              initial={{ x: "-120%" }}
              animate={{ x: "320%" }}
              transition={{ delay: at + 0.4, duration: 0.9, repeat: Infinity, repeatDelay: 2.2, ease: "easeInOut" }}
            />
          </span>
          {label}
        </Button>
      </m.div>
    </m.div>
  );
}

/**
 * The renders in the chests (the owner's ask of 2026-11-06: too dark, the tile to float on its card as the book's): their navy backdrop
 * keyed out, then a little brighter, more contrasted and more vivid. The backdrop is one narrow band of navies (sRGB about 27-35, 36-46,
 * 49-62, measured on the renders): a pixel inside the band on its three channels at once turns see-through (`feComponentTransfer` marks
 * each channel's band in 64 steps, `feColorMatrix` keeps a pixel unless all three are marked); a tile's own colours, its dark crevices,
 * its purple crystal, are outside it. The cut (`TILE_CUT`) still frames the tile.
 */
const band = (from: number, to: number) => Array.from({ length: 64 }, (_, k) => (k >= from && k <= to ? 1 : 0)).join(" ");
const KEY_R = band(3, 10);
const KEY_G = band(5, 12);
const KEY_B = band(8, 17);
const VIVID = "brightness(1.18) contrast(1.12) saturate(1.3)";

/**
 * A tile's picture in the chests: its angled render in the player's skin (`tileArt`, by plan key), cut to the tile so it floats on the
 * card as the book's; with none served, the plan's flat chip.
 */
export function TilePicture({ plan, art, className }: { plan: number; art?: TileArt; className?: string }) {
  const key = `tile-key-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const src = art?.(planCode(plan).toLowerCase()) ?? null;
  if (!src) return <TileChip plan={plan} className={cn("size-full rounded-md border-0", className)} />;
  return (
    <>
      <svg aria-hidden width="0" height="0" style={OFF}>
        <filter id={key} colorInterpolationFilters="sRGB">
          <feComponentTransfer in="SourceGraphic" result="band">
            <feFuncR type="discrete" tableValues={KEY_R} />
            <feFuncG type="discrete" tableValues={KEY_G} />
            <feFuncB type="discrete" tableValues={KEY_B} />
          </feComponentTransfer>
          <feColorMatrix in="band" result="keep" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1 -1 -1 0 3" />
          <feComposite in="SourceGraphic" in2="keep" operator="in" />
        </filter>
      </svg>
      <img src={src} alt="" draggable={false} decoding="async" style={{ ...TILE_CUT, filter: `url(#${key}) ${VIVID}` }} className={cn("block size-full object-cover", className)} />
    </>
  );
}

/** The filter's holder takes no room. */
const OFF: CSSProperties = { position: "absolute", width: 0, height: 0 };

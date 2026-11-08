import { formatInteger } from "@paved/game-core";
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type RefObject } from "react";
import { useMotionValue, useReducedMotionConfig, useTransform } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";
import { FRAME_ART, uiFrameImageSet, uiFrameUrl, XP_TRACK_SLICE } from "./ui-art";
import { UiIcon } from "./ui-icon";
import { isMaxLevel } from "./xp-level";
import { levelShare, useXpMotion, type PlayerProgress } from "./xp-motion";

/** The level as the star shows it: two figures at most ("99+" past them). */
export const levelText = (level: number | undefined): string => (level === undefined ? "" : level > 99 ? "99+" : formatInteger(level));

/** The XP as the bar shows it: "90/150", "Max" at the cap; the profile's longer, "90 / 150 XP", "Max level". */
export const xpText = (progress: PlayerProgress, variant: LevelBarVariant = "card"): string =>
  variant === "profile"
    ? isMaxLevel(progress)
      ? "Max level"
      : `${formatInteger(progress.xp)} / ${formatInteger(progress.xpForNext)} XP`
    : isMaxLevel(progress)
      ? "Max"
      : `${formatInteger(progress.xp)}/${formatInteger(progress.xpForNext)}`;

/** The track's ends drawn 7 px wide, its height its two halves (its 9-slice). */
const TRACK: CSSProperties = {
  borderStyle: "solid",
  borderColor: "transparent",
  borderWidth: "9px 7px",
  borderImageSource: uiFrameImageSet("xp-track"),
  borderImageSlice: `50% ${(XP_TRACK_SLICE.x * 100).toFixed(2)}% fill`,
  borderImageWidth: "9px 7px",
  borderImageRepeat: "stretch",
};
/** The fill's painted strip at the recess's height, never stretched, slid in from the left as far as the share. */
const FILL: CSSProperties = { backgroundImage: uiFrameImageSet("xp-fill"), backgroundSize: "auto 100%", backgroundRepeat: "repeat-x" };
/** The fill on load: from empty to its share, eased in and out. It waits for its art (1 s at most), so the strip never pops in halfway. */
export const FILL_IN_MS = 900;
const ART_WAIT_MS = 1000;
/** The fill slid to a share: the strip's right end at it. */
export const fillShift = (share: number) => `translateX(${(share - 1) * 100}%)`;

/**
 * On load, and when the XP is read again, the fill comes in from empty to its share (the owner's ask of 2026-11-02), as an animation
 * of the element itself (Web Animations, on `transform`): the compositor runs it, so the work of a page loading does not jerk it, as a
 * JavaScript animation of the width did. It holds empty until the fill's art is decoded. Under reduced motion, or where the browser has
 * no Web Animations, the share is drawn at once.
 */
function useFillIn(fill: RefObject<HTMLSpanElement | null>, progress: PlayerProgress | undefined, capped: boolean) {
  const reduced = useReducedMotionConfig();
  const to = progress ? fillShift(capped ? 1 : levelShare(progress)) : null;
  useLayoutEffect(() => {
    const el = fill.current;
    if (to === null || reduced || typeof el?.animate !== "function") return;
    const run = el.animate([{ transform: fillShift(0) }, { transform: to }], { duration: FILL_IN_MS, easing: "ease-in-out", fill: "backwards" });
    run.pause();
    // The copy the fill's image-set picks at this density.
    const [small, large] = FRAME_ART["xp-fill"].sizes;
    const art = new Image();
    art.src = uiFrameUrl("xp-fill", window.devicePixelRatio > 1 ? (large ?? small!) : small!);
    let gone = false;
    const start = () => {
      if (!gone) run.play();
    };
    void Promise.race([art.decode?.() ?? Promise.resolve(), new Promise((r) => setTimeout(r, ART_WAIT_MS))]).then(start, start);
    return () => {
      gone = true;
      run.cancel();
    };
    // Once per reading's arrival: a later change of the share is the motion's (a gain, a level up), not a fill-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to === null, reduced]);
}

/**
 * The card's bar: its track 130 px (146 from `tablet`), plus the 16 px of the star's half on its left (LEVEL-STAR-SIZE: the star grew from 28 to
 * 32 px so that two figures fit inside, the track kept its size). `PlayerBadge`'s stand-in while the bar loads has the same width.
 */
const CARD_WIDTH = "w-[9.125rem] tablet:w-[10.125rem]";

/** `card`: the player card's, 146 px (162 from `tablet`); `profile`: the profile drawer's, its row's width, the XP's unit written. */
export type LevelBarVariant = "card" | "profile";

export interface LevelBarProps {
  /** Undefined while it is read: the empty track, the star blank. */
  progress: PlayerProgress | undefined;
  variant?: LevelBarVariant;
  /** The star over the bar's left end; false when the caller draws the level larger beside it (a game's end, END-SCREENS). */
  star?: boolean;
  className?: string;
}

/**
 * The player's level on the player card (the owner's direction of 2026-11-01, `docs/design/home.webp`, decomposed layer by layer): the
 * HUD's blue star holding the level, over the left end of the mockup's track and its faceted cyan fill (images), the XP made and the XP the level needs in it ("90/150"). On load the bar
 * fills from empty, eased in and out. A gain fills the bar
 * and a "+N XP" rises at its end; a level up completes it, flashes it, turns the level over, then fills the new one (`useXpMotion`).
 * Under reduced motion the values change at once with a brief flash. Decorative: the card says the level and the XP left.
 */
export function LevelBar({ progress, variant = "card", star = true, className }: LevelBarProps) {
  const { share, level, gain, setGain, burst, setBurst, flash, setFlash } = useXpMotion(progress);
  const capped = progress ? isMaxLevel(progress) : false;
  // The cap's bar is full whatever the share (its span is 0): a motion value too, so a level up into the cap redraws it.
  const full = useMotionValue(capped ? 1 : 0);
  useEffect(() => full.set(capped ? 1 : 0), [capped, full]);
  // A transform, not a width: the fill moves without laying the bar out again.
  const shift = useTransform([share, full], ([s, f]: number[]) => fillShift(f ? 1 : s!));
  const fill = useRef<HTMLSpanElement>(null);
  useFillIn(fill, progress, capped);
  const lit = burst ?? flash;
  return (
    <span
      data-slot="level-bar"
      aria-hidden
      className={cn("relative flex h-7 max-w-full items-center", star && "pl-4", variant === "card" ? CARD_WIDTH : "w-full", className)}
    >
      {/*
        The mockup's track (`xp-track`: a near-black outline, a silver bevel, a dark recess) with its drop shadow, and over it, inside
        the outline, the faceted cyan fill (`xp-fill`), shown from the left up to the share: as on the mockup, the fill covers the silver
        bevel (the owner's ask of 2026-11-02), the outline alone round it (1 px, its inner corner 5 px). The recess and the flash are
        rounded at both ends, full or not, star or not (the owner's ask of 2026-11-07): under the star the left corner is hidden, at a game's end it shows.
      */}
      <span className="relative h-4.5 flex-1">
        <span aria-hidden data-slot="xp-track" className="absolute inset-0 [filter:drop-shadow(0_1px_0_var(--background))]" style={TRACK} />
        <span data-slot="level-recess" className="absolute inset-px overflow-hidden rounded-[5px]">
          <m.span ref={fill} data-slot="level-fill" className="absolute inset-0 will-change-transform" style={{ ...FILL, transform: shift }} />
        </span>
        {lit !== null && (
          // The level up lights the whole bar, fading.
          <m.span
            key={lit}
            data-slot="level-flash"
            className="absolute inset-px rounded-[5px] bg-xp-light"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            onAnimationComplete={() => {
              setFlash((f) => (f === lit ? null : f));
              setBurst((b) => (b === lit ? null : b));
            }}
          />
        )}
        {/* In capitals, as a game's gauge reads ("MAX LEVEL", "120 / 300 XP"; the owner's ask of 2026-11-04). */}
        <span data-slot="xp" className="numeric text-outline absolute inset-0 grid place-items-center pl-2 text-xs leading-none font-bold text-foreground uppercase">
          {progress ? xpText(progress, variant) : ""}
        </span>
      </span>
      {/* The star centred on the track's left end, the level in it: 32 px, 2 px past the bar above and below (LEVEL-STAR-SIZE). */}
      {star && <span data-slot="level-star" className="absolute -top-0.5 left-0 grid size-8 place-items-center perspective-[200px]">
        <UiIcon name="level-star" px={32} className="absolute inset-0 size-full [filter:drop-shadow(0_1px_0_var(--background))]" />
        <span data-slot="level" className="numeric text-outline relative text-xs leading-none font-bold text-foreground">
          {progress && level !== undefined ? (
            <m.span key={level} className="inline-block" initial={burst === null ? false : { rotateX: -90 }} animate={{ rotateX: 0 }} transition={{ duration: 0.3, ease: "easeOut" }}>
              {levelText(level)}
            </m.span>
          ) : (
            levelText(undefined)
          )}
        </span>
      </span>}
      {gain && (
        <m.span
          key={gain.id}
          data-slot="xp-gain"
          className="numeric text-outline pointer-events-none absolute right-0 bottom-full text-xs font-bold whitespace-nowrap text-primary"
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: -10, opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.2, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}
          onAnimationComplete={() => setGain((g) => (g?.id === gain.id ? null : g))}
        >
          +{formatInteger(gain.amount)} XP
        </m.span>
      )}
    </span>
  );
}

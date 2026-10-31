import type { CSSProperties } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";
import { CHEST_ART_REM, CHEST_DROP_S, CHEST_NAME, CHEST_SPENT, RANK_LIGHT, type ChestArtSize, type ChestRank } from "./chest-designs";
import { CHEST_BASE, CHEST_EFFECTS, CHEST_LAYERS, CHEST_MEASURES, chestEffectUrl, chestImageUrl, pickSize, type ChestLayer } from "./chest-images";

/**
 * A chest's state: `rest` idles (a shine crosses it now and then; epic glows), `ready` glows and shakes as issue 784's, `opening`
 * crouches, springs up and pops its lid as the light bursts, `open` holds the opened chest in its light, `spent` is an opened chest,
 * empty and grey (the slots' opened chest).
 */
export type ChestArtState = "rest" | "ready" | "opening" | "open" | "spent";

/**
 * The opening's beats (s), the chest's squash and stretch over `JUMP_S`: it crouches, springs up and pops its lid at `POP_S` (the
 * flash, then the light and the sparks), and lands at `LAND_S` in a puff of dust.
 */
const JUMP_S = 0.72;
export const POP_S = 0.24;
const LAND_S = 0.44;
/** The light under reduced motion: a short fade, nothing else. */
const FADE = { duration: 0.4, ease: "easeOut" } as const;

/** The shake of issue 784 (s): a few short shakes that squash the chest, then a pause. */
const SHAKE_S = 0.7;
const SHAKE_PAUSE_S = 1.4;
const SHAKE = {
  rotate: [0, -5, 5, -4, 4, -2, 0],
  scaleX: [1, 1.06, 0.97, 1.03, 0.99, 1, 1],
  scaleY: [1, 0.92, 1.05, 0.97, 1.02, 1, 1],
  y: ["0em", "0em", "-0.04em", "0em", "-0.02em", "0em", "0em"],
};

/** The rays' and the flash's spans, in the art's box (1em). */
const RAYS_EM = 1.6;
const FLASH_EM = 1.2;

/** The sparks: their directions (degrees from straight up), their reach and their size, in the art's box. */
const SPARKS: readonly { a: number; r: number; s: number }[] = [
  { a: -62, r: 0.39, s: 0.1 },
  { a: -40, r: 0.47, s: 0.07 },
  { a: -22, r: 0.36, s: 0.11 },
  { a: -6, r: 0.5, s: 0.08 },
  { a: 8, r: 0.42, s: 0.1 },
  { a: 26, r: 0.47, s: 0.07 },
  { a: 44, r: 0.38, s: 0.1 },
  { a: 64, r: 0.44, s: 0.08 },
  { a: -80, r: 0.29, s: 0.06 },
  { a: 82, r: 0.3, s: 0.06 },
];

/** Centred on a point of the box (shares of its side), `em` wide and `h` high (in the box's em). */
const at = (x: number, y: number, em: number, h = em): CSSProperties => ({
  position: "absolute",
  left: `${x * 100}%`,
  top: `${y * 100}%`,
  width: `${em}em`,
  height: `${h}em`,
  marginLeft: `${-em / 2}em`,
  marginTop: `${-h / 2}em`,
});
/** An image as a mask, stretched to its box: the rays tinted in the rank's light, the shine kept to the chest. */
const masked = (url: string): CSSProperties => ({ maskImage: `url(${url})`, maskSize: "100% 100%", maskRepeat: "no-repeat" });

/** The screen's density, for the copies: 1 to 3. */
const density = () => (typeof window === "undefined" ? 2 : Math.min(3, Math.max(1, window.devicePixelRatio || 1)));

export interface ChestArtProps {
  rank: ChestRank;
  state?: ChestArtState;
  size?: ChestArtSize;
  /** Ready: shakes as issue 784's (the default); false when a parent shakes it (the modal, faster while its draw comes) or holds it still (the slots). */
  shake?: boolean;
  /** Arrives by dropping in from above, landing with a squash and a puff of dust (the modal's chest), after `CHEST_DROP_S`. */
  drop?: boolean;
  /** The accessible name: the chest's ("Epic chest") by default; `null` makes the art decorative. */
  label?: string | null;
  className?: string;
}

/**
 * A chest's art (the owner's direction of 2026-10-31), for the chest slots and the opening's modal: images in layers, the closed
 * chest, then once open the raised lid behind, the light, and the body in front, in a box 1em square (`CHEST_ART_REM`), animated with
 * Motion. At rest a shine crosses the chest now and then, and an epic chest glows; ready, it shakes and squashes as issue 784's;
 * opening, it crouches, springs up and pops its lid on its hinges with a flash, light bursts out of it (rays turning in the rank's
 * colour, a glow, a beam out of the mouth and sparks) and it lands in a puff of dust. Under reduced motion nothing moves: the open
 * chest shows at once and its light only fades in. The copies are picked for the box and the screen's density, the open chest's
 * layers loaded with the closed one so it opens with no wait. The app loads it in its own chunk (`LazyChestArt`).
 */
export function ChestArt({ rank, state = "rest", size = "md", shake = true, drop = false, label, className }: ChestArtProps) {
  const reduced = useReducedMotionConfig() ?? false;
  const light = RANK_LIGHT[rank];
  const { mouth, hinge } = CHEST_MEASURES[rank];
  const name = label === undefined ? CHEST_NAME[rank] : label;
  const opened = state === "opening" || state === "open" || state === "spent";
  const lit = state === "opening" || state === "open";
  // Motion when the state brings it in: the opening's beats; `open` shows its end at once.
  const animateIn = state === "opening" && !reduced;
  // Under reduced motion the opening's light only fades in: no scale, no delay, no flight.
  const fadeIn = state === "opening" && reduced;
  const idle = !reduced && (state === "rest" || state === "ready");
  const dropIn = drop && !reduced;
  const shaking = state === "ready" && shake && !reduced;

  const box = CHEST_ART_REM[size] * 16;
  const px = box * density();
  const layer = (part: Exclude<ChestLayer, "icon">) => chestImageUrl(rank, part, pickSize(CHEST_LAYERS[part].sizes, px));
  const rays = chestEffectUrl("rays", pickSize(CHEST_EFFECTS.rays.sizes, px * RAYS_EM));
  const sparkle = chestEffectUrl("sparkle", pickSize(CHEST_EFFECTS.sparkle.sizes, px * 0.12));
  const dust = chestEffectUrl("dust", pickSize(CHEST_EFFECTS.dust.sizes, px * 1.2));
  const image = { alt: "", decoding: "async", className: "pointer-events-none absolute inset-0 size-full select-none" } as const;
  // The closed chest gives way to the open one at the pop; the open one's layers load with it, unseen.
  const swap = (shown: boolean) =>
    animateIn
      ? ({ initial: { opacity: shown ? 0 : 1 }, animate: { opacity: shown ? 1 : 0 }, transition: { delay: POP_S, duration: 0 } } as const)
      : ({ initial: false, animate: { opacity: (opened ? shown : !shown) ? 1 : 0 }, transition: { duration: 0 } } as const);
  const lightIn = (opacity: number, scale = 1) =>
    animateIn
      ? ({ initial: { opacity: 0, scale: 0.3 }, animate: { opacity, scale }, transition: { duration: 0.5, delay: POP_S + 0.04, ease: "easeOut" } } as const)
      : fadeIn
        ? ({ initial: { opacity: 0, scale }, animate: { opacity, scale }, transition: FADE } as const)
        : ({ initial: false, animate: { opacity, scale }, transition: { duration: 0 } } as const);

  return (
    <span
      {...(name ? { role: "img", "aria-label": name } : { "aria-hidden": true })}
      data-slot="chest-art"
      data-rank={rank}
      data-state={state}
      className={cn("relative inline-block shrink-0 select-none", className)}
      style={{ fontSize: `${CHEST_ART_REM[size]}rem`, width: "1em", height: "1em", ...(state === "spent" && CHEST_SPENT) }}
    >
      {/* An epic chest's glow at rest (and every chest's, ready): a soft halo that breathes. */}
      {!opened && (rank === "epic" || state === "ready") && (
        <m.span
          data-part="glow"
          style={{ ...at(0.5, 0.68, 1.15), borderRadius: "50%", background: `radial-gradient(closest-side, ${light}, transparent)` }}
          initial={false}
          animate={idle ? { opacity: [0.3, 0.55, 0.3] } : { opacity: 0.4 }}
          transition={idle ? { duration: 2.8, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
        />
      )}

      {/* The light from inside: two fans of rays turning either way behind the chest, the glow. */}
      {lit && (
        <span data-part="burst">
          <m.span data-part="rays" style={{ ...at(mouth.x, mouth.y, RAYS_EM), ...masked(rays), backgroundColor: light }} {...lightIn(0.85)}>
            <m.span
              className="absolute inset-0"
              style={{ ...masked(rays), backgroundColor: "var(--foreground)", opacity: 0.35 }}
              animate={reduced ? { rotate: 0 } : { rotate: -360 }}
              transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
            />
          </m.span>
          <m.span
            data-part="glow"
            style={{ ...at(mouth.x, mouth.y, 1.1), borderRadius: "50%", background: `radial-gradient(closest-side, var(--foreground), ${light} 35%, transparent)` }}
            {...lightIn(0.6)}
          />
        </span>
      )}

      {/* The dust behind the chest, where it lands, as it drops in and as it opens: it spreads out on either side. */}
      {(dropIn || animateIn) && (
        <m.img
          {...image}
          draggable={false}
          className="pointer-events-none absolute select-none"
          src={dust}
          data-part="dust"
          style={{ left: "-10%", width: "120%", height: "45%", top: `${(CHEST_BASE - 0.94 * 0.45) * 100}%`, transformOrigin: "50% 94%", maxWidth: "none" }}
          initial={{ opacity: 0, scaleX: 0.5, scaleY: 0.4 }}
          animate={{ opacity: [0, 0.85, 0], scaleX: [0.5, 1.15, 1.35], scaleY: [0.4, 1, 1.1], y: ["0em", "-0.02em", "-0.05em"] }}
          transition={{ duration: 0.75, delay: dropIn ? CHEST_DROP_S * 0.45 : LAND_S, ease: "easeOut" }}
        />
      )}

      {/* The chest drops in, then squashes and shakes, or crouches and springs as it opens; its foot stays on the ground. */}
      <m.span
        data-part="drop"
        className="absolute inset-0"
        style={{ transformOrigin: `50% ${CHEST_BASE * 100}%` }}
        initial={dropIn ? { y: "-0.8em", opacity: 0 } : false}
        animate={dropIn ? { y: ["-0.8em", "0em", "0em", "0em"], scaleX: [0.92, 1.14, 0.97, 1], scaleY: [1.12, 0.82, 1.06, 1], opacity: [0, 1, 1, 1] } : { y: "0em", opacity: 1 }}
        transition={dropIn ? { duration: CHEST_DROP_S, times: [0, 0.45, 0.72, 1], ease: ["easeIn", "easeOut", "easeInOut"] } : { duration: 0 }}
      >
        <m.span
          data-part="chest"
          className="absolute inset-0"
          style={{ transformOrigin: `50% ${CHEST_BASE * 100}%` }}
          // From its pose at rest, so a chest that mounts opening (the modal's) crouches and springs too.
          initial={{ rotate: 0, scaleX: 1, scaleY: 1, y: "0em" }}
          animate={
            shaking
              ? SHAKE
              : animateIn
                ? {
                    scaleX: [1, 1.12, 0.92, 0.96, 1.06, 0.98, 1],
                    scaleY: [1, 0.84, 1.1, 1.04, 0.92, 1.02, 1],
                    y: ["0em", "0em", "-0.1em", "-0.12em", "0em", "0em", "0em"],
                  }
                : { rotate: 0, scaleX: 1, scaleY: 1, y: "0em" }
          }
          transition={
            shaking
              ? { duration: SHAKE_S, repeat: Infinity, repeatDelay: SHAKE_PAUSE_S, ease: "easeInOut", delay: dropIn ? CHEST_DROP_S : 0 }
              : animateIn
                ? { duration: JUMP_S, times: [0, 0.16, 0.32, 0.5, 0.62, 0.8, 1], ease: "easeInOut" }
                : { duration: 0 }
          }
        >
          <m.img {...image} draggable={false} src={layer("closed")} data-part="closed" {...swap(false)} />
          {/* The open chest: the lid raised behind, popping up on its hinges, then the beam, then the body. */}
          <m.img
            {...image}
            draggable={false}
            src={layer("lid")}
            data-part="lid"
            style={{ transformOrigin: `50% ${hinge * 100}%` }}
            {...swap(true)}
            {...(animateIn && {
              initial: { opacity: 0, scaleY: 0.3 },
              animate: { opacity: 1, scaleY: [0.3, 1.14, 0.95, 1.02, 1] },
              transition: { delay: POP_S, opacity: { delay: POP_S, duration: 0 }, scaleY: { delay: POP_S, duration: 0.45, ease: "easeOut" } },
            })}
          />
          {lit && (
            <m.span
              data-part="beam"
              style={{
                position: "absolute",
                left: `${(mouth.x - mouth.w * 0.75) * 100}%`,
                width: `${mouth.w * 150}%`,
                top: 0,
                height: `${mouth.y * 100}%`,
                clipPath: "polygon(16.7% 100%, 83.3% 100%, 100% 0, 0 0)",
                background: `linear-gradient(to top, color-mix(in oklab, var(--foreground) 60%, ${light}), ${light} 25%, transparent 85%)`,
              }}
              {...lightIn(0.45)}
            />
          )}
          <m.img {...image} draggable={false} src={layer("body")} data-part="body" {...swap(true)} />
          {/* The light pouring out of the mouth, over the body's dark inside. */}
          {lit && (
            <m.span
              data-part="mouth-light"
              style={{ ...at(mouth.x, mouth.y, mouth.w * 1.1, mouth.w * 0.32), borderRadius: "50%", mixBlendMode: "screen", background: `radial-gradient(closest-side, var(--foreground), ${light} 45%, transparent)` }}
              {...lightIn(0.9)}
            />
          )}
          {/* The idle shine: a band of light across the closed chest, now and then, kept to its shape. */}
          {idle && (
            <span data-part="shine" className="absolute inset-0 overflow-hidden" style={masked(layer("closed"))}>
              <m.span
                className="absolute inset-0"
                style={{ background: "linear-gradient(105deg, transparent 38%, var(--foreground) 50%, transparent 62%)", opacity: 0.35 }}
                initial={{ x: "-110%" }}
                animate={{ x: "110%" }}
                transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 3.6, ease: "easeInOut", delay: 0.8 + (dropIn ? CHEST_DROP_S : 0) }}
              />
            </span>
          )}
        </m.span>
      </m.span>

      {/* The flash as the lid pops. */}
      {animateIn && (
        <m.span
          data-part="flash"
          style={{ ...at(mouth.x, mouth.y, FLASH_EM), borderRadius: "50%", mixBlendMode: "screen", background: `radial-gradient(closest-side, var(--foreground), ${light} 30%, transparent 70%)` }}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: [0, 0.85, 0], scale: [0.4, 1, 1.15] }}
          transition={{ duration: 0.28, delay: POP_S, times: [0, 0.25, 1], ease: "easeOut" }}
        />
      )}

      {/* The sparks: out of the mouth, again and again while the chest is lit. */}
      {lit && (
        <m.span data-part="sparks" initial={fadeIn ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={fadeIn ? FADE : { duration: 0 }}>
          {SPARKS.map((s, i) => {
            const rad = (s.a * Math.PI) / 180;
            const dx = s.r * Math.sin(rad);
            const dy = -s.r * Math.cos(rad);
            const style = { ...at(mouth.x, mouth.y, s.s), maxWidth: "none" };
            return reduced ? (
              <img key={i} {...image} draggable={false} className="pointer-events-none select-none" src={sparkle} style={{ ...style, transform: `translate(${dx * 0.6}em, ${dy * 0.6}em)`, opacity: 0.8 }} />
            ) : (
              <m.img
                key={i}
                {...image}
                draggable={false}
                className="pointer-events-none select-none"
                src={sparkle}
                style={style}
                initial={{ x: "0em", y: "0em", opacity: 0, scale: 0.4, rotate: 0 }}
                animate={{ x: `${dx}em`, y: `${dy}em`, opacity: [0, 1, 0], scale: [0.4, 1.2, 0.6], rotate: 90 }}
                transition={{ duration: 1.2, delay: (animateIn ? POP_S + 0.12 : 0) + i * 0.07, repeat: Infinity, repeatDelay: 0.5, ease: "easeOut" }}
              />
            );
          })}
        </m.span>
      )}

    </span>
  );
}

export default ChestArt;

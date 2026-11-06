import { formatInteger } from "@paved/game-core";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";
import { ChangeFloat, ChangePop, changeTone, useAmountChange } from "./amount-change";
import { NumberTicker } from "./number-ticker";

// Its own module, loaded lazily by a save alone (the home's chip, the village page's score): `amount-change` is in the first
// load with the balances, and a lazy import of it would keep this there too.

/**
 * A score that counts from `from` to `value` once, as it mounts (the village's, after a save, issue 802), the balances' way: the
 * colour of the change, the "+N" or "−N", the icon's pop. Equal, or no `from`: the score, still. A later change of `value`
 * plays again. Assistive technology reads the score alone, never the counting figure.
 */
export function CountedScore({ value, from, icon, className }: { value: number; from?: number; icon?: ReactNode; className?: string }) {
  const { start, target, format, change, flash, moving } = useAmountChange({
    amount: BigInt(Math.round(value)),
    decimals: 0,
    fraction: 0,
    from: from === undefined ? undefined : BigInt(Math.round(from)),
  });
  return (
    // At least as wide as the floating figure, which stands inside the box: a "−1,122" under an "838" stays over it.
    <span data-slot="score-count" className={cn("relative inline-flex items-center gap-1.5", className)} style={moving ? { minWidth: `${change!.text.length}ch` } : undefined}>
      {icon && <ChangePop change={change} moving={moving}>{icon}</ChangePop>}
      <span aria-hidden className={cn("numeric transition-colors duration-700 motion-reduce:duration-300", changeTone(flash, change))}>
        <NumberTicker value={target} startValue={start} format={format} className="tracking-normal" />
      </span>
      {/* Under the figure, inside its width: the label above (the village page's) and the badge above the chip (the home's) stay clear. */}
      <ChangeFloat change={change} moving={moving} below className="drop-shadow-sm" />
      <span className="sr-only">{formatInteger(value)}</span>
    </span>
  );
}

/** The notice's place: under the HUD's top row (the profile, the balances), centred (a style: the stylesheet's budget). */
const NOTICE_TOP = { top: "calc(var(--hud-inset-top) + 5.5rem)" } as const;

/** How long the save's notice stays, ms. */
const NOTICE_MS = 3_500;

/**
 * The home's score after a save (EDIT-VILLAGE, the Paved UX Book's "Edit my village": back home, "the score counts up to the new
 * total"): the capsule's count (`CountedScore`), and the book's notice, "Layout saved · 874 (+36)" (the change only when there is one),
 * on the HUD's face, for a few seconds, centred under the HUD's top row (the book's place between the profile and the balances has no
 * room in ours on a phone). In this chunk, loaded by a save alone, the notice drawn over the screen (a portal):
 * nothing of it in the home's first load. Assistive technology hears the scene's own status ("Village saved: score 874").
 */
export function ScoreCount({ value, from, className }: { value: number; from?: number; className?: string }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setShown(false), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [value]);
  const change = from === undefined ? 0 : Math.round(value - from);
  return (
    <>
      <CountedScore value={value} from={from} className={className} />
      {createPortal(
        <AnimatePresence>
          {shown && (
            <m.p
              aria-hidden
              data-slot="saved-notice"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="pointer-events-none fixed left-1/2 z-30 -translate-x-1/2 rounded-full bg-hud-card/80 px-3 py-1 text-xs font-bold whitespace-nowrap text-foreground shadow-lg backdrop-blur-sm text-outline"
              style={NOTICE_TOP}
            >
              Layout saved · <span className="numeric">{formatInteger(value)}</span>
              {change !== 0 && <span className="numeric"> ({change > 0 ? "+" : "−"}{formatInteger(Math.abs(change))})</span>}
            </m.p>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

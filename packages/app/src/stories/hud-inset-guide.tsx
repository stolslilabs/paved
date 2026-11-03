import type { CSSProperties, ReactNode } from "react";
import { expect, waitFor } from "storybook/test";

/** The edge bands: each as wide as the HUD's inset on its edge (`--hud-inset-*` of theme.css, the notch's safe area included). */
const BANDS: CSSProperties[] = [
  { top: 0, left: 0, right: 0, height: "var(--hud-inset-top)" },
  { top: 0, bottom: 0, left: 0, width: "var(--hud-inset-left)" },
  { top: 0, bottom: 0, right: 0, width: "var(--hud-inset-right)" },
];

/**
 * HOME-HUD-PADDING: the HUD's inset drawn over the screen's top and sides, a translucent band each, so a capture shows the profile,
 * the balances and the capsules standing on one line off each edge. Stories only; it takes no tap.
 */
export function HudInsetGuide({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      {BANDS.map((style, i) => (
        <span key={i} aria-hidden data-slot="hud-inset-guide" className="pointer-events-none fixed z-50 bg-destructive" style={{ ...style, opacity: 0.3 }} />
      ))}
    </>
  );
}

/**
 * A notched phone (`top`, `side`: its safe areas in px; an iPhone's portrait top by default): the safe area simulated on the
 * tokens, added to the inset as theme.css does with `env(safe-area-inset-*)`, which a desktop browser gives as 0.
 */
export const NOTCH = { top: 47, side: 0 } as const;
export function SimulatedNotch({ top = NOTCH.top, side = NOTCH.side, children }: { top?: number; side?: number; children: ReactNode }) {
  const style = {
    "--hud-inset-top": `calc(var(--hud-inset) + ${top}px)`,
    "--hud-inset-left": `calc(var(--hud-inset) + ${side}px)`,
    "--hud-inset-right": `calc(var(--hud-inset) + ${side}px)`,
  } as CSSProperties;
  return (
    <div data-slot="simulated-notch" className="contents" style={style}>
      {children}
    </div>
  );
}

/**
 * The check: the player card's box on the inset's top and left lines (its painted outline 1.5 px inside them, as the balances'
 * art, nudged by the scene's `BALANCES_NUDGE`), the balances' column within the inset's right line by at most their art's margin,
 * and no page wider than the viewport.
 */
export async function expectHudInset(canvasElement: HTMLElement): Promise<void> {
  const doc = canvasElement.ownerDocument;
  const view = doc.defaultView!;
  const guide = [...doc.querySelectorAll<HTMLElement>("[data-slot=hud-inset-guide]")].map((el) => el.getBoundingClientRect());
  const [top, left, right] = guide as [DOMRect, DOMRect, DOMRect];
  const card = await waitFor(() => {
    const found = [...doc.querySelectorAll<HTMLElement>("[data-slot=player-card]")].find((el) => el.getBoundingClientRect().width > 0);
    if (!found) throw new Error("no player card drawn yet");
    return found.getBoundingClientRect();
  });
  await expect(Math.abs(card.top - top.height)).toBeLessThanOrEqual(0.5);
  await expect(Math.abs(card.left - left.width)).toBeLessThanOrEqual(0.5);
  // The balances come in their own chunk, after the card.
  const plates = await waitFor(() => {
    const found = [...doc.querySelectorAll<HTMLElement>("[data-slot=home-overlays] [data-slot=hud-frame]")]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.left > view.innerWidth / 2);
    if (found.length === 0) throw new Error("no balances drawn yet");
    return found;
  }, { timeout: 5000 });
  for (const plate of plates) await expect(plate.right).toBeLessThanOrEqual(view.innerWidth - right.width + 2);
  await expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(view.innerWidth);
}

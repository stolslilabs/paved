import type { CSSProperties } from "react";
import { cn } from "../../lib/utils";

export interface HudFrameProps {
  /** The frame's corner in CSS px: 13 on the player card, 10 on a capsule (the rim keeps about a third of it). */
  px: number;
  className?: string;
}

/**
 * The HUD's frame (HOME-UI-CARD and HOME-UI-CAPSULES, `docs/design/home.webp` decomposed layer by layer): under a control's content,
 * a see-through dark grey face, then the mockup's frame: a near-black outline with a crisp drop, a grey rim lit along its top (smooth,
 * the book's grey since HUD-RIM-GREY: the slate's blue and its painted patches left), a dark line inside it. CSS since HUD-FRAME-CSS
 * (`hud-frame`, `hud-face`, theme.css; the owner's ask of 2026-11-03: the painted 9-slice stretched its brush strokes with each box's
 * shape), sized by `px` whatever the box. The player card and the
 * capsules (the crowns, the village, the shield, the balances) share it, as does the HUD's drawer (`containers/hud-drawer.tsx`). Its
 * parent is `relative isolate` (the two layers sit under the content at `-z-10`). Decorative.
 */
export function HudFrame({ px, className }: HudFrameProps) {
  const size = { "--hud-px": px } as CSSProperties;
  return (
    <>
      <span aria-hidden data-slot="hud-face" className="hud-face pointer-events-none absolute -z-10 bg-hud-card/80 backdrop-blur-sm" style={size} />
      <span aria-hidden data-slot="hud-frame" className={cn("hud-frame pointer-events-none absolute inset-0 -z-10", className)} style={size} />
    </>
  );
}

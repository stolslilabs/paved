import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * The stack's view (after Dorfromantik's): the plane turned `TURN` degrees around its vertical, then tilted `TILT` degrees
 * off it, as the angled tile renders' camera (`scripts/render-tiles/page.ts`: 35° around, 40° off the vertical): mostly from
 * above, a tile's voxels still standing. Seen so, a slab shows its top, its south side and its east side.
 */
export const TILT = 40;
export const TURN = 35;

/** The faces' changes: a slab moving, the fade of the tile in hand. */
const FADE = "transition-[opacity,transform,width,height] duration-200 motion-reduce:transition-none";

export interface SlabProps extends Omit<ComponentProps<"div">, "children"> {
  /** The side of its square, px. */
  size: number;
  /** Its thickness, px. */
  height: number;
  /** Its base above the scene's plane, px. */
  z?: number;
  /** What its top shows (a tile's render): it fills the square, north up. */
  face?: ReactNode;
  faceClassName?: string;
  /** Dimmed (the tile in hand is on a cell). Each face fades, not the box: an opacity on it would flatten the 3D. */
  faded?: boolean;
}

/**
 * A square slab in CSS 3D (a coming tile without the 3D view), centred on the origin of the nearest `preserve-3d` scene (the tile stack's): its top and the two
 * sides the stack's view shows (south and east). Nothing else is drawn: the view is fixed, the other two never face it.
 */
export function Slab({ size, height, z = 0, face, faceClassName, faded = false, className, style, ...rest }: SlabProps) {
  // A tile's side, a stone rim over earth (`slab-side` in `theme.css`).
  const sides = cn("slab-side", FADE, faded && "opacity-40");
  return (
    <div
      className={cn("absolute top-0 left-0 transform-3d", className)}
      style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, transform: `translateZ(${z}px)`, ...style }}
      {...rest}
    >
      {/* South: its top edge on the square's south edge, folded down. */}
      <span
        aria-hidden
        className={cn("absolute left-0 origin-top backface-hidden", sides)}
        style={{ top: size, width: size, height, transform: `translateZ(${height}px) rotateX(-90deg)`, ["--side-dir" as string]: "to bottom" }}
      />
      {/* East: its left edge on the square's east edge, folded down; darker, away from the light. */}
      <span
        aria-hidden
        className={cn("absolute top-0 origin-left backface-hidden", sides, "slab-side-shade")}
        style={{ left: size, width: height, height: size, transform: `translateZ(${height}px) rotateY(90deg)`, ["--side-dir" as string]: "to right" }}
      />
      <span className={cn("absolute inset-0 overflow-hidden", FADE, faded && "opacity-40", faceClassName)} style={{ transform: `translateZ(${height}px)` }}>
        {face}
      </span>
    </div>
  );
}

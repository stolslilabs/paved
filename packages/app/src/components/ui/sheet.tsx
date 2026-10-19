/*
 * Source: shadcn/ui's Sheet (F3) on the Radix dialog, sliding with Motion (`AnimatePresence`, https://motion.dev,
 * `motion` 14.0.0, MIT): kept as F3b's sheet; the Dialog takes the same structure (docs/client/v2-architecture.md,
 * "Animated components: chosen sources").
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ComponentProps } from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { AnimatePresence, useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";
import { CloseIcon } from "./icons";

type Side = "top" | "right" | "bottom" | "left";

const OpenContext = createContext<{ open: boolean; close: () => void }>({ open: false, close: () => {} });

/**
 * A Radix dialog whose panel slides with Motion (section 3.2): the Sheet follows `open` itself so that
 * `AnimatePresence` can keep the panel mounted while it leaves.
 */
export function Sheet({ open, defaultOpen = false, onOpenChange, ...props }: ComponentProps<typeof SheetPrimitive.Root>) {
  const [inner, setInner] = useState(defaultOpen);
  const current = open ?? inner;
  const change = useCallback(
    (next: boolean) => {
      setInner(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );
  const value = useMemo(() => ({ open: current, close: () => change(false) }), [current, change]);
  return (
    <OpenContext.Provider value={value}>
      <SheetPrimitive.Root data-slot="sheet" open={current} onOpenChange={change} {...props} />
    </OpenContext.Provider>
  );
}
export function SheetTrigger(props: ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}
export function SheetClose(props: ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

const OFFSCREEN: Record<Side, { x?: string; y?: string }> = {
  right: { x: "100%" },
  left: { x: "-100%" },
  top: { y: "-100%" },
  bottom: { y: "100%" },
};

const SIDE_CLASS: Record<Side, string> = {
  right: "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
  left: "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
  top: "inset-x-0 top-0 h-auto border-b",
  bottom: "inset-x-0 bottom-0 h-auto rounded-t-xl border-t pb-[max(1.5rem,env(safe-area-inset-bottom))]",
};

/**
 * Drag-to-dismiss of a bottom sheet (issue 581): `slop` px before a gesture is read as a drag or not; a release closes past
 * `share` of the panel's height or `distance` px (the smaller), or when the finger leaves downward at `velocity` px/ms or
 * more; an upward flick at that speed keeps it open.
 */
export const SHEET_DRAG = { slop: 6, share: 0.25, distance: 120, velocity: 0.5 } as const;

/** Whether a release at `offset` px down, leaving at `velocity` px/ms (down is positive), closes a panel `height` px tall. */
export function sheetDragCloses(offset: number, velocity: number, height: number): boolean {
  if (offset <= 0 || velocity <= -SHEET_DRAG.velocity) return false;
  return velocity >= SHEET_DRAG.velocity || offset >= Math.min(height * SHEET_DRAG.share, SHEET_DRAG.distance);
}

/**
 * The scroll guard: whether a downward gesture from `target` may drag the panel. From the grab bar or the header, always;
 * anywhere else, only while nothing between the target and the panel is scrolled (so a drag down in scrolled content
 * scrolls it back up first). A control with its own drag (a slider, a field) keeps its gesture.
 */
export function sheetDragAllowed(target: Element, panel: Element): boolean {
  if (target.closest("[role=slider], input, textarea, select, [data-sheet-no-drag]")) return false;
  if (target.closest("[data-slot=sheet-grab-bar], [data-slot=sheet-header]")) return true;
  for (let node: Element | null = target; node && node !== panel.parentElement; node = node.parentElement) {
    if (node.scrollTop > 0) return false;
  }
  return true;
}

/** The spring back, close to the slide's: no overshoot, so that no gap opens under the panel. */
const SPRING_BACK = "translate 0.3s cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * Follows a downward drag on the panel with the CSS `translate` property, apart from the `transform` that Motion slides
 * the panel with, so that the two never fight. Touch events (non-passive, to hold the native scroll while the panel
 * moves) for a finger; pointer events for a mouse or a pen.
 */
function useSheetDrag(el: HTMLElement | null, active: boolean, close: () => void) {
  const reduced = useReducedMotionConfig() ?? false;
  useEffect(() => {
    if (!active || !el) return;
    let g: { x: number; y: number; allowed: boolean; mode: "pending" | "drag" | "off"; offset: number; lastY: number; lastT: number; v: number } | null = null;
    let quietUntil = 0;
    const place = (offset: number, spring: boolean) => {
      el.style.transition = spring && !reduced ? SPRING_BACK : "";
      el.style.translate = offset > 0 ? `0 ${offset}px` : "";
    };
    const start = (x: number, y: number, target: EventTarget | null) => {
      g = { x, y, allowed: target instanceof Element && sheetDragAllowed(target, el), mode: "pending", offset: 0, lastY: y, lastT: performance.now(), v: 0 };
    };
    /** Moves the panel; true while the gesture is (or may become) the sheet's, so that the caller holds the native scroll. */
    const move = (x: number, y: number): boolean => {
      if (!g || g.mode === "off") return false;
      const dx = x - g.x;
      const dy = y - g.y;
      if (g.mode === "pending") {
        const down = dy >= 0 && dy >= Math.abs(dx);
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SHEET_DRAG.slop) return g.allowed && down;
        g.mode = g.allowed && down ? "drag" : "off";
        if (g.mode === "off") return false;
        el.dataset.dragging = "";
        el.style.userSelect = "none";
        window.getSelection()?.removeAllRanges();
      }
      const t = performance.now();
      g.v = (y - g.lastY) / Math.max(1, t - g.lastT);
      g.lastY = y;
      g.lastT = t;
      g.offset = Math.max(0, dy);
      place(g.offset, false);
      return true;
    };
    const end = () => {
      const was = g;
      g = null;
      if (!was || was.mode !== "drag") return;
      delete el.dataset.dragging;
      el.style.userSelect = "";
      quietUntil = performance.now() + 400;
      const velocity = performance.now() - was.lastT > 100 ? 0 : was.v;
      if (sheetDragCloses(was.offset, velocity, el.getBoundingClientRect().height)) close();
      else place(0, true);
    };
    const cancel = () => {
      if (g?.mode === "drag") place(0, true);
      delete el.dataset.dragging;
      el.style.userSelect = "";
      g = null;
    };

    const onTouchStart = (e: TouchEvent) => (e.touches.length === 1 ? start(e.touches[0].clientX, e.touches[0].clientY, e.target) : cancel());
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && move(e.touches[0].clientX, e.touches[0].clientY) && e.cancelable) e.preventDefault();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (move(e.clientX, e.clientY)) e.preventDefault();
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      end();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.button !== 0) return;
      start(e.clientX, e.clientY, e.target);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    };
    /** A drag that ends on a button does not press it. */
    const onClick = (e: MouseEvent) => {
      if (performance.now() < quietUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", cancel);
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("click", onClick, true);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", cancel);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("click", onClick, true);
      g = null;
      onPointerUp();
    };
  }, [el, active, close, reduced]);
}

export function SheetContent({ className, children, side = "right", ...props }: ComponentProps<typeof SheetPrimitive.Content> & { side?: Side }) {
  const { open, close } = useContext(OpenContext);
  // The portal mounts the panel a render late: a state, not a ref, so that the drag attaches once it is there.
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  useSheetDrag(panel, open && side === "bottom", close);
  return (
    <AnimatePresence>
      {open && (
        <SheetPrimitive.Portal forceMount>
          <SheetPrimitive.Overlay forceMount asChild>
            <m.div
              data-slot="sheet-overlay"
              className="fixed inset-0 z-50 bg-board/80"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
          </SheetPrimitive.Overlay>
          <SheetPrimitive.Content forceMount asChild {...props}>
            <m.div
              ref={setPanel}
              data-slot="sheet-content"
              data-side={side}
              className={cn("fixed z-50 flex flex-col gap-4 border-border bg-popover p-6 text-popover-foreground shadow-lg outline-none", SIDE_CLASS[side], className)}
              initial={OFFSCREEN[side]}
              animate={{ x: 0, y: 0 }}
              exit={OFFSCREEN[side]}
              transition={{ type: "spring", stiffness: 420, damping: 40 }}
            >
              {side === "bottom" && (
                <div data-slot="sheet-grab-bar" aria-hidden className="absolute top-0 left-1/2 flex h-6 w-24 -translate-x-1/2 touch-none justify-center pt-2">
                  <span className="h-1 w-10 rounded-full bg-muted-foreground/40" />
                </div>
              )}
              {children}
              <SheetPrimitive.Close
                data-slot="sheet-close-x"
                className="state-layer absolute top-3 right-3 grid size-8 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CloseIcon />
                <span className="sr-only">Close</span>
              </SheetPrimitive.Close>
            </m.div>
          </SheetPrimitive.Content>
        </SheetPrimitive.Portal>
      )}
    </AnimatePresence>
  );
}

export function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-1.5", className)} {...props} />;
}
export function SheetFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="sheet-footer" className={cn("mt-auto flex flex-col gap-2", className)} {...props} />;
}
export function SheetTitle({ className, ...props }: ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn("font-semibold text-foreground", className)} {...props} />;
}
export function SheetDescription({ className, ...props }: ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description data-slot="sheet-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

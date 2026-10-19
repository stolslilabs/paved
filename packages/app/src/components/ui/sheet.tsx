/*
 * Source: shadcn/ui's Sheet (F3) on the Radix dialog, sliding with Motion (`AnimatePresence`, https://motion.dev,
 * `motion` 14.0.0, MIT): kept as F3b's sheet; the Dialog takes the same structure (docs/client/v2-architecture.md,
 * "Animated components: chosen sources").
 */
import { createContext, useCallback, useContext, useState, type ComponentProps } from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";
import { CloseIcon } from "./icons";

type Side = "top" | "right" | "bottom" | "left";

const OpenContext = createContext(false);

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
  return (
    <OpenContext.Provider value={current}>
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

export function SheetContent({ className, children, side = "right", ...props }: ComponentProps<typeof SheetPrimitive.Content> & { side?: Side }) {
  const open = useContext(OpenContext);
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
              data-slot="sheet-content"
              data-side={side}
              className={cn("fixed z-50 flex flex-col gap-4 border-border bg-popover p-6 text-popover-foreground shadow-lg outline-none", SIDE_CLASS[side], className)}
              initial={OFFSCREEN[side]}
              animate={{ x: 0, y: 0 }}
              exit={OFFSCREEN[side]}
              transition={{ type: "spring", stiffness: 420, damping: 40 }}
            >
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

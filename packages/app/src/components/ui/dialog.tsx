/*
 * Source: the enter and exit are motion-primitives' Dialog (components/core/dialog.tsx, its `defaultVariants` and
 * `defaultTransition`, https://github.com/ibelick/motion-primitives at commit 120f64f6ca60348e251f929e9c81f11ccbe45eda,
 * MIT, (c) 2024 ibelick), on F3's Radix dialog (shadcn/ui). Its native `<dialog>` is not taken: Radix keeps the focus
 * trap, the focus return and the labelling F3 tests. Adapted: `m` for LazyMotion, `AnimatePresence` around a
 * force-mounted Radix portal (as the Sheet), the semantic tokens.
 */
import { createContext, useCallback, useContext, useState, type ComponentProps } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";
import { CloseIcon } from "./icons";

const OpenContext = createContext(false);

/** The Dialog follows `open` itself so that `AnimatePresence` can keep the panel mounted while it leaves. */
export function Dialog({ open, defaultOpen = false, onOpenChange, ...props }: ComponentProps<typeof DialogPrimitive.Root>) {
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
      <DialogPrimitive.Root data-slot="dialog" open={current} onOpenChange={change} {...props} />
    </OpenContext.Provider>
  );
}
export function DialogTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}
export function DialogClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

const TRANSITION = { ease: "easeOut", duration: 0.2 } as const;

export function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay forceMount asChild {...props}>
      <m.div
        data-slot="dialog-overlay"
        className={cn("fixed inset-0 z-50 bg-board/80 backdrop-blur-sm", className)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={TRANSITION}
      />
    </DialogPrimitive.Overlay>
  );
}

/**
 * The panel fades and scales from 0.9 (section 3.2); under reduced motion `MotionConfig` keeps the fade and drops the
 * scale. The panel's edge is `border` (decorative): the dimmed backdrop and the shadow set it apart, and it holds focus.
 */
export function DialogContent({ className, children, showClose = true, ...props }: ComponentProps<typeof DialogPrimitive.Content> & { showClose?: boolean }) {
  const open = useContext(OpenContext);
  return (
    <AnimatePresence>
      {open && (
        <DialogPrimitive.Portal forceMount>
          <DialogOverlay />
          <DialogPrimitive.Content forceMount asChild {...props}>
            <m.div
              data-slot="dialog-content"
              className={cn(
                "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-border bg-popover p-6 text-popover-foreground shadow-lg outline-none sm:max-w-lg",
                className,
              )}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={TRANSITION}
            >
              {children}
              {showClose && (
                <DialogPrimitive.Close
                  data-slot="dialog-close-x"
                  className="absolute top-4 right-4 rounded-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
                >
                  <CloseIcon />
                  <span className="sr-only">Close</span>
                </DialogPrimitive.Close>
              )}
            </m.div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      )}
    </AnimatePresence>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-1.5 text-left", className)} {...props} />;
}
export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="dialog-footer" className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}
export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn("text-lg leading-none font-semibold", className)} {...props} />;
}
export function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

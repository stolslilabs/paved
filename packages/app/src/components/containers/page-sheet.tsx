import { useMemo, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";
import { PagePanelProvider } from "./page-panel-context";
import { PageRegionProvider } from "./page-region";

export interface PageSheetProps {
  open: boolean;
  /** The sheet's title: its accessible name (its header shows it too). */
  title: string;
  /** From the bottom on a phone (drag down to close), from the right from `desktop`, over the side panel. */
  side: "bottom" | "right";
  /** The close: the header's Back, Escape, a tap outside, a drag down. Up to the page under it. */
  onClose: () => void;
  children: ReactNode;
}

/**
 * BACK-RULE (#783, the owner's decisions of 2026-10-26): no page opens another page; what a page shows beyond itself, it shows in
 * place. A page reached from Settings (the themes, a theme, My tiles, the credits, the referral) is this sheet over it: the page
 * under it stays where it was. Its content is laid out as in the side panel (`PagePanelProvider`, `data-page-panel`: the phone's
 * layout), its header's Back closes it (`PagePanelValue.back`), and its body scrolls. The slide is the Sheet's (Motion, reduced under reduced motion).
 */
export default function PageSheet({ open, title, side, onClose, children }: PageSheetProps) {
  // Its header's Back closes it (PAGES-SCROLL #782 left the panels without a close button).
  const value = useMemo(() => ({ top: false, back: onClose }), [onClose]);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side={side}
        closeButton={false}
        aria-describedby={undefined}
        data-page-panel=""
        data-page-sheet={side}
        className={cn(
          "gap-0 bg-background p-0 text-foreground",
          side === "bottom" ? "max-h-[calc(100dvh-2rem)] pt-3 pb-[env(safe-area-inset-bottom)]" : "w-[28rem] max-w-full sm:max-w-none",
        )}
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <PagePanelProvider value={value}>
          <div data-slot="page-scroll" className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
            <PageRegionProvider value>{children}</PageRegionProvider>
          </div>
        </PagePanelProvider>
      </SheetContent>
    </Sheet>
  );
}

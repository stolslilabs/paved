import { SpinnerIcon } from "../components/ui/icons";
import { SearchVoid } from "./search-void";

/**
 * PvP's neutral loading screen (RANKED-SCAN-TIMING, #1067, the owner's ask of 2026-11-07): the rival's void with a spinner. The
 * scan (`PvpSearchScene`) means a search and nothing else, so a page that only reads (a resumed attack, a link to a result)
 * waits here. The spinner holds still under reduced motion (`SpinnerIcon`).
 */
export function PvpLoading() {
  return (
    <div data-pvp-loading className="relative flex h-dvh min-h-[32rem] flex-col overflow-hidden bg-board text-foreground">
      <div aria-hidden className="absolute inset-0">
        <SearchVoid />
      </div>
      <div role="status" aria-label="Loading" className="relative z-10 flex flex-1 items-center justify-center pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <SpinnerIcon aria-hidden className="size-8 text-foreground/80 desktop:size-10" />
      </div>
    </div>
  );
}

import { Suspense, useEffect } from "react";
import { Outlet } from "react-router";
import { LoadingScene } from "../components/scenes/loading-scene";
import { WalletFooter } from "../wallet/notice";
import { useRoutePage } from "./handle";
import { HistoryTracker } from "./history";
import { usePrefetchTabs } from "./prefetch";

/** The boot screen: also the router's `hydrateFallbackElement` and every route's `Suspense` fallback (section 6.1). */
export const bootScreen = <LoadingScene progress={null} />;

/** The board routes: the scene fills the viewport (`h-dvh`) and carries the D-15 notice itself (`BoardScene`'s `footnote`). */
const BOARD_PATHS = new Set(["game/:gameId", "training", "tutorial"]);

/**
 * The root of every route. It draws only the footer (the D-15 notice and the connected account, `WalletFooter`), in
 * normal flow after the page, except on a board route, which would scroll by the footer's height: a tab page brings the sticky navigation (`TabPage`, `AppNav`), a full-screen flow its top
 * bar, so the page scrolls as one document and nothing wraps it in an overflow box. Pages load lazily; `Suspense` shows
 * the loading scene while a page's code arrives; once the first render is done the browser fetches the tab pages' code in
 * its idle time (`prefetch.tsx`).
 */
export function RootLayout() {
  const page = useRoutePage();
  usePrefetchTabs();
  const onBoard = page !== null && BOARD_PATHS.has(page.path);
  // A board route does not scroll: no pull-to-refresh, no bounce (`html[data-board]`, styles/theme.css; APP-FEEL, P-69).
  useEffect(() => {
    if (!onBoard) return;
    document.documentElement.dataset.board = "";
    return () => {
      delete document.documentElement.dataset.board;
    };
  }, [onBoard]);
  return (
    <HistoryTracker>
      <Suspense fallback={bootScreen}>
        <Outlet />
      </Suspense>
      {!onBoard && <WalletFooter />}
    </HistoryTracker>
  );
}

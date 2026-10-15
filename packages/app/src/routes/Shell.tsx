import { Suspense } from "react";
import { Outlet } from "react-router";
import { LoadingScene } from "../components/scenes/loading-scene";
import { HistoryTracker } from "./history";

/** The boot screen: also the router's `hydrateFallbackElement` and every route's `Suspense` fallback (section 6.1). */
export const bootScreen = <LoadingScene progress={null} />;

/**
 * The root of every route. It draws nothing of its own: a tab page brings the sticky navigation (`TabPage`,
 * `AppNav`), a full-screen flow its top bar, so the page scrolls as one document and nothing wraps it in an overflow
 * box. Pages load lazily; `Suspense` shows the loading scene while a page's code arrives.
 */
export function RootLayout() {
  return (
    <HistoryTracker>
      <Suspense fallback={bootScreen}>
        <Outlet />
      </Suspense>
    </HistoryTracker>
  );
}

import { Suspense, useEffect } from "react";
import { Outlet } from "react-router";
import { AudioProvider } from "../components/containers/audio-provider";
import { useDeviceSettings } from "../data/settings";
import { LoadingScene } from "../components/scenes/loading-scene";
import { useRoutePage } from "./handle";
import { HistoryTracker } from "./history";
import { usePrefetchTabs } from "./prefetch";

/** The boot screen: also the router's `hydrateFallbackElement` and every route's `Suspense` fallback (section 6.1). */
export const bootScreen = <LoadingScene progress={null} />;

/** The board routes: the scene fills the viewport (`h-dvh`) and the document does not scroll. */
const BOARD_PATHS = new Set(["game/:gameId", "training", "tutorial"]);

/**
 * The root of every route. It draws nothing of its own (the Cartridge notice lives on the Credits page, D-15): a tab page
 * brings the sticky navigation (`TabPage`, `AppNav`), a full-screen flow its top bar, and every page is `min-h-dvh`, so a page
 * that fits does not scroll and a taller one scrolls as one document, nothing wrapping it in an overflow box. Pages load lazily; `Suspense` shows
 * the loading scene while a page's code arrives; once the first render is done the browser fetches the tab pages' code in
 * its idle time (`prefetch.tsx`).
 */
export function RootLayout() {
  const page = useRoutePage();
  usePrefetchTabs();
  const [{ musicVolume, sfxVolume }] = useDeviceSettings();
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
    // The audio engine is its own chunk and starts on the first gesture; the provider only carries the two volumes.
    <AudioProvider musicVolume={musicVolume} sfxVolume={sfxVolume}>
      <HistoryTracker>
        <Suspense fallback={bootScreen}>
          <Outlet />
        </Suspense>
      </HistoryTracker>
    </AudioProvider>
  );
}

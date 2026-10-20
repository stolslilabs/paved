import { Suspense } from "react";
import { Outlet } from "react-router";
import { AudioProvider } from "../components/containers/audio-provider";
import { MockMarkProvider } from "../components/containers/mock-mark";
import { MOCKED, MOCKED_PAGES } from "../data/data-source";
import { deviceSettings, useDeviceSettings, withVolume } from "../data/settings";
import { LoadingScene } from "../components/scenes/loading-scene";
import { useRoutePage } from "./handle";
import { BalancesHost } from "./balances-host";
import { HistoryTracker } from "./history";
import { usePrefetchTabs } from "./prefetch";
import { StaleChunkGate } from "./stale-chunk-gate";

/** The boot screen: also the router's `hydrateFallbackElement` and every route's `Suspense` fallback (section 6.1). */
export const bootScreen = <LoadingScene progress={null} />;

/** The music volume from the player's pause (0) or resume, stored like a move of the slider. */
const setMusicVolume = (v: number) => deviceSettings.set(withVolume(deviceSettings.get(), "music", v));

/** The board routes: the scene fills the viewport (`h-dvh`), and it shows no balances. */
const BOARD_PATHS = new Set(["game/:gameId", "training", "story/:campaign/:level"]);

/**
 * The root of every route. It draws nothing of its own (the Cartridge notice lives on the Credits page, D-15): a tab page
 * is one viewport tall, its navigation fixed to the bottom and its content in its own scrolling region (`TabFrame`, FOOTER-FIXED); a
 * full-screen flow brings its top bar and is `min-h-dvh`, scrolling as one document. The document never bounces (`html, body`
 * take no overscroll, styles/theme.css). Pages load lazily; `Suspense` shows
 * the loading scene while a page's code arrives; once the first render is done the browser fetches the tab pages' code in
 * its idle time (`prefetch.tsx`).
 */
export function RootLayout() {
  const page = useRoutePage();
  usePrefetchTabs();
  const [{ musicVolume, musicBefore, sfxVolume }] = useDeviceSettings();
  const onBoard = page !== null && BOARD_PATHS.has(page.path);
  return (
    // The audio engine is its own chunk and starts on the first gesture; the provider carries the two volumes, and a pause or a
    // resume of the music player (the settings, the lock screen) comes back as the music volume.
    <AudioProvider musicVolume={musicVolume} musicBefore={musicBefore} sfxVolume={sfxVolume} onMusicVolumeChange={setMusicVolume}>
      {/* The "Mock" mark of the headers of the pages the mock serves (MOCK-FIRST). */}
      <MockMarkProvider value={MOCKED && page !== null && MOCKED_PAGES.has(page.path)}>
        <HistoryTracker>
          <StaleChunkGate />
          {/* A board shows no balances: it reads none (a board is the heaviest page, and its tests the most timing-bound). */}
          {onBoard ? (
            <Suspense fallback={bootScreen}>
              <Outlet />
            </Suspense>
          ) : (
            <BalancesHost>
              <Suspense fallback={bootScreen}>
                <Outlet />
              </Suspense>
            </BalancesHost>
          )}
        </HistoryTracker>
      </MockMarkProvider>
    </AudioProvider>
  );
}

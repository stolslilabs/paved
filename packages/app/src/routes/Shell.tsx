import { Suspense } from "react";
import { Outlet } from "react-router";
import { AudioProvider } from "../components/containers/audio-provider";
import { MockMarkProvider } from "../components/containers/mock-mark";
import { MOCKED, MOCKED_PAGES } from "../data/data-source";
import { deviceSettings, useDeviceSettings, withVolume } from "../data/settings";
import { LoadingScene } from "../components/scenes/loading-scene";
import { useRoutePage } from "./handle";
import { BalancesHost } from "./balances-host";
import { BALANCE_PAGES } from "./balance-pages";
import { ProfileHost } from "./profile-host";
import { HistoryTracker } from "./history";
import { usePrefetchTabs } from "./prefetch";
import { StaleChunkGate } from "./stale-chunk-gate";
import { useTabSwipeEnd } from "./tab-swipe";

/** The boot screen: also the router's `hydrateFallbackElement` and every route's `Suspense` fallback (section 6.1). */
export const bootScreen = <LoadingScene progress={null} />;

/** The music volume from the player's pause (0) or resume, stored like a move of the slider. */
const setMusicVolume = (v: number) => deviceSettings.set(withVolume(deviceSettings.get(), "music", v));

/** A leaf, so that the view transition's state re-renders it alone: it removes the swipe's mark when the swipe ends (TAB-SWIPE, issue 726). */
function TabSwipeEnd() {
  useTabSwipeEnd();
  return null;
}

/** The board routes: the scene fills the viewport (`h-dvh`), and it reads neither the balances nor the avatar. */
const BOARD_PATHS = new Set(["game/:gameId", "training", "story/:campaign/:level"]);

/**
 * The root of every route. It draws nothing of its own (the Cartridge notice lives on the Credits page, D-15): a tab page
 * is one viewport tall, its navigation fixed to the bottom and its content in its own scrolling region (`TabFrame`, FOOTER-FIXED); a
 * full-screen flow brings its top bar and is `min-h-dvh`, scrolling as one document. The document never bounces (`html, body`
 * take no overscroll, styles/theme.css). Every page's header, the top bar, the tab pages' title row, the navigation's header from
 * `desktop`, is one height per breakpoint (`--header-h`, the
 * `page-header` utility, theme.css: HEADER-HEIGHT). Pages load lazily; `Suspense` shows
 * the loading scene while a page's code arrives; once the first render is done the browser fetches the tab pages' code in
 * its idle time (`prefetch.tsx`).
 */
export function RootLayout() {
  const page = useRoutePage();
  usePrefetchTabs();
  const [{ musicVolume, musicBefore, sfxVolume }] = useDeviceSettings();
  const onBoard = page !== null && BOARD_PATHS.has(page.path);
  // The page's balances (BALANCES-BY-PAGE, issue 855): only those it uses, by its route (`null`: none). A page with none reads none,
  // unless the home stays mounted under it (a panel's page from `desktop`, issue 762), whose own balances still show.
  const shown = page && BALANCE_PAGES.has(page.path) ? page.path : null;
  const noBalance = shown === null && !page?.panel;
  const pages = (
    <Suspense fallback={bootScreen}>
      <Outlet />
    </Suspense>
  );
  return (
    // The audio engine is its own chunk and starts on the first gesture; the provider carries the two volumes, and a pause or a
    // resume of the music player (the settings, the lock screen) comes back as the music volume.
    <AudioProvider musicVolume={musicVolume} musicBefore={musicBefore} sfxVolume={sfxVolume} onMusicVolumeChange={setMusicVolume}>
      {/* The "Mock" mark of the headers of the pages the mock serves (MOCK-FIRST). */}
      <MockMarkProvider value={MOCKED && page !== null && MOCKED_PAGES.has(page.path)}>
        <HistoryTracker>
          <StaleChunkGate />
          <TabSwipeEnd />
          {/* A board shows no balances and no avatar: it reads neither (a board is the heaviest page, and its tests the most timing-bound). */}
          {onBoard ? pages : noBalance ? <ProfileHost>{pages}</ProfileHost> : (
            <BalancesHost page={shown}>
              <ProfileHost>{pages}</ProfileHost>
            </BalancesHost>
          )}
        </HistoryTracker>
      </MockMarkProvider>
    </AudioProvider>
  );
}

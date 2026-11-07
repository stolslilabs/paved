import { Suspense, lazy, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { SettingsScene, type Account, type Preferences, type SettingsView } from "../../components/scenes/settings-scene";
import { Skeleton } from "../../components/ui/skeleton";
import { savedLook, useAvatar } from "../../data/avatar";
import { isUnranked, usePvpLastAttack, usePvpLeagueOf } from "../../data/pvp-standing";
import { autoQuality, deviceSettings, useDeviceSettings, withVolume } from "../../data/settings";
import { useShowSkins } from "../../data/skins";
import { useDataSources, type DataSources } from "../../data/sources";
import { SFX_CREDITS } from "../../lib/audio/sfx";
import { titleOf } from "../../lib/music/track-info";
import { TRACKS } from "../../lib/music/tracks";
import { LEAGUES, leagueOf } from "../../lib/pvp-rules";
import { version } from "../../../package.json";
import { useAccount } from "../../wallet/wallet";
import { useConnectError } from "../connect-error";
import { useDrawerRoute } from "../drawer-route";
import { useAppNavigate, useBack } from "../ref";

/** The Themes view's wiring and scene (the chain's skins, the tiles' renders): its own chunk, loaded with the view. */
const ThemesView = lazy(() => import("./theme"));

const CREDITS = { tracks: TRACKS.map(titleOf), sounds: [...SFX_CREDITS] };

/** The views with a URL of their own (More's rows): the route names them. */
const ROUTED: Readonly<Record<string, Exclude<SettingsView, "settings" | "quality">>> = { "/settings/credits": "credits", "/settings/theme": "themes" };
const PATHS = { credits: "/settings/credits", themes: "/settings/theme" } as const;

/** The sources of a guest's standing: no views (the standing's reads ask nothing then, as in a story). */
const NO_READS = { views: {} } as Pick<DataSources, "views">;

/** The state of a view the drawer opened: its Back goes back in the history, to Settings. */
const OPENED = { opened: true } as const;

/**
 * `/settings`, `/settings/credits` and `/settings/theme` (P11a, sections 6.1 and 6.4; SETTINGS-PAGE: the HUD's drawer, one page, so a
 * move between its views keeps it). The device settings (`useDeviceSettings`: graphics quality, the day and night cycle, the ambient
 * effects, the volumes, tile preview, placement highlight, the square grid) and the viewer's switch for the other players' skins
 * (`useShowSkins`) are kept on this device; the board reads the same stores, so a change applies to an open board. The account is the
 * wallet's (`useAccount`): the username, or the short address, the saved look and the league's rim (`usePvpLeagueOf`, unranked as the
 * profile reads it), and Reset (a new key and account on this device, for testing: #918). No Disconnect and no Connect (NO-GUEST, the
 * owner's ruling of 2026-11-07): every player has an account, Reset goes from one to the next. The two volume sliders keep the volume and the level before a mute (`withVolume`).
 * Views: Credits and Themes are the URL's, each an entry of its own pushed from Settings (Back goes back in the history; reached by a
 * link or a reload, Back replaces it with Settings); the quality's choice is the page's own state. The data layer's types are the
 * chain-free ones (no value import of `@paved/chain` in this chunk).
 */
export default function Page() {
  const drawer = useDrawerRoute();
  const back = useBack();
  const go = useAppNavigate();
  const navigate = useNavigate();
  const { pathname, state } = useLocation();
  const wallet = useAccount();
  useConnectError(wallet.error);
  const [settings, set] = useDeviceSettings();
  const [showSkins, setShowSkins] = useShowSkins();
  const [quality, setQuality] = useState(false);
  // The drawer stays mounted once closed (its host keeps it): it opens again on Settings, never on the quality's choice left open.
  const open = drawer?.open ?? true;
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setQuality(false);
  }

  // A guest reads no standing: no views, no query.
  const sources = useDataSources();
  const reads = wallet.address ? sources : NO_READS;
  const me = wallet.address ?? "0x0";
  const look = savedLook(useAvatar(wallet.address).data);
  const standing = usePvpLeagueOf(reads, me);
  const attack = usePvpLastAttack(reads, me);
  const ranked = standing && attack !== undefined && !(attack !== null && isUnranked(standing, attack));
  const league = ranked ? (LEAGUES[standing.league] ?? leagueOf(standing.crowns)) : undefined;
  const account: Account | null = wallet.address ? { address: wallet.address, name: wallet.username, look, league } : null;
  const preferences: Preferences = { ...settings, showSkins };

  const routed = ROUTED[pathname];
  const view: SettingsView = routed ?? (quality ? "quality" : "settings");
  const onView = (next: Exclude<SettingsView, "settings">) => (next === "quality" ? setQuality(true) : go(PATHS[next], { state: OPENED }));
  const onViewBack = () => {
    if (!routed) setQuality(false);
    else if ((state as typeof OPENED | null)?.opened) navigate(-1);
    else go("/settings", { replace: true });
  };

  return (
    <SettingsScene
      preferences={preferences}
      account={account}
      autoQuality={autoQuality()}
      connecting={wallet.status === "connecting" || wallet.status === "restoring"}
      version={version}
      view={view}
      credits={CREDITS}
      themes={
        view === "themes" && (
          // While its chunk comes, the view's place held, not a blank body.
          <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
            <ThemesView />
          </Suspense>
        )
      }
      open={open}
      returnFocus={drawer?.returnFocus}
      onVolumeChange={(channel, volume) => deviceSettings.set(withVolume(deviceSettings.get(), channel, volume))}
      onChange={(key, value) => (key === "showSkins" ? setShowSkins(value as boolean) : set(key, value as never))}
      onReset={() => void wallet.reset()}
      onView={onView}
      onViewBack={onViewBack}
      onBack={drawer?.onClose ?? back}
    />
  );
}

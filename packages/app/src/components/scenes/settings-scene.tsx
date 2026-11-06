import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import * as m from "motion/react-m";
import type { League } from "../../lib/pvp-rules";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { PlayerName } from "../elements/player-name";
import { SETTING_LABEL, SETTING_ROW, ShowSkinsSwitch } from "../elements/setting-switch";
import { ShortAddress } from "../elements/short-address";
import { UiIcon } from "../elements/ui-icon";
import { BalancesSlot } from "../containers/balances-context";
import type { ShownBalance } from "../containers/balances";
import { DeviceSettingsPanel, QualityChoice, type DevicePreferences, type DeviceSettingsPanelProps, type GraphicsQuality, type VolumeChannel } from "../containers/device-settings-panel";
import { HudDrawer } from "../containers/hud-drawer";
import { LeaguePortrait } from "../containers/league-control";
import { SettingsGroup, SettingsLink } from "../containers/settings-group";
import { CreditsScene, type CreditsSceneProps } from "./credits-scene";

/** The player's preferences, kept on this device (section 6.4: local storage): the device settings of the panel, and the skins switch. */
export interface Preferences extends DevicePreferences {
  /** Show the other players' skins on their boards (off: their base models, nothing of theirs downloaded). The own tiles always wear theirs. */
  showSkins: boolean;
}

/** The connected account: the device's key's (#918). */
export interface Account {
  address: string;
  /** The player's username, when there is one. */
  name: string | null;
  /** The look they saved (#626; a new player's drawn one on the mock, #926); null or omitted: the initial. */
  look?: bigint | null;
  /** Their league, its rim round the portrait and its crest (the book's account); omitted, a plain ring (unranked, or not read yet). */
  league?: League;
}

/**
 * What the drawer shows (SETTINGS-PAGE): Settings, or one of its views in its place: the quality's choice (the Visuals' pill), Credits
 * and Themes (More's rows, each its own URL).
 */
export type SettingsView = "settings" | "quality" | "credits" | "themes";

const TITLES: Record<SettingsView, string> = { settings: "Settings", quality: "Graphics quality", credits: "Credits", themes: "Themes" };

export interface SettingsSceneProps {
  preferences: Preferences;
  /** Null: a guest. */
  account: Account | null;
  /** The tier "auto" resolves to on this device: "Auto (Medium)". */
  autoQuality?: Exclude<GraphicsQuality, "auto">;
  connecting?: boolean;
  /** The app's version, at the foot of the page. */
  version?: string;
  /** The view shown; omitted, Settings. */
  view?: SettingsView;
  /** What Credits names (the music's titles, the sound effects'). */
  credits: Pick<CreditsSceneProps, "tracks" | "sounds">;
  /** The Themes view's body, the route's (`ThemeScene` on the chain's skins, its own chunk); the view shows nothing without it. */
  themes?: ReactNode;
  /** The drawer is open (its route the current one); omitted, open. */
  open?: boolean;
  /** Where the focus goes back on close: the dock's Settings that opened it. */
  returnFocus?: () => HTMLElement | null;
  onChange?: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  onVolumeChange?: (channel: VolumeChannel, volume: number) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  /** Reset: a new key and a new account on this device (testing, #918). Omitted: no Reset row. */
  onReset?: () => void;
  /** A view opened from Settings: the quality's pill, More's Themes and Credits. */
  onView?: (view: Exclude<SettingsView, "settings">) => void;
  /** A view's Back, to Settings. */
  onViewBack?: () => void;
  /** Back on a phone, the close from `tablet` and from a view (the red cross), Escape, a tap on the village: up to the village (BACK-RULE #783). */
  onBack?: () => void;
}

/** The Themes view's balance at the header's end: the Cobbles its themes are bought with (#855: the page's own balance). */
const COBBLES: readonly ShownBalance[] = ["cobbles"];

/** A press on a dialog over the drawer (the wallet's, a theme's question) is no tap on the village. */
const keepForDialogs = (event: Event) => {
  if ((event.target as Element | null)?.closest?.("[role=dialog], [role=alertdialog]")) event.preventDefault();
};

/** The account's raised pill (the book's Disconnect, the Reset): a press on the carved surface, 44 px tall. */
const PILL = "drawer-raised state-layer text-outline flex min-h-11 shrink-0 cursor-pointer items-center rounded-full px-3.5 text-sm font-bold outline-none disabled:pointer-events-none disabled:opacity-50";

/**
 * Settings (`/settings`, SETTINGS-PAGE, the Paved UX Book's Settings): the HUD's drawer, as the Shop (`HudDrawer`): a full page with
 * Back on a phone, a side panel docked at the right from `tablet`, the dock's Settings being its right-most button (the book draws a
 * centred window at those widths). Its groups in the book's order: Visuals (the quality's pill, the day and night cycle, the ambient
 * effects, the other players' skins), Sound (the two sliders, the music player of #569), Gameplay (tile preview, placement highlight,
 * the square grid), Account (the portrait in its league's rim, the name, Connected and the address, Disconnect; a guest's Connect;
 * Reset for testing, #918), More (Themes, kept, and Credits), the app's version at the foot. The quality's choice, Credits and Themes
 * open as views in the drawer, in its place, sliding in: the header names the view, its Back goes back to Settings and the red cross
 * leaves (the Guild's menu's pattern).
 */
export function SettingsScene(props: SettingsSceneProps) {
  const { preferences: p, account, view = "settings", onChange } = props;
  // A move between Settings and a view starts at the top of the drawer's body (the Shop's rule); the first view comes with the drawer's
  // own slide, only a move between views slides.
  const body = useRef<HTMLDivElement>(null);
  const [last, setLast] = useState(view);
  const [moved, setMoved] = useState(false);
  if (last !== view) {
    setLast(view);
    setMoved(true);
  }
  const mounted = useRef(false);
  useLayoutEffect(() => {
    const region = mounted.current ? body.current?.closest("[data-hud-drawer-body]") : null;
    if (region) region.scrollTop = 0;
    mounted.current = true;
  }, [view]);
  const inView = view !== "settings";

  return (
    <HudDrawer
      open={props.open ?? true}
      onOpenChange={(next) => {
        if (!next) props.onBack?.();
      }}
      title={TITLES[view]}
      side="right"
      slot="settings"
      returnFocus={props.returnFocus}
      end={view === "themes" ? <BalancesSlot layout="pill" kinds={COBBLES} /> : undefined}
      onBack={inView ? props.onViewBack : undefined}
      onInteractOutside={keepForDialogs}
    >
      <m.div
        key={view}
        ref={body}
        // A view comes in from the right, Settings back from the left (no slide under reduced motion: `MotionConfig`).
        initial={moved && { x: inView ? 48 : -48, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="flex flex-col gap-4"
      >
        {view === "quality" && <QualityChoice quality={p.quality} autoQuality={props.autoQuality} onChange={(q) => onChange?.("quality", q)} />}
        {view === "credits" && <CreditsScene {...props.credits} />}
        {view === "themes" && props.themes}
        {view === "settings" && (
          <>
            <DeviceSettingsPanel
              preferences={p}
              autoQuality={props.autoQuality}
              onChange={onChange as DeviceSettingsPanelProps["onChange"]}
              onVolumeChange={props.onVolumeChange}
              onOpenQuality={() => props.onView?.("quality")}
              visualsExtra={<ShowSkinsSwitch checked={p.showSkins} onCheckedChange={(v) => onChange?.("showSkins", v)} />}
            />
            <AccountGroup account={account} connecting={props.connecting} onConnect={props.onConnect} onDisconnect={props.onDisconnect} onReset={props.onReset} />
            <SettingsGroup title="More" surface="links">
              <SettingsLink label="Themes" art="theme-forest" onClick={() => props.onView?.("themes")} />
              <SettingsLink label="Credits" art="missions" onClick={() => props.onView?.("credits")} />
            </SettingsGroup>
            {props.version && <p className="text-center text-xs text-muted-foreground">Paved v{props.version}</p>}
          </>
        )}
      </m.div>
    </HudDrawer>
  );
}

/** The account (the book's): the portrait in its league's rim, the name, Connected in green and the address, Disconnect; a guest's Connect. */
function AccountGroup({ account, connecting, onConnect, onDisconnect, onReset }: Pick<SettingsSceneProps, "account" | "connecting" | "onConnect" | "onDisconnect" | "onReset">) {
  return (
    <SettingsGroup title="Account">
      {account ? (
        // The pill goes under the words at 320 px rather than squeezing them (WRAP360).
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
          <LeaguePortrait player={account} look={account.look} league={account.league} className="text-[3rem]" />
          <span className="flex min-w-0 flex-1 basis-28 flex-col">
            <PlayerName name={account.name} address={account.address} className="text-outline text-lg leading-tight font-bold" />
            <span className="text-outline text-sm font-bold text-success">Connected</span>
            <ShortAddress address={account.address} className="text-sm text-muted-foreground" />
          </span>
          <button type="button" className={cn(PILL, "ml-auto")} onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full border-4 border-border">
            <UiIcon name="user" px={32} className="drawer-icon size-8" />
          </span>
          <span className="flex min-w-0 flex-1 basis-28 flex-col">
            <span className="text-outline text-lg leading-tight font-bold">Guest</span>
            <span className="text-sm wrap-anywhere text-muted-foreground">Story progress is saved on this device only.</span>
          </span>
          <Button className="ml-auto" onClick={onConnect} loading={connecting}>
            Connect
          </Button>
        </div>
      )}
      {onReset && (
        <div data-slot="setting-row" className={cn(SETTING_ROW, "py-3")}>
          <UiIcon name="rotate" px={32} className="drawer-icon size-8" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={SETTING_LABEL}>Reset account</span>
            <span className="text-sm wrap-anywhere text-muted-foreground">A new key and a new account on this device. For testing: the old account cannot be recovered.</span>
          </span>
          <button type="button" className={cn(PILL, "ml-auto")} onClick={onReset} disabled={connecting}>
            Reset
          </button>
        </div>
      )}
    </SettingsGroup>
  );
}

import type { Tab } from "../../routes/pages";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { PlayerName } from "../elements/player-name";
import { ShortAddress } from "../elements/short-address";
import { SettingSwitch, ShowSkinsSwitch } from "../elements/setting-switch";
import { SettingsGroup, SettingsLink } from "../containers/settings-group";
import { TabPage } from "../containers/tab-page";
import { THEMES, type ThemeId } from "../containers/theme-card";

/** "auto" picks by device: Low on a phone, Medium on a desktop; High only by hand. */
export type GraphicsQuality = "auto" | "low" | "medium" | "high";

/** The player's preferences, kept on this device (section 6.4: local storage). */
export interface Preferences {
  quality: GraphicsQuality;
  sound: boolean;
  music: boolean;
  /** Show the tile on a slot before it is placed. */
  tilePreview: boolean;
  /** Outline the slots where the tile in hand fits. */
  placementHighlight: boolean;
  /** Show the players' skins on the boards (off: the base models, nothing downloaded). Kept with the theme. */
  showSkins: boolean;
}

/** The connected controller account. */
export interface Account {
  address: string;
  /** The controller username, when it has one. */
  name: string | null;
}

export interface SettingsSceneProps {
  preferences: Preferences;
  /** Null: a guest. */
  account: Account | null;
  theme: ThemeId;
  /** The tier "auto" resolves to on this device: "Auto (Medium)". */
  autoQuality?: Exclude<GraphicsQuality, "auto">;
  connecting?: boolean;
  /** The app's version, at the foot of the page. */
  version?: string;
  onChange?: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onOpenTheme?: () => void;
  onOpenReferral?: () => void;
  onNavigate?: (tab: Tab) => void;
}

const QUALITY: { value: GraphicsQuality; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

/** Settings (`/settings`): graphics quality, sound, music, tile preview and placement highlight (the mockups); the account; theme and referral. */
export function SettingsScene(props: SettingsSceneProps) {
  const { preferences: p, account, theme, onChange } = props;
  const themeName = THEMES.find((t) => t.id === theme)?.name ?? theme;
  return (
    <TabPage tab="settings" title="Settings" onNavigate={props.onNavigate}>
      <div className="grid grid-cols-1 gap-4 desktop:grid-cols-2 desktop:items-start">
        <div className="flex flex-col gap-4">
          <SettingsGroup title="Visuals">
            <div className="flex flex-col gap-2 py-2.5">
              <span id="quality-label" className="flex items-center gap-3 text-sm">
                <Icon name="display" className="text-muted-foreground" size="sm" fixedWidth />
                Graphics quality
              </span>
              <ToggleGroup
                type="single"
                variant="outline"
                aria-labelledby="quality-label"
                value={p.quality}
                onValueChange={(v) => v && onChange?.("quality", v as GraphicsQuality)}
                className="w-full"
              >
                {QUALITY.map((q) => (
                  <ToggleGroupItem key={q.value} value={q.value} className="flex-1">
                    {q.value === "auto" && props.autoQuality ? `Auto (${QUALITY.find((o) => o.value === props.autoQuality)?.label})` : q.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {p.quality === "high" && <p className="text-xs text-muted-foreground">High is heavier: it can slow the board and drain a battery faster.</p>}
            </div>
            <ShowSkinsSwitch checked={p.showSkins} onCheckedChange={(v) => onChange?.("showSkins", v)} />
            <SettingSwitch label="Sound" icon="volume-high" checked={p.sound} onCheckedChange={(v) => onChange?.("sound", v)} />
            <SettingSwitch label="Music" icon="music" checked={p.music} onCheckedChange={(v) => onChange?.("music", v)} />
          </SettingsGroup>

          <SettingsGroup title="Gameplay">
            <SettingSwitch
              label="Tile preview"
              hint="Show the tile on a slot before you place it"
              icon="eye"
              checked={p.tilePreview}
              onCheckedChange={(v) => onChange?.("tilePreview", v)}
            />
            <SettingSwitch
              label="Placement highlight"
              hint="Outline the slots where your tile fits"
              icon="highlighter"
              checked={p.placementHighlight}
              onCheckedChange={(v) => onChange?.("placementHighlight", v)}
            />
          </SettingsGroup>
        </div>

        <div className="flex flex-col gap-4">
          <SettingsGroup title="Account">
            {account ? (
              <div className="flex items-center gap-3 py-2.5">
                <Avatar className="size-9">
                  <AvatarFallback className="bg-gold-900 font-semibold text-gold-200">{(account.name ?? account.address.slice(2, 3)).slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-1 flex-col">
                  <PlayerName name={account.name} address={account.address} className="text-sm font-semibold" />
                  {/* The status and the address are two pieces that never break inside: in a narrow column the address goes
                      to the next line whole (WRAP360), never "0x05f1…" over "6e7f". */}
                  <span className="flex flex-wrap items-center gap-x-1.5 text-xs">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-success">
                      <span aria-hidden className="size-1.5 rounded-full bg-success" />
                      Connected
                    </span>{" "}
                    <ShortAddress address={account.address} className="text-muted-foreground" />
                  </span>
                </span>
                <Button size="sm" variant="outline" onClick={props.onDisconnect}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 py-2.5">
                <Icon name="user" className="text-muted-foreground" size="md" fixedWidth />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold">Guest</span>
                  <span className="text-xs wrap-anywhere text-muted-foreground">Training is saved on this device only.</span>
                </span>
                <Button size="sm" onClick={props.onConnect} loading={props.connecting}>
                  Connect
                </Button>
              </div>
            )}
          </SettingsGroup>

          <SettingsGroup title="More">
            <SettingsLink label="Theme" icon="palette" value={themeName} onClick={props.onOpenTheme} />
            <SettingsLink label="Referral" hint="Your link and what it earned" icon="user-group" onClick={props.onOpenReferral} />
          </SettingsGroup>

          {props.version && <p className="text-center text-xs text-muted-foreground">Paved v{props.version}</p>}
        </div>
      </div>
    </TabPage>
  );
}


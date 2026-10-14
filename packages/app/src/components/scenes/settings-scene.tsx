import type { Tab } from "../../routes/pages";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { PlayerName, shortAddress } from "../elements/player-name";
import { SettingSwitch } from "../elements/setting-switch";
import { SettingsGroup, SettingsLink } from "../containers/settings-group";
import { TabPage } from "../containers/tab-page";
import { THEMES, type ThemeId } from "../containers/theme-card";

export type GraphicsQuality = "low" | "medium" | "high";

/** The player's preferences, kept on this device (section 6.4: local storage). */
export interface Preferences {
  quality: GraphicsQuality;
  sound: boolean;
  music: boolean;
  /** Show the tile on a slot before it is placed. */
  tilePreview: boolean;
  /** Outline the slots where the tile in hand fits. */
  placementHighlight: boolean;
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
                    {q.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
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
                  <span className="flex items-center gap-1.5 text-xs text-success">
                    <span aria-hidden className="size-1.5 rounded-full bg-success" />
                    Connected <span className="font-mono text-muted-foreground">{shortAddress(account.address)}</span>
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
                  <span className="text-xs text-muted-foreground">Training is saved on this device only.</span>
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


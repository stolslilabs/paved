import type { Tab } from "../../routes/pages";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { PlayerAvatar } from "../elements/player-avatar";
import { PlayerName } from "../elements/player-name";
import { ShortAddress } from "../elements/short-address";
import { ShowSkinsSwitch } from "../elements/setting-switch";
import { DeviceSettingsPanel, type DevicePreferences, type DeviceSettingsPanelProps, type GraphicsQuality, type VolumeChannel } from "../containers/device-settings-panel";
import { SettingsGroup, SettingsLink } from "../containers/settings-group";
import { TabPage } from "../containers/tab-page";

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
}

export interface SettingsSceneProps {
  preferences: Preferences;
  /** Null: a guest. */
  account: Account | null;
  /** The tier "auto" resolves to on this device: "Auto (Medium)". */
  autoQuality?: Exclude<GraphicsQuality, "auto">;
  connecting?: boolean;
  /** The app's version, at the foot of the page. */
  version?: string;
  onChange?: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  onVolumeChange?: (channel: VolumeChannel, volume: number) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  /** Reset: a new key and a new account on this device (testing, #918). Omitted: no Reset row. */
  onReset?: () => void;
  onOpenTheme?: () => void;
  onOpenReferral?: () => void;
  onOpenCredits?: () => void;
  /** Back, up to the village (BACK-RULE #783); omitted, the bar's Home. */
  onBack?: () => void;
  onNavigate?: (tab: Tab) => void;
}

/** Settings (`/settings`): the device settings (the shared panel), the account, theme, referral and credits. */
export function SettingsScene(props: SettingsSceneProps) {
  const { preferences: p, account, onChange } = props;
  return (
    <TabPage tab="settings" title="Settings" onBack={props.onBack} onNavigate={props.onNavigate}>
      <div className="grid grid-cols-1 gap-4">
        <DeviceSettingsPanel
          preferences={p}
          autoQuality={props.autoQuality}
          onChange={onChange as DeviceSettingsPanelProps["onChange"]}
          onVolumeChange={props.onVolumeChange}
          visualsExtra={<ShowSkinsSwitch checked={p.showSkins} onCheckedChange={(v) => onChange?.("showSkins", v)} />}
        />

        <div className="flex flex-col gap-4">
          <SettingsGroup title="Account">
            {account ? (
              <div className="flex items-center gap-3 py-2.5">
                <PlayerAvatar player={account} look={account.look} className="size-9 p-0" />
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
                  <span className="text-xs wrap-anywhere text-muted-foreground">Story progress is saved on this device only.</span>
                </span>
                <Button size="sm" onClick={props.onConnect} loading={props.connecting}>
                  Connect
                </Button>
              </div>
            )}
            {props.onReset && (
              <div className="flex items-center gap-3 py-2.5">
                <Icon name="arrows-rotate" className="text-muted-foreground" size="md" fixedWidth />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold">Reset account</span>
                  <span className="text-xs wrap-anywhere text-muted-foreground">A new key and a new account on this device. For testing: the old account cannot be recovered.</span>
                </span>
                <Button size="sm" variant="outline" onClick={props.onReset} disabled={props.connecting}>
                  Reset
                </Button>
              </div>
            )}
          </SettingsGroup>

          <SettingsGroup title="More">
            <SettingsLink label="Themes" hint="Your tiles' looks, and their shops" icon="palette" onClick={props.onOpenTheme} />
            <SettingsLink label="Referral" hint="Your link and what it earned" icon="user-group" onClick={props.onOpenReferral} />
            <SettingsLink label="Credits" hint="Licences and third-party notices" icon="circle-info" onClick={props.onOpenCredits} />
          </SettingsGroup>

          {props.version && <p className="text-center text-xs text-muted-foreground">Paved v{props.version}</p>}
        </div>
      </div>
    </TabPage>
  );
}


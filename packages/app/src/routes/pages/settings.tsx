import { SettingsScene, type Account, type Preferences } from "../../components/scenes/settings-scene";
import { savedLook, useAvatar } from "../../data/avatar";
import { autoQuality, deviceSettings, useDeviceSettings, withVolume } from "../../data/settings";
import { useShowSkins } from "../../data/skins";
import { version } from "../../../package.json";
import { useAccount } from "../../wallet/wallet";
import { useConnectError } from "../connect-error";
import { useAppNavigate, useBack, useTabNavigate } from "../ref";

/**
 * `/settings` (P11a, sections 6.1 and 6.4). The device settings (`useDeviceSettings`: graphics quality, sound, music, tile
 * preview, placement highlight) and the viewer's switch for the other players' skins (`useShowSkins`) are kept on this device;
 * the board reads the same stores, so a change applies to an open board. The account is the wallet's (`useWallet`): the
 * username, or the short address, and the saved look, with Disconnect (then Home, `?ref=` kept) or Connect for a guest, and Reset (a new key and account on this device, for testing: #918). The two volume sliders (music, sound effects) keep the volume and the level before a mute (`withVolume`). The data layer's types are the chain-free ones (no value import of
 * `@paved/chain` in this chunk).
 */
export default function Page() {
  const go = useAppNavigate();
  const onNavigate = useTabNavigate();
  const onBack = useBack();
  const wallet = useAccount();
  useConnectError(wallet.error);
  const [settings, set] = useDeviceSettings();
  const [showSkins, setShowSkins] = useShowSkins();

  const look = savedLook(useAvatar(wallet.address).data);
  const account: Account | null = wallet.address ? { address: wallet.address, name: wallet.username, look } : null;
  const preferences: Preferences = { ...settings, showSkins };

  return (
    <SettingsScene
      preferences={preferences}
      account={account}
      autoQuality={autoQuality()}
      connecting={wallet.status === "connecting" || wallet.status === "restoring"}
      version={version}
      onVolumeChange={(channel, volume) => deviceSettings.set(withVolume(deviceSettings.get(), channel, volume))}
      onChange={(key, value) => (key === "showSkins" ? setShowSkins(value as boolean) : set(key, value as never))}
      onConnect={() => void wallet.connect()}
      onDisconnect={() => {
        wallet.disconnect();
        go("/", { replace: true });
      }}
      onReset={() => void wallet.reset()}
      onOpenTheme={() => go("/settings/theme")}
      onOpenReferral={() => go("/referral")}
      onOpenCredits={() => go("/settings/credits")}
      onBack={onBack}
      onNavigate={onNavigate}
    />
  );
}

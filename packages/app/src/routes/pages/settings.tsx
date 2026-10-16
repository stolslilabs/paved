import { SettingsScene, type Account, type Preferences } from "../../components/scenes/settings-scene";
import { autoQuality, useDeviceSettings } from "../../data/settings";
import { useDeviceTheme, useShowSkins } from "../../data/skins";
import pkg from "../../../package.json";
import { useAccount } from "../../wallet/wallet";
import { useConnectError } from "../connect-error";
import { useAppNavigate, useTabNavigate } from "../ref";

/**
 * `/settings` (P11a, sections 6.1 and 6.4). The device settings (`useDeviceSettings`: graphics quality, sound, music, tile
 * preview, placement highlight) and the viewer's skins switch (`useShowSkins`, the theme's store) are kept on this device;
 * the board reads the same stores, so a change applies to an open board. The account is the wallet's (`useWallet`): the
 * controller username, or the short address, with Disconnect (then Home, `?ref=` kept) or Connect for a guest. Sound and
 * music are stored only: the app plays no audio yet. The data layer's types are the chain-free ones (no value import of
 * `@paved/chain` in this chunk).
 */
export default function Page() {
  const go = useAppNavigate();
  const onNavigate = useTabNavigate();
  const wallet = useAccount();
  useConnectError(wallet.error);
  const [settings, set] = useDeviceSettings();
  const [showSkins, setShowSkins] = useShowSkins();
  const [theme] = useDeviceTheme();

  const account: Account | null = wallet.address ? { address: wallet.address, name: wallet.username } : null;
  const preferences: Preferences = { ...settings, showSkins };

  return (
    <SettingsScene
      preferences={preferences}
      account={account}
      theme={theme}
      autoQuality={autoQuality()}
      connecting={wallet.status === "connecting" || wallet.status === "restoring"}
      version={pkg.version}
      onChange={(key, value) => (key === "showSkins" ? setShowSkins(value as boolean) : set(key, value as never))}
      onConnect={() => void wallet.connect()}
      onDisconnect={() => {
        wallet.disconnect();
        go("/", { replace: true });
      }}
      onOpenTheme={() => go("/settings/theme")}
      onOpenReferral={() => go("/referral")}
      onNavigate={onNavigate}
    />
  );
}

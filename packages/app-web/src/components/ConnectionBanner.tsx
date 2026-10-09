import { usePaved } from "@paved/chain";
import { useWallet } from "./WalletProvider";

const short = (address: string) => (address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address);

/**
 * Says why writes are not offered: the deployment is incomplete, or no account plays. Outside
 * devnet it holds the controller's "Connect" button, and once connected its account and "Disconnect".
 */
export function ConnectionBanner() {
  const { status, deployment, address, writing } = usePaved();
  const wallet = useWallet();
  const controller = wallet?.signer === "controller";

  if (status === "ready") {
    if (!controller || !address) return null;
    return (
      <div role="status" style={{ background: "#1e293b", color: "#fff", padding: "8px 12px", fontSize: 14 }}>
        Signed in with Cartridge Controller ({short(address)}).{" "}
        {/* Not while a write is in flight: its receipt would arrive for an account the player left. */}
        <button type="button" onClick={wallet.disconnect} disabled={writing}>
          Disconnect
        </button>
        {wallet.error && <span> {wallet.error}</span>}
        <div style={{ fontSize: 12, opacity: 0.7 }}>Cartridge Controller is the copyright of Cartridge Gaming Company.</div>
      </div>
    );
  }

  const text =
    status === "not-configured"
      ? `Not connected to ${deployment.network}: ${deployment.missing.join(", ")} missing. ` +
        "Set them in contracts/deployments/<network>.json or the VITE_* variables."
      : controller
        ? "Read only: connect to play."
        : "Read only: no playing account (set VITE_PLAYER_ADDRESS and VITE_PLAYER_PRIVATE_KEY).";
  return (
    <div role="alert" style={{ background: status === "not-configured" ? "#7f1d1d" : "#78350f", color: "#fff", padding: "8px 12px", fontSize: 14 }}>
      {text}
      {status === "read-only" && controller && (
        <>
          {" "}
          <button type="button" onClick={wallet.connect} disabled={wallet.connecting}>
            {wallet.connecting ? "Connecting..." : "Connect"}
          </button>
          {wallet.error && <span> {wallet.error}</span>}
        </>
      )}
    </div>
  );
}

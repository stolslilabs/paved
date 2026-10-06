import { usePaved } from "@paved/chain";

/** Says why writes are not offered: the deployment is incomplete, or no account plays. */
export function ConnectionBanner() {
  const { status, deployment } = usePaved();
  if (status === "ready") return null;
  const text =
    status === "not-configured"
      ? `Not connected to ${deployment.network}: ${deployment.missing.join(", ")} missing. ` +
        "Set them in contracts/deployments/<network>.json or the VITE_* variables."
      : "Read only: no playing account (set VITE_PLAYER_ADDRESS and VITE_PLAYER_PRIVATE_KEY).";
  return (
    <div role="alert" style={{ background: status === "not-configured" ? "#7f1d1d" : "#78350f", color: "#fff", padding: "8px 12px", fontSize: 14 }}>
      {text}
    </div>
  );
}

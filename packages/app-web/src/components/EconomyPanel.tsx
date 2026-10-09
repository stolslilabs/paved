import { Link } from "react-router-dom";
import type { EconomyState } from "../utils/economy-context";
import { EconomyReferral } from "./EconomyReferral";
import { EconomySettle } from "./EconomySettle";
import { EconomyVault } from "./EconomyVault";
import { panel, warning } from "./EconomyStyles";

/**
 * The landing's economy panels: referral link, Vault, after the day. Until the economy is deployed (CORE's E2/E3) it
 * says so and reads nothing.
 */
export function EconomyPanel({
  economy,
  address,
  origin,
  write,
  busy,
}: {
  economy: EconomyState;
  address: string | null;
  origin: string;
  write: (fn: () => Promise<unknown>, after: Array<() => void>) => void;
  busy: boolean;
}) {
  const { client, writer, deployment } = economy;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }} aria-label="Economy">
      {!client ? (
        <div style={panel}>
          <strong>Paid Daily (USDC)</strong>
          <span>{`Not deployed on ${deployment.base.network}: ${deployment.missing.join(", ")}.`}</span>
        </div>
      ) : (
        <>
          <EconomyVault client={client} writer={writer} address={address} write={write} busy={busy} />
          <EconomySettle client={client} writer={writer} address={address} write={write} busy={busy} now={economy.now} />
        </>
      )}
      <EconomyReferral address={address} origin={origin} />
      <Link to="/economy" style={{ color: "#f59e0b", fontSize: 13 }}>Open the economy page</Link>
    </div>
  );
}

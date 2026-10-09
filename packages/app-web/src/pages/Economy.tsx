import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { usePaved } from "@paved/chain";
import { EconomyPurchase } from "../components/EconomyPurchase";
import { EconomyReferral } from "../components/EconomyReferral";
import { EconomySettle } from "../components/EconomySettle";
import { EconomyVault } from "../components/EconomyVault";
import { alert, panel } from "../components/EconomyStyles";
import { useEconomy } from "../utils/economy-context";
import { purchaseIntent } from "../utils/economy-start";
import { referrerFromSearch } from "../utils/economy-view";
import { buildGameRoute } from "../utils/mode-routing";

const page = { minHeight: "100%", background: "#0a0a0a", color: "#f5f5f5", padding: 24, display: "flex", flexDirection: "column", gap: 12, maxWidth: 960, margin: "0 auto", boxSizing: "border-box" } as const;

/**
 * The economy as a page (P8): the paid Daily's purchase, the Vault and the after-the-day settlement. The Landing keeps
 * its own entry points; this page shows the same panels together. The purchase is only confirmed here: the game page
 * sends it from the history state, as from the Landing.
 */
export function EconomyPage() {
  const navigate = useNavigate();
  const { status, address } = usePaved();
  const economy = useEconomy();
  const [searchParams] = useSearchParams();
  const referrer = referrerFromSearch(searchParams);
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const { client, writer, deployment } = economy;

  const write = async (fn: () => Promise<unknown>, after: Array<() => void>) => {
    if (writing) return;
    setWriting(true);
    setWriteError(null);
    try {
      await fn();
      after.forEach((refresh) => refresh());
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : String(error));
    } finally {
      setWriting(false);
    }
  };

  return (
    <div style={page} aria-label="Economy page">
      <Link to="/" style={{ color: "#f59e0b" }}>Back</Link>
      <h2 style={{ margin: 0 }}>Economy</h2>
      {!client ? (
        <div style={panel}>
          <strong>Paid Daily (USDC)</strong>
          <span>{`Not deployed on ${deployment.base.network}: ${deployment.missing.join(", ")}.`}</span>
        </div>
      ) : (
        <>
          <div style={panel}>
            <strong>Paid Daily</strong>
            <EconomyPurchase
              client={client}
              address={address}
              ready={status === "ready" && writer !== null}
              referrer={referrer}
              onConfirm={(stake, confirmedPrice, ref) => navigate(buildGameRoute({ mode: "daily" }), { state: purchaseIntent(stake, confirmedPrice, ref) })}
            />
          </div>
          {writeError && <span role="alert" style={alert}>{writeError}</span>}
          <EconomyVault client={client} writer={writer} address={address} write={write} busy={writing} />
          <EconomySettle client={client} writer={writer} address={address} write={write} busy={writing} now={economy.now} />
        </>
      )}
      <EconomyReferral address={address} origin={window.location.origin} />
    </div>
  );
}

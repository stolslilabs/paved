import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { usePaved, type WriteResult } from "@paved/chain";
import { useWallet } from "../components/WalletProvider";

/** The task the claim credits: `TUTORIAL_FINISHED` (quests.md), which completes First Stone (achievement 1). */
export const TUTORIAL_TASK = 10;

/**
 * The outcome of one `Setup.claim_tutorial()`. The call is idempotent (D-21, P-49): the first one emits
 * `AchievementProgressed { task 10, count 1 }` from Setup; a later one has no effect, no revert and no event. So the
 * receipt tells them apart: the event is a claim, its absence a claim made before.
 */
export function claimOutcome(result: WriteResult): "claimed" | "already-claimed" {
  const credited = result.events.some((e) => e.name === "AchievementProgressed" && Number(e.fields.taskId) === TUTORIAL_TASK);
  return credited ? "claimed" : "already-claimed";
}

type ClaimState =
  | { kind: "idle" }
  | { kind: "claiming" }
  | { kind: "claimed" | "already-claimed"; transactionHash: string }
  | { kind: "refused"; reason: string };

const panel = { maxWidth: 480, margin: "48px auto", padding: 24, display: "flex", flexDirection: "column", gap: 12 } as const;
const linkStyle = { color: "#f5f5f5" };

/**
 * `/tutorial/claim`: the tutorial's achievement, First Stone, claimed on chain with one `Setup.claim_tutorial()`. A chain
 * route (inside the app's `Chain` boundary), unlike `/tutorial`, which builds no chain client. Nothing checks on chain
 * that the tutorial was played (P-49 (2)): the claim is the player's word.
 */
export function TutorialClaimPage() {
  const { status, writer, deployment } = usePaved();
  const wallet = useWallet();
  const [state, setState] = useState<ClaimState>({ kind: "idle" });
  const sent = useRef(false);

  const claim = () => {
    if (!writer || sent.current) return;
    sent.current = true;
    setState({ kind: "claiming" });
    writer.claimTutorial().then(
      (result) => setState({ kind: claimOutcome(result), transactionHash: result.transactionHash }),
      (error) => {
        // A refused claim may be tried again: nothing was credited.
        sent.current = false;
        setState({ kind: "refused", reason: error instanceof Error ? error.message : String(error) });
      },
    );
  };

  let body: ReactNode;
  if (status === "not-configured" || !deployment.addresses.Setup) {
    body = (
      <p role="status" data-testid="claim-unavailable">
        The claim is not available on this network: it has no Setup contract.
      </p>
    );
  } else if (!writer) {
    const canConnect = wallet?.signer === "controller";
    body = (
      <div data-testid="claim-no-wallet" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <p role="status" style={{ margin: 0 }}>
          No wallet is connected. Connect one to claim First Stone.
        </p>
        {canConnect && (
          <div>
            <button type="button" onClick={wallet.connect} disabled={wallet.connecting}>
              {wallet.connecting ? "Connecting..." : "Connect"}
            </button>
            {wallet.error && <span> {wallet.error}</span>}
          </div>
        )}
      </div>
    );
  } else if (state.kind === "claimed") {
    body = (
      <p role="status" data-testid="claim-claimed">
        Claimed: First Stone is yours.
      </p>
    );
  } else if (state.kind === "already-claimed") {
    body = (
      <p role="status" data-testid="claim-already">
        Already claimed: this account had First Stone before. A claim counts once, so this one changed nothing.
      </p>
    );
  } else {
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <button type="button" onClick={claim} disabled={state.kind === "claiming"} data-testid="claim-button">
            {state.kind === "claiming" ? "Claiming..." : "Claim First Stone"}
          </button>
        </div>
        {state.kind === "refused" && (
          <p role="alert" data-testid="claim-refused" style={{ margin: 0, color: "#fca5a5" }}>
            {`The claim was refused: ${state.reason}`}
          </p>
        )}
      </div>
    );
  }

  return (
    <main style={panel}>
      <h1 style={{ margin: 0 }}>Claim your achievement</h1>
      <p style={{ margin: 0 }}>Finishing the tutorial earns First Stone. Claiming it records it for your account, once.</p>
      {body}
      <div style={{ display: "flex", gap: 12 }}>
        <Link to="/quests" style={linkStyle}>
          Quests
        </Link>
        <Link to="/" style={linkStyle}>
          Landing
        </Link>
      </div>
    </main>
  );
}

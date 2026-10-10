import { useState } from "react";
import type { Rank } from "@paved/chain";
import { parseTokenAmount, tokenLabel } from "../utils/landing-helpers";

export interface Claimable {
  tournamentId: number;
  rank: Rank;
  reward: bigint;
}

/** A day nobody ranked in, where this account may take its part of the prize back (P-37). */
export interface Reclaimable {
  tournamentId: number;
  /** The part to take back: the account's `Sponsored` events less its `Reclaimed` ones. */
  amount: bigint;
  /** What went back to every sponsor of that day so far, from the `Reclaimed` events (the day's `prize` keeps the total). */
  returned: bigint;
}

const panel = { background: "rgba(0,0,0,0.75)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column" as const, gap: 8, color: "#f5f5f5", fontSize: 13 };
const button = { border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.08)", color: "#fff", borderRadius: 8, padding: "6px 10px", cursor: "pointer" };
const confirmButton = { ...button, background: "#f59e0b", color: "#0a0a0a", border: "none" };

type Pending = { kind: "claim"; claim: Claimable } | { kind: "reclaim"; reclaim: Reclaimable } | { kind: "sponsor"; amount: bigint };

/**
 * Prizes to claim and the sponsor form. Every action that moves tokens takes two clicks: the first
 * shows the amount and asks, only "Confirm" calls out, and the amount is read again at that click
 * (the typed sponsor amount, the claim's reward) and handed over with what the player confirmed,
 * so that the writer can refuse a difference.
 */
export function PrizePanel({
  decimals,
  claimables,
  reclaimables = [],
  busy,
  error,
  onClaim,
  onReclaim = () => {},
  onSponsor,
}: {
  decimals: number | null;
  claimables: Claimable[];
  /** Days nobody ranked in where the account sponsored: its part is taken back, never a rank's reward. */
  reclaimables?: Reclaimable[];
  busy: boolean;
  error: string | null;
  onClaim: (claim: Claimable, confirmedReward: bigint) => void;
  onReclaim?: (reclaim: Reclaimable, confirmedAmount: bigint) => void;
  onSponsor: (amount: bigint, confirmedAmount: bigint) => void;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState("");
  const typed = parseTokenAmount(text, decimals);

  const confirm = () => {
    if (!pending || busy) return;
    if (pending.kind === "claim") {
      setPending(null);
      onClaim(pending.claim, pending.claim.reward);
    } else if (pending.kind === "reclaim") {
      setPending(null);
      onReclaim(pending.reclaim, pending.reclaim.amount);
    } else {
      // Read the field again: an edit after "Sponsor" is a different amount, which the writer refuses.
      const now = parseTokenAmount(text, decimals);
      setPending(null);
      if (now !== null) onSponsor(now, pending.amount);
    }
  };

  return (
    <div style={panel} aria-label="Prizes">
      {error && <div role="alert" style={{ color: "#fecaca" }}>{error}</div>}
      {claimables.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <strong>Prizes to claim</strong>
          {claimables.map((c) => (
            <div key={`${c.tournamentId}-${c.rank}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ flex: 1 }}>{`Tournament ${c.tournamentId}, rank ${c.rank}: ${tokenLabel(c.reward, decimals)}`}</span>
              <button type="button" style={button} disabled={busy || decimals === null} onClick={() => setPending({ kind: "claim", claim: c })}>
                Claim
              </button>
            </div>
          ))}
        </div>
      )}
      {reclaimables.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <strong>Prizes nobody ranked for</strong>
          {reclaimables.map((r) => (
            <div key={r.tournamentId} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ flex: 1 }}>
                {`Tournament ${r.tournamentId}: your part, ${tokenLabel(r.amount, decimals)}`}
                {r.returned > 0n ? ` (${tokenLabel(r.returned, decimals)} already went back to sponsors)` : ""}
              </span>
              <button type="button" style={button} disabled={busy || decimals === null} onClick={() => setPending({ kind: "reclaim", reclaim: r })}>
                Reclaim
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <strong>Sponsor today&apos;s prize</strong>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            aria-label="Sponsor amount"
            inputMode="decimal"
            placeholder="Amount"
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ flex: 1, background: "#111", color: "#fff", border: "1px solid #555", borderRadius: 6, padding: "4px 8px" }}
          />
          <button
            type="button"
            style={button}
            disabled={busy || typed === null}
            onClick={() => typed !== null && setPending({ kind: "sponsor", amount: typed })}
          >
            Sponsor
          </button>
        </div>
        {text !== "" && typed === null && <span style={{ color: "#fbbf24" }}>Enter a positive amount{decimals === null ? " (token decimals unknown)" : ""}</span>}
      </div>
      {pending && (
        <div role="dialog" aria-label="Confirm" style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid #444", paddingTop: 8 }}>
          <span>
            {pending.kind === "claim"
              ? `Claim ${tokenLabel(pending.claim.reward, decimals)} from tournament ${pending.claim.tournamentId} (rank ${pending.claim.rank})?`
              : pending.kind === "reclaim"
                ? `Take back ${tokenLabel(pending.reclaim.amount, decimals)}, your part of tournament ${pending.reclaim.tournamentId}'s prize? Nobody ranked in that day.`
                : `Pay ${tokenLabel(pending.amount, decimals)} into today's prize?`}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={confirmButton} disabled={busy} onClick={confirm}>
              {pending.kind === "claim" ? "Confirm claim" : pending.kind === "reclaim" ? "Confirm reclaim" : "Confirm sponsor"}
            </button>
            <button type="button" style={button} onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

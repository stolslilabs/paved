import { useState } from "react";
import { PAVED_DECIMALS, VaultAmountChangedError, parseUnits, useAsyncRead } from "@paved/chain";
import type { EconomyClient, EconomyWriter } from "@paved/chain";
import { paved, usdc } from "../utils/economy-view";
import { button, confirmButton, input, panel, warning } from "./EconomyStyles";

type Pending = { kind: "stake" | "unstake"; amount: bigint } | { kind: "claim"; amount: bigint };

/**
 * The Vault: PAVED staked, USDC dividends. Every write takes two clicks: the first shows the amount, only "Confirm"
 * sends, with the amount read again at that click and handed over with what the player confirmed.
 */
export function EconomyVault({
  client,
  writer,
  address,
  write,
  busy,
}: {
  client: EconomyClient;
  writer: EconomyWriter | null;
  address: string | null;
  /** Runs a write and refreshes after it (the landing's write wrapper). */
  write: (fn: () => Promise<unknown>, after: Array<() => void>) => void;
  busy: boolean;
}) {
  const position = useAsyncRead(address ? () => client.views.vault(address) : null, [client, address], { onVisible: true });
  const balance = useAsyncRead(address ? () => client.views.pavedBalance(address) : null, [client, address], { onVisible: true });
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  // The dividends grew between the confirm and the send: say so and ask again with the new amount.
  const [changed, setChanged] = useState<string | null>(null);
  const typed = parseUnits(text, PAVED_DECIMALS);
  const refresh = [position.refresh, balance.refresh];
  const failed = position.error ?? balance.error;

  const confirm = () => {
    if (!pending || !writer || busy) return;
    setPending(null);
    setChanged(null);
    if (pending.kind === "claim") {
      return write(async () => {
        try {
          await writer.claimDividends({ confirmedAmount: pending.amount });
        } catch (error) {
          if (!(error instanceof VaultAmountChangedError)) throw error;
          // Nothing was sent: a new confirm with the amount the chain has now, not a bare error.
          setChanged(`Your dividends changed from ${usdc(error.confirmed)} to ${usdc(error.current)}: confirm again`);
          setPending({ kind: "claim", amount: error.current });
        }
      }, refresh);
    }
    // The field again: an edit after the first click is another amount, which the writer refuses.
    const now = parseUnits(text, PAVED_DECIMALS) ?? 0n;
    const send = pending.kind === "stake" ? writer.stake.bind(writer) : writer.unstake.bind(writer);
    return write(() => send(now, { confirmedAmount: pending.amount }), refresh);
  };

  const p = position.data;
  return (
    <div style={panel} aria-label="Vault">
      <strong>Vault</strong>
      {!address && <span>Connect to stake.</span>}
      {failed && <span role="alert" style={warning}>{`Vault unavailable: ${failed}`}</span>}
      {p && (
        <>
          <span>{`Staked: ${paved(p.staked)} of ${paved(p.totalStaked)}`}</span>
          <span>{`Dividends: ${usdc(p.pending)}`}</span>
        </>
      )}
      {balance.data !== null && <span>{`Wallet: ${paved(balance.data)}`}</span>}
      <div style={{ display: "flex", gap: 8 }}>
        <input aria-label="Vault amount" inputMode="decimal" placeholder="PAVED" value={text} onChange={(e) => setText(e.target.value)} style={input} />
        <button type="button" style={button} disabled={!writer || busy || typed === null || !!failed} onClick={() => typed && setPending({ kind: "stake", amount: typed })}>
          Stake
        </button>
        <button type="button" style={button} disabled={!writer || busy || typed === null || !!failed} onClick={() => typed && setPending({ kind: "unstake", amount: typed })}>
          Unstake
        </button>
      </div>
      <button
        type="button"
        style={button}
        disabled={!writer || busy || !p || p.pending === 0n || !!failed}
        onClick={() => p && setPending({ kind: "claim", amount: p.pending })}
      >
        Claim dividends
      </button>
      {changed && <span role="status" style={warning}>{changed}</span>}
      {pending && (
        <div role="dialog" aria-label="Confirm" style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid #444", paddingTop: 8 }}>
          <span>
            {pending.kind === "stake"
              ? `Stake ${paved(pending.amount)} in the Vault?`
              : pending.kind === "unstake"
                ? `Unstake ${paved(pending.amount)} from the Vault? Your dividends stay claimable.`
                : `Claim ${usdc(pending.amount)} of dividends?`}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={confirmButton} disabled={busy} onClick={confirm}>
              {pending.kind === "stake" ? "Confirm stake" : pending.kind === "unstake" ? "Confirm unstake" : "Confirm claim"}
            </button>
            <button
              type="button"
              style={button}
              onClick={() => {
                setPending(null);
                setChanged(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

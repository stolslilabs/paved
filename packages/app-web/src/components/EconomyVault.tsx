import { useState } from "react";
import { PAVED_DECIMALS, VaultAmountChangedError, VaultOverMaxWithdrawError, VaultZeroSharesError, parseUnits, useAsyncRead } from "@paved/chain";
import type { EconomyClient, EconomyWriter } from "@paved/chain";
import { exitFeeText, paved, vaultRateText, vpaved } from "../utils/economy-view";
import { button, confirmButton, input, panel, warning } from "./EconomyStyles";

/** A write waiting for its confirm, with the figures the first click read. */
type Pending =
  | { kind: "deposit"; amount: bigint; shares: bigint }
  | { kind: "withdraw"; amount: bigint; shares: bigint }
  | { kind: "withdrawAll"; shares: bigint; amount: bigint };

/**
 * The Vault (vPAVED, P-56): PAVED deposited for vPAVED, whose rate rises with every purchase's margin and every exit fee.
 * No claim: the rate is the only reward. Every write takes two clicks: the first reads the preview and shows it, only
 * "Confirm" sends, with the amount read again at that click and handed over with what the player confirmed. A withdraw
 * above `max_withdraw` is refused at the first click, and again by the writer: nothing is sent.
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
  // A refusal before any send (too small, above max_withdraw, a failed preview), or the vPAVED held that changed.
  const [notice, setNotice] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const typed = parseUnits(text, PAVED_DECIMALS);
  const refresh = [position.refresh, balance.refresh];
  const failed = position.error ?? balance.error;
  const p = position.data;

  const ask = async (kind: "deposit" | "withdraw") => {
    if (typed === null || previewing) return;
    setPending(null);
    setNotice(null);
    if (kind === "withdraw" && p && typed > p.maxWithdraw) {
      setNotice(new VaultOverMaxWithdrawError(p.maxWithdraw).message);
      return;
    }
    setPreviewing(true);
    try {
      const shares = kind === "deposit" ? await client.views.previewDeposit(typed) : await client.views.previewWithdraw(typed);
      if (kind === "deposit" && shares === 0n) setNotice(new VaultZeroSharesError().message);
      else setPending({ kind, amount: typed, shares });
    } catch (error) {
      setNotice(`Cannot read the Vault rate: ${error instanceof Error ? error.message : String(error)}. Nothing was sent.`);
    } finally {
      setPreviewing(false);
    }
  };

  const confirm = () => {
    if (!pending || !writer || busy) return;
    setPending(null);
    setNotice(null);
    if (pending.kind === "withdrawAll") {
      return write(async () => {
        try {
          await writer.withdrawAll({ confirmedShares: pending.shares });
        } catch (error) {
          if (!(error instanceof VaultAmountChangedError)) throw error;
          // Nothing was sent: the vPAVED held moved (a transfer in or out). Read again and confirm again.
          setNotice(`Your vPAVED changed from ${vpaved(error.confirmed)} to ${vpaved(error.current)}: confirm again`);
          position.refresh();
        }
      }, refresh);
    }
    // The field again: an edit after the first click is another amount, which the writer refuses.
    const now = parseUnits(text, PAVED_DECIMALS) ?? 0n;
    const send = pending.kind === "deposit" ? writer.deposit.bind(writer) : writer.withdraw.bind(writer);
    return write(() => send(now, { confirmedAmount: pending.amount }), refresh);
  };

  const disabled = !writer || busy || previewing || !!failed;
  return (
    <div style={panel} aria-label="Vault">
      <strong>Vault (vPAVED)</strong>
      {!address && <span>Connect to stake.</span>}
      {failed && <span role="alert" style={warning}>{`Vault unavailable: ${failed}`}</span>}
      {p && (
        <>
          <span>{`Your share: ${vpaved(p.shares)}, worth ${paved(p.value)}`}</span>
          <span>{`Withdrawable now: ${paved(p.maxWithdraw)}, after the exit fee`}</span>
          <span>{`Rate: ${vaultRateText(p.totalAssets, p.totalSupply)}`}</span>
          <span>{exitFeeText(p.exitFeeBps)}</span>
          <span style={{ opacity: 0.7 }}>The rate rises with every purchase's margin and every exit fee. There is nothing to claim.</span>
        </>
      )}
      {balance.data !== null && <span>{`Wallet: ${paved(balance.data)}`}</span>}
      <div style={{ display: "flex", gap: 8 }}>
        <input aria-label="Vault amount" inputMode="decimal" placeholder="PAVED" value={text} onChange={(e) => setText(e.target.value)} style={input} />
        <button type="button" style={button} disabled={disabled || typed === null} onClick={() => void ask("deposit")}>
          Deposit
        </button>
        <button type="button" style={button} disabled={disabled || typed === null || !p} onClick={() => void ask("withdraw")}>
          Withdraw
        </button>
      </div>
      <button
        type="button"
        style={button}
        disabled={disabled || !p || p.shares === 0n}
        onClick={() => {
          if (!p) return;
          setNotice(null);
          setPending({ kind: "withdrawAll", shares: p.shares, amount: p.maxWithdraw });
        }}
      >
        Withdraw all
      </button>
      {notice && <span role="status" style={warning}>{notice}</span>}
      {pending && p && (
        <div role="dialog" aria-label="Confirm" style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid #444", paddingTop: 8 }}>
          <span>
            {pending.kind === "deposit"
              ? `Deposit ${paved(pending.amount)} for about ${vpaved(pending.shares)}?`
              : pending.kind === "withdraw"
                ? `Withdraw ${paved(pending.amount)}? It uses about ${vpaved(pending.shares)}, the ${exitFeeText(p.exitFeeBps)} included.`
                : `Withdraw everything: ${vpaved(pending.shares)} for about ${paved(pending.amount)}, after the ${exitFeeText(p.exitFeeBps)}?`}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={confirmButton} disabled={busy} onClick={confirm}>
              {pending.kind === "deposit" ? "Confirm deposit" : "Confirm withdraw"}
            </button>
            <button
              type="button"
              style={button}
              onClick={() => {
                setPending(null);
                setNotice(null);
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

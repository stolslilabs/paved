import { useState } from "react";
import { errorDetail } from "../error-detail";
import { parseUnits, type VaultMode } from "../../components/containers/vault-form";
import { VaultScene, type VaultStatus } from "../../components/scenes/vault-scene";
import { usePavedBalance, useSplit, useVaultPosition } from "../../data/chain";
import { useDataSources } from "../../data/sources";
import { exactUnits, useVaultDelegate, useVaultPreview, useVaultWrites } from "../../data/vault";
import { useAccount } from "../../wallet/wallet";
import { useConnectError } from "../connect-error";
import { useAppNavigate, useTabNavigate } from "../ref";

/**
 * `/vault` (P10): the connected player's vPAVED on the Vault as it is on main, an OpenZeppelin ERC4626 over PAVED. The
 * position (`balance_of`, `convert_to_assets`, `max_withdraw`), its share of the Vault, the rate from `total_assets` and
 * `total_supply`, the exit fee, the delegate (read only) and the wallet's PAVED. The field is PAVED: read exactly as a bigint
 * of 18 decimals (`parseUnits`: digits, one point, at most 18 decimals; anything else is no amount), never a float. Deposit
 * previews `preview_deposit` and sends the approve of exactly the amount and `deposit` in one transaction (one wallet
 * prompt); Withdraw previews `preview_withdraw` with the exit fee on top and sends `withdraw(assets)`, the PAVED the player
 * typed; Withdraw all sends `redeem` of every vPAVED, its fee shown before. An exit sends only at the fee shown. A guest
 * connects; a failed read has Retry.
 */
export default function Page() {
  const go = useAppNavigate();
  const onNavigate = useTabNavigate();
  const wallet = useAccount();
  useConnectError(wallet.error);
  const { signer = null } = useDataSources();
  const account = signer?.address ?? null;
  const [mode, setMode] = useState<VaultMode>("deposit");
  const [amount, setAmount] = useState("");
  const position = useVaultPosition(account);
  const balance = usePavedBalance(account);
  const split = useSplit();
  const delegate = useVaultDelegate(account);
  const typed = parseUnits(amount, 18);
  const preview = useVaultPreview(mode, typed);
  const control = useVaultWrites(account);

  const failed = [position, balance].find((q) => q.error);
  const status: VaultStatus | null =
    account === null
      ? wallet.status === "restoring" || wallet.status === "connecting"
        ? { kind: "loading" }
        : { kind: "guest" }
      : failed
        ? { kind: "error", message: (failed.error as Error).message, detail: errorDetail(failed.error) }
        : position.data === undefined || balance.data === undefined
          ? { kind: "loading" }
          : null;

  const current = position.data ?? null;
  const fresh = () => control.reset();
  const sent = (ok: boolean) => {
    if (ok) setAmount("");
  };

  return (
    <VaultScene
      deployed={current !== null}
      status={status}
      position={current}
      balance={balance.data ?? 0n}
      split={split.data ?? null}
      delegate={delegate.isSuccess ? delegate.data : undefined}
      mode={mode}
      amount={amount}
      preview={preview.data ?? null}
      busy={control.busy}
      refused={control.refused}
      refusedDetail={control.refused ? errorDetail(control.refusedError ?? control.refused) : undefined}
      done={control.done}
      onModeChange={(m) => {
        fresh();
        setMode(m);
        setAmount("");
      }}
      onAmountChange={(text) => {
        fresh();
        setAmount(text);
      }}
      onMax={() => {
        fresh();
        setAmount(exactUnits(mode === "deposit" ? (balance.data ?? 0n) : (current?.maxWithdraw ?? 0n)));
      }}
      onDeposit={() => {
        if (typed !== null && typed > 0n) void control.send({ kind: "deposit", amount: typed }).then(sent);
      }}
      onWithdraw={() => {
        if (typed !== null && typed > 0n && current) void control.send({ kind: "withdraw", amount: typed, exitFeeBps: current.exitFeeBps }).then(sent);
      }}
      onWithdrawAll={() => {
        if (current && current.shares > 0n) void control.send({ kind: "withdrawAll", shares: current.shares, exitFeeBps: current.exitFeeBps }).then(sent);
      }}
      onConnect={() => void wallet.connect()}
      onRetry={() => {
        void position.refetch();
        void balance.refetch();
      }}
      onPlay={() => go("/play")}
      onNavigate={onNavigate}
    />
  );
}

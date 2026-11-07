import { useCallback, useState } from "react";
import { useSearchParams } from "react-router";
import { errorDetail, useErrorDetail } from "../error-detail";
import { limitOf, opOf, parseUnits, type VaultTab, type VaultUnit } from "../../components/containers/vault-form";
import { VaultScene, type VaultStatus } from "../../components/scenes/vault-scene";
import { useGuardRate, usePavedBalance, useSplit, useVaultPosition } from "../../data/chain";
import { useDataSources } from "../../data/sources";
import { exactUnits, useVaultPreview, useVaultWrites } from "../../data/vault";
import { useAccount } from "../../wallet/wallet";
import { useConnectError } from "../connect-error";
import { useDrawerRoute } from "../drawer-route";
import { useAppNavigate, useBack } from "../ref";

/** The footer's tab from the URL (`?tab=deposit`, `?tab=withdraw`); the Position, the first, when absent or unknown. */
const tabOf = (value: string | null): VaultTab => (value === "deposit" || value === "withdraw" ? value : "position");

/**
 * `/vault` (P10; VAULT-PAGE: the HUD's drawer over the home, `PageDef.drawer`): the connected player's vPAVED on the Vault as it is on
 * main, an OpenZeppelin ERC4626 over PAVED. The position (`balance_of`, `convert_to_assets`, `max_withdraw`), its share of the Vault and
 * the supply, the rate from `total_assets` and `total_supply`, the exit fee, the wallet's PAVED, and the guard's rate (`Economy.rate()`,
 * the Challenge's) for the dollar figures. The footer's tab is the URL's (`?tab=withdraw`, replaced, so Back leaves the drawer). The
 * field is PAVED or vPAVED (the book's unit switch, the page's state, back to PAVED on a tab's change): read exactly as a bigint of 18
 * decimals (`parseUnits`: digits, one point, at most 18 decimals; anything else is no amount), never a float. Deposit previews
 * `preview_deposit` and sends the approve of exactly the amount and `deposit` in one transaction (one wallet prompt); Mint previews
 * `preview_mint` and sends the approve of what it takes and `mint(shares)`; Withdraw previews `preview_withdraw` with the exit fee on
 * top and sends `withdraw(assets)`, the PAVED the player typed; Redeem previews `preview_redeem`, the fee taken, and sends
 * `redeem(shares)`; Withdraw all sends `redeem` of every vPAVED, its fee shown before. An exit sends only at the fee shown. Every player
 * has an account (the owner's ruling of 2026-11-07): until it is read, the page shows its loading; a failed read has Retry. The delegate (`Vault.delegates`) is no longer read: delegation is not in the app.
 */
export default function Page() {
  const go = useAppNavigate();
  const drawer = useDrawerRoute();
  const back = useBack();
  const onBack = drawer?.onClose ?? back;
  const wallet = useAccount();
  useConnectError(wallet.error);
  const { signer = null } = useDataSources();
  const account = signer?.address ?? null;
  const [params, setParams] = useSearchParams();
  const mode = tabOf(params.get("tab"));
  const [unit, setUnit] = useState<VaultUnit>("paved");
  // The Position sends nothing: a deposit's op stands for it (no amount is typed there, so nothing is previewed).
  const op = opOf(mode === "position" ? "deposit" : mode, unit);
  const [amount, setAmount] = useState("");
  const position = useVaultPosition(account);
  const balance = usePavedBalance(account);
  const split = useSplit();
  const guard = useGuardRate();
  const typed = parseUnits(amount, 18);
  const preview = useVaultPreview(op, typed);
  // A quote that failed (and is not being read again): the action stays held, the error has Retry (VAULT-QUOTE-GATE).
  const quoteFailed = preview.error && !preview.isFetching ? preview.error : null;
  const quoteDetail = useErrorDetail(quoteFailed);
  // The quote the action may send at: none while the query holds an error, even with an older quote kept and its retry on its way
  // (TanStack keeps both the last data and the error until a read succeeds), so the action stays held until a fresh one is shown.
  const usableQuote = preview.error ? null : (preview.data ?? null);
  const control = useVaultWrites(account);
  const refusedDetail = useErrorDetail(control.refused ? (control.refusedError ?? control.refused) : null);

  const failed = [position, balance].find((q) => q.error);
  // No account yet (restoring, connecting, or the app's own connect on its way): the page's loading, never a guest's Connect.
  const status: VaultStatus | null =
    account === null
      ? { kind: "loading" }
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
  // Radix's tabs call it twice on a press: the second finds the URL already there.
  const setMode = useCallback(
    (next: VaultTab) =>
      setParams(
        (p) => {
          const q = new URLSearchParams(p);
          if (next === "position") q.delete("tab");
          else q.set("tab", next);
          return q;
        },
        { replace: true },
      ),
    [setParams],
  );

  return (
    <VaultScene
      deployed={current !== null}
      status={status}
      position={current}
      balance={balance.data ?? 0n}
      split={split.data ?? null}
      guardRate={guard.data ?? null}
      mode={mode}
      unit={unit}
      amount={amount}
      preview={usableQuote}
      previewError={quoteFailed ? (quoteFailed as Error).message : null}
      previewErrorDetail={quoteDetail}
      onRetryPreview={() => void preview.refetch()}
      busy={control.busy}
      refused={control.refused}
      refusedDetail={refusedDetail}
      done={control.done}
      open={drawer?.open ?? true}
      returnFocus={drawer?.returnFocus}
      onModeChange={(m) => {
        if (m === mode) return;
        fresh();
        setMode(m);
        setUnit("paved");
        setAmount("");
      }}
      onUnitChange={(u) => {
        fresh();
        setUnit(u);
        setAmount("");
      }}
      onAmountChange={(text) => {
        fresh();
        setAmount(text);
      }}
      onMax={() => {
        fresh();
        if (current) setAmount(exactUnits(limitOf(op, { ...current, balance: balance.data ?? 0n })));
      }}
      onDeposit={() => {
        if (typed !== null && typed > 0n) void control.send({ kind: "deposit", amount: typed }).then(sent);
      }}
      onMint={() => {
        if (typed !== null && typed > 0n) void control.send({ kind: "mint", shares: typed }).then(sent);
      }}
      onRedeem={() => {
        if (typed !== null && typed > 0n && current) void control.send({ kind: "redeem", shares: typed, exitFeeBps: current.exitFeeBps }).then(sent);
      }}
      onWithdraw={() => {
        if (typed !== null && typed > 0n && current) void control.send({ kind: "withdraw", amount: typed, exitFeeBps: current.exitFeeBps }).then(sent);
      }}
      onWithdrawAll={() => {
        if (current && current.shares > 0n) void control.send({ kind: "withdrawAll", shares: current.shares, exitFeeBps: current.exitFeeBps }).then(sent);
      }}
      onRetry={() => {
        void position.refetch();
        void balance.refetch();
      }}
      onPlay={() => go("/play")}
      onBack={onBack}
    />
  );
}

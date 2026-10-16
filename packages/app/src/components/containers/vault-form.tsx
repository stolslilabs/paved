import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Amount, formatUnits, TOKENS } from "../elements/amount";
import { Notice } from "../elements/notice";
import { formatBps } from "./split-bar";

/**
 * A typed amount to base units, or null when it is not one (empty, a letter, a sign, an exponent, too many decimals).
 * Exact: digits, at most one point, then at most `decimals` digits, read as a bigint; never a float. `@paved/chain`'s
 * `parseUnits`, restated so the scenes import only its types.
 */
export function parseUnits(text: string, decimals: number): bigint | null {
  const t = text.trim();
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(t)) return null;
  const [whole = "", fraction = ""] = t.split(".");
  if (fraction.length > decimals) return null;
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}

const BPS = 10_000n;
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

/**
 * The exit fee of a `withdraw` of `assets`, on top of it, rounded up as the Vault rounds it: `ceil(a x fee / 10,000)`.
 * `@paved/chain`'s `withdrawFee`, restated so the scenes import only its types (a test holds them equal).
 */
export function withdrawFee(assets: bigint, exitFeeBps: number): bigint {
  return ceilDiv(assets * BigInt(exitFeeBps), BPS);
}

export type VaultMode = "deposit" | "withdraw";

/** A write of the Vault on its way: the deposit (one prompt for its approve and the deposit), a withdraw, or the exit of every vPAVED. */
export type VaultBusy = "deposit" | "withdraw" | "withdrawAll";

/** What the last write did, from its receipt's `Deposit` or `Withdraw`: the PAVED in or out, the vPAVED minted or burned. */
export interface VaultDone {
  kind: "deposit" | "withdraw";
  assets: bigint;
  shares: bigint;
}

export interface VaultFormProps {
  mode: VaultMode;
  /** The amount typed, in PAVED. */
  amount: string;
  /** PAVED in the wallet (`balance_of`), what a deposit can take. */
  balance: bigint;
  /** vPAVED held. */
  shares: bigint;
  /** The vPAVED's PAVED at the rate, before the exit fee (`convert_to_assets`): with `maxWithdraw`, the fee of Withdraw all. */
  value?: bigint;
  /** `max_withdraw`: the most PAVED a withdraw pays now, the exit fee taken. */
  maxWithdraw: bigint;
  exitFeeBps: number;
  /** `preview_deposit` or `preview_withdraw` of the typed amount: the vPAVED minted or burned. Null until read. */
  preview: bigint | null;
  /** The write on its way. */
  busy?: VaultBusy | null;
  /** The last write's refusal, the writer's message (a typed error of `@paved/chain`). */
  refused?: string | null;
  /** The last write went through. */
  done?: VaultDone | null;
  onModeChange?: (mode: VaultMode) => void;
  onAmountChange?: (amount: string) => void;
  /** Fills the field with the wallet's PAVED (deposit) or `max_withdraw` (withdraw). */
  onMax?: () => void;
  onDeposit?: () => void;
  onWithdraw?: () => void;
  onWithdrawAll?: () => void;
  className?: string;
}

const tile = TOKENS.paved;
const shown = (value: bigint) => `${formatUnits(value, tile.decimals, tile.fraction)} ${tile.symbol}`;

/** The button's label while a write is on its way; one wallet prompt each (a deposit's approve and deposit are one transaction). */
const BUSY_TEXT = "Confirm in your wallet…";

/** The line under the buttons while a write is on its way: what the wallet asks for. */
const BUSY_LINE: Record<VaultBusy, string> = {
  deposit: "Approve and deposit in your wallet: one transaction for both.",
  withdraw: "Confirm the withdraw in your wallet.",
  withdrawAll: "Confirm the withdrawal of every vPAVED in your wallet.",
};

/**
 * Deposit PAVED for vPAVED, or withdraw: the field, Max, the preview, the button; Withdraw all redeems every share. The exit
 * fee is shown before an exit is sent: on top of a withdraw (`withdrawFee`), inside Withdraw all (its value less
 * `max_withdraw`). Refuses before any send what the contract would refuse: a deposit above the wallet, a withdraw above
 * `max_withdraw`.
 */
export function VaultForm(props: VaultFormProps) {
  const { mode, amount, balance, shares, maxWithdraw, exitFeeBps, preview, busy, className } = props;
  const typed = parseUnits(amount, tile.decimals);
  const limit = mode === "deposit" ? balance : maxWithdraw;
  const over = typed !== null && typed > limit;
  const empty = typed === null || typed === 0n;
  const working = busy != null;
  const fee = mode === "withdraw" && !empty && !over ? withdrawFee(typed, exitFeeBps) : null;
  const allFee = props.value !== undefined && props.value >= maxWithdraw ? props.value - maxWithdraw : null;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Tabs value={mode} onValueChange={(v) => props.onModeChange?.(v as VaultMode)}>
        <TabsList className="w-full">
          <TabsTrigger value="deposit" className="flex-1" disabled={working}>Deposit</TabsTrigger>
          <TabsTrigger value="withdraw" className="flex-1" disabled={working}>Withdraw</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className={cn("flex items-center gap-2 rounded-lg border bg-secondary/60 p-1.5 pl-3", over ? "border-destructive-text" : "border-input")}>
        <input
          aria-label={mode === "deposit" ? "Amount to deposit" : "Amount to withdraw"}
          aria-invalid={over || undefined}
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          disabled={working}
          onChange={(e) => props.onAmountChange?.(e.target.value)}
          className="numeric min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none placeholder:text-muted-foreground"
        />
        <span className="text-sm text-muted-foreground">{tile.symbol}</span>
        <Button size="sm" variant="secondary" onClick={props.onMax} disabled={working || limit === 0n}>Max</Button>
      </div>

      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          {mode === "deposit" ? "Wallet " : "Withdrawable "}
          <Amount value={limit} token="paved" />
        </span>
        {!empty && !over && preview !== null && (
          <span>
            {mode === "deposit" ? "You get about " : "Uses about "}
            <Amount value={preview} token="vpaved" />
          </span>
        )}
      </div>

      {fee !== null && (
        <dl aria-label="Before you withdraw" className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-lg bg-secondary/60 px-3 py-2 text-xs">
          <dt className="text-muted-foreground">You receive</dt>
          <dd className="text-right"><Amount value={typed as bigint} token="paved" /></dd>
          <dt className="text-muted-foreground">Exit fee, <span className="numeric">{formatBps(exitFeeBps)}</span>, on top</dt>
          <dd className="text-right" data-testid="withdraw-fee"><Amount value={fee} token="paved" /></dd>
        </dl>
      )}

      {over && (
        <Notice tone="danger" title={mode === "deposit" ? "Not enough PAVED" : "Over max_withdraw"}>
          {mode === "deposit"
            ? `More than your wallet holds: at most ${formatUnits(balance, tile.decimals, tile.fraction)} PAVED. Nothing was sent.`
            : `More than you can withdraw: at most ${formatUnits(maxWithdraw, tile.decimals, tile.fraction)} PAVED now, the exit fee taken. Nothing was sent.`}
        </Notice>
      )}

      {props.refused && !working && (
        <Notice tone="danger" title={mode === "deposit" ? "Deposit refused" : "Withdraw refused"}>
          {props.refused}
        </Notice>
      )}
      {props.done && !working && (
        <Notice icon="circle-check" title={props.done.kind === "deposit" ? "Deposited" : "Withdrawn"}>
          {props.done.kind === "deposit"
            ? `${shown(props.done.assets)} in the Vault for ${formatUnits(props.done.shares, 18, 2)} vPAVED.`
            : `${shown(props.done.assets)} sent to your wallet; ${formatUnits(props.done.shares, 18, 2)} vPAVED burned.`}
        </Notice>
      )}

      {mode === "deposit" ? (
        <Button size="lg" onClick={props.onDeposit} disabled={empty || over || working} loading={busy === "deposit"}>
          {busy === "deposit" ? BUSY_TEXT : "Deposit"}
        </Button>
      ) : (
        <div className="grid grid-cols-1 gap-2 tablet:grid-cols-2">
          <Button size="lg" onClick={props.onWithdraw} disabled={empty || over || working} loading={busy === "withdraw"}>
            {busy === "withdraw" ? BUSY_TEXT : "Withdraw"}
          </Button>
          <Button size="lg" variant="outline" onClick={props.onWithdrawAll} disabled={shares === 0n || working} loading={busy === "withdrawAll"}>
            <Icon name="arrow-right-from-bracket" size="sm" />
            {busy === "withdrawAll" ? BUSY_TEXT : "Withdraw all"}
          </Button>
        </div>
      )}
      {busy && (
        <p role="status" className="text-xs text-foreground">
          {BUSY_LINE[busy]}
        </p>
      )}
      {mode === "deposit" && !busy && (
        <p className="text-xs text-muted-foreground">
          Your wallet asks once: the approve of exactly this amount to the Vault, and the deposit, in one transaction.
        </p>
      )}
      {mode === "withdraw" && (
        <p className="text-xs text-muted-foreground">
          The exit fee, <span className="numeric">{formatBps(exitFeeBps)}</span> of what leaves, stays in the Vault for the other holders.
          {allFee !== null && shares > 0n && (
            <>
              {" "}
              Withdraw all pays <Amount value={maxWithdraw} token="paved" />, a fee of <Amount value={allFee} token="paved" /> taken.
            </>
          )}
        </p>
      )}
    </div>
  );
}

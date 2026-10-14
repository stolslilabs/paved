import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Amount, formatUnits, TOKENS } from "../elements/amount";
import { Notice } from "../elements/notice";
import { formatBps } from "./split-bar";

/**
 * A typed amount to base units, or null when it is not one (empty, a letter, too many decimals). `@paved/chain`'s
 * `parseUnits`, restated so the scenes import only its types.
 */
export function parseUnits(text: string, decimals: number): bigint | null {
  const t = text.trim();
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(t)) return null;
  const [whole = "", fraction = ""] = t.split(".");
  if (fraction.length > decimals) return null;
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}

export type VaultMode = "deposit" | "withdraw";

export interface VaultFormProps {
  mode: VaultMode;
  /** The amount typed, in $TILE. */
  amount: string;
  /** PAVED in the wallet (`balance_of`), what a deposit can take. */
  balance: bigint;
  /** vPAVED held. */
  shares: bigint;
  /** `max_withdraw`: the most PAVED a withdraw pays now, the exit fee taken. */
  maxWithdraw: bigint;
  exitFeeBps: number;
  /** `preview_deposit` or `preview_withdraw` of the typed amount: the vPAVED minted or burned. Null until read. */
  preview: bigint | null;
  /** The write on its way. */
  busy?: "deposit" | "withdraw" | "withdrawAll" | null;
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

/**
 * Deposit $TILE for vPAVED, or withdraw: the field, Max, the preview, the button; Withdraw all redeems every share. Refuses
 * before any send what the contract would refuse: a deposit above the wallet, a withdraw above `max_withdraw`.
 */
export function VaultForm(props: VaultFormProps) {
  const { mode, amount, balance, shares, maxWithdraw, exitFeeBps, preview, busy, className } = props;
  const typed = parseUnits(amount, tile.decimals);
  const limit = mode === "deposit" ? balance : maxWithdraw;
  const over = typed !== null && typed > limit;
  const empty = typed === null || typed === 0n;
  const working = busy != null;
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

      {over && (
        <Notice tone="danger" title={mode === "deposit" ? "Not enough $TILE" : "Over max_withdraw"}>
          {mode === "deposit"
            ? `More than your wallet holds: at most ${formatUnits(balance, tile.decimals, tile.fraction)} $TILE. Nothing was sent.`
            : `More than you can withdraw: at most ${formatUnits(maxWithdraw, tile.decimals, tile.fraction)} $TILE now, the exit fee taken. Nothing was sent.`}
        </Notice>
      )}

      {mode === "deposit" ? (
        <Button size="lg" onClick={props.onDeposit} disabled={empty || over || working} loading={busy === "deposit"}>
          {busy === "deposit" ? "Confirm in your wallet…" : "Deposit"}
        </Button>
      ) : (
        <div className="grid gap-2 tablet:grid-cols-2">
          <Button size="lg" onClick={props.onWithdraw} disabled={empty || over || working} loading={busy === "withdraw"}>
            {busy === "withdraw" ? "Confirm in your wallet…" : "Withdraw"}
          </Button>
          <Button size="lg" variant="outline" onClick={props.onWithdrawAll} disabled={shares === 0n || working} loading={busy === "withdrawAll"}>
            <Icon name="arrow-right-from-bracket" size="sm" />
            Withdraw all
          </Button>
        </div>
      )}
      {mode === "withdraw" && (
        <p className="text-xs text-muted-foreground">
          The exit fee, <span className="numeric">{formatBps(exitFeeBps)}</span> of what leaves, stays in the Vault for the other holders.
        </p>
      )}
    </div>
  );
}

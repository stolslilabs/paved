import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Amount, amountFigure, formatUnits, TOKENS } from "../elements/amount";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { SectionTitle } from "../elements/section-title";
import { TokenIcon } from "../elements/token-icon";
import { UiIcon } from "../elements/ui-icon";
import { VaultArtImage } from "../elements/vault-art-image";
import type { SplitView } from "@paved/chain";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
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

/** USDC's decimals, and the guard's rate's scale (`RATE_SCALE` of `@paved/chain`, restated: the scenes import only its types). */
const USDC_DECIMALS = 6;
const RATE_SCALE = 10n ** 18n;

/**
 * PAVED base units in dollars at the guard's rate (`Economy.rate()`: PAVED base units per USDC base unit x 1e18, the rate the Challenge's
 * "1 PAVED ≈ $X" reads), USDC counted as a dollar: `fraction` decimals (cents by default), rounded down. Null without a rate (0 before
 * any purchase, unread, or no economy).
 */
export function pavedUsd(value: bigint, guardRate: bigint | null | undefined, fraction = 2): string | null {
  if (!guardRate) return null;
  return formatUnits((value * RATE_SCALE) / guardRate, USDC_DECIMALS, fraction);
}

export type VaultMode = "deposit" | "withdraw";

/** The footer's tabs (the owner's ask of 2026-11-07): the Position first, then the book's Deposit and Withdraw. */
export type VaultTab = "position" | VaultMode;

/** The unit the field is typed in (the book's switch): PAVED, or vPAVED for an exact vPAVED amount. */
export type VaultUnit = "paved" | "vpaved";

/**
 * The Vault's four operations, a tab's two by the field's unit (ERC4626's): Deposit (the PAVED in fixed), Mint (the vPAVED out fixed),
 * Withdraw (the PAVED out fixed) and Redeem (the vPAVED in fixed).
 */
export type VaultOp = "deposit" | "mint" | "withdraw" | "redeem";

/** A tab's operation for the field's unit. */
export const opOf = (mode: VaultMode, unit: VaultUnit): VaultOp => (mode === "deposit" ? (unit === "paved" ? "deposit" : "mint") : unit === "paved" ? "withdraw" : "redeem");

/** A write of the Vault on its way: one of the four (a deposit's and a mint's approve in the same prompt), or the exit of every vPAVED. */
export type VaultBusy = VaultOp | "withdrawAll";

/** What the last write did, from its receipt's `Deposit` or `Withdraw`: the PAVED in or out, the vPAVED minted or burned. */
export interface VaultDone {
  kind: "deposit" | "withdraw";
  assets: bigint;
  shares: bigint;
}

const tile = TOKENS.paved;
const shown = (value: bigint) => `${formatUnits(value, tile.decimals, tile.fraction)} ${tile.symbol}`;

/** The Vault's totals, for the conversions the page writes before a preview is read (OpenZeppelin's at offset 0, rounded down). */
export interface VaultTotals {
  totalAssets: bigint;
  totalSupply: bigint;
}
/** `convert_to_assets(shares)`, rounded down. */
export const toAssets = (shares: bigint, t: VaultTotals) => (shares * (t.totalAssets + 1n)) / (t.totalSupply + 1n);
/** `convert_to_shares(assets)`, rounded down: the most vPAVED a mint can ask for with `assets` PAVED (`preview_mint` rounds up). */
export const toShares = (assets: bigint, t: VaultTotals) => (assets * (t.totalSupply + 1n)) / (t.totalAssets + 1n);

/** What an operation's field can take at most: the wallet's PAVED, the vPAVED it can mint, `max_withdraw`, the vPAVED held. */
export function limitOf(op: VaultOp, position: VaultTotals & { balance: bigint; shares: bigint; maxWithdraw: bigint }): bigint {
  if (op === "deposit") return position.balance;
  if (op === "mint") return toShares(position.balance, position);
  if (op === "withdraw") return position.maxWithdraw;
  return position.shares;
}

/** What a typed amount is against its limit (`limitOf`). */
export function typedAmount(amount: string, limit: bigint) {
  const typed = parseUnits(amount, tile.decimals);
  const over = typed !== null && typed > limit;
  const empty = typed === null || typed === 0n;
  return { typed, over, empty, ready: !empty && !over };
}

/** The line under the field while a write is on its way: what the wallet asks for. */
const BUSY_LINE: Record<VaultBusy, string> = {
  deposit: "Approve and deposit in your wallet: one transaction for both.",
  mint: "Approve and mint in your wallet: one transaction for both.",
  withdraw: "Confirm the withdraw in your wallet.",
  redeem: "Confirm the redeem in your wallet.",
  withdrawAll: "Confirm the withdrawal of every vPAVED in your wallet.",
};

/** Each operation's word: its section's title, its gold button, its refusal. */
export const OP_WORD: Record<VaultOp, string> = { deposit: "Deposit", mint: "Mint", withdraw: "Withdraw", redeem: "Redeem" };

export interface VaultFormProps {
  mode: VaultMode;
  /** The field's unit: PAVED (Deposit, Withdraw) or vPAVED (Mint, Redeem). */
  unit: VaultUnit;
  /** The amount typed, in the field's unit. */
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
  /** The Vault's totals (`total_assets`, `total_supply`): a vPAVED amount's dollars, the most a mint can ask for, a redeem's fee. */
  totalAssets: bigint;
  totalSupply: bigint;
  /** The operation's preview of the typed amount (`useVaultPreview`): its other side. Null until read. */
  preview: bigint | null;
  /** The write on its way. */
  busy?: VaultBusy | null;
  /** The last write's refusal, the writer's message (a typed error of `@paved/chain`). */
  refused?: string | null;
  /** That refusal's detail for support (`InlineError`): its typed name, its hash, the version, the time. */
  refusedDetail?: ErrorDetail;
  /** The last write went through. */
  done?: VaultDone | null;
  onAmountChange?: (amount: string) => void;
  /** The field's unit picked (the book's PAVED | vPAVED). */
  onUnitChange?: (unit: VaultUnit) => void;
  /** Fills the field with the operation's limit (`limitOf`). */
  onMax?: () => void;
  onWithdrawAll?: () => void;
  /** No vPAVED and no PAVED: the deposit's Play, where PAVED is won. */
  onPlay?: () => void;
  /** `Economy.split_bps()`, for the notes' line on the Vault's part of each purchase. */
  split?: SplitView | null;
  /** `Economy.rate()`, the guard's swap rate: the typed amount in dollars; null or 0, none. */
  guardRate?: bigint | null;
  className?: string;
}

/** A row of the withdraw's receipt: its word, its figure at the end. */
function Line({ label, children, testId }: { label: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right" data-testid={testId}>
        {children}
      </dd>
    </>
  );
}

/** The field's units, the book's switch: a coin and a word each. */
const UNITS: readonly { id: VaultUnit; label: string }[] = [
  { id: "paved", label: "PAVED" },
  { id: "vpaved", label: "vPAVED" },
];

/** The units' switch (the book's PAVED | vPAVED): raised keys side by side, the one on lit; the arrow keys move between them. */
function UnitSwitch({ unit, disabled, onChange }: { unit: VaultUnit; disabled: boolean; onChange?: (unit: VaultUnit) => void }) {
  return (
    <ToggleGroup
      type="single"
      aria-label="Amount in"
      value={unit}
      // Radix sends "" when the key on is pressed again: the unit stays.
      onValueChange={(next) => next && next !== unit && onChange?.(next as VaultUnit)}
      disabled={disabled}
      className="drawer-carved grid w-full grid-cols-2 gap-1 rounded-xl p-1"
    >
      {UNITS.map(({ id, label }) => (
        <ToggleGroupItem
          key={id}
          value={id}
          className="text-outline h-10 gap-1.5 rounded-lg bg-transparent text-base font-bold text-muted-foreground data-[state=on]:drawer-raised data-[state=on]:text-foreground"
        >
          {id === "paved" ? <TokenIcon kind="paved" size="sm" /> : <TokenIcon kind="vpaved" size="sm" />}
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/**
 * A tab's body (VAULT-PAGE, after the Paved UX Book's Deposit and Withdraw and the Challenge's stake panel): under its painted title, the
 * book's unit switch, PAVED or vPAVED, which picks the operation (ERC4626's four: Deposit and Withdraw fix the PAVED, Mint and Redeem
 * the vPAVED); the amount in a carved field with its coin and Max (raised), its dollars and the limit under it (the wallet, or what
 * leaves now, or the vPAVED held); an exit's receipt before it is sent, carved: a withdraw's PAVED and its fee on top (`withdrawFee`), a
 * redeem's vPAVED and its fee inside (`redeemFee`'s rule); Withdraw all (raised, every vPAVED, its fee shown before: the value less
 * `max_withdraw`); then the notes. The gold action and the other side of the operation are the footer's (`VaultAction`). Refuses before
 * any send what the contract would refuse: more than the wallet pays, more than leaves now, more vPAVED than held. No vPAVED and no
 * PAVED: Play, where PAVED is won, over the field.
 */
export function VaultForm(props: VaultFormProps) {
  const { mode, unit, amount, balance, shares, maxWithdraw, exitFeeBps, busy, className } = props;
  const op = opOf(mode, unit);
  const totals = { totalAssets: props.totalAssets, totalSupply: props.totalSupply };
  const limit = limitOf(op, { ...totals, balance, shares, maxWithdraw });
  const { typed, over, ready } = typedAmount(amount, limit);
  const working = busy != null;
  const deposit = mode === "deposit";
  const inShares = unit === "vpaved";
  // An exit's fee before it is sent: on top of a withdraw's PAVED, inside a redeem's value.
  const fee = !ready || deposit ? null : inShares ? exitFeeInside(toAssets(typed!, totals), exitFeeBps) : withdrawFee(typed!, exitFeeBps);
  const allFee = props.value !== undefined && props.value >= maxWithdraw ? props.value - maxWithdraw : null;
  const nothing = deposit && shares === 0n && balance === 0n;
  const usd = ready ? pavedUsd(inShares ? toAssets(typed!, totals) : typed!, props.guardRate) : null;
  const token = inShares ? "vpaved" : "paved";
  const word = OP_WORD[op];
  return (
    <section aria-labelledby={`vault-${mode}`} className={cn("flex flex-col gap-3", className)}>
      <SectionTitle id={`vault-${mode}`}>
        {deposit ? (
          <VaultArtImage name="deposit" px={28} className="drawer-icon size-7 self-center" />
        ) : (
          <VaultArtImage name="withdraw" px={28} className="drawer-icon size-7 self-center" />
        )}
        {word}
      </SectionTitle>

      {nothing && (
        <Notice tone="info" title="No PAVED in your wallet" action={<Button size="sm" onClick={props.onPlay}>Play</Button>}>
          PAVED is won in Challenge games that beat their threshold.
        </Notice>
      )}

      <UnitSwitch unit={unit} disabled={working} onChange={props.onUnitChange} />
      <div className="flex items-stretch gap-2">
        <label className={cn("drawer-carved flex h-14 min-w-0 flex-1 items-center gap-2 rounded-xl border-2 pr-3 pl-4", over ? "border-destructive-text" : "border-transparent")}>
          <input
            aria-label={`Amount to ${word.toLowerCase()}, in ${inShares ? "vPAVED" : "PAVED"}`}
            aria-invalid={over || undefined}
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            disabled={working}
            onChange={(e) => props.onAmountChange?.(e.target.value)}
            className="numeric text-outline min-w-0 flex-1 bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground disabled:opacity-60"
          />
          {inShares ? <TokenIcon kind="vpaved" size="md" /> : <TokenIcon kind="paved" size="md" />}
          <span aria-hidden className="text-outline text-base font-bold">
            {inShares ? "vPAVED" : "PAVED"}
          </span>
        </label>
        <Button variant="ghost" onClick={props.onMax} disabled={working || limit === 0n} className="drawer-raised text-outline h-14 rounded-xl px-4 text-base font-bold">
          Max
        </Button>
      </div>
      <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-sm">
        <span aria-label="In dollars" className="numeric font-semibold text-muted-foreground">
          {usd !== null ? `≈ $${usd}` : ""}
        </span>
        <span className="flex flex-wrap items-center gap-x-2">
          <span className="font-semibold text-muted-foreground">{deposit ? "Wallet" : inShares ? "Held" : "Available"}</span>
          {op === "mint" ? <Amount value={balance} token="paved" /> : <Amount value={limit} token={token} />}
        </span>
      </p>

      {fee !== null && (
        <dl aria-label="Before you withdraw" className="drawer-carved grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 rounded-xl px-4 py-3 text-sm">
          <Line label={inShares ? "You burn" : "You receive"}>
            <Amount value={typed!} token={token} />
          </Line>
          <Line label={<>Exit fee, <span className="numeric">{formatBps(exitFeeBps)}</span>, {inShares ? "inside" : "on top"}</>} testId="withdraw-fee">
            <Amount value={fee} token="paved" />
          </Line>
        </dl>
      )}

      {/* The amount's error and the write's refusal: one InlineError each, always rendered, so their height animates. */}
      <InlineError title={OVER_TITLE[op]} message={over ? overText(op, limit) : null} />
      <InlineError title={`${word} refused`} message={working ? null : props.refused} detail={props.refusedDetail} />
      {props.done && !working && (
        <Notice icon="circle-check" title={props.done.kind === "deposit" ? "Deposited" : "Withdrawn"}>
          {props.done.kind === "deposit"
            ? `${shown(props.done.assets)} in the Vault for ${formatUnits(props.done.shares, 18, 2)} vPAVED.`
            : `${shown(props.done.assets)} sent to your wallet; ${formatUnits(props.done.shares, 18, 2)} vPAVED burned.`}
        </Notice>
      )}
      {busy && (
        <p role="status" className="px-1 text-sm font-semibold">
          {BUSY_LINE[busy]}
        </p>
      )}

      {!deposit && (
        <div className="flex flex-col gap-1.5">
          <Button
            variant="ghost"
            onClick={props.onWithdrawAll}
            disabled={shares === 0n || working}
            loading={busy === "withdrawAll"}
            className="drawer-raised text-outline h-12 rounded-xl text-base font-bold"
          >
            <VaultArtImage name="withdraw" px={28} className="drawer-icon size-7" />
            Withdraw all
          </Button>
          {allFee !== null && shares > 0n && (
            <p className="px-1 text-center text-sm text-muted-foreground">
              Withdraw all pays <Amount value={maxWithdraw} token="paved" />, a fee of <Amount value={allFee} token="paved" /> taken.
            </p>
          )}
        </div>
      )}

      <VaultNotes label={`How a ${word.toLowerCase()} works`}>
        {deposit ? (
          <li className="flex gap-2">
            <UiIcon name="info" px={20} className="drawer-icon mt-px size-5 shrink-0" />
            <span>{inShares ? "Mint: exactly this vPAVED, for the PAVED it costs now; one wallet prompt." : "Deposit: exactly this PAVED; one wallet prompt for the approve and the deposit."}</span>
          </li>
        ) : (
          <li className="flex gap-2">
            <VaultArtImage name="exit-fee" px={20} className="drawer-icon mt-px size-5 shrink-0" />
            <span>
              The exit fee, <span className="numeric">{formatBps(exitFeeBps)}</span>, stays in the Vault for the other holders.
            </span>
          </li>
        )}
      </VaultNotes>
    </section>
  );
}

/** The exit fee inside a redeem worth `value` PAVED at the rate: `ceil(value x fee / (fee + 10,000))`, `@paved/chain`'s `redeemFee`. */
export function exitFeeInside(value: bigint, exitFeeBps: number): bigint {
  const fee = BigInt(exitFeeBps);
  return ceilDiv(value * fee, fee + BPS);
}

/** An amount over its limit: each operation's title, and what it says (nothing was sent). */
const OVER_TITLE: Record<VaultOp, string> = { deposit: "Not enough PAVED", mint: "Not enough PAVED", withdraw: "Over max_withdraw", redeem: "More than you hold" };
function overText(op: VaultOp, limit: bigint): string {
  const at = (token: "paved" | "vpaved") => formatUnits(limit, 18, TOKENS[token].fraction);
  if (op === "deposit") return `More than your wallet holds: at most ${at("paved")} PAVED. Nothing was sent.`;
  if (op === "mint") return `More than your wallet pays for: at most ${at("vpaved")} vPAVED now. Nothing was sent.`;
  if (op === "withdraw") return `More than you can withdraw: at most ${at("paved")} PAVED now, the exit fee taken. Nothing was sent.`;
  return `More vPAVED than you hold: at most ${at("vpaved")} vPAVED. Nothing was sent.`;
}

/**
 * What the page means, a short line each under its box (the Challenge's notes, painted icons): a form's own line, or the Position's
 * (`general`): the Vault's part of every purchase raises the rate, and the rate is the reward (nothing to claim).
 */
export function VaultNotes({ children, split, general = false, label }: { children?: ReactNode; split?: SplitView | null; general?: boolean; label: string }) {
  return (
    <ul aria-label={label} className="flex flex-col gap-1.5 px-1 text-sm leading-snug text-muted-foreground">
      {children}
      {general && split && (
        <li className="flex gap-2">
          <UiIcon name="vault" px={20} className="drawer-icon mt-px size-5 shrink-0" />
          <span>
            Up to <span className="numeric">{formatBps(split.vault)}</span> of every purchase feeds the Vault: the rate rises.
          </span>
        </li>
      )}
      {general && (
        <li className="flex gap-2">
          <UiIcon name="star" px={20} className="drawer-icon mt-px size-5 shrink-0" />
          <span>Nothing to claim: you withdraw at the rate.</span>
        </li>
      )}
    </ul>
  );
}


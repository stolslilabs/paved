import { useRef } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { DecodedEvent, VaultPosition, WriteResult } from "@paved/chain";
import type { VaultBusy, VaultDone } from "../components/containers/vault-form";
import { addressKey, queryKeys } from "./keys";
import { useDataSources } from "./sources";

// The vault page (P10, section 6.4): the Vault's reads behind `VaultViews` (`EconomyViews` is one), the previews of the
// typed amount, and the writes deposit, withdraw and withdraw all through the sources' `vault`. `@paved/chain` is a type-only
// import here, so the route's chunk loads none of it: the writer is loaded at the first write (`vault-client.ts`). A
// receipt's `Deposit` or `Withdraw` sets the position and the wallet in the cache, then the reads are invalidated once.
// Nothing polls.

/** The keys of the Vault's reads beside `keys.ts`'s `vault` and `pavedBalance`. Amounts are decimal strings (a key holds no bigint). */
export const vaultKeys = {
  /** `preview_deposit(assets)` or `preview_withdraw(assets)`. */
  preview: (kind: "deposit" | "withdraw", amount: bigint) => ["chain", "economy", "vaultPreview", kind, amount.toString()] as const,
  /** Every preview: a write's receipt moves the rate. */
  previews: ["chain", "economy", "vaultPreview"] as const,
  /** `delegates(holder)`. */
  delegate: (account: string) => ["chain", "economy", "vaultDelegate", addressKey(account)] as const,
};

/** PAVED's and vPAVED's decimals. */
const DECIMALS = 18;
const BPS = 10_000n;
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

/**
 * Base units to the exact decimal the field shows (Max): every digit kept, trailing zeros dropped, no thousands separator.
 * `parseUnits` reads it back to the same bigint.
 */
export function exactUnits(value: bigint, decimals = DECIMALS): string {
  const scale = 10n ** BigInt(decimals);
  const fraction = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${value / scale}.${fraction}` : String(value / scale);
}

/**
 * The position after a receipt moved `shares` vPAVED and `assets` PAVED in (positive) or out (negative), recomputed as the
 * Vault computes it: `convert_to_assets` at offset 0 rounded down, then `max_withdraw` = the value less the redeem fee
 * `ceil(v x f / (f + 10,000))` (`vault.cairo`). The reconciling read replaces it.
 */
export function positionAfter(position: VaultPosition, shares: bigint, assets: bigint): VaultPosition {
  const totalAssets = position.totalAssets + assets;
  const totalSupply = position.totalSupply + shares;
  const held = position.shares + shares;
  const value = (held * (totalAssets + 1n)) / (totalSupply + 1n);
  const fee = BigInt(position.exitFeeBps);
  return { ...position, shares: held, value, maxWithdraw: value - ceilDiv(value * fee, fee + BPS), totalAssets, totalSupply };
}

const big = (v: unknown) => BigInt(v as bigint | number | string);

/**
 * The account's `Deposit` (as owner) or `Withdraw` (as owner) in a receipt's Vault events: the PAVED in or out and the vPAVED
 * minted or burned. On a withdraw the exit fee stays in the Vault: `assets` is what left it.
 */
export function vaultDoneIn(events: readonly DecodedEvent[], account: string): VaultDone | null {
  for (const event of events) {
    if ((event.name !== "Deposit" && event.name !== "Withdraw") || addressKey(String(event.fields.owner)) !== addressKey(account)) continue;
    return { kind: event.name === "Deposit" ? "deposit" : "withdraw", assets: big(event.fields.assets), shares: big(event.fields.shares) };
  }
  return null;
}

/** A receipt's write into the cache: the position's shares and totals, and the wallet's PAVED (out on a deposit, in on a withdraw). */
export function applyVaultDone(client: QueryClient, account: string, done: VaultDone): void {
  const sign = done.kind === "deposit" ? 1n : -1n;
  client.setQueryData<VaultPosition | null>(queryKeys.chain.vault(account), (p) => (p ? positionAfter(p, sign * done.shares, sign * done.assets) : p));
  client.setQueryData<bigint | null>(queryKeys.chain.pavedBalance(account), (b) => (typeof b === "bigint" ? b - sign * done.assets : b));
}

/** `Vault.delegates(holder)`: null when not delegated, undefined while read; null as well without an economy. */
export function useVaultDelegate(account: string | null): UseQueryResult<string | null> {
  const { economy } = useDataSources();
  return useQuery({
    queryKey: vaultKeys.delegate(account ?? "0x0"),
    queryFn: () => (economy ? economy.delegateOf(account as string) : null),
    enabled: account !== null,
  });
}

/**
 * The preview of a typed amount: the vPAVED a deposit mints (`preview_deposit`), or a withdraw burns, its exit fee on top
 * (`preview_withdraw`). Disabled for no amount or 0; null without an economy.
 */
export function useVaultPreview(kind: "deposit" | "withdraw", amount: bigint | null): UseQueryResult<bigint | null> {
  const { economy } = useDataSources();
  const asked = amount !== null && amount > 0n ? amount : null;
  return useQuery({
    queryKey: vaultKeys.preview(kind, asked ?? 0n),
    queryFn: () => (economy ? (kind === "deposit" ? economy.previewDeposit(asked as bigint) : economy.previewWithdraw(asked as bigint)) : null),
    enabled: asked !== null,
  });
}

/** One write of the page, with what the player confirmed: the amount, and for an exit the fee and the vPAVED they saw. */
export type VaultWrite =
  | { kind: "deposit"; amount: bigint }
  | { kind: "withdraw"; amount: bigint; exitFeeBps: number }
  | { kind: "withdrawAll"; shares: bigint; exitFeeBps: number };

export interface VaultControl {
  /** The connected account can write: a signer and the Vault's writes. */
  available: boolean;
  busy: VaultBusy | null;
  /** The last refusal's message (a typed error of `@paved/chain`), until `reset` or the next write. */
  refused: string | null;
  /** The refusal's typed error, for its name and hash (`InlineError`'s detail, P-67). */
  refusedError: Error | null;
  /** The last write's receipt, until `reset` or the next write. */
  done: VaultDone | null;
  /** Sends; resolves once it is confirmed (true) or refused (false). A second call while one is on its way does nothing. */
  send: (write: VaultWrite) => Promise<boolean>;
  reset: () => void;
}

/**
 * The Vault's writes for the connected account. The receipt's `Deposit` or `Withdraw` sets the position and the PAVED
 * balance in the cache, then the position, the balance and the previews are read once more (after a refusal too: an
 * earlier write may have landed, or the fee may have changed).
 */
export function useVaultWrites(account: string | null): VaultControl {
  const { signer = null, vault = null } = useDataSources();
  const client = useQueryClient();
  // Set at once, not by a render: a second tap before the page re-renders must not reach the writer.
  const sending = useRef(false);
  const mutation = useMutation<{ result: WriteResult; done: VaultDone | null }, Error, VaultWrite>({
    mutationFn: async (write) => {
      if (!signer || !vault) throw new Error("Connect to use the Vault");
      const writes = vault(signer);
      const result =
        write.kind === "deposit"
          ? await writes.deposit(write.amount, { confirmedAmount: write.amount })
          : write.kind === "withdraw"
            ? await writes.withdraw(write.amount, { confirmedAmount: write.amount, confirmedExitFeeBps: write.exitFeeBps })
            : await writes.withdrawAll({ confirmedShares: write.shares, confirmedExitFeeBps: write.exitFeeBps });
      return { result, done: account ? vaultDoneIn(result.events, account) : null };
    },
    onSuccess: ({ done }) => {
      if (account && done) applyVaultDone(client, account, done);
    },
    onSettled: () => {
      if (!account) return;
      void client.invalidateQueries({ queryKey: queryKeys.chain.vault(account) });
      void client.invalidateQueries({ queryKey: queryKeys.chain.pavedBalance(account) });
      void client.invalidateQueries({ queryKey: vaultKeys.previews });
    },
  });
  const pending = mutation.isPending ? mutation.variables : undefined;
  return {
    available: signer !== null && vault !== null,
    busy: pending?.kind ?? null,
    refused: mutation.error?.message ?? null,
    refusedError: mutation.error ?? null,
    done: mutation.data?.done ?? null,
    reset: mutation.reset,
    send: async (write) => {
      if (!signer || !vault || sending.current) return false;
      sending.current = true;
      try {
        await mutation.mutateAsync(write);
        return true;
      } catch {
        // The refusal is `refused`.
        return false;
      } finally {
        sending.current = false;
      }
    },
  };
}

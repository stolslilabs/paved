import { computeAdjustedReward, fpToMultiplier } from "@paved/game-core";

function trimTrailingZeros(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function formatTokenAmount(value: bigint | number | string, decimals = 18, precision = 4): string {
  const raw = BigInt(value);
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const fraction = raw % divisor;

  if (fraction === 0n) {
    return whole.toString();
  }

  const padded = fraction.toString().padStart(decimals, "0");
  const trimmed = padded.slice(0, precision);
  return trimTrailingZeros(`${whole.toString()}.${trimmed}`);
}

export interface LandingTokenPanelInput {
  balance: bigint;
  supportsMint: boolean;
  mintLoading: boolean;
  mintError: string | null;
}

export function mapLandingTokenPanel(input: LandingTokenPanelInput) {
  return {
    balanceLabel: formatTokenAmount(input.balance, 18, 4),
    supportsMint: input.supportsMint,
    isMinting: input.mintLoading,
    error: input.mintError,
  };
}

export interface GameEconomySnapshotInput {
  entry_multiplier_fp: number | string | bigint;
  entry_supply_snapshot: number | string | bigint;
  entry_target_snapshot: number | string | bigint;
  observedTokenSupply?: number | string | bigint;
}

export function mapGameEconomySnapshot(input: GameEconomySnapshotInput) {
  const snapshotSupply = BigInt(input.entry_supply_snapshot);
  const observedSupply = input.observedTokenSupply != null
    ? BigInt(input.observedTokenSupply)
    : 0n;
  const fallbackToObserved = snapshotSupply === 0n && observedSupply > 0n;

  return {
    multiplierLabel: `${trimTrailingZeros(fpToMultiplier(input.entry_multiplier_fp).toFixed(2))}x`,
    supplyLabel: formatTokenAmount(
      fallbackToObserved ? observedSupply : snapshotSupply,
      18,
      4,
    ),
    targetLabel: formatTokenAmount(input.entry_target_snapshot, 18, 4),
    warning: fallbackToObserved
      ? "Economy snapshot supply is zero; using observed token supply."
      : null,
  };
}

export interface RewardPreviewInput {
  baseReward: number;
  multiplierFp: number;
}

export function buildRewardPreview(input: RewardPreviewInput) {
  const adjusted = computeAdjustedReward(input.baseReward, input.multiplierFp);
  return {
    baseLabel: trimTrailingZeros(input.baseReward.toFixed(2)),
    multiplierLabel: `${trimTrailingZeros(fpToMultiplier(input.multiplierFp).toFixed(2))}x`,
    adjustedLabel: trimTrailingZeros(adjusted.toFixed(2)),
  };
}

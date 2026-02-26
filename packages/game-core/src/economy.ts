export const FP_SCALE_DEFAULT = 1_000_000;

function toNumber(value: number | bigint | string): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return Number(value);
}

export function fpToMultiplier(
  multiplierFp: number | bigint | string,
  fpScale = FP_SCALE_DEFAULT,
): number {
  if (fpScale <= 0) return 0;
  return toNumber(multiplierFp) / fpScale;
}

export function computeAdjustedReward(
  base: number | bigint | string,
  multiplierFp: number | bigint | string,
  fpScale = FP_SCALE_DEFAULT,
): number {
  if (fpScale <= 0) return 0;
  return (toNumber(base) * toNumber(multiplierFp)) / fpScale;
}

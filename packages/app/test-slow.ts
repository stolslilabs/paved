/**
 * The slow profile (TIMING-TESTS). A machine running several suites and builds stalls a test for seconds that takes
 * 0.1 s on a quiet one, so every wait ceiling of the suite is multiplied by `PAVED_TEST_SLOW`: unset or `0` is 1 (CI, a quiet
 * machine), `1` is 3, and any other number is the factor itself. The board's check sets `PAVED_TEST_SLOW=1` when the load is high
 * (`scripts/check/check.mts`). A ceiling only costs a failing test time: a passing one returns as soon as its state is there.
 */
const raw = process.env.PAVED_TEST_SLOW ?? "";
const parsed = Number(raw);
export const SLOW_FACTOR = raw === "" || !(parsed > 0) ? 1 : parsed === 1 ? 3 : parsed;

/** A wait ceiling or a test timeout in ms, scaled by the profile. */
export const slow = (ms: number): number => ms * SLOW_FACTOR;

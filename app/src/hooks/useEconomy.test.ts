import { toEconomyView } from "./useEconomy";

const view = toEconomyView({
  entry_multiplier_fp: 1_500_000,
  entry_supply_snapshot: 1000n,
  entry_target_snapshot: 2000n,
});

if (view.multiplierFp !== 1_500_000) {
  throw new Error("useEconomy test failed: wrong multiplierFp");
}

if (view.multiplier !== 1.5) {
  throw new Error("useEconomy test failed: wrong multiplier");
}

if (view.supplySnapshot !== 1000n || view.targetSnapshot !== 2000n) {
  throw new Error("useEconomy test failed: wrong snapshots");
}

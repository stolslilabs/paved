// The economy client (P8): `docs/architecture/client-economy.md`. The fake (`fake.ts`) is left out on purpose.
export * from "./amounts";
export { ECONOMY_ABI_IS_STUB } from "./stub-abi";
export { resolveEconomyDeployment } from "./deployment";
export type { EconomyDeployment, EconomyDeploymentFile, EconomyEnv } from "./deployment";
export { ECONOMY_VIEW_FIELDS, RpcEconomyViews } from "./views";
export type { DayView, EconomyViews, QuoteView, TermsView, VaultPosition } from "./views";
export { EconomyWriter, PurchaseOutcomeUnknownError, PurchasePriceChangedError, VaultAmountChangedError } from "./writer";
export type { PurchasePlan, PurchaseRequest } from "./writer";
export { EconomyClient, createEconomyClient } from "./client";

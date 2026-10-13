// The economy client (P8): `docs/architecture/client-economy.md`. The fake (`fake.ts`) is left out on purpose.
export * from "./amounts";
export { EconomyPoolQuoter, POOL_CANNOT_FILL, POOL_QUOTE_CONFIRMED, POOL_QUOTE_UNAVAILABLE, RATE_UNAVAILABLE, ROUTER_NOT_PINNED, ROUTER_UNKNOWN, isQuoteRevert, rateProblem, poolQuoterFor, routerProblem } from "./pool";
export type { PoolQuoter } from "./pool";
export { MAINNET_ROUTER, resolveEconomyDeployment } from "./deployment";
export type { EconomyDeployment, EconomyDeploymentFile, EconomyEnv } from "./deployment";
export { ECONOMY_VIEW_FIELDS, RpcEconomyViews } from "./views";
export type { DayView, EconomyViews, QuoteView, TermsView, VaultPosition } from "./views";
export { EconomyWriter, RateUnavailableError, PoolCannotFillError, PoolPriceMovedError, PoolQuoteBelowFloorError, PoolQuoteUnavailableError, PurchaseOutcomeUnknownError, PurchasePriceChangedError, RouterNotPinnedError, SelfReferralError, SettleTooEarlyError, referrerOf, SwapBelowMinOutError, VaultAmountChangedError } from "./writer";
export type { PurchasePlan, PurchaseRequest } from "./writer";
export { CHAIN_MISMATCH, CHAIN_UNKNOWN, ChainMismatchError, EconomyClient, createEconomyClient } from "./client";

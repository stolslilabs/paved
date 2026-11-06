import { formatUnits, TOKENS } from "../elements/amount";
import { packsOnSale } from "./cobble-types";

export { packsOnSale };

/**
 * A USDC price as dollars, whole when it is ("$9"), else with cents ("$0.09"). The packs' cards left for the Shop's (SHOP-PAGE,
 * `shop-packs.tsx`).
 */
export function formatUsd(price: bigint, fraction = 0): string {
  return `$${formatUnits(price, TOKENS.usdc.decimals, fraction)}`;
}

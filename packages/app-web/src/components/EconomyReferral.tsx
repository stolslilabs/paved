import { formatPercentBps, useAsyncRead } from "@paved/chain";
import type { EconomyClient } from "@paved/chain";
import { referralLink } from "../utils/economy-view";
import { panel } from "./EconomyStyles";

/**
 * The player's referral link. A link only names a referrer: it never buys anything nor sets an amount. The referrer's share
 * is the chain's (`Economy.split_bps().referral`, owner-set since P-56), never a constant; unread (no economy, a failed read),
 * no figure is shown.
 */
export function EconomyReferral({ address, origin, client = null }: { address: string | null; origin: string; client?: EconomyClient | null }) {
  const split = useAsyncRead(client ? () => client.views.split() : null, [client], { onVisible: true });
  const share = split.data && split.error === null ? `${formatPercentBps(split.data.referral)} of it` : "a share of it";
  return (
    <div style={panel} aria-label="Referral">
      <strong>Referral link</strong>
      {address ? <code style={{ wordBreak: "break-all" }}>{referralLink(origin, address)}</code> : <span>Connect to get your link.</span>}
      <span>{`A player who buys through your link pays the same price; you get ${share}, out of the stakers' margin.`}</span>
    </div>
  );
}

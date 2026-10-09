import { REFERRAL_BPS, formatUnits } from "@paved/chain";
import { referralLink } from "../utils/economy-view";
import { panel } from "./EconomyStyles";

/** The player's referral link. A link only names a referrer: it never buys anything nor sets an amount. */
export function EconomyReferral({ address, origin }: { address: string | null; origin: string }) {
  const percent = formatUnits(REFERRAL_BPS, 2);
  return (
    <div style={panel} aria-label="Referral">
      <strong>Referral link</strong>
      {address ? <code style={{ wordBreak: "break-all" }}>{referralLink(origin, address)}</code> : <span>Connect to get your link.</span>}
      <span>{`A player who buys through your link pays the same price; you get ${percent} % of it, out of the stakers' margin.`}</span>
    </div>
  );
}

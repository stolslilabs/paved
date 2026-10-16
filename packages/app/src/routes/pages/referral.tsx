import { useEffect, useState } from "react";
import { ReferralScene } from "../../components/scenes/referral-scene";
import { useSplit } from "../../data/chain";
import { referralLink, useReferralEarnings } from "../../data/referral";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { useConnectError } from "../connect-error";
import { useBack, useTabNavigate } from "../ref";

/** How long the Copy button says "Copied". */
const COPIED_MS = 2_000;

/**
 * `/referral` (P10): the connected player's link (the app's origin with `?ref=` and their address, which `withRef` keeps on
 * every link and the purchases send as the referrer), Copy, and Share where the browser has a share sheet; their share of a
 * price from `Economy.split_bps()`; what the link earned from the indexer's `/v1/players/:id/referrals`, where the id is
 * the player's address, the signer's (D-25 (E): a player is the wallet's address). The link needs no read: a failed read of
 * the earnings shows Retry beside it, never in its place. A guest connects.
 */
export default function Page() {
  const onNavigate = useTabNavigate();
  const onBack = useBack();
  const wallet = useAccount();
  useConnectError(wallet.error);
  const { signer = null } = useDataSources();
  const account = signer?.address ?? null;
  const split = useSplit();
  const earnings = useReferralEarnings(account);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const link = account ? referralLink(window.location.origin, account) : null;
  const share = typeof navigator !== "undefined" && typeof navigator.share === "function" ? navigator.share.bind(navigator) : null;

  return (
    <ReferralScene
      link={link}
      copied={copied}
      split={split.data ?? null}
      splitPending={split.isPending}
      earnings={earnings.data ?? null}
      earningsError={earnings.error ? earnings.error.message : null}
      onCopy={(value) => {
        navigator.clipboard?.writeText(value).then(
          () => setCopied(true),
          () => undefined,
        );
      }}
      onShare={share ? (value) => void share({ title: "Paved", text: "Play Paved with my link", url: value }).catch(() => undefined) : undefined}
      onRetry={() => void earnings.refetch()}
      onConnect={() => void wallet.connect()}
      onBack={onBack}
      onNavigate={onNavigate}
    />
  );
}

import { CobblesScene } from "../../components/scenes/cobbles-scene";
import { BalancesOf } from "../../components/containers/balances-of";
import { useBack } from "../ref";
import { useShopPacks } from "../shop-packs";

/**
 * The Cobble packs in the sheet over the page that asked for them (`cobbles-sheet-host.tsx`, BACK-RULE #783): the Shop's Cobbles tab
 * (SHOP-PAGE), its wiring (`useShopPacks`) and its cards. Its header shows the Shop's balances (#855), the Cobbles and USDC, whatever
 * the page under it shows. The packs' own page (`/cobbles`) left for the Shop's tab.
 */
export default function Page() {
  return (
    <BalancesOf page="village/shop">
      <Packs />
    </BalancesOf>
  );
}

function Packs() {
  const onBack = useBack();
  return <CobblesScene {...useShopPacks()} onBack={onBack} />;
}

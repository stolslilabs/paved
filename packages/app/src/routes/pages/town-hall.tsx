import { useQueryClient } from "@tanstack/react-query";
import { TOWN_HALL_LEVELS, townHallPlayerLevel, townHallPrice, townHallSlots } from "@paved/game-core";
import { TownHallScene, type TownHallLevel, type TownHallStatus } from "../../components/scenes/town-hall-scene";
import { cobbleKeys, useCobbleAccount } from "../../data/cobbles";
import { invalidateV2, useFreeVillageHeld } from "../../data/free-village-base";
import { useDataSources } from "../../data/sources";
import { useTownHallWrites } from "../../data/town-hall";
import { useAccount } from "../../wallet/wallet";
import { useDrawerRoute } from "../drawer-route";
import { errorDetail } from "../error-detail";
import { useAppNavigate, useBack } from "../ref";
import { refusalText } from "../village-shapes";

/** Every level of the rule (game-core's): its tiles, the Town Hall not counted, and what the upgrade to it asks. */
const LEVELS: readonly TownHallLevel[] = Array.from({ length: TOWN_HALL_LEVELS }, (_, i) => ({
  level: i + 1,
  tiles: townHallSlots(i + 1) - 1,
  price: i === 0 ? 0 : townHallPrice(i),
  playerLevel: i === 0 ? 1 : townHallPlayerLevel(i),
}));

/**
 * `/town-hall` (TOWN-HALL-PAGE: the HUD's drawer over the home, `PageDef.drawer`, in place of the upgrade's dialog): the connected
 * player's Town Hall, its level read with the village (`useFreeVillageHeld`, the home's cache), the rule's levels (game-core's
 * slots, prices and player levels), the Cobbles held, and the upgrade (`useTownHallWrites`), sent at the price shown: a refusal comes
 * back in words (`refusalText`). Where the village or the upgrade is not served (the chain before its contracts), the page says so.
 * Every player has an account (the owner's ruling of 2026-11-07): until it is read, the page shows its loading; a failed read has Retry.
 */
export default function Page() {
  const go = useAppNavigate();
  const drawer = useDrawerRoute();
  const back = useBack();
  const onBack = drawer?.onClose ?? back;
  useAccount();
  const me = useDataSources().signer?.address ?? null;
  const read = useFreeVillageHeld(me);
  const writes = useTownHallWrites(me);
  const cobbles = useCobbleAccount(me).data?.cobbles ?? null;
  const client = useQueryClient();

  const status: TownHallStatus | null =
    me === null ? { kind: "loading" } : read.error ? { kind: "error", message: read.error.message, detail: errorDetail(read.error) } : read.data === undefined ? { kind: "loading" } : null;
  const village = writes.signer ? (read.data ?? null) : null;
  const level = village?.townHall ?? 1;

  return (
    <TownHallScene
      status={status}
      hall={village ? { level, placed: village.tiles.length, playerLevel: village.level, cobbles } : null}
      levels={LEVELS}
      busy={writes.pending}
      refusal={writes.error ? refusalText(writes.error) : null}
      refusalDetail={writes.error ? errorDetail(writes.error) : undefined}
      onUpgrade={() => {
        writes.reset();
        void writes.upgrade({ confirmedPrice: townHallPrice(level) }).catch(() => undefined);
      }}
      onDismissRefusal={writes.reset}
      onRetry={() => {
        if (me) invalidateV2(client, me);
        void client.invalidateQueries({ queryKey: cobbleKeys.all });
      }}
      onGetCobbles={() => go("/village/shop?tab=cobbles")}
      open={drawer?.open ?? true}
      onBack={onBack}
      returnFocus={drawer?.returnFocus}
    />
  );
}

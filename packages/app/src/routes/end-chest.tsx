import { useState, type ReactNode } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import type { ChestRank } from "@paved/game-core";
import {
  ChestModal,
  type ChestTaken,
} from "../components/containers/chest-modal";
import { toastError } from "../components/containers/error-toast";
import type { EndChest } from "../components/containers/game-end";
import type { TileArt } from "../components/elements/tile-chip";
import {
  useChests,
  useFreeVillageWrites,
  type ChestOrigin,
} from "../data/free-village";
import { queryKeys } from "../data/keys";
import { haptic } from "../lib/haptics";
import { useAngledArt } from "./angled-art";
import { errorDetail } from "./error-detail";
import { refusalText } from "./village-v2";

/**
 * The chest a game won: its rank, and which of the read's origins are its (a PvP day's slot, a Story level's; unknown origins pass),
 * for the chests waiting and the one drawn alike.
 */
export interface WonChest {
  rank: ChestRank;
  mine: (origin: ChestOrigin | null | undefined) => boolean;
}

export interface EndChestControl {
  /** The panel's state: won (waiting), opening, kept (taken here, or opened before); loading, error or unavailable while the read is not there. */
  chest: EndChest;
  /** A tap on the panel: the chest opens (its draw), then its reveal. */
  open: () => void;
  tileArt?: TileArt;
  /** The reveal over the end (`ChestModal`): the cards, Take, the tile kept and Claim, back to the end. */
  modal: ReactNode;
}

/** The last index of `list` passing `test`, or -1. */
function lastIndex<T>(
  list: readonly T[],
  test: (item: T, index: number) => boolean,
): number {
  for (let i = list.length - 1; i >= 0; i--) if (test(list[i]!, i)) return i;
  return -1;
}

/**
 * A game's chest opened on its end (END-CHEST, the owner's ask of 2026-11-06: every chest opens where it is won, the Chests page gone):
 * the chest `won` found in the read, waiting (the last of its rank and origin in `pending`) or drawn already (`open`); a tap draws
 * it (`openChest`, a firm buzz), its reveal comes over the end (`ChestModal`), Take keeps a tile (`claimChest`) and Claim brings the
 * end back, its panel saying the tile kept. A chest of the game neither waiting nor drawn was opened before: "opened". A refused
 * draw is said in a toast (the end has no place for it); a refused choice in the reveal. Until the chests' read is there the panel
 * cannot open: loading, a failed read (its message and Retry, which reads the chests again), or unavailable (no chests served).
 */
export function useEndChest(
  me: string | null,
  won: WonChest | null,
): EndChestControl {
  const read = useChests(me);
  const client = useQueryClient();
  const chestsKey = queryKeys.chain.v2.chests(me ?? "0x0");
  const retrying = useIsFetching({ queryKey: chestsKey }) > 0;
  const writes = useFreeVillageWrites(me);
  // The tiles' art only once a chest is won: a game without one reads no skins (a Story level in its own theme reads none).
  const tileArt = useAngledArt(won ? me : null);
  const [taken, setTaken] = useState<ChestTaken | null>(null);
  const [claimed, setClaimed] = useState(false);
  const view = read.data;
  const index =
    won && view
      ? lastIndex(
          view.pending,
          (rank, i) => rank === won.rank && won.mine(view.origins?.[i]),
        )
      : -1;
  const drawn =
    won &&
    view?.open &&
    view.open.rank === won.rank &&
    won.mine(view.openOrigin)
      ? view.open
      : null;
  const pending = writes.pending;
  let chest: EndChest;
  if (!won) chest = { state: "none" };
  else if (taken) chest = { state: "kept", rank: won.rank, plan: taken.plan };
  else if (drawn || pending?.kind === "open")
    chest = { state: "opening", rank: won.rank };
  else if (view === undefined)
    chest = read.error
      ? {
          state: "error",
          rank: won.rank,
          message: read.error.message,
          detail: errorDetail(read.error),
          retrying,
          onRetry: () => void client.refetchQueries({ queryKey: chestsKey }),
        }
      : { state: "loading", rank: won.rank };
  else if (view === null) chest = { state: "unavailable", rank: won.rank };
  else if (index >= 0) chest = { state: "won", rank: won.rank };
  else chest = { state: "kept", rank: won.rank, plan: null };

  const open = () => {
    if (chest.state !== "won" || index < 0 || pending) return;
    haptic("firm");
    writes.reset();
    writes
      .openChest(index)
      .catch((error: Error) =>
        toastError({
          title: "Not done",
          message: refusalText(error),
          detail: errorDetail(error),
        }),
      );
  };
  const modal = (
    <ChestModal
      open={(drawn != null && taken == null) || (taken != null && !claimed)}
      onClose={() => setClaimed(true)}
      chest={null}
      more={0}
      opened={
        drawn && !taken
          ? { chestId: -1, draw: { rank: drawn.rank, plans: drawn.plans } }
          : null
      }
      opening={false}
      taken={taken && !claimed ? taken : null}
      busy={pending?.kind === "claim"}
      refusal={writes.error && drawn ? refusalText(writes.error) : null}
      refusalDetail={
        writes.error && drawn ? errorDetail(writes.error) : undefined
      }
      tileArt={tileArt}
      onTake={(_, choice) => {
        if (pending || !drawn) return;
        writes.reset();
        const plan = drawn.plans[choice];
        if (plan === undefined) return;
        writes.claimChest(choice).then(
          () => setTaken({ plan }),
          () => undefined,
        );
      }}
      onDismissRefusal={writes.reset}
    />
  );
  return { chest, open, tileArt, modal };
}

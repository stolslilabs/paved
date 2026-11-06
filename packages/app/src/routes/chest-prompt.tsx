import { useState } from "react";
import { ChestModal, type Chest, type ChestTaken } from "../components/containers/chest-modal";
import { useChests, useFreeVillageWrites } from "../data/free-village";
import { errorDetail } from "./error-detail";
import { useAngledArt } from "./angled-art";
import { refusalText } from "./village-v2";

export interface ChestPromptProps {
  /** The connected player, whose chests wait. */
  me: string;
  /** Claim on the last chest: the prompt leaves the home. */
  onDone: () => void;
  /** Closed before a chest's tap (the cross, Escape): it waits for the app's next run. */
  onDismiss: () => void;
}

/**
 * A chest left to open, asked over the home (END-CHEST, the owner's asks of 2026-11-06: every chest is opened, where it is won; one
 * drawn and left, or won and not opened, is asked again): the book's opening in front of everything. One drawn shows its reveal at
 * once (it cannot be closed until a tile is taken); one waiting shows the chest to tap ("Tap to open", the cross beside it); its draw
 * (`openChest`), its reveal, Take (`claimChest`), the tile kept and Claim, then the next waiting, until none is left. Its own chunk,
 * loaded by the home's hosts (`home-hosts.tsx`) only while the read says a chest waits.
 */
export default function ChestPrompt({ me, onDone, onDismiss }: ChestPromptProps) {
  const read = useChests(me);
  const writes = useFreeVillageWrites(me);
  const tileArt = useAngledArt(me);
  const [taken, setTaken] = useState<ChestTaken | null>(null);
  const view = read.data;
  const open = view?.open ?? null;
  const pending = writes.pending;
  const waiting = view?.pending ?? [];
  // The next chest to tap, the oldest waiting: its id its place in the read, plus one.
  const first = waiting[0];
  const origin = view?.origins?.[0];
  const chest: Chest | null = !taken && !open && first ? { id: 1, rank: first, source: origin?.source } : null;
  return (
    <ChestModal
      open
      onClose={() => {
        if (!taken) return onDismiss();
        // Claim: the next waiting, or the home.
        setTaken(null);
        if (waiting.length === 0 && !open) onDone();
      }}
      chest={chest}
      more={Math.max(0, waiting.length - 1)}
      opened={open && !taken ? { chestId: -1, draw: { rank: open.rank, plans: open.plans } } : null}
      opening={pending?.kind === "open"}
      taken={taken}
      busy={pending !== undefined}
      refusal={writes.error ? refusalText(writes.error) : null}
      refusalDetail={writes.error ? errorDetail(writes.error) : undefined}
      tileArt={tileArt}
      onOpen={() => {
        if (pending) return;
        writes.reset();
        writes.openChest(0).catch(() => undefined);
      }}
      onTake={(_, index) => {
        if (pending || !open) return;
        writes.reset();
        const plan = open.plans[index];
        if (plan === undefined) return;
        writes.claimChest(index).then(
          () => setTaken({ plan }),
          () => undefined,
        );
      }}
      onDismissRefusal={writes.reset}
    />
  );
}

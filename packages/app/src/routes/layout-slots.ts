import { useMemo } from "react";
import type { LayoutSlotsProps } from "../components/containers/layout-slots-strip";
import { useCobbleAccount } from "../data/cobbles";
import { V2RefusedError, type V2Refusal } from "../data/free-village-base";
import { useLayoutSlotWrites, useLayoutSlots } from "../data/layout-slots";
import { errorDetail } from "./error-detail";
import { boardTilesOf, layoutTilesOf, refusalText } from "./village-shapes";

// The saved layouts' strip as the home's stage wires it (#804): the slots read, their writes, the Cobbles held. In the stage's
// chunk, never the home's first one.

/** The slots' own refusals, in words; the layout's are `refusalText`'s. */
const SLOT_REFUSALS: Partial<Record<V2Refusal, string>> = {
  "slot-locked": "Buy this slot first.",
  "slot-empty": "Save a layout into this slot first.",
  "slot-open": "This slot is yours already.",
  "not-a-slot": "There is no such slot.",
};

const slotRefusal = (error: Error) => (error instanceof V2RefusedError && SLOT_REFUSALS[error.reason]) || refusalText(error);

/** The strip's props for the player's village, or undefined where the slots are not served (no strip). */
export function useStageLayoutSlots(playerId: string | null): LayoutSlotsProps | undefined {
  const read = useLayoutSlots(playerId);
  const writes = useLayoutSlotWrites(playerId);
  const cobbles = useCobbleAccount(writes.signer ? playerId : null).data?.cobbles ?? null;
  const data = read.data;
  const slots = useMemo(
    () => data?.slots.map((s) => ({ slot: s.slot, open: s.open, price: s.price, tiles: s.tiles && boardTilesOf(s.tiles), score: s.score, fits: s.fits })),
    [data],
  );
  const pending = writes.pending;
  const { error, reset, saveTo, activate, buy } = writes;
  if (!data || !slots || !writes.signer) return undefined;
  const settle = (write: Promise<unknown>) => void write.catch(() => undefined);
  return {
    active: data.active,
    slots,
    cobbles,
    busy: pending ? { kind: pending.kind === "buy-slot" ? "buy" : pending.kind, slot: pending.kind === "buy-slot" ? pending.request.slot : pending.slot } : null,
    error: error ? slotRefusal(error) : null,
    errorDetail: error ? errorDetail(error) : undefined,
    onSaveTo: (slot, tiles) => {
      reset();
      settle(saveTo(slot, layoutTilesOf(tiles)));
    },
    onActivate: (slot) => {
      reset();
      settle(activate(slot));
    },
    onBuy: (slot, price) => {
      reset();
      settle(buy({ slot, confirmedPrice: price }));
    },
    onDismissError: reset,
  };
}

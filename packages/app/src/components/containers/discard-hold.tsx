import type { ReactNode } from "react";
import { HoldButton } from "../elements/hold-button";
import { useSfx } from "./audio-provider";

/**
 * Discard, held (#606): the trash in a grey circle whose ring fills red (`HoldButton`'s destructive tone), the colours of
 * Validate inverted. The tile's actions' and the stack's: the same hold wherever the player discards. Its label names the cost.
 * `glyph` (TILE-ACTIONS): the painted blue trash, the whole button (`HoldButton`'s painted look), the red ring on its rim.
 */
export function DiscardHold({ onDiscard, cost, disabled, holdMs, glyph, className }: { onDiscard: () => void; cost?: number; disabled?: boolean; holdMs?: number; glyph?: ReactNode; className?: string }) {
  const play = useSfx();
  const penalty = cost ? ` (costs ${cost} points)` : " (free)";
  return (
    <HoldButton
      tone="destructive"
      icon="trash"
      glyph={glyph}
      painted={!!glyph}
      label={`Hold to discard the tile${penalty}`}
      title={`Hold to discard${penalty}`}
      holdMs={holdMs}
      disabled={disabled}
      onComplete={() => {
        play("discard");
        onDiscard();
      }}
      className={className}
    />
  );
}

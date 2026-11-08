import type { ReactNode } from "react";
import { HoldButton } from "../elements/hold-button";
import { UiIcon } from "../elements/ui-icon";
import { useSfx } from "./audio-provider";

/**
 * Discard, held (#606): the trash in a grey circle whose ring fills red (`HoldButton`'s destructive tone), the colours of
 * Validate inverted. The tile's actions' and the stack's: the same hold wherever the player discards. Its label names the cost.
 * The painted red trash (TILE-ACTIONS), the whole button (`HoldButton`'s painted look), the red rail round it; the stack's too since
 * GAME-OVERLAY (no Font Awesome trash left). `glyph`: another painting in its place.
 */
export function DiscardHold({ onDiscard, cost, disabled, holdMs, glyph, className }: { onDiscard: () => void; cost?: number; disabled?: boolean; holdMs?: number; glyph?: ReactNode; className?: string }) {
  const play = useSfx();
  const penalty = cost ? ` (costs ${cost} points)` : " (free)";
  return (
    <HoldButton
      tone="destructive"
      painted
      glyph={glyph ?? <UiIcon name="tile-discard" px={44} className="pointer-events-none size-11" />}
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

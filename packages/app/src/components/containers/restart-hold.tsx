import { HoldButton } from "../elements/hold-button";
import { UiIcon } from "../elements/ui-icon";
import { useSfx } from "./audio-provider";

/**
 * Restart, held (GAME-OVERLAY, the owner's ask of 2026-11-07: Story's Restart in the board's UI, an icon confirmed by a long press): the
 * painted red arrow going back round, the whole button, the red rail filling round it as the tile's Discard (`HoldButton`'s painted
 * look, its hold, length and haptics: the hold is the confirmation, no dialog). The level (Story) or the game (Training, TRAINING-END)
 * starts again from its first tile; `label` names which.
 */
export function RestartHold({ onRestart, disabled, holdMs, label = "Hold to restart the level", className }: { onRestart: () => void; disabled?: boolean; holdMs?: number; label?: string; className?: string }) {
  const play = useSfx();
  return (
    <HoldButton
      painted
      tone="destructive"
      glyph={<UiIcon name="restart" px={36} className="drawer-icon pointer-events-none size-8 mobile:size-9" />}
      label={label}
      title={label}
      holdMs={holdMs}
      disabled={disabled}
      onComplete={() => {
        play("tap");
        onRestart();
      }}
      className={className}
    />
  );
}

import { formatInteger } from "@paved/game-core";
import { Cobbles } from "../elements/cobbles";
import { HudDialog } from "./hud-dialog";

/** The Town Hall of the player's village (TOWN-HALL): its level and slots, the next level's, and the upgrade. */
export interface TownHallProps {
  /** The Town Hall's level, 1 to 10. */
  level: number;
  /** The village's slots at this level, the Town Hall counted as one. */
  slots: number;
  /** The next level: its slots, its price in Cobbles and the player level it asks for. Null at the last level. */
  next: { slots: number; price: number; playerLevel: number } | null;
  /** The player's level. */
  playerLevel: number;
  /** The Cobbles held; null while they are not read. */
  cobbles: number | null;
  /** The upgrade is on its way. */
  busy?: boolean;
  /** The last upgrade's refusal, in words. */
  error?: string | null;
  onUpgrade?: () => void;
  onDismissError?: () => void;
}

/**
 * The Town Hall's dialog, in the HUD drawers' look (`HudDialog`): opened by a tap on the Town Hall of one's own village. It says
 * what the level holds and what the next one brings, and upgrades for Cobbles as the Shop prices a purchase; the answer is off
 * while the player's level or Cobbles are short, with the reason in words.
 */
export function TownHallDialog({ open, onClose, level, slots, next, playerLevel, cobbles, busy, error, onUpgrade }: TownHallProps & { open: boolean; onClose: () => void }) {
  const lowLevel = next !== null && playerLevel < next.playerLevel;
  const short = next !== null && cobbles !== null && cobbles < next.price;
  const tiles = (n: number) => `${n - 1} ${n - 1 === 1 ? "tile" : "tiles"}`;
  return (
    <HudDialog
      open={open}
      onCancel={onClose}
      cancel="Close"
      title={`Town Hall level ${level}`}
      description={
        <span data-slot="town-hall-text">
          {`Your village holds ${tiles(slots)} round its Town Hall. `}
          {next === null
            ? "It is at its last level."
            : lowLevel
              ? `Level ${level + 1} holds ${tiles(next.slots)}: it opens at player level ${next.playerLevel} (you are level ${playerLevel}).`
              : short
                ? `Level ${level + 1} holds ${tiles(next.slots)}. Not enough Cobbles yet.`
                : `Level ${level + 1} holds ${tiles(next.slots)}, and the hall grows.`}
          {error ? ` ${error}` : ""}
        </span>
      }
      action={
        next === null
          ? { label: "Close", onClick: onClose }
          : {
              label: `Upgrade to level ${level + 1} for ${formatInteger(next.price)} ${next.price === 1 ? "Cobble" : "Cobbles"}`,
              price: next.price,
              onClick: () => onUpgrade?.(),
              disabled: lowLevel || short || busy || !onUpgrade,
            }
      }
      note={
        cobbles != null && (
          <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            You hold <Cobbles value={cobbles} tone="muted" />
          </p>
        )
      }
    />
  );
}

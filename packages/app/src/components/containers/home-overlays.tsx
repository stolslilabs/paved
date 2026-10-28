import * as m from "motion/react-m";
import { cn } from "../../lib/utils";
import { GameIcon, type GameIconName } from "../elements/game-icon";

export interface OverlayButtonProps {
  /** The game icon (#844): the HUD draws its icons in relief, in their own colours. */
  icon: GameIconName;
  label: string;
  /** Shown under the icon in the name's place (the player's league on League): the accessible name keeps both. */
  detail?: string;
  /** A count on the button (chests waiting, missions to claim); none or 0: no badge. */
  badge?: number;
  onClick?: () => void;
  className?: string;
}

/**
 * A round button of the home's right column (#753, Clash of Clans style): its icon on a card disc, its name below, a count in a
 * badge at its top right. 56 px across, past the 44 px touch floor; the name keeps the text over the scene readable on its own
 * plate. Its accessible name says the count.
 */
export function OverlayButton({ icon, label, detail, badge = 0, onClick, className }: OverlayButtonProps) {
  const name = detail ? `${label}, ${detail}` : label;
  return (
    <m.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      aria-label={badge > 0 ? `${name}, ${badge} waiting` : name}
      className={cn("group flex w-16 flex-col items-center gap-0.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      <span className="state-layer relative grid size-12 place-items-center rounded-full border border-border bg-card/90 shadow-lg backdrop-blur tablet:size-14">
        <GameIcon name={icon} size="lg" />
        {badge > 0 && (
          <span aria-hidden className="numeric absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">
            {badge}
          </span>
        )}
      </span>
      <span aria-hidden className="rounded-md bg-background/70 px-1.5 text-center text-xs leading-tight font-semibold text-foreground backdrop-blur">
        {detail ?? label}
      </span>
    </m.button>
  );
}

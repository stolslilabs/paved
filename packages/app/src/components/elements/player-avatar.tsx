import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";

const avatarVariants = cva("relative grid shrink-0 place-items-center rounded-full", {
  variants: {
    // The box is the disc plus a 2 px band on each side: the room issue 625's ring takes (the box stays the size of a touch target).
    size: {
      md: "size-11 p-0.5",
      lg: "size-24 p-1",
    },
  },
  defaultVariants: { size: "md" },
});

const DISC = "grid size-full place-items-center rounded-full";

/** Who the avatar shows: the name the screens give the player (`PlayerName`) and the address their initial falls back to. */
export interface AvatarPlayer {
  name: string | null;
  address: string;
}

export interface PlayerAvatarProps extends VariantProps<typeof avatarVariants> {
  /** Null: a guest, drawn as a silhouette that invites to connect. */
  player: AvatarPlayer | null;
  /** The wallet is still looking for an earlier session: a placeholder of the same size. */
  loading?: boolean;
  /** Drawn over the disc, in the box's band: issue 625's ring and level badge. */
  children?: ReactNode;
  className?: string;
}

/** The initial a default avatar shows: the name's first letter, else the address's first digit after `0x`. */
export function avatarInitial(player: AvatarPlayer): string {
  return (player.name || player.address.slice(2, 3) || "?").slice(0, 1).toUpperCase();
}

/**
 * The player's avatar (issue 624): a round disc, 40 px inside a 44 px box on a phone. Connected, a default one until the avatar
 * creator (issue 626): the initial in gold on the secondary disc. A guest: a silhouette on a dashed outline. Decorative: the
 * control that holds it carries the name.
 */
export function PlayerAvatar({ player, loading, size, children, className }: PlayerAvatarProps) {
  return (
    <span data-slot="player-avatar" aria-hidden className={cn(avatarVariants({ size }), className)}>
      {loading ? (
        <span data-slot="skeleton" className={cn(DISC, "animate-pulse bg-muted motion-reduce:animate-none")} />
      ) : player ? (
        <span className={cn(DISC, "border border-primary/40 bg-secondary font-display text-primary", size === "lg" ? "text-4xl" : "text-lg")}>{avatarInitial(player)}</span>
      ) : (
        <span className={cn(DISC, "border border-dashed border-muted-foreground/60 bg-muted text-muted-foreground")}>
          <Icon name="user" size={size === "lg" ? "xl" : "md"} />
        </span>
      )}
      {children}
    </span>
  );
}

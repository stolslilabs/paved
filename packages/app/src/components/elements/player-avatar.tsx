import { lazy, Suspense, type ReactNode } from "react";
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

/** The saved avatar's still, its own chunk (the renderer's format and the still renderer stay out of the menus' first load). */
const SavedAvatar = lazy(() => import("./saved-avatar"));

/**
 * The still's side in CSS px at each size: the disc's (the box less its band), `lg` at the largest it is drawn (the home's profile
 * at the season dial's size, 144 px from `tablet`, #856; the profile sheet's 88 px disc shares that still).
 */
const DISC_PX = { md: 40, lg: 128 } as const;

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
  /**
   * The look the player saved (issue 626, read from the chain): its still image fills the disc once rendered, the initial
   * shows until then. Null or omitted: the default avatar, the initial.
   */
  look?: bigint | null;
  /** Drawn over the disc, in the box's band: issue 625's ring and level badge. */
  children?: ReactNode;
  className?: string;
}

/** The initial a default avatar shows: the name's first letter, else the address's first digit after `0x`. */
export function avatarInitial(player: AvatarPlayer): string {
  return (player.name || player.address.slice(2, 3) || "?").slice(0, 1).toUpperCase();
}

/**
 * The player's avatar (issue 624): a round disc, 40 px inside a 44 px box on a phone. Connected, the avatar they saved (issue
 * 626) as a still image (rendered once, cached: never a live WebGL context per avatar), else the default one: the initial in
 * gold on the secondary disc. A guest: a silhouette on a dashed outline. Decorative: the control that holds it carries the name.
 */
export function PlayerAvatar({ player, loading, look, size, children, className }: PlayerAvatarProps) {
  return (
    <span data-slot="player-avatar" aria-hidden className={cn(avatarVariants({ size }), className)}>
      {loading ? (
        <span data-slot="skeleton" className={cn(DISC, "animate-pulse bg-muted motion-reduce:animate-none")} />
      ) : player ? (
        <span className={cn(DISC, "relative overflow-hidden border border-primary/40 bg-secondary font-display text-primary", size === "lg" ? "text-4xl" : "text-lg")}>
          {avatarInitial(player)}
          {look ? (
            <Suspense fallback={null}>
              <SavedAvatar look={look} px={DISC_PX[size ?? "md"]} />
            </Suspense>
          ) : null}
        </span>
      ) : (
        <span className={cn(DISC, "border border-dashed border-muted-foreground/60 bg-muted text-muted-foreground")}>
          <Icon name="user" size={size === "lg" ? "xl" : "md"} />
        </span>
      )}
      {children}
    </span>
  );
}


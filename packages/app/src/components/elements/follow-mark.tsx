import type { FollowStatus } from "../../data/social-source";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";

/**
 * The mark of a player who follows the viewer (#954): "Friend" when the viewer follows them too, else "Follows you". None
 * otherwise. Never says whether they block the viewer.
 */
export function FollowMark({ status, className }: { status: Pick<FollowStatus, "followsYou" | "friend">; className?: string }) {
  if (!status.followsYou && !status.friend) return null;
  return (
    <span
      data-slot="follow-mark"
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        status.friend ? "bg-primary text-primary-foreground" : "border border-border bg-secondary text-secondary-foreground",
        className,
      )}
    >
      <Icon name={status.friend ? "user-group" : "user"} size="xs" />
      {status.friend ? "Friend" : "Follows you"}
    </span>
  );
}

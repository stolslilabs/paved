import type { FollowStatus } from "../../data/social-source";
import { cn } from "../../lib/utils";
import { FriendsArt } from "./friends-art-image";
import { UiIcon } from "./ui-icon";

/**
 * The mark of a player who follows the viewer (issue 954): "Friends" when the viewer follows them too, else "Follows you". None
 * otherwise. Never says whether they block the viewer. FRIENDS-PAGE, the book's profile: the painted handshake (the home's Friends
 * icon) or the followers' three people, the words beside it in the secondary grey.
 */
export function FollowMark({ status, className }: { status: Pick<FollowStatus, "followsYou" | "friend">; className?: string }) {
  if (!status.followsYou && !status.friend) return null;
  return (
    <span data-slot="follow-mark" className={cn("inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground", className)}>
      {status.friend ? (
        <UiIcon name="friends" px={24} className="drawer-icon size-6" />
      ) : (
        <FriendsArt part="followers" px={24} className="drawer-icon size-6" />
      )}
      {status.friend ? "Friends" : "Follows you"}
    </span>
  );
}

import { FollowProfileActions } from "../components/containers/follow-profile";
import { useFollowActions, type FollowStatus } from "../data/social";

// The follow parts of a player's public profile (#954), in the profile's chunk: the actions (Follow or Following, Block or
// Unblock). The marks and the counts are the sheet's (`follow`), from the same read (`useFollowStatus`).

/** Follow, Following (unfollow, confirmed), Block (confirmed) or Unblock, on `address`'s profile; none without a player. */
export function ProfileFollowActions({ address, name, me, status }: { address: string; name: string | null; me: string | null; status: FollowStatus | undefined }) {
  const actions = useFollowActions(me);
  if (!actions || !status) return null;
  return <FollowProfileActions status={status} name={name} onAction={(action) => actions.run(action, address)} />;
}

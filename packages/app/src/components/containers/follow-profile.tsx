import type { FollowStatus } from "../../data/social-source";
import { followErrorText } from "../../lib/follow-text";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { InlineError } from "../elements/inline-error";
import { useGuildActions } from "./guild-sheets";

/** The follow writes of another player's profile (#954). */
export type FollowProfileAction = "follow" | "unfollow" | "block" | "unblock";

export interface FollowProfileActionsProps {
  /** The other player as the viewer sees them. */
  status: FollowStatus;
  /** Their name, or null (their short address). */
  name: string | null;
  onAction?: (action: FollowProfileAction) => Promise<unknown> | void;
}

/**
 * The follow actions on another player's profile (#954): Follow (Follow back when they follow the viewer), or Following, which
 * unfollows after a confirmation; Block, confirmed, which ends each one's follow of the other. A player the viewer blocks shows
 * only Unblock. A refusal says why, a hidden block only that the action is not available.
 */
export function FollowProfileActions({ status, name, onAction }: FollowProfileActionsProps) {
  const { run, ask, dialog, pending, error } = useGuildActions(onAction, followErrorText);
  const who = name ?? "this player";
  if (status.blocking)
    return (
      <div data-slot="follow-actions" className="flex flex-col gap-2">
        <p className="text-center text-sm text-muted-foreground">You block {who}: neither of you can follow, message or invite the other.</p>
        <Button variant="outline" loading={pending} onClick={() => ask({ title: `Unblock ${who}?`, text: "They can follow you, message you and invite you again. The follows the block ended do not come back.", confirm: "Unblock" }, () => "unblock")}>
          <Icon name="lock-open" size="xs" />
          Unblock
        </Button>
        <InlineError title="Unblock" message={error} />
        {dialog}
      </div>
    );
  return (
    <div data-slot="follow-actions" className="flex flex-col gap-2">
      {status.following ? (
        <Button variant="secondary" aria-label={`Following ${who}: unfollow`} onClick={() => ask({ title: `Unfollow ${who}?`, text: status.friend ? "You stop being friends; they still follow you." : "They are not told.", confirm: "Unfollow" }, () => "unfollow")}>
          <Icon name="check" size="xs" />
          Following
        </Button>
      ) : (
        <Button loading={pending} onClick={() => void run("follow")}>
          <Icon name="plus" size="xs" />
          {status.followsYou ? "Follow back" : "Follow"}
        </Button>
      )}
      <Button
        variant="ghost"
        className="text-destructive-text"
        onClick={() =>
          ask(
            { title: `Block ${who}?`, text: "Each of you stops following the other. They can no longer follow you, message you or invite you to a guild, and you no longer see their messages. They are not told.", confirm: "Block", destructive: true },
            () => "block",
          )
        }
      >
        <Icon name="lock" size="xs" />
        Block
      </Button>
      <InlineError title="Follow" message={error} />
      {dialog}
    </div>
  );
}

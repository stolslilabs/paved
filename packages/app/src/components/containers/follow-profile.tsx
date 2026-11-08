import type { FollowStatus } from "../../data/social-source";
import { followErrorText } from "../../lib/follow-text";
import { Icon } from "../ui/icon";
import { InlineError } from "../elements/inline-error";
import { UiIcon } from "../elements/ui-icon";
import { useGuildActions } from "./guild-sheets";
import { ActionTile } from "./profile-action";

/** The follow writes of another player's profile (#954). */
export type FollowProfileAction = "follow" | "unfollow" | "block" | "unblock";

export interface FollowProfileActionsProps {
  /** The other player as the viewer sees them. */
  status: FollowStatus;
  /** Their name, or null (their short address). */
  name: string | null;
  onAction?: (action: FollowProfileAction) => Promise<unknown> | void;
}

/** A mark over a tile's icon, at its lower right: what the tile is now (Following's check) or does (Follow's plus). */
const MARK = "absolute -right-1.5 -bottom-1 size-5";

/**
 * The follow actions on another player's profile (#954): Follow (Follow back when they follow the viewer), or Following, which
 * unfollows after a confirmation; Block, confirmed, which ends each one's follow of the other. A player the viewer blocks shows
 * only Unblock. A refusal says why, a hidden block only that the action is not available. FRIENDS-PAGE (the owner's ask of
 * 2026-11-05: another player's profile is the Profile's page, its actions in place of Battle logs, Avatar, Tiles, Invite): the Profile's
 * raised tiles, the followers' three people (a plus to follow, a check once following) and Block's painted no-entry sign; its parts
 * stand in the row it is put in (`contents`), a refusal on a line of its own under them.
 */
export function FollowProfileActions({ status, name, onAction }: FollowProfileActionsProps) {
  const { run, ask, dialog, pending, error } = useGuildActions(onAction, followErrorText);
  const who = name ?? "this player";
  if (status.blocking)
    return (
      <div data-slot="follow-actions" className="contents">
        <p className="basis-full text-center text-sm font-semibold text-muted-foreground">You block {who}: neither of you can follow, message or invite the other.</p>
        <ActionTile
          art="lock"
          label="Unblock"
          loading={pending}
          onClick={() => ask({ title: `Unblock ${who}?`, text: "They can follow you, message you and invite you again. The follows the block ended do not come back.", confirm: "Unblock" }, () => "unblock")}
        />
        <InlineError title="Unblock" message={error} className="basis-full" />
        {dialog}
      </div>
    );
  return (
    <div data-slot="follow-actions" className="contents">
      {status.following ? (
        <ActionTile
          art="followers"
          label="Following"
          name={`Following ${who}: unfollow`}
          onClick={() => ask({ title: `Unfollow ${who}?`, text: status.friend ? "You stop being friends; they still follow you." : "They are not told.", confirm: "Unfollow" }, () => "unfollow")}
        >
          <span className={`${MARK} grid place-items-center rounded-full bg-success text-primary-foreground ring-2 ring-secondary`}>
            <Icon name="check" size="xs" />
          </span>
        </ActionTile>
      ) : (
        <ActionTile art="followers" label={status.followsYou ? "Follow back" : "Follow"} loading={pending} onClick={() => void run("follow")}>
          <UiIcon name="plus" px={20} className={MARK} />
        </ActionTile>
      )}
      <ActionTile
        art="block"
        label="Block"
        onClick={() =>
          ask(
            { title: `Block ${who}?`, text: "Each of you stops following the other. They can no longer follow you, message you or invite you to an allegiance, and you no longer see their messages. They are not told.", confirm: "Block", destructive: true },
            () => "block",
          )
        }
      />
      <InlineError title="Follow" message={error} className="basis-full" />
      {dialog}
    </div>
  );
}

import { useState } from "react";
import { followErrorText } from "../../lib/follow-text";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { InlineError } from "../elements/inline-error";

/** Where the viewer stands with a player found by the search: what its button offers. */
export type FollowResultState = "follow" | "follow-back" | "following" | "blocking";

export interface FollowResultButtonProps {
  state: FollowResultState;
  /** Their name, or null (their short address). */
  name: string | null;
  /** Returns the write's promise; a rejection is a refusal, said under the button. */
  onFollow?: () => Promise<unknown> | void;
}

/**
 * Follow on a result of the player search (#954): Follow, or Follow back when they follow the viewer; a player already followed
 * shows Following, one the viewer blocks Blocked (their profile unfollows and unblocks). A refusal says why under the button.
 * Light on purpose: the friends page's chunk carries it (#973).
 */
export function FollowResultButton({ state, name, onFollow }: FollowResultButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const who = name ?? "this player";
  if (state === "following" || state === "blocking")
    return (
      <span data-slot="follow-result" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Icon name={state === "following" ? "check" : "lock"} size="xs" />
        {state === "following" ? "Following" : "Blocked"}
      </span>
    );
  const follow = async () => {
    setPending(true);
    setError(null);
    try {
      await onFollow?.();
    } catch (e) {
      setError(followErrorText(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <span data-slot="follow-result" className="flex flex-col items-end gap-1">
      <Button size="sm" aria-label={`${state === "follow-back" ? "Follow back" : "Follow"} ${who}`} loading={pending} onClick={() => void follow()}>
        <Icon name="plus" size="xs" />
        {state === "follow-back" ? "Follow back" : "Follow"}
      </Button>
      <InlineError title="Follow" message={error} className="max-w-56" />
    </span>
  );
}

import { useState } from "react";
import { followErrorText } from "../../lib/follow-text";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { InlineError } from "../elements/inline-error";
import { GOLD_PILL, GOLD_PILL_STYLE, RAISED_PILL } from "./friends-panel";

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
 * FRIENDS-PAGE: the lists' pills, Follow raised and Follow back the book's gold pill. Light on purpose: the friends page's chunk carries it (#973).
 */
export function FollowResultButton({ state, name, onFollow }: FollowResultButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const who = name ?? "this player";
  if (state === "following" || state === "blocking")
    return (
      <span data-slot="follow-result" className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
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
  const back = state === "follow-back";
  return (
    <span data-slot="follow-result" className="flex flex-col items-end gap-1">
      <Button variant="ghost" className={back ? GOLD_PILL : RAISED_PILL} style={back ? GOLD_PILL_STYLE : undefined} aria-label={`${back ? "Follow back" : "Follow"} ${who}`} loading={pending} onClick={() => void follow()}>
        {back ? "Follow back" : "Follow"}
      </Button>
      <InlineError title="Follow" message={error} className="max-w-56" />
    </span>
  );
}

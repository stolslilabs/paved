import { Button } from "../ui/button";
import { Icon } from "../ui/icon";

/** Message, on another player's profile (#955): opens the private conversation with them. */
export function MessageButton({ name, onMessage }: { name: string | null; onMessage?: () => void }) {
  return (
    <Button variant="secondary" aria-label={`Message ${name ?? "this player"}`} onClick={onMessage}>
      <Icon name="comments" size="xs" />
      Message
    </Button>
  );
}

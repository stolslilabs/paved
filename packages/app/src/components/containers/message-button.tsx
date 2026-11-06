import { ActionTile } from "./profile-action";

/**
 * Message, on another player's profile (#955): opens the private conversation with them. FRIENDS-PAGE (the owner's ask of 2026-11-05:
 * another player's profile is the Profile's page): the first of its tiles, the painted speech bubble (the home's Chat icon) over the word.
 */
export function MessageButton({ name, onMessage }: { name: string | null; onMessage?: () => void }) {
  return <ActionTile art="chat" label="Message" name={`Message ${name ?? "this player"}`} onClick={() => onMessage?.()} />;
}

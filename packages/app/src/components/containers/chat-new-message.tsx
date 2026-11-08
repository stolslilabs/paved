import { useMemo } from "react";
import type { PublicProfile } from "../../data/social-source";
import { Skeleton } from "../ui/skeleton";
import { HudDrawer } from "./hud-drawer";
import { PlayerResult, PlayerSearch, type PlayerSearchProps } from "./player-search";

/** The key a list compares players by: the address in small letters, without leading zeros. */
const keyOf = (address: string): string => {
  try {
    return `0x${BigInt(address).toString(16)}`;
  } catch {
    return address.toLowerCase();
  }
};

export interface ChatNewMessageProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The player's friends (#954); null while read. */
  friends: readonly PublicProfile[] | null;
  /** Their guildmates (#953), the player left out; null while read; undefined for a player in no guild. */
  guildmates?: readonly PublicProfile[] | null;
  /** The player search (#952), under the lists; a result picked opens the conversation. */
  search: Omit<PlayerSearchProps, "onOpen" | "className">;
  /** A player picked: their private conversation opens. */
  onPick: (address: string) => void;
}

/** One list of players to write to: its title, then each player, a tap picking them. */
function Contacts({ title, players, empty, onPick }: { title: string; players: readonly PublicProfile[] | null; empty: string; onPick: (address: string) => void }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="font-semibold">{title}</h3>
      {players === null && (
        <div aria-busy className="flex flex-col gap-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      )}
      {players?.length === 0 && <p className="text-sm text-muted-foreground">{empty}</p>}
      {players && players.length > 0 && (
        <ul className="flex flex-col gap-2">
          {players.map((p) => (
            <li key={keyOf(p.address)}>
              <PlayerResult player={p} onOpen={onPick} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * New message (#973), from the chat page's Private tab: the friends first, then the guildmates who are not friends, then the
 * player search (#952). Picking a player opens the private conversation with them (a friend's or a guildmate's at once; anyone
 * else's waits in their Requests, #955). DRAWER-NAV-IN-PLACE (#1064): a page in the chat's drawer, in its place, with Back to the
 * chat; alone (no drawer open), its own drawer.
 */
export function ChatNewMessage({ open, onOpenChange, friends, guildmates, search, onPick }: ChatNewMessageProps) {
  // A friend who is also a guildmate shows once, among the friends.
  const mates = useMemo(() => {
    if (!guildmates || !friends) return guildmates ?? null;
    const known = new Set(friends.map((p) => keyOf(p.address)));
    return guildmates.filter((p) => !known.has(keyOf(p.address)));
  }, [friends, guildmates]);
  const pick = (address: string) => {
    onOpenChange(false);
    onPick(address);
  };
  return (
    <HudDrawer open={open} onOpenChange={onOpenChange} title="New message" side="right" slot="chat-new-message" inPlace>
      <div data-slot="chat-new-message" className="flex flex-col gap-5 pb-2">
        <p className="text-sm font-semibold text-muted-foreground">Write to a friend or a member of your allegiance, or find any player.</p>
        <Contacts title="Friends" players={friends} empty="No friends yet: when a player you follow follows you back, you are friends." onPick={pick} />
        {guildmates !== undefined && <Contacts title="Allegiance" players={mates} empty="No other member yet." onPick={pick} />}
        <section aria-label="Someone else" className="flex flex-col gap-2">
          <h3 className="font-semibold">Someone else</h3>
          <PlayerSearch {...search} onOpen={pick} />
        </section>
      </div>
    </HudDrawer>
  );
}

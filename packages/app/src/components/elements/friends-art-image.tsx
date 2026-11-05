import { cn } from "../../lib/utils";
import { friendsPartSources, type FriendsArtName } from "./friends-art";

/**
 * One of the friends page's painted icons (`friends-art.ts`: the followers' three people, Block's no-entry sign), drawn as a
 * `UiIcon` is, from its own chunk's art rather than the first load's. Decorative: the control that holds it carries its name.
 */
export function FriendsArt({ part, px, className }: { part: FriendsArtName; px: number; className?: string }) {
  return <img {...friendsPartSources(part, px)} alt="" aria-hidden decoding="async" draggable={false} className={cn("inline-block shrink-0 select-none", className)} />;
}

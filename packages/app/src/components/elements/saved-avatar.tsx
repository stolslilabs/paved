import { useMemo } from "react";
import { decodeTraits } from "@paved/renderer";
import { useAvatarStill } from "./avatar-still";

export interface SavedAvatarProps {
  /** The look saved on chain (the traits' value), not 0. */
  look: bigint;
  /** The image's side in CSS px. */
  px: number;
}

/**
 * The saved avatar's still over `PlayerAvatar`'s initial, once rendered (issue 626). Its own chunk, loaded only for a player
 * who saved one: it decodes the look and asks the page's one still renderer, so the menus' first load takes neither.
 */
export default function SavedAvatar({ look, px }: SavedAvatarProps) {
  const traits = useMemo(() => decodeTraits(look), [look]);
  const src = useAvatarStill(traits, px);
  return src ? <img data-slot="avatar-still" src={src} alt="" width={px} height={px} className="absolute inset-0 block size-full" draggable={false} /> : null;
}

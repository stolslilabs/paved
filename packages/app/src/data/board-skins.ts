import { useQuery } from "@tanstack/react-query";
import { NO_SKINS, skinsOf, type TileSkins } from "@paved/renderer";
import { skinKeys, skinViews, useShowSkins } from "./skins";
import { useDataSources } from "./sources";
import type { BoardViewportProps } from "../components/containers/board-viewport";
import type { TileViewProps } from "../components/containers/tile-view";

// The board's skins (SKIN-RENDER): the active set of the player whose tiles the board draws, read from `Setup`'s
// `active_skins` (the theme page's read, same key, so a save there moves the board too), as the renderer's per-plan map.
// The board never waits for it: the base models until it answers, and for good when it fails.

/**
 * The tile skins of `playerId` (`active_skins(player)`, as `TileSkins`), for the board to draw: a Challenge game's player
 * (anyone viewing that game sees its player's skins), or the connected player in Training and the tutorial. `NO_SKINS`
 * (every tile on its base model) for a guest (null), without the skins views, while the read is on its way, and when it
 * fails. And `NO_SKINS` for a viewer who opted out on this device (`useShowSkins`), with no read made: the renderer then
 * asks for no variant, so no skin model is downloaded.
 */
export function useBoardSkins(playerId: string | null): TileSkins {
  const { views } = useDataSources();
  const skins = skinViews(views);
  const [show] = useShowSkins();
  const read = useQuery({
    queryKey: skinKeys.active(playerId ?? "0x0"),
    queryFn: () => skins!.activeSkins(playerId!),
    enabled: show && playerId !== null && skins !== null,
    select: skinsOf,
  });
  return (show && playerId !== null && read.data) || NO_SKINS;
}

// Compile-time check, no runtime code (as `skins.ts`'s): the hook's map is what `BoardViewport` and `TileView` take.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
export type BoardSkinTypes = [
  Expect<Equal<ReturnType<typeof useBoardSkins>, NonNullable<BoardViewportProps["skins"]>>>,
  Expect<Equal<ReturnType<typeof useBoardSkins>, NonNullable<TileViewProps["skins"]>>>,
];

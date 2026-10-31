import { lazy, Suspense, useState } from "react";
import { useSearchParams } from "react-router";

// Another player's public profile (#952) is the URL's `?player=<id>`: a link opens it, and Back closes it. A tap on a player's
// name or avatar where the app lists other players (the battle logs' cards, the search's results, later the guild's members,
// the friends and the chat) opens it (`useOpenPlayer`, `open-player.ts`), and `/player/:id` lands on the home with it
// (`router.tsx`). The pages that list other players mount the host: the home, and below `desktop` the pages that are not drawn
// over it (from `desktop` the home stays mounted under a panel's page, and its host serves). None of it is in the shell's first
// load. Its closing (`player-profile-host.tsx`), then the sheet and its reads (`player-profile-sheet.tsx`), are their own
// chunks, fetched when a profile is first asked for.

const Host = lazy(() => import("./player-profile-host"));

/** The public profile of the URL's `?player=`, mounted once a profile is first asked for, so its chunks load only then. */
export function PlayerProfileHost() {
  const [params] = useSearchParams();
  const [asked, setAsked] = useState(false);
  // `PLAYER_PARAM` (`player-param.ts`), as a literal: that module stays out of the home's first load.
  if (!asked && params.has("player")) setAsked(true);
  return asked ? (
    <Suspense fallback={null}>
      <Host />
    </Suspense>
  ) : null;
}

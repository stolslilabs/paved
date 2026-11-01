import { useState } from "react";
import { formatInteger } from "@paved/game-core";
import type { PublicProfile } from "../../data/social-source";
import { useSidePanel } from "../../lib/side-panel";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";
import { InlineError } from "../elements/inline-error";
import { PlayerAvatar } from "../elements/player-avatar";
import { PlayerName } from "../elements/player-name";

/** The side panel from `desktop`; the bottom sheet under it. */
const DESKTOP_QUERY = "(min-width: 64rem)";

export interface ChatMenuProps {
  /** The players the player mutes, the latest first; null while read. */
  mutes: readonly PublicProfile[] | null;
  onUnmute?: (address: string) => Promise<unknown> | void;
  onOpenPlayer?: (address: string) => void;
  /** Where the muted players' sheet starts: open for its story. */
  initialMutedOpen?: boolean;
}

/**
 * The chat page's menu (#973), at the header's top right: the muted players (#955), with Unmute, in a sheet (the side panel from
 * `desktop`, a bottom sheet under it).
 */
export function ChatMenu({ mutes, onUnmute, onOpenPlayer, initialMutedOpen = false }: ChatMenuProps) {
  const [mutedOpen, setMutedOpen] = useState(initialMutedOpen);
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" aria-label="Chat menu">
            <Icon name="ellipsis" size="sm" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setMutedOpen(true)}>
            <Icon name="volume-xmark" size="xs" fixedWidth />
            Muted players{mutes && mutes.length > 0 && <span className="numeric">({formatInteger(mutes.length)})</span>}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <MutedSheet open={mutedOpen} onOpenChange={setMutedOpen} mutes={mutes} onUnmute={onUnmute} onOpenPlayer={onOpenPlayer} />
    </>
  );
}

interface MutedSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mutes: readonly PublicProfile[] | null;
  onUnmute?: (address: string) => Promise<unknown> | void;
  onOpenPlayer?: (address: string) => void;
}

/** The muted players, each with Unmute. A mute is the player's own: the muted player is not told. */
function MutedSheet({ open, onOpenChange, mutes, onUnmute, onOpenPlayer }: MutedSheetProps) {
  const desktop = useSidePanel(DESKTOP_QUERY);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unmute = (address: string) => {
    setBusy(address);
    setError(null);
    void Promise.resolve(onUnmute?.(address))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Something went wrong."))
      .finally(() => setBusy(null));
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={desktop ? "right" : "bottom"} data-slot="muted-players" className={desktop ? undefined : "max-h-[92dvh]"}>
        <SheetHeader>
          <SheetTitle>Muted players</SheetTitle>
          <SheetDescription>Their messages are hidden from you in the World and in your guild. They are not told.</SheetDescription>
        </SheetHeader>
        <ScrollRegion className="-mx-6 min-h-0 px-6">
          {mutes === null && <Skeleton aria-busy className="h-16 rounded-xl" />}
          {mutes?.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">You mute no one. Mute a player from one of their messages.</p>}
          {mutes && mutes.length > 0 && (
            <ul className="flex flex-col gap-2">
              {mutes.map((p) => (
                <li key={p.address} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card p-2 pr-3">
                  <button
                    type="button"
                    aria-label={p.name ?? p.address}
                    onClick={() => onOpenPlayer?.(p.address)}
                    className="state-layer flex min-h-12 min-w-0 flex-[1_1_10rem] items-center gap-3 rounded-lg px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <PlayerAvatar player={{ name: p.name, address: p.address }} look={p.look} />
                    <PlayerName name={p.name} address={p.address} className="min-w-0 font-semibold" />
                  </button>
                  <Button size="sm" variant="outline" className="ml-auto" aria-label={`Unmute ${p.name ?? "this player"}`} loading={busy === p.address} disabled={busy !== null} onClick={() => unmute(p.address)}>
                    <Icon name="volume-high" size="xs" />
                    Unmute
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <InlineError title="Unmute" message={error} className="mt-2" />
        </ScrollRegion>
      </SheetContent>
    </Sheet>
  );
}

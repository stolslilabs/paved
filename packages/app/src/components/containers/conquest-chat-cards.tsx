import type { ConquestBuiltState, ConquestRequestState } from "../../data/conquest-source";
import { cn } from "../../lib/utils";
import { RARITY_NAME } from "../elements/rarity-badge";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { TokenIcon } from "../elements/token-icon";
import { UiIcon } from "../elements/ui-icon";
import { Button } from "../ui/button";

export interface ConquestChatCardsProps {
  /** The allegiance's open build requests. */
  requests: readonly ConquestRequestState[];
  /** The last tiles it built, the latest first. */
  built: readonly ConquestBuiltState[];
  /** The orders it has left today. */
  orders: number;
  /** The gift on its way: every Give waits. */
  busy?: boolean;
  onGive?: (request: number) => void;
  /** A card's cell on the map. */
  onOpen?: (zone: number) => void;
  /** Every request, on the Conquest's page. */
  onAll?: () => void;
  tileArt?: TileArt;
  className?: string;
}

/** The cards the guild's chat shows at most. */
const SHOWN = 2;

/**
 * The Conquest in the guild's chat (the design proposal's "The chat carries it"): a live card per open build request (the tile
 * wanted and its cell, who asked, who holds one, what the gift pays, then Give) and one per tile just built (who gave it). They are
 * read from the Conquest, not kept as messages: a card goes when its request is built, and the built one takes its place.
 */
export function ConquestChatCards({ requests, built, orders, busy = false, onGive, onOpen, onAll, tileArt, className }: ConquestChatCardsProps) {
  if (requests.length === 0 && built.length === 0) return null;
  const more = requests.length - SHOWN;
  return (
    <section aria-label="Conquest" data-slot="conquest-chat" className={cn("flex shrink-0 flex-col gap-1.5", className)}>
      {requests.slice(0, SHOWN).map((r) => (
        <article key={r.id} data-request={r.id} aria-label={`Build request: ${tileName(r.plan)} on ${r.zoneName}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-primary/60 bg-card px-3 py-2">
          <TileChip plan={r.plan} orientation={r.orientation} art={tileArt} className="size-11" />
          <button type="button" onClick={() => onOpen?.(r.zone)} className="flex min-h-11 min-w-32 flex-1 cursor-pointer flex-col items-start justify-center text-left">
            <span className="flex items-center gap-1 text-xs font-extrabold tracking-widest text-primary uppercase">
              <UiIcon name="hammer" px={14} className="size-3.5" />
              Build request
            </span>
            <span className="text-sm font-bold">
              {tileName(r.plan)} · {r.zoneName}
            </span>
            <span className="text-xs font-semibold text-muted-foreground">
              asked by <span className="wrap-anywhere">{r.by.name ?? "a member"}</span> · {RARITY_NAME[r.rarity]} · <span className="numeric">{r.holders}</span> {r.holders === 1 ? "holds" : "hold"} one
            </span>
            <span className="flex items-center gap-1 text-xs font-bold">
              <TokenIcon kind="cobbles" size="sm" px={14} className="size-3.5" />
              <span className="numeric">+{r.cobbles}</span> · {r.held > 0 ? <span className="text-info">you hold {r.held}</span> : <span className="text-muted-foreground">you hold none</span>}
            </span>
          </button>
          <Button className="ml-auto h-11" disabled={r.held === 0 || orders < 1 || busy} aria-busy={busy || undefined} aria-label={`Give ${tileName(r.plan)} for ${r.cobbles} ${r.cobbles === 1 ? "Cobble" : "Cobbles"}`} onClick={() => onGive?.(r.id)}>
            Give
          </Button>
        </article>
      ))}
      {more > 0 && (
        <Button variant="secondary" size="sm" className="h-11" onClick={onAll}>
          <span className="numeric">{more}</span> more {more === 1 ? "request" : "requests"}
        </Button>
      )}
      {built.slice(0, 1).map((b) => (
        <article key={`${b.x},${b.y}`} data-built aria-label={`Tile built: ${tileName(b.plan)} on ${b.zoneName}`} className="flex items-center gap-3 rounded-2xl border border-success/50 bg-card px-3 py-2">
          <TileChip plan={b.plan} orientation={b.orientation} art={tileArt} className="size-9" />
          <button type="button" onClick={() => onOpen?.(b.zone)} className="flex min-h-11 min-w-0 flex-1 cursor-pointer flex-col items-start justify-center text-left">
            <span className="text-xs font-extrabold tracking-widest text-success uppercase">Built</span>
            <span className="text-sm font-semibold text-muted-foreground">
              <strong className="text-foreground wrap-anywhere">{b.by.name ?? "A member"}</strong> built {tileName(b.plan)} on {b.zoneName}
            </span>
          </button>
        </article>
      ))}
    </section>
  );
}

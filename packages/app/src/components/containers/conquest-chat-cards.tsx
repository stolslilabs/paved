import type { ReactNode } from "react";
import type { ConquestBuiltState, ConquestRequestState } from "../../data/conquest-source";
import { ConquestTile } from "../elements/conquest-art";
import { GoldButton } from "../elements/gold-button";
import { RARITY_NAME } from "../elements/rarity-badge";
import { tileName, type TileRenders } from "../elements/tile-render";
import { UiIcon } from "../elements/ui-icon";

/** A card the guild's conversation shows among its messages, at its time. */
export interface ConquestChatCard {
  id: string;
  at: number;
  node: ReactNode;
}

const cellOf = (c: { x: number; y: number }) => (
  <>
    Cell <span className="numeric">{c.x}</span>, <span className="numeric">{c.y}</span>
  </>
);

/**
 * A build request in the guild's chat (the proposal's "The chat carries it"): who opened it, the tile wanted and its rarity, its cell,
 * the members who hold one and what the viewer can give, then its one action, which opens the cell on the map.
 */
export function ConquestRequestCard({ request, renders, onOpen }: { request: ConquestRequestState; renders?: TileRenders; onOpen?: () => void }) {
  return (
    <article data-slot="conquest-chat-card" data-request={request.id} aria-label={`Build request: ${tileName(request.plan)}`} className="flex flex-col gap-2.5 rounded-2xl border-2 border-primary/70 bg-card px-3 py-2.5">
      <div className="flex items-center gap-2">
        <UiIcon name="hammer" px={20} className="size-5 shrink-0" />
        <span className="min-w-0 flex-1 text-sm font-bold text-primary wrap-anywhere">New build request · {request.by.name ?? "a member"}</span>
        <span className="shrink-0 rounded-md bg-primary px-2 py-px text-xs font-extrabold tracking-widest text-primary-foreground uppercase">Open</span>
      </div>
      <div className="flex items-center gap-3">
        <ConquestTile plan={request.plan} orientation={request.orientation} renders={renders} className="size-16 border-2 border-primary/70" />
        <div className="flex min-w-0 flex-col">
          <span className="text-base leading-tight font-bold">
            {tileName(request.plan)} · {RARITY_NAME[request.rarity].toLowerCase()}
          </span>
          <span className="text-sm font-semibold text-muted-foreground">
            {cellOf(request)} · zone {request.zoneName}
          </span>
          <span className="text-sm font-bold text-success">
            <span className="numeric">{request.holders}</span> {request.holders === 1 ? "member holds" : "members hold"} it · {request.held > 0 ? <>you can give <span className="numeric">{request.held}</span></> : "you hold none to give"}
          </span>
        </div>
      </div>
      <GoldButton className="w-full" aria-label={`Open the cell of ${tileName(request.plan)} on the map`} onClick={onOpen}>
        Open
      </GoldButton>
    </article>
  );
}

/** A tile just built, in the guild's chat: the tile and its cell, who gave it and what the gift paid. */
export function ConquestBuiltCard({ built, renders, onOpen }: { built: ConquestBuiltState; renders?: TileRenders; onOpen?: () => void }) {
  return (
    <article data-slot="conquest-chat-card" data-built aria-label={`Tile built: ${tileName(built.plan)}`} className="rounded-2xl border-2 border-success/70 bg-card">
      <button type="button" onClick={onOpen} className="flex min-h-14 w-full cursor-pointer items-center gap-3 px-3 py-2 text-left">
        <ConquestTile plan={built.plan} orientation={built.orientation} renders={renders} className="size-12" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-base leading-tight font-bold">
            {tileName(built.plan)} · {cellOf(built)}
          </span>
          <span className="text-sm font-semibold text-muted-foreground">
            Built by <strong className="text-foreground wrap-anywhere">{built.by.name ?? "a member"}</strong> · <span className="numeric">+{built.cobbles}</span> {built.cobbles === 1 ? "Cobble" : "Cobbles"}
          </span>
        </span>
        <span className="shrink-0 rounded-md bg-success px-2 py-px text-xs font-extrabold tracking-widest text-background uppercase">Built</span>
      </button>
    </article>
  );
}

/**
 * The Conquest's cards of the guild's conversation, each at its time among the messages: an open request since it was asked, a
 * tile built since it was given. Read from the Conquest, not kept as messages: an open request's card goes when it is built, and
 * the built one stands in its place.
 */
export function conquestChatCards({ requests, built, renders, onOpen }: { requests: readonly ConquestRequestState[]; built: readonly ConquestBuiltState[]; renders?: TileRenders; onOpen?: (zone: number) => void }): ConquestChatCard[] {
  return [
    ...built.map((b) => ({ id: `built:${b.x},${b.y}`, at: b.at, node: <ConquestBuiltCard built={b} renders={renders} onOpen={() => onOpen?.(b.zone)} /> })),
    ...requests.map((r) => ({ id: `request:${r.id}`, at: r.at, node: <ConquestRequestCard request={r} renders={renders} onOpen={() => onOpen?.(r.zone)} /> })),
  ].sort((a, b) => a.at - b.at);
}

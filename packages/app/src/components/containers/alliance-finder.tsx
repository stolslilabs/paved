import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import * as m from "motion/react-m";
import { ALLIANCE_ACTOR_RANK, ALLIANCE_MAX_GUILDS, formatInteger, type AllianceDraft } from "@paved/game-core";
import type { AllianceSummary, GuildSummary, PlayerAlliance } from "../../data/social-source";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { AllianceEmblem, GuildCount } from "../elements/alliance-emblem";
import { DrawerRow } from "../elements/drawer-row";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { listRowShape } from "../elements/list-row";
import { rankingArtSources } from "../elements/ranking-art";
import { UiIcon } from "../elements/ui-icon";
import { AllianceForm, NEW_ALLIANCE } from "./alliance-form";
import { AllianceGuildRow, OwnTag, RAISED, RowScore, useAllianceActions } from "./alliance-page";
import { EMPTY, RAISED_FACE, TabSection, VIEW_LINE, rowRule } from "./guild-page";
import { ViewHeader, useDrawerView } from "./hud-drawer";

/** An alliance's row: its emblem on its laurel, its name, its guilds, its score; the viewer's own on the gold wash with "Yours". */
export function AllianceRow({ alliance, own = false, onOpen, className }: { alliance: AllianceSummary; own?: boolean; onOpen?: () => void; className?: string }) {
  return (
    <button
      type="button"
      data-slot="alliance-row"
      data-own={own || undefined}
      aria-label={`${alliance.name}${own ? " (your alliance)" : ""}, ${formatInteger(alliance.guilds)} of ${ALLIANCE_MAX_GUILDS} guilds, ${formatInteger(alliance.score)} ${alliance.score === 1 ? "crown" : "crowns"}`}
      onClick={onOpen}
      className={cn("state-layer flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-left outline-none", own && "bg-primary/15", className)}
    >
      <AllianceEmblem emblem={alliance.emblem} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="text-outline max-w-full min-w-0 pr-0.5 text-sm leading-snug font-bold wrap-anywhere">{alliance.name}</span>
        <span className="flex min-h-5 max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <GuildCount guilds={alliance.guilds} className="text-xs leading-tight font-bold text-muted-foreground" />
          {own && <OwnTag>Yours</OwnTag>}
        </span>
      </span>
      <RowScore value={alliance.score} />
    </button>
  );
}

/** An invitation's answer: the raised grey, its icon before its word. */
const ANSWER = "text-outline h-10 min-w-0 gap-1.5 rounded-xl px-2 text-sm font-bold";

/** A list read as the finder shows it: the alliances (null while read), or why it failed, with Retry. */
export interface AllianceList {
  alliances: readonly AllianceSummary[] | null;
  error?: string | null;
  errorDetail?: ErrorDetail;
  onRetry?: () => void;
}

/** The search's field: carved, the painted magnifier at its start (the guild finder's). */
const SEARCH = "drawer-carved flex min-w-0 items-center gap-2 rounded-xl px-3";

/**
 * Find an alliance (ALLIANCES): the search by name, carved, then the alliances found, or every alliance by score while it is empty; a
 * row opens the alliance's page (where a guild's leader asks to join).
 */
export function AllianceBrowse({ query, onQueryChange, list, mine = null, onOpenAlliance }: { query: string; onQueryChange?: (query: string) => void; list: AllianceList; mine?: number | null; onOpenAlliance?: (id: number) => void }) {
  const items = list.alliances;
  return (
    <div data-slot="alliance-browse" className="flex flex-col gap-3">
      <label className={SEARCH}>
        <UiIcon name="find" px={20} className="size-5 shrink-0" />
        <input type="search" aria-label="Search alliances" placeholder="Alliance name" autoComplete="off" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm font-semibold outline-none placeholder:text-muted-foreground" value={query} onChange={(e) => onQueryChange?.(e.target.value)} />
      </label>
      <TabSection title={query.trim() === "" ? "Alliances" : "Found"} count={items?.length ?? 0}>
        <InlineError title="Could not load the alliances" message={list.error} detail={list.errorDetail} />
        {items === null && !list.error && (
          <div role="status" aria-label="Loading the alliances" className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        )}
        {items?.length === 0 && <p className={EMPTY}>{query.trim() === "" ? "No alliance yet: create the first." : "No alliance has this name."}</p>}
        {items && items.length > 0 && (
          <ul aria-label="Alliances" className="drawer-carved flex flex-col rounded-xl">
            {items.map((a, i) => (
              <li key={a.id} className={cn("flex", rowRule(i))}>
                <AllianceRow alliance={a} own={a.id === mine} onOpen={() => onOpenAlliance?.(a.id)} className={listRowShape(i, items.length)} />
              </li>
            ))}
          </ul>
        )}
      </TabSection>
    </div>
  );
}

/**
 * Invite a guild (ALLIANCES), the alliance leader's view: the search by name or tag, carved, then the guilds found, or every guild by
 * score while it is empty, on the alliance's guild rows; a row opens the guild's page, where Invite is (as Invite a player opens a profile).
 */
export function GuildPicker({ query, onQueryChange, guilds, error, errorDetail, onOpenGuild }: { query: string; onQueryChange?: (query: string) => void; guilds: readonly GuildSummary[] | null; error?: string | null; errorDetail?: ErrorDetail; onOpenGuild?: (id: number) => void }) {
  return (
    <div data-slot="guild-picker" className="flex flex-col gap-3">
      <label className={SEARCH}>
        <UiIcon name="find" px={20} className="size-5 shrink-0" />
        <input type="search" aria-label="Search guilds" placeholder="Guild name or #tag" autoComplete="off" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm font-semibold outline-none placeholder:text-muted-foreground" value={query} onChange={(e) => onQueryChange?.(e.target.value)} />
      </label>
      <TabSection title={query.trim() === "" ? "Guilds" : "Found"} count={guilds?.length ?? 0}>
        <InlineError title="Could not load the guilds" message={error} detail={errorDetail} />
        {guilds === null && !error && (
          <div role="status" aria-label="Loading the guilds" className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        )}
        {guilds?.length === 0 && <p className={EMPTY}>No guild has this name or tag.</p>}
        {guilds && guilds.length > 0 && (
          <ul aria-label="Guilds" className="drawer-carved flex flex-col rounded-xl">
            {guilds.map((g, i) => (
              <li key={g.id} className={cn("flex", rowRule(i))}>
                <AllianceGuildRow guild={g} onOpen={() => onOpenGuild?.(g.id)} className={listRowShape(i, guilds.length)} />
              </li>
            ))}
          </ul>
        )}
      </TabSection>
    </div>
  );
}

/** What a guild in no alliance may do, each one a write of the source. */
export type NoAllianceAction = { type: "create"; draft: AllianceDraft } | { type: "answer-invitation"; alliance: number; accept: boolean } | { type: "cancel-request" };

/** A view the "No alliance" page opens in the drawer: Create an alliance, Find an alliance. */
export type NoAllianceView = "create" | "find";

export interface NoAllianceProps {
  /** The player's alliance state (no alliance: `alliance` null). */
  player: PlayerAlliance;
  onAction?: (action: NoAllianceAction) => Promise<unknown> | void;
  onOpenAlliance?: (id: number) => void;
  /** Find an alliance's search and list, as the route reads them. */
  query: string;
  onQueryChange?: (query: string) => void;
  list: AllianceList;
  /** Back out of the view (the route's): its header says "Alliance". */
  onClose?: () => void;
  /** The view it starts on (its stories; the route's, back from an alliance opened in Find). */
  initialView?: NoAllianceView;
  /** The view shown changed (the route keeps it in the history entry, so Back from an alliance comes back to it). */
  onViewChange?: (view: NoAllianceView | null) => void;
}

/**
 * The guild page's Alliance for a guild in no alliance (ALLIANCES), a view of the Guild drawer: "No alliance" written out under the
 * Alliances icon (an absence is written, never an empty icon alone). For the guild's leader, the invitations their guild holds (each
 * row opening the alliance, a raised Accept and Decline), its request waiting (a raised Cancel), then Create an alliance and Find an
 * alliance as the guild menu's raised rows, each opening its view in the drawer. For the others, one line: the leader decides.
 */
export function NoAlliance({ player, onAction, onOpenAlliance, query, onQueryChange, list, onClose, initialView, onViewChange }: NoAllianceProps) {
  const { run, dialog, pending, error } = useAllianceActions(onAction);
  const leader = player.guild !== null && player.guild.rank >= ALLIANCE_ACTOR_RANK;
  const [views, setStack] = useState<readonly NoAllianceView[]>(initialView ? [initialView] : []);
  const stack = leader ? views : [];
  const view = stack.at(-1) ?? null;
  const setViews = (next: readonly NoAllianceView[]) => {
    setStack(next);
    onViewChange?.(next.at(-1) ?? null);
  };
  const back = () => setViews(stack.slice(0, -1));
  const titles: Record<NoAllianceView, string> = { create: "Create an alliance", find: "Find an alliance" };
  const viewTitle = view === null ? null : titles[view];
  const inDrawer = useDrawerView(viewTitle ?? (onClose ? "Alliance" : null), view === null && onClose ? onClose : back);
  const viewKey = view ?? "none";
  const shown = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const region = shown.current?.closest("[data-hud-drawer-body]");
    if (region) region.scrollTop = 0;
    shown.current?.focus({ preventScroll: true });
  }, [viewKey]);

  let body: ReactNode;
  if (view === "create")
    body = (
      <>
        <p className={VIEW_LINE}>Your guild becomes its head guild, and you its leader. Free for now.</p>
        <AllianceForm mode="create" initial={NEW_ALLIANCE} pending={pending} error={error} onSubmit={(draft) => void run({ type: "create", draft }).then((done) => done && setViews([]))} />
      </>
    );
  else if (view === "find")
    body = (
      <>
        <p className={VIEW_LINE}>Open an alliance to ask it to take your guild in.</p>
        <AllianceBrowse query={query} onQueryChange={onQueryChange} list={list} onOpenAlliance={onOpenAlliance} />
      </>
    );
  else
    body = (
      <>
        <section data-slot="no-alliance" aria-label="No alliance" className="drawer-carved flex min-w-0 items-center gap-3 rounded-xl p-3">
          <img {...rankingArtSources("alliances", 56)} alt="" draggable={false} decoding="async" className="size-14 shrink-0 opacity-50 grayscale" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-outline text-lg leading-tight font-bold">No alliance</p>
            <p className="text-xs leading-snug font-semibold text-muted-foreground">{leader ? `${player.guild!.name} is in no alliance.` : "Your guild's leader can create one or ask to join one."}</p>
          </div>
        </section>
        <InlineError title="Alliance" message={error} />

        {leader && player.invitations.length > 0 && (
          <TabSection title="Invitations" count={player.invitations.length}>
            <ul className="drawer-carved flex flex-col rounded-xl">
              {player.invitations.map((v, i) => (
                <li key={v.alliance.id} data-slot="alliance-invited" className={cn("flex min-w-0 flex-col gap-1.5 pb-2.5", rowRule(i))}>
                  <AllianceRow alliance={v.alliance} onOpen={() => onOpenAlliance?.(v.alliance.id)} />
                  {/* Its answer under it, side by side (the guild finder's invitations): Decline and Accept, raised. */}
                  <div className="grid grid-cols-2 gap-2 px-2">
                    <Button variant="ghost" style={RAISED} aria-label={`Decline ${v.alliance.name}`} disabled={pending} onClick={() => void run({ type: "answer-invitation", alliance: v.alliance.id, accept: false })} className={ANSWER}>
                      <Icon name="xmark" size="sm" />
                      Decline
                    </Button>
                    <Button variant="ghost" style={RAISED} aria-label={`Accept ${v.alliance.name}`} disabled={pending} onClick={() => void run({ type: "answer-invitation", alliance: v.alliance.id, accept: true })} className={ANSWER}>
                      <Icon name="check" size="sm" className="text-success" />
                      Accept
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </TabSection>
        )}

        {leader && player.request && (
          <TabSection title="Request" count={1}>
            <div data-slot="alliance-requested" className="drawer-carved flex min-w-0 items-center gap-1 rounded-xl py-1 pr-1.5">
              <AllianceRow alliance={player.request.alliance} onOpen={() => onOpenAlliance?.(player.request!.alliance.id)} className="flex-1" />
              <button type="button" aria-label="Cancel the request" disabled={pending} onClick={() => void run({ type: "cancel-request" })} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg outline-none disabled:opacity-50">
                <span className={cn(RAISED_FACE, "size-9")}>
                  <Icon name="xmark" size="sm" />
                </span>
              </button>
            </div>
          </TabSection>
        )}

        {leader && (
          <ul aria-label="Alliance" className="flex flex-col gap-2">
            <li>
              <DrawerRow art={<img {...rankingArtSources("alliances", 40)} alt="" draggable={false} decoding="async" className="drawer-icon size-10" />} label="Create an alliance" next onClick={() => setViews([...stack, "create"])} />
            </li>
            <li>
              <DrawerRow art="find" label="Find an alliance" next onClick={() => setViews([...stack, "find"])} />
            </li>
          </ul>
        )}
      </>
    );

  return (
    <div data-slot="no-alliance-page" className="flex flex-col gap-4">
      {!inDrawer && viewTitle !== null && <ViewHeader title={viewTitle} onBack={back} />}
      <m.div key={viewKey} ref={shown} tabIndex={-1} data-slot="alliance-view" data-view={viewKey} initial={view !== null && { x: 48, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.22, ease: "easeOut" }} className="flex flex-col gap-4 outline-none">
        {body}
      </m.div>
      {dialog}
    </div>
  );
}

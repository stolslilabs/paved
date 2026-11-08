import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import * as m from "motion/react-m";
import { ALLIANCE_ACTOR_RANK, ALLIANCE_MAX_GUILDS, GUILD_MAX_MEMBERS, formatInteger, leaveAllianceRefusal, leaveDisbandsAlliance, type AllianceRole, type AllianceSettings } from "@paved/game-core";
import type { AllianceView, GuildSummary } from "../../data/social-source";
import { ALLIANCE_REFUSALS, ROLE_NAMES, allianceErrorText } from "../../lib/alliance-text";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { AllianceEmblem } from "../elements/alliance-emblem";
import { allianceArtSources } from "../elements/emblem-art";
import { GOLD_ACTION, GoldShine } from "../elements/gold-action";
import { GuildEmblem } from "../elements/guild-emblem";
import { InlineError } from "../elements/inline-error";
import { listRowShape } from "../elements/list-row";
import type { UiIconName } from "../elements/ui-art";
import { UiIcon } from "../elements/ui-icon";
import { AllianceForm } from "./alliance-form";
import { MemberCount } from "./guild-card";
import { CHOSEN, EMPTY, Figure, GuildDescription, GuildMenu, PILL, RAISED_FACE, TabSection, VIEW_LINE, rowRule, type GuildMenuItem } from "./guild-page";
import { HudDialog } from "./hud-dialog";
import { DrawerFooter, ViewHeader, useDrawerView } from "./hud-drawer";

/** What the leader of a guild outside the alliance may do on its page, as the route works it out with game-core's checks. */
export type AllianceApply =
  /** Their guild is in no alliance and may ask: Request to join. */
  | { kind: "request" }
  /** Their guild's request waits here: Cancel. */
  | { kind: "requested" }
  /** Their guild holds an invitation from this alliance: Accept or Decline. */
  | { kind: "invited" }
  /** They may not ask: why (the alliance full, a request waiting elsewhere). */
  | { kind: "blocked"; reason: string };

/** The alliance page's actions, each one a write of the source. */
export type AlliancePageAction =
  | { type: "request" }
  | { type: "cancel-request" }
  | { type: "answer-invitation"; accept: boolean }
  | { type: "answer-request"; guild: number; accept: boolean }
  | { type: "settings"; settings: AllianceSettings }
  | { type: "leave" };

/** A view the alliance page opens in the drawer, in its own place: the menu, and what it opens (Invite a guild, Alliance settings). */
export type AlliancePageView = "menu" | "invite" | "settings";

export interface AlliancePageProps {
  alliance: AllianceView;
  /** The viewer's guild (its row "Yours"), or null. */
  myGuild?: number | null;
  /** The clock, in seconds. */
  now: number;
  /** For the leader of a guild outside it: what they may do. Left out: nothing offered. */
  apply?: AllianceApply;
  /** Each action, as the source's write (its promise: a refusal keeps the dialog open with why). */
  onAction?: (action: AlliancePageAction) => Promise<unknown> | void;
  /** Opens a guild's page (over the drawer): a guild's row, a request's, an invitation's. Its page holds what the leader does to it. */
  onOpenGuild?: (id: number) => void;
  /** The menu's Invite a guild (the alliance's leader): the guild search, drawn in its view. */
  invite?: ReactNode;
  /** The view the page starts on (its stories). */
  initialView?: AlliancePageView;
  /** Where the description starts: unfolded for its story. */
  initialUnfolded?: boolean;
  /**
   * The page is a view of the guild page's drawer: its header says "Alliance" and its Back calls this (the route's: back to where it was
   * opened from). Left out, the drawer's header is the page's own.
   */
  onClose?: () => void;
}

/**
 * The raised grey answer (the Shop's `PRICE`, the search's Cancel): the drawer's raised grey with its lip, the state layer over it.
 * Inline: one-off values on tokens.
 */
export const RAISED: CSSProperties = {
  backgroundImage: "linear-gradient(var(--layer, transparent), var(--layer, transparent)), linear-gradient(var(--drawer-raised), var(--secondary))",
  boxShadow: "inset 0 1px 0 var(--drawer-bevel), 0 0 0 1px var(--hud-outline), 0 2px 0 1px var(--hud-outline)",
};
/** The two actions' word: the same size on both, a step smaller under 360 px (the search's). */
export const WORD = "h-12 min-w-0 px-2 text-base font-black mobile:text-lg";

/** An alliance art icon (Invite a guild, Remove a guild; `emblem-art.ts`), at a menu row's 40 px. */
export const allianceArt = (name: "invite-guild" | "remove-guild", px = 40, className = "drawer-icon size-10") => (
  <img {...allianceArtSources(name, px)} alt="" draggable={false} decoding="async" className={className} />
);

/** A guild's role in its alliance, a carved pill in the medal's gold: the head's crown, a member's shield. */
type RoleArt = Record<AllianceRole, UiIconName>;
const ROLE_ART: RoleArt = { head: "crown", member: "guild" };
export function RolePill({ role }: { role: AllianceRole }) {
  return (
    <span data-slot="alliance-role" data-role={role} className={cn(PILL, "drawer-carved gap-1 pl-1.5 text-medal-1")}>
      <UiIcon name={ROLE_ART[role]} px={16} className="size-4" />
      {ROLE_NAMES[role]}
    </span>
  );
}

/** The viewer's tag beside a name: the Guild page's "You", in the medal's gold. */
export function OwnTag({ children }: { children: ReactNode }) {
  return <span className="shrink-0 rounded-md bg-medal-1 px-1.5 text-xs leading-tight font-bold text-primary-foreground">{children}</span>;
}

/** A guild's score at a row's end: the painted crown and the figure, outlined (the Guild members' rows'). */
export function RowScore({ value }: { value: number }) {
  return (
    <span role="img" aria-label={`${formatInteger(value)} ${value === 1 ? "crown" : "crowns"}`} className="flex shrink-0 items-center gap-1">
      <UiIcon name="crown" px={20} className="drawer-icon size-5" />
      <span aria-hidden className="numeric text-outline min-w-10 text-right font-sans text-base leading-tight font-bold">
        {formatInteger(value)}
      </span>
    </span>
  );
}

/** The head guild's mark on its row: the crown and "Head", carved. */
function HeadMark() {
  return (
    <span data-slot="alliance-head" className={cn(PILL, "drawer-carved h-5 gap-0.5 pl-1 text-medal-1")}>
      <UiIcon name="crown" px={14} className="size-3.5" />
      Head
    </span>
  );
}

/**
 * A guild of the alliance (or one to invite, without a role): its emblem, its name, its members and the head's mark (the viewer's own on
 * the gold wash with "Yours"), its score. A tap opens its page, where the alliance's leader finds what they may do to it (Invite, Make
 * head, Remove).
 */
export function AllianceGuildRow({ guild, role = null, own = false, onOpen, className }: { guild: GuildSummary; role?: AllianceRole | null; own?: boolean; onOpen?: () => void; className?: string }) {
  return (
    <button
      type="button"
      data-slot="alliance-guild"
      data-role={role ?? undefined}
      data-own={own || undefined}
      aria-label={`${guild.name}${role === "head" ? ", head guild" : ""}${own ? " (your guild)" : ""}, ${formatInteger(guild.members)} of ${GUILD_MAX_MEMBERS} members, ${formatInteger(guild.score)} ${guild.score === 1 ? "crown" : "crowns"}`}
      onClick={onOpen}
      className={cn("state-layer flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left outline-none", own && CHOSEN, className)}
    >
      <GuildEmblem emblem={guild.emblem} />
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="text-outline max-w-full min-w-0 pr-0.5 text-sm leading-snug font-bold wrap-anywhere">{guild.name}</span>
        <span className="flex min-h-5 max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <MemberCount members={guild.members} className="text-xs leading-tight font-bold text-muted-foreground" />
          {role === "head" && <HeadMark />}
          {own && <OwnTag>Yours</OwnTag>}
        </span>
      </span>
      <RowScore value={guild.score} />
    </button>
  );
}

/** A guild's line under its name in a request's or an invitation's row: its members and its score. */
function GuildLine({ guild }: { guild: GuildSummary }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 text-xs leading-tight font-bold text-muted-foreground">
      <MemberCount members={guild.members} />
      <span role="img" aria-label={`${formatInteger(guild.score)} ${guild.score === 1 ? "crown" : "crowns"}`} className="flex items-center gap-0.5">
        <UiIcon name="crown" px={16} className="size-4" />
        <span aria-hidden className="text-outline text-foreground tabular-nums">
          {formatInteger(guild.score)}
        </span>
      </span>
    </span>
  );
}

/** A guild in a request's or an invitation's row: its emblem, name and line, a tap opening its page. */
function GuildButton({ guild, onOpen }: { guild: GuildSummary; onOpen?: (id: number) => void }) {
  return (
    <button type="button" aria-label={`${guild.name}'s page`} onClick={() => onOpen?.(guild.id)} className="state-layer flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl px-3 py-1.5 text-left outline-none">
      <GuildEmblem emblem={guild.emblem} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-outline max-w-full min-w-0 pr-0.5 text-sm leading-snug font-bold wrap-anywhere">{guild.name}</span>
        <GuildLine guild={guild} />
      </span>
    </button>
  );
}

/** A confirmation in the HUD's look (`HudDialog`): its question, what it does, and its one answer. */
export interface AllianceConfirmation {
  title: string;
  description: string;
  label: string;
  art: UiIconName;
  destructive?: boolean;
}

/**
 * The alliance actions of a page: `run` one at once (Request, Accept), or `ask` its confirmation first (Leave, Remove), in the HUD's
 * dialog: its red close cancels, its one answer runs it. A refused action keeps the dialog open with why; done, it closes.
 */
export function useAllianceActions<A>(onAction?: (action: A) => Promise<unknown> | void) {
  const [asking, setAsking] = useState<{ confirmation: AllianceConfirmation; action: A } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: A): Promise<boolean> => {
    setPending(true);
    setError(null);
    try {
      await onAction?.(action);
      return true;
    } catch (e) {
      setError(allianceErrorText(e));
      return false;
    } finally {
      setPending(false);
    }
  };
  const ask = (confirmation: AllianceConfirmation, action: A) => {
    setError(null);
    setAsking({ confirmation, action });
  };
  const c = asking?.confirmation;
  const dialog = (
    <HudDialog
      open={asking !== null}
      onCancel={() => setAsking(null)}
      cancel="Cancel"
      title={c?.title ?? ""}
      description={c?.description ?? ""}
      action={{ label: c?.label ?? "", art: c?.art, tone: c?.destructive ? "destructive" : "raised", disabled: pending, onClick: () => asking && void run(asking.action).then((done) => done && setAsking(null)) }}
      note={asking && error ? <InlineError title={c?.label ?? ""} message={error} /> : undefined}
    />
  );
  return { run, ask, dialog, pending, error: asking ? null : error };
}

/** Days left before an invitation lapses, at least 1. */
const daysLeft = (expiresAt: number, now: number) => Math.max(1, Math.ceil((expiresAt - now) / 86_400));

/**
 * An alliance's page (ALLIANCES; the Paved UX Book draws none: the Guild page's look and parts). In the guild page's drawer, as a view
 * of it (Back, the red cross). For anyone: the identity on the drawer's face (the emblem on its laurel; the name, and for a guild's
 * leader in it the menu as a small raised square; their guild's role in a carved pill), the figures on a carved band (the guilds against
 * the cap, the score under the painted crown, the players), the description folded to two lines, then its guilds on the battle logs'
 * carved rows (the head first with its crown, the viewer's own on the gold wash), a row's tap opening the guild's page. For the
 * alliance's leader, the requests waiting with a raised Accept and Decline, then the invitations sent. For the leader of a guild
 * outside it, the drawer's footer: Cancel or Decline at the left, the gold Request to join or Accept at the right, in their places
 * whatever the state, why not over them. The menu and what it opens are views in the drawer (`useDrawerView`).
 */
export function AlliancePage({ alliance, myGuild = null, now, apply, onAction, onOpenGuild, invite, initialView, initialUnfolded, onClose }: AlliancePageProps) {
  const { run, ask, dialog, pending, error } = useAllianceActions(onAction);
  const member = alliance.role !== null;
  const leads = alliance.leads;
  const [views, setViews] = useState<readonly AlliancePageView[]>(initialView ? [initialView] : []);
  // A view the viewer may no longer see (the menu of a guild no more in it, the settings of a leader no more) is dropped.
  const stack = views.filter((v) => alliance.leadsGuild && (v === "menu" || leads));
  const view = stack.at(-1) ?? null;
  const openView = (next: AlliancePageView) => setViews([...stack, next]);
  const back = () => setViews(stack.slice(0, -1));
  const titles: Record<AlliancePageView, string> = { menu: "Alliance menu", invite: "Invite a guild", settings: "Alliance settings" };
  const viewTitle = view === null ? null : titles[view];
  // One title for the drawer's header: the view's, else "Alliance" when the page is itself a view; Back one view, else out of the page.
  const inDrawer = useDrawerView(viewTitle ?? (onClose ? "Alliance" : null), view === null && onClose ? onClose : back);
  // A move between the page and a view slides (the Guild page's): forward from the right, back from the left, at the body's top.
  const [depth, setDepth] = useState(stack.length);
  const [forward, setForward] = useState<boolean | null>(null);
  if (depth !== stack.length) {
    setDepth(stack.length);
    setForward(stack.length > depth);
  }
  const viewKey = view ?? "page";
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

  const disbands = leaveDisbandsAlliance(alliance.guilds);
  const leaveBlock = alliance.leadsGuild ? leaveAllianceRefusal({ guild: myGuild ?? 0, rank: ALLIANCE_ACTOR_RANK, alliance: alliance.id, role: alliance.role }, alliance.guilds) : null;
  const leave = () =>
    ask(
      disbands
        ? { title: `Disband ${alliance.name}?`, description: "Your guild is its only guild: leaving disbands the alliance, for good.", label: "Disband", art: "disband", destructive: true }
        : { title: `Leave ${alliance.name}?`, description: "Your guild leaves the alliance. It can join another, or come back if invited.", label: "Leave", art: "leave", destructive: true },
      { type: "leave" } as const,
    );
  const menu: GuildMenuItem[] = [
    ...(leads ? [{ label: "Invite a guild", art: allianceArt("invite-guild"), next: true, onSelect: () => openView("invite") }] : []),
    ...(leads ? [{ label: "Alliance settings", art: "settings" as const, next: true, onSelect: () => openView("settings") }] : []),
    { label: disbands ? "Disband the alliance" : "Leave the alliance", art: disbands ? "disband" : "leave", destructive: true, onSelect: leave, refused: leaveBlock ? ALLIANCE_REFUSALS[leaveBlock] : undefined },
  ];

  let shownView: ReactNode;
  if (view === "menu") shownView = <GuildMenu items={menu} label="Alliance menu" />;
  else if (view === "invite")
    shownView = (
      <>
        <p className={VIEW_LINE}>Find a guild, then invite it to {alliance.name} from its page. An invitation lapses after 7 days.</p>
        {invite}
      </>
    );
  else if (view === "settings")
    shownView = (
      <>
        <p className={VIEW_LINE}>Only the head guild's leader changes these.</p>
        <AllianceForm
          mode="edit"
          initial={{ name: alliance.name, emblem: alliance.emblem, description: alliance.description }}
          pending={pending}
          error={error}
          onSubmit={(draft) => void run({ type: "settings", settings: { emblem: draft.emblem, description: draft.description } }).then((done) => done && setViews([]))}
        />
      </>
    );
  else
    shownView = (
      <>
        <header data-slot="alliance-header" className="flex flex-col gap-3">
          <div data-slot="alliance-identity" className="flex min-w-0 items-center gap-3">
            <AllianceEmblem emblem={alliance.emblem} size="lg" />
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
              <span className="flex max-w-full min-w-0 items-center gap-0.5">
                <h2 className="text-outline min-w-0 text-2xl leading-tight font-bold wrap-anywhere">{alliance.name}</h2>
                {alliance.leadsGuild && (
                  <button type="button" aria-label="Alliance menu" onClick={() => openView("menu")} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg outline-none">
                    <span className={RAISED_FACE}>
                      <Icon name="ellipsis" size="sm" />
                    </span>
                  </button>
                )}
              </span>
              {member && alliance.role && <RolePill role={alliance.role} />}
            </div>
          </div>
          {/* The figures, the guild's band: information, never pressed. */}
          <dl data-slot="alliance-figures" className="drawer-carved drawer-rule flex rounded-xl">
            <Figure term="Guilds" label={`${formatInteger(alliance.guilds)} of ${ALLIANCE_MAX_GUILDS} guilds`}>
              {formatInteger(alliance.guilds)}/{ALLIANCE_MAX_GUILDS}
            </Figure>
            <Figure term="Score" label={formatInteger(alliance.score)}>
              <UiIcon name="crown" px={20} className="drawer-icon size-5" />
              {formatInteger(alliance.score)}
            </Figure>
            <Figure term="Players">{formatInteger(alliance.members)}</Figure>
          </dl>
          {alliance.description && <GuildDescription text={alliance.description} initialUnfolded={initialUnfolded} />}
          <InlineError title={alliance.name} message={error} />
        </header>

        <TabSection title="Guilds">
          <ul aria-label="Guilds" className="drawer-carved flex flex-col rounded-xl">
            {alliance.roster.map((g, i) => (
              <li key={g.guild.id} className={cn("flex", rowRule(i))}>
                <AllianceGuildRow guild={g.guild} role={g.role} own={g.guild.id === myGuild} onOpen={() => onOpenGuild?.(g.guild.id)} className={listRowShape(i, alliance.roster.length)} />
              </li>
            ))}
          </ul>
        </TabSection>

        {alliance.requests && (
          <TabSection title="Requests">
            {alliance.requests.length === 0 ? (
              <p className={EMPTY}>No request waiting.</p>
            ) : (
              <ul className="drawer-carved flex flex-col rounded-xl">
                {alliance.requests.map((r, i) => (
                  <li key={r.guild.id} data-slot="alliance-request" className={cn("flex min-w-0 items-center gap-1 py-1 pr-1.5", rowRule(i))}>
                    <GuildButton guild={r.guild} onOpen={onOpenGuild} />
                    <button type="button" aria-label={`Accept ${r.guild.name}`} disabled={pending} onClick={() => void run({ type: "answer-request", guild: r.guild.id, accept: true })} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg outline-none disabled:opacity-50">
                      <span className={cn(RAISED_FACE, "size-9 text-success")}>
                        <Icon name="check" size="sm" />
                      </span>
                    </button>
                    <button type="button" aria-label={`Decline ${r.guild.name}`} disabled={pending} onClick={() => void run({ type: "answer-request", guild: r.guild.id, accept: false })} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg outline-none disabled:opacity-50">
                      <span className={cn(RAISED_FACE, "size-9")}>
                        <Icon name="xmark" size="sm" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </TabSection>
        )}

        {alliance.invitations && (
          <TabSection title="Invitations sent">
            {alliance.invitations.length === 0 ? (
              <p className={EMPTY}>None waiting. Invite a guild from the alliance's menu.</p>
            ) : (
              <ul className="drawer-carved flex flex-col rounded-xl">
                {alliance.invitations.map((v, i) => (
                  <li key={v.guild.id} data-slot="alliance-invitation" className={cn("flex min-w-0 items-center gap-2 py-1 pr-3", rowRule(i))}>
                    <GuildButton guild={v.guild} onOpen={onOpenGuild} />
                    <span className={cn(PILL, "drawer-carved shrink-0 text-muted-foreground")}>Lapses in {formatInteger(daysLeft(v.expiresAt, now))}d</span>
                  </li>
                ))}
              </ul>
            )}
          </TabSection>
        )}

        {apply && !member && <ApplyFooter alliance={alliance} apply={apply} pending={pending} onRun={(a) => void run(a)} />}
      </>
    );

  return (
    <div data-slot="alliance-page" className="flex flex-col gap-4">
      {!inDrawer && viewTitle !== null && <ViewHeader title={viewTitle} onBack={back} />}
      <m.div
        key={viewKey}
        ref={shown}
        tabIndex={-1}
        data-slot="alliance-view"
        data-view={viewKey}
        initial={forward !== null && { x: forward ? 48 : -48, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="flex flex-col gap-4 outline-none"
      >
        {shownView}
      </m.div>
      {dialog}
    </div>
  );
}

/**
 * What the leader of a guild outside the alliance may do, at the drawer's foot (the Challenge's footer): two actions side by side, the
 * same in every state (the word changes and the control dims; the control never moves): Cancel or Decline at the left, raised grey;
 * Request to join or Accept at the right, the book's gold pill with its passing light while it can be pressed; why not above them.
 */
function ApplyFooter({ alliance, apply, pending, onRun }: { alliance: AllianceView; apply: AllianceApply; pending: boolean; onRun: (action: AlliancePageAction) => void }) {
  const invited = apply.kind === "invited";
  const left = invited ? { label: "Decline", enabled: true, action: { type: "answer-invitation", accept: false } as const } : { label: "Cancel", enabled: apply.kind === "requested", action: { type: "cancel-request" } as const };
  const right = invited
    ? { word: "Accept", label: `Accept ${alliance.name}'s invitation`, enabled: true, action: { type: "answer-invitation", accept: true } as const }
    : apply.kind === "requested"
      ? { word: "Requested", label: "Request sent", enabled: false, action: null }
      : { word: "Request to join", label: `Request to join ${alliance.name}`, enabled: apply.kind === "request", action: { type: "request" } as const };
  const note = apply.kind === "blocked" ? apply.reason : apply.kind === "requested" ? "Your guild's request is waiting for an answer." : apply.kind === "invited" ? `${alliance.name} invites your guild.` : null;
  return (
    <DrawerFooter>
      <div data-slot="alliance-apply" data-kind={apply.kind} className="flex flex-col gap-2 px-4 py-2.5">
        {note && <p className={cn("text-center text-xs leading-snug font-semibold", apply.kind === "blocked" ? "text-warning" : "text-muted-foreground")}>{note}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" style={RAISED} className={cn(WORD, "text-outline rounded-xl")} disabled={!left.enabled || pending} onClick={() => onRun(left.action)}>
            {left.label}
          </Button>
          <Button variant="ghost" style={GOLD_ACTION} aria-label={right.label} className={cn(WORD, "relative text-foreground")} disabled={!right.enabled || pending} onClick={() => right.action && onRun(right.action)}>
            {right.enabled && !pending && <GoldShine />}
            {right.word}
          </Button>
        </div>
      </div>
    </DrawerFooter>
  );
}

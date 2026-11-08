import { useEffect, useRef, useState, type CSSProperties } from "react";
import { PUZZLE_PRIZE_COBBLES, formatInteger } from "@paved/game-core";
import type { PuzzleEntry } from "../../data/puzzle-source";
import { haptic } from "../../lib/haptics";
import { cn } from "../../lib/utils";
import { CheckBadge } from "../elements/check-badge";
import { CobblesBurst } from "../elements/cobbles-burst";
import { formatDay } from "../elements/day-picker";
import { goldPillStyle } from "../elements/friends-art";
import { GiftArt, type GiftArtState } from "../elements/gift-art";
import { InlineError } from "../elements/inline-error";
import { SectionTitle } from "../elements/section-title";
import { TokenIcon } from "../elements/token-icon";
import { UiIcon } from "../elements/ui-icon";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";
import { useSfx } from "./audio-provider";
import { PuzzleRankRow } from "./leaderboard";
import { GIFT_REVEAL_S } from "./milestones-bar";

// The mailbox (the chat's Inbox tab, the owner's ask of 2026-11-08): the system's mail beside the DMs, a prize's mail with its gift. The
// mails are read from the chain's state (a day the player finished first, claimed or not), so their Cobbles stack there until claimed,
// never in the Play page; a mail deleted is hidden on the device.

/** A mail of the Inbox's list: a Puzzle prize's. */
export interface InboxMail {
  /** `puzzle-<day>`: the route's and the device's deleted list's. */
  id: string;
  /** The Puzzle's day it pays. */
  day: number;
  /** When it came, in seconds since the epoch: the day's end. */
  at: number;
  /** Its Cobbles were claimed: the gift open. */
  claimed: boolean;
}

/** The book's gold pill, 36 px (Follow back's, `goldPillStyle`): the Inbox's one primary button, Claim all. */
const GOLD_PILL: CSSProperties = goldPillStyle(36);

/** A mail's time in the list: "00:00" the day it came, else its day ("Sat"), as a conversation's last message's. */
function mailTime(at: number, now: number): string {
  if (Math.floor(at / 86_400) === Math.floor(now / 86_400)) return "00:00";
  return formatDay(Math.floor(at / 86_400)).split(",")[0] ?? "";
}

/** A day as a mail's bubble names it: "Sat, Nov 7" (the UTC day, its zone left to the mail). */
const shortDay = (day: number): string => formatDay(day).replace(/\s*UTC$/, "");

/** A gift of the Inbox, 40 px or more: ready (shaking in its halo) while its Cobbles wait, open (and checked) once claimed. */
function MailGift({ state, px, giftRef }: { state: GiftArtState; px: number; giftRef?: { current: HTMLElement | null } }) {
  return (
    <span
      ref={(el) => {
        if (giftRef) giftRef.current = el;
      }}
      className="relative grid shrink-0 place-items-center"
      style={{ width: px, height: px }}
    >
      <GiftArt state={state} style={{ fontSize: px * 0.85 }} />
      {state === "open" && <CheckBadge px={20} className="absolute -right-1 -bottom-1 size-5" />}
    </span>
  );
}

export interface MailSectionProps {
  mails: readonly InboxMail[];
  now: number;
  /** Claim all: the Cobbles of every mail whose gift waits; shown while one waits. */
  onClaimAll?: () => void;
  /** Claim all on its way: its pill waits. */
  claiming?: boolean;
  /** Why the last claim was refused. */
  error?: string | null;
  onOpen?: (mail: InboxMail) => void;
}

/**
 * The Inbox's Mail (the owner's approved mockups of 2026-11-08): its title, the one primary button at its end, Claim all (the book's gold
 * pill) while a gift waits, then the mails on a raised card, the newest first: the gift (shaking in its halo while its Cobbles wait,
 * open and checked once claimed), "Puzzle: you won!", the day, the place and the prize in a carved bubble, the time. A row opens its mail.
 */
export function MailSection({ mails, now, onClaimAll, claiming = false, error, onOpen }: MailSectionProps) {
  if (mails.length === 0) return null;
  const waiting = mails.some((m) => !m.claimed);
  return (
    <section aria-label="Mail" className="flex shrink-0 flex-col gap-1.5">
      <SectionTitle
        end={
          waiting &&
          onClaimAll && (
            // The 36 px pill in its 44 px target, the title's line kept (`-my-1`).
            <button
              type="button"
              disabled={claiming}
              aria-busy={claiming || undefined}
              onClick={onClaimAll}
              className="relative -my-1 grid h-11 shrink-0 cursor-pointer place-items-center disabled:cursor-default disabled:opacity-70"
            >
              <span style={GOLD_PILL} className="text-outline grid h-9 place-items-center px-1 text-sm font-black text-foreground">
                Claim all
              </span>
            </button>
          )
        }
      >
        <UiIcon name="letter" px={28} className="drawer-icon size-7 self-center" />
        Mail
      </SectionTitle>
      <ul className="drawer-raised drawer-rows flex flex-col overflow-hidden rounded-xl">
        {mails.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              data-slot="mail-row"
              data-claimed={m.claimed || undefined}
              aria-label={`Puzzle of ${formatDay(m.day)}: you won${m.claimed ? ", claimed" : `, ${PUZZLE_PRIZE_COBBLES} Cobbles waiting`}`}
              onClick={() => onOpen?.(m)}
              className={cn("state-layer flex min-h-16 w-full min-w-0 items-center gap-2.5 px-2.5 py-2 text-left outline-none", m.claimed && "opacity-75")}
            >
              <MailGift state={m.claimed ? "open" : "ready"} px={44} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="text-outline text-base leading-snug font-bold">Puzzle: you won!</span>
                  <span className="ml-auto shrink-0 pl-1 text-xs font-semibold text-muted-foreground tabular-nums">{mailTime(m.at, now)}</span>
                </span>
                {/* The bubble whole at every width (WRAP360): the time on the title's line, the bubble's words wrap rather than cut. */}
                <span className="drawer-carved w-fit max-w-full rounded-lg px-2.5 py-1 text-[0.8125rem] leading-snug font-semibold text-muted-foreground">
                  {shortDay(m.day)} · {m.claimed ? "claimed" : `${PUZZLE_PRIZE_COBBLES} Cobbles`}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <InlineError title="Claim" message={error ?? null} />
    </section>
  );
}

export interface PrizeMailProps {
  day: number;
  /** The player's winning score. */
  score: number;
  /** The day's players. */
  players: number;
  /** The day's final first ten, the player among them. */
  top: readonly PuzzleEntry[];
  /** The viewer: their row in gold. */
  me: string;
  /** Its Cobbles were claimed: the gift open. */
  claimed: boolean;
  /** Its claim (or the claim before a delete) on its way: the gift shakes fast. */
  claiming?: boolean;
  /** Why the claim was refused. */
  error?: string | null;
  /** A tap on the gift: its Cobbles. */
  onClaim?: () => void;
  /** The bin: the mail goes (its gift claimed first while it waits). */
  onDelete?: () => void;
  /** Back to the Inbox's list. */
  onBack?: () => void;
  onOpenPlayer?: (address: string) => void;
}

/** Whether two player IDs are one, whatever their leading zeros. */
function sameAddress(a: string, b: string): boolean {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return a === b;
  }
}

/**
 * A Puzzle prize's mail (the owner's approved mockups of 2026-11-08): Back to the Inbox and the bin (a raised face; it claims a waiting
 * gift first, then deletes), Paved and the day's end, "Puzzle of <day>: you won!", the day's figures; the prize, the missions' gift
 * (ready, shaking in its halo; no Claim button: the gift is the button): a tap claims it, it shakes as the claim goes, then opens as it
 * lands, its Cobbles bursting into the balance's plate; then the gift open and checked. The day's final ranking, its first ten (the
 * viewer's row in gold).
 */
export function PrizeMail({ day, score, players, top, me, claimed, claiming = false, error, onClaim, onDelete, onBack, onOpenPlayer }: PrizeMailProps) {
  const play = useSfx();
  const gift = useRef<HTMLElement | null>(null);
  // A claim seen landing on this mail opens its gift and bursts once; a mail read already claimed does not.
  const [seen, setSeen] = useState({ day, claimed });
  const [opening, setOpening] = useState(false);
  const [burst, setBurst] = useState(0);
  if (seen.day !== day || seen.claimed !== claimed) {
    const landed = seen.day === day && !seen.claimed && claimed;
    setSeen({ day, claimed });
    setOpening(landed);
    if (landed) setBurst((n) => n + 1);
  }
  useEffect(() => {
    if (!opening) return;
    const timer = setTimeout(() => setOpening(false), GIFT_REVEAL_S * 1000);
    return () => clearTimeout(timer);
  }, [opening]);
  const [burstDone, setBurstDone] = useState(0);
  useEffect(() => {
    if (burst === 0) return;
    play("burst");
    haptic("firm");
  }, [burst, play]);
  const state: GiftArtState = opening ? "opening" : claimed ? "open" : claiming ? "shaking" : "ready";
  const date = shortDay(day);
  return (
    <article aria-label={`Puzzle of ${date}`} className="drawer-carved flex min-h-80 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
      <ScrollRegion className="flex min-h-0 flex-1 flex-col gap-3 overscroll-contain p-2.5">
      <div className="flex items-center gap-1">
        {onBack && (
          <button type="button" aria-label="Back to the Inbox" onClick={onBack} className="state-layer grid size-11 shrink-0 cursor-pointer place-items-center rounded-full outline-none">
            <Icon name="chevron-left" className="drawer-icon" />
          </button>
        )}
        <UiIcon name="letter" px={36} className="drawer-icon size-9 shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col pl-1">
          <span className="text-outline text-base leading-tight font-bold">Paved</span>
          <span className="text-xs font-semibold text-muted-foreground">{shortDay(day + 1)} · 00:00 UTC</span>
        </span>
        {onDelete && (
          <button type="button" aria-label="Delete this mail" disabled={claiming} onClick={onDelete} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg outline-none disabled:cursor-default disabled:opacity-50">
            <span className="state-layer drawer-raised grid size-9 place-items-center rounded-lg">
              <Icon name="trash" size="sm" />
            </span>
          </button>
        )}
      </div>
      <h2 className="text-outline px-1 font-display text-[1.75rem] leading-tight font-bold">Puzzle of {date}: you won!</h2>
      <p className="px-1 text-[0.9375rem] leading-snug font-semibold text-muted-foreground">
        The day is over. You finished <span className="text-foreground">1st of {formatInteger(players)}</span> with{" "}
        <span className="numeric text-foreground">{formatInteger(score)}</span> points. Here is your prize.
      </p>
      <section aria-label="Prize" className="drawer-raised flex items-center gap-4 rounded-2xl bg-linear-to-b from-primary/15 to-primary/5 px-4 py-3">
        <button
          type="button"
          aria-label={claimed ? `${PUZZLE_PRIZE_COBBLES} Cobbles, claimed` : `Open the gift: ${PUZZLE_PRIZE_COBBLES} Cobbles`}
          disabled={claimed || claiming || !onClaim}
          aria-busy={claiming || undefined}
          onClick={onClaim}
          className="grid shrink-0 cursor-pointer place-items-center rounded-xl outline-none disabled:cursor-default"
        >
          <MailGift state={state} px={64} giftRef={gift} />
        </button>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-outline flex items-center gap-1.5 text-xl leading-tight font-extrabold">
            <TokenIcon kind="cobbles" size="lg" className="drawer-icon size-6" px={24} />
            <span className="numeric">{PUZZLE_PRIZE_COBBLES}</span> Cobbles
          </span>
          <span className="text-[0.8125rem] font-semibold text-muted-foreground">{claimed ? "In your balance" : claiming ? "Opening…" : "Tap the gift to open it"}</span>
        </span>
      </section>
      <InlineError title="Claim" message={error ?? null} />
      <section aria-labelledby="mail-ranking" className="flex flex-col gap-1.5">
        <SectionTitle id="mail-ranking">
          <UiIcon name="trophy" px={28} className="drawer-icon size-7 self-center" />
          Final ranking
        </SectionTitle>
        <ol className="drawer-raised drawer-rows flex flex-col overflow-hidden rounded-xl">
          {top.map((e) => (
            <li key={e.profile.address}>
              <PuzzleRankRow compact profile={e.profile} place={e.place} score={e.score} own={sameAddress(e.profile.address, me)} onOpen={() => onOpenPlayer?.(e.profile.address)} />
            </li>
          ))}
        </ol>
      </section>
      {burst !== burstDone && <CobblesBurst key={burst} from={() => gift.current} onDone={() => setBurstDone(burst)} />}
      </ScrollRegion>
    </article>
  );
}

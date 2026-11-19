import type { CSSProperties, ReactNode } from "react";
import { CONQUEST_ELIGIBLE_DAYS, CONQUEST_PHASE_DAYS, CONQUEST_PHASE_ELIGIBLE_DAYS, formatInteger, type ConquestPlayPhase } from "@paved/game-core";
import type { ConquestFinal, ConquestGuild, ConquestMemberRow, ConquestPhaseResult, ConquestRankRow } from "../../data/conquest-source";
import { rankName } from "../../lib/guild-text";
import { cn } from "../../lib/utils";
import { KnowledgeIcon, PlaceMark, ordinal } from "../elements/conquest-art";
import { GuildEmblem } from "../elements/guild-emblem";
import { PlayerAvatar } from "../elements/player-avatar";
import { PlayerName } from "../elements/player-name";
import { formatPoints } from "../elements/score";
import { Icon } from "../ui/icon";

export const CONQUEST_PHASE_NAME: Record<ConquestPlayPhase, string> = { foundation: "Foundation", awakening: "Awakening", frontiers: "Frontiers" };
const CREST_NAME = { gold: "Gold", silver: "Silver", bronze: "Bronze" } as const;
/** What the ranking is read by: a phase's points, or the three together. */
export type ConquestRankBy = ConquestPlayPhase | "final";

/** The rows ranked again by a phase's points (a tie keeps the total's order), each with its place there. */
export function rankedBy(rows: readonly ConquestRankRow[], by: ConquestRankBy): (ConquestRankRow & { points: number })[] {
  if (by === "final") return rows.map((r) => ({ ...r, points: r.total }));
  return [...rows].sort((a, b) => b[by] - a[by] || a.place - b.place).map((r, i) => ({ ...r, place: i + 1, points: r[by] }));
}

/**
 * The allegiances by points (`by`: a phase's, or all three): the podium wears its medals, the others their place; each row its emblem,
 * its name, its members and its points; the viewer's own is lit, and says so in words.
 */
export function ConquestRanks({ rows, by = "final", label, className }: { rows: readonly ConquestRankRow[]; by?: ConquestRankBy; label: string; className?: string }) {
  return (
    <ol aria-label={label} data-slot="conquest-ranks" className={cn("drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl", className)}>
      {rankedBy(rows, by).map((r) => (
        <li key={r.guild.id} data-mine={r.mine || undefined} className={cn("flex min-h-16 items-center gap-3 px-3 py-2", r.mine && "bg-info/15 shadow-[inset_3px_0_0_var(--info)]")}>
          <PlaceMark place={r.place} px={28} />
          <GuildEmblem emblem={r.guild.emblem} size="sm" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span title={r.guild.name} className="truncate text-sm font-bold">
              {r.guild.name}
            </span>
            <span className={cn("text-xs font-semibold", r.mine ? "text-info" : "text-muted-foreground")}>
              {r.mine && "your allegiance · "}
              <span className="numeric">{r.members}</span> {r.members === 1 ? "member" : "members"}
            </span>
          </span>
          <span className="numeric text-outline shrink-0 text-base leading-tight font-bold">{formatPoints(r.points)}</span>
        </li>
      ))}
    </ol>
  );
}

/** What the members are ranked by. */
export type ConquestMemberBy = "tiles" | "knowledge" | "explored";

/**
 * The members of the allegiance ranked by tiles given, Knowledge brought or cells explored: each with their avatar, their name and
 * rank, and two figures (the one they are ranked by first). The three best wear the podium's medals; the viewer's own row is lit.
 */
export function ConquestMembers({ rows, by = "tiles", onOpenPlayer, className }: { rows: readonly ConquestMemberRow[]; by?: ConquestMemberBy; onOpenPlayer?: (address: string) => void; className?: string }) {
  const other: ConquestMemberBy = by === "knowledge" ? "tiles" : "knowledge";
  const sorted = [...rows].sort((a, b) => b[by] - a[by] || b[other] - a[other]);
  const figure = (row: ConquestMemberRow, what: ConquestMemberBy, lead: boolean) => (
    <span className="flex w-12 shrink-0 flex-col items-end">
      <span className={cn("numeric text-outline text-base leading-tight font-bold", !lead && "text-muted-foreground")}>{formatInteger(row[what])}</span>
      <span className="text-xs leading-none font-semibold text-muted-foreground">{what === "tiles" ? (row.tiles === 1 ? "tile" : "tiles") : what === "knowledge" ? "Knowl." : "cells"}</span>
    </span>
  );
  return (
    <ol aria-label={`Members by ${by === "tiles" ? "tiles given" : by === "knowledge" ? "Knowledge" : "cells explored"}`} data-slot="conquest-members" className={cn("drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl", className)}>
      {sorted.map((r, i) => (
        <li key={r.profile.address} data-me={r.me || undefined} className={cn("flex min-h-16 items-center gap-2.5 px-3 py-1.5", r.me && "bg-info/15 shadow-[inset_3px_0_0_var(--info)]")}>
          <PlaceMark place={i + 1} px={24} />
          <button type="button" onClick={() => onOpenPlayer?.(r.profile.address)} className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left">
            <PlayerAvatar player={r.profile} look={r.profile.look} />
            <span className="flex min-w-0 flex-col items-start gap-0.5">
              <PlayerName name={r.profile.name} address={r.profile.address} className="max-w-full text-sm font-bold" />
              <span className="rounded-full border border-border px-2 text-xs leading-5 font-bold">{rankName(r.rank)}</span>
            </span>
          </button>
          {figure(r, by, true)}
          {figure(r, other, false)}
        </li>
      ))}
    </ol>
  );
}

/** The rays behind a result's emblem: a slow fan of light from its centre, fading to the page. Decorative. */
const RAYS: CSSProperties = {
  backgroundImage: "repeating-conic-gradient(from 0deg at 50% 38%, color-mix(in oklab, var(--primary) 16%, transparent) 0deg 9deg, transparent 9deg 18deg)",
  maskImage: "radial-gradient(circle at 50% 38%, black, transparent 72%)",
};

/** The crest's shield: the podium's metal, top to bottom. */
const CREST: Record<1 | 2 | 3, CSSProperties> = {
  1: { backgroundImage: "linear-gradient(160deg, color-mix(in oklab, var(--medal-1) 55%, white), var(--medal-1) 45%, color-mix(in oklab, var(--medal-1) 55%, black))" },
  2: { backgroundImage: "linear-gradient(160deg, color-mix(in oklab, var(--medal-2) 55%, white), var(--medal-2) 45%, color-mix(in oklab, var(--medal-2) 55%, black))" },
  3: { backgroundImage: "linear-gradient(160deg, color-mix(in oklab, var(--medal-3) 55%, white), var(--medal-3) 45%, color-mix(in oklab, var(--medal-3) 55%, black))" },
};

/** A result's frame: its chip, its title, its emblem on the rays, then its body. */
function ResultStage({ label, chip, chipClass, title, emblem, children }: { label: string; chip: string; chipClass: string; title: string; emblem: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={label} data-slot="conquest-result" className="relative isolate flex flex-col items-center gap-4 text-center">
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96" style={RAYS} />
      <span className={cn("rounded-md px-2.5 py-0.5 text-xs font-extrabold tracking-widest uppercase", chipClass)}>{chip}</span>
      <h2 className="text-outline font-display text-[2rem] leading-tight font-bold">{title}</h2>
      {emblem}
      {children}
    </section>
  );
}

/** The podium's three allegiances side by side, the viewer's own framed. */
function Podium({ rows, by }: { rows: readonly ConquestRankRow[]; by: ConquestRankBy }) {
  return (
    <ol aria-label="Podium" className="drawer-carved grid w-full grid-cols-3 gap-1 rounded-2xl p-1.5">
      {rankedBy(rows, by)
        .slice(0, 3)
        .map((r) => (
          <li key={r.guild.id} data-mine={r.mine || undefined} className={cn("flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2", r.mine && "bg-info/15 shadow-[inset_0_0_0_2px_var(--info)]")}>
            <PlaceMark place={r.place} px={28} />
            <span title={r.guild.name} className="max-w-full truncate text-sm font-bold">
              {r.guild.name}
            </span>
            <span className={cn("numeric text-sm font-semibold", r.mine ? "text-info" : "text-muted-foreground")}>{formatPoints(r.points)}</span>
          </li>
        ))}
    </ol>
  );
}

function Eligible({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <p data-eligible={ok} className={cn("flex items-start gap-2 text-left text-sm font-bold", ok ? "text-success" : "text-warning")}>
      <Icon name={ok ? "check" : "info"} size="sm" className="mt-0.5" />
      <span>{children}</span>
    </p>
  );
}

export interface ConquestPhaseEndProps {
  result: ConquestPhaseResult;
  /** The day the result came in, and whether it is the rest day now. */
  rest: boolean;
  /** What comes next, in a line ("Next: Awakening, tomorrow"). */
  next: string;
}

/**
 * A phase is over (the proposal's "Foundation is over"): the allegiance's emblem under its medal on the rays, its place and its points,
 * the podium, then the viewer's part: the tiles they gave, the cells they explored, the Knowledge they brought, and whether their days
 * of Offerings pay them. The Cobbles and Claim are the page's footer.
 */
export function ConquestPhaseEnd({ result, rest, next }: ConquestPhaseEndProps) {
  const name = CONQUEST_PHASE_NAME[result.phase];
  const day = CONQUEST_PHASE_DAYS[result.phase].result;
  return (
    <ResultStage
      label={`${name} is over`}
      chip={rest ? `D${day} · Rest day` : `Since D${day}`}
      chipClass="bg-info text-background"
      title={`${name} is over`}
      emblem={
        <span className="flex flex-col items-center">
          {result.place <= 3 && <PlaceMark place={result.place} px={56} className="-mb-2 z-10" />}
          <GuildEmblem emblem={result.guild.emblem} size="lg" />
        </span>
      }
    >
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-outline text-xl font-bold wrap-anywhere">{result.guild.name}</span>
        <span data-slot="conquest-result-place" className="text-sm font-semibold text-muted-foreground">
          <strong className="numeric text-foreground">{ordinal(result.place)}</strong> of <span className="numeric">{result.of}</span> · <span className="numeric">{formatPoints(result.score)}</span> points
        </span>
      </div>
      <Podium rows={result.podium} by={result.phase} />
      <div data-slot="conquest-part" className="flex w-full flex-col gap-3 rounded-2xl border border-primary/50 bg-card px-4 py-3">
        <span className="text-left text-sm font-bold text-primary">Your part</span>
        <div role="group" aria-label="Your part" className="grid grid-cols-3">
          {(
            [
              [result.part.tiles, result.part.tiles === 1 ? "tile built" : "tiles built"],
              [result.part.explored, result.part.explored === 1 ? "cell explored" : "cells explored"],
              [result.part.knowledge, "Knowledge"],
            ] as const
          ).map(([value, word]) => (
            <span key={word} className="flex min-w-0 flex-col items-center">
              <span className="numeric text-outline text-2xl leading-tight font-bold">{formatInteger(value)}</span>
              <span className="text-xs font-semibold text-muted-foreground">{word}</span>
            </span>
          ))}
        </div>
        <Eligible ok={result.eligible}>
          {result.eligible ? "Eligible" : "Not paid"}: Offerings on <span className="numeric">{result.days}</span> of the phase's days{!result.eligible && ` (${CONQUEST_PHASE_ELIGIBLE_DAYS} needed)`}
        </Eligible>
      </div>
      <p className="text-sm font-semibold text-muted-foreground">{next}</p>
    </ResultStage>
  );
}

/**
 * The Conquest is over (the proposal's "2nd of World 3"): the allegiance's emblem in the crest's shield (gold, silver or bronze on the
 * podium; a plain one past it), the crest it wears for the whole next season, then each phase's points and place and the final line.
 * The Cobbles and Claim are the page's footer.
 */
export function ConquestFinalEnd({ final, last = false }: { final: ConquestFinal; /** The Conquest before this one. */ last?: boolean }) {
  const podium = final.place <= 3 ? (final.place as 1 | 2 | 3) : null;
  return (
    <ResultStage
      label={last ? "The last Conquest" : "The Conquest is over"}
      chip={last ? "The last Conquest" : "The Conquest is over"}
      chipClass="bg-joust-rival-fill text-foreground"
      title={`${ordinal(final.place)} of World ${final.world}`}
      emblem={
        <span data-slot="conquest-crest" data-crest={final.crest ?? undefined} className={cn("grid h-36 w-30 place-items-center pb-6 [clip-path:polygon(0_0,100%_0,100%_58%,50%_100%,0_58%)]", !podium && "bg-secondary")} style={podium ? CREST[podium] : undefined}>
          <GuildEmblem emblem={final.guild.emblem} size="lg" />
        </span>
      }
    >
      <p className="max-w-80 text-sm font-semibold text-muted-foreground">
        {final.crest ? (
          <>
            <span className="wrap-anywhere">{final.guild.name}</span> wear the <strong className="text-foreground">{CREST_NAME[final.crest]} crest</strong> on their emblem for the whole next season.
          </>
        ) : (
          <>
            <span className="wrap-anywhere">{final.guild.name}</span> finish <strong className="text-foreground">{ordinal(final.place)}</strong> of <span className="numeric">{final.of}</span>. The podium wears a crest for the whole next season.
          </>
        )}
      </p>
      <table data-slot="conquest-final-table" className="drawer-carved w-full overflow-hidden rounded-2xl text-left text-sm">
        <tbody className="drawer-rows">
          {final.phases.map((p) => (
            <tr key={p.phase}>
              <th scope="row" className="px-3.5 py-2.5 font-semibold">
                {CONQUEST_PHASE_NAME[p.phase]}
              </th>
              <td className="numeric px-2 py-2.5 text-right text-muted-foreground">{formatPoints(p.score)}</td>
              <td className={cn("numeric w-14 px-3.5 py-2.5 font-bold", p.place === 1 && "text-primary")}>{ordinal(p.place)}</td>
            </tr>
          ))}
          <tr className="bg-info/15">
            <th scope="row" className="px-3.5 py-2.5 font-bold">
              Final
            </th>
            <td className="numeric px-2 py-2.5 text-right font-bold">{formatPoints(final.score)}</td>
            <td className="numeric w-14 px-3.5 py-2.5 font-bold text-primary">{ordinal(final.place)}</td>
          </tr>
        </tbody>
      </table>
      <Eligible ok={final.eligible}>
        {final.eligible ? "Eligible" : "Not paid"}: Offerings on <span className="numeric">{final.days}</span> days{!final.eligible && ` (${CONQUEST_ELIGIBLE_DAYS} needed)`}
      </Eligible>
    </ResultStage>
  );
}

/** A result's line on the Conquest's page: what is over, the place, and whether Cobbles wait; a tap opens it. */
export function ConquestResultRow({ title, place, of, waiting, onOpen, guild }: { title: string; place: number; of: number; /** Cobbles to claim; 0: none. */ waiting: number; onOpen?: () => void; guild: ConquestGuild }) {
  return (
    <button type="button" data-slot="conquest-result-row" onClick={onOpen} className="state-layer drawer-carved flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-2xl px-3.5 py-2 text-left">
      <GuildEmblem emblem={guild.emblem} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-outline text-base leading-tight font-bold">{title}</span>
        <span className="text-xs font-semibold text-muted-foreground">
          <span className="numeric text-foreground">{ordinal(place)}</span> of <span className="numeric">{of}</span>
          {waiting > 0 && (
            <strong className="text-primary">
              {" "}
              · <span className="numeric">+{formatInteger(waiting)}</span> Cobbles to claim
            </strong>
          )}
        </span>
      </span>
      <Icon name="chevron-right" size="sm" className="text-muted-foreground" />
    </button>
  );
}

export { KnowledgeIcon };

import { CONQUEST_ELIGIBLE_DAYS, CONQUEST_PHASE_ELIGIBLE_DAYS, formatInteger, type ConquestPlayPhase } from "@paved/game-core";
import type { ConquestFinal, ConquestMemberRow, ConquestPhaseResult, ConquestRankRow } from "../../data/conquest-source";
import { cn } from "../../lib/utils";
import { GuildEmblem } from "../elements/guild-emblem";
import { PlayerName } from "../elements/player-name";
import { formatPoints } from "../elements/score";
import { TokenIcon } from "../elements/token-icon";
import { Button } from "../ui/button";

export const CONQUEST_PHASE_NAME: Record<ConquestPlayPhase, string> = { foundation: "Foundation", awakening: "Awakening", frontiers: "Frontiers" };
const CREST_NAME = { gold: "Gold", silver: "Silver", bronze: "Bronze" } as const;

/** The allegiances by points: each with its place, its emblem and name, and its points (a phase's, or all three with the total). */
export function ConquestRanks({ rows, phase, label, className }: { rows: readonly ConquestRankRow[]; /** One phase's points alone; omitted: the three and the total. */ phase?: ConquestPlayPhase; label: string; className?: string }) {
  return (
    <ol aria-label={label} data-slot="conquest-ranks" className={cn("drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl", className)}>
      {rows.map((r) => (
        <li key={r.guild.id} data-mine={r.mine || undefined} className={cn("flex min-h-12 items-center gap-2.5 px-3 py-1.5", r.mine && "bg-info/15")}>
          <span className="numeric w-6 shrink-0 text-sm font-bold text-muted-foreground">{formatInteger(r.place)}</span>
          <GuildEmblem emblem={r.guild.emblem} size="sm" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span title={r.guild.name} className="truncate text-sm font-bold">
              {r.guild.name}
            </span>
            {!phase && (
              <span className="text-xs font-semibold text-muted-foreground">
                <span className="numeric">{formatPoints(r.foundation)}</span> · <span className="numeric">{formatPoints(r.awakening)}</span> · <span className="numeric">{formatPoints(r.frontiers)}</span>
              </span>
            )}
          </span>
          <span className="numeric text-outline shrink-0 text-base leading-tight font-bold">{formatPoints(phase ? r[phase] : r.total)}</span>
        </li>
      ))}
    </ol>
  );
}

/** The members of the allegiance, by tiles given: each with the cells they explored, the Knowledge they brought and their days of Offerings. */
export function ConquestMembers({ rows, onOpenPlayer, className }: { rows: readonly ConquestMemberRow[]; onOpenPlayer?: (address: string) => void; className?: string }) {
  return (
    <ol aria-label="Members by tiles given" data-slot="conquest-members" className={cn("drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl", className)}>
      {rows.map((r, i) => (
        <li key={r.profile.address} data-me={r.me || undefined} className={cn("flex min-h-12 items-center gap-2.5 px-3 py-1", r.me && "bg-info/15")}>
          <span className="numeric w-6 shrink-0 text-sm font-bold text-muted-foreground">{i + 1}</span>
          <button type="button" onClick={() => onOpenPlayer?.(r.profile.address)} className="flex min-h-11 min-w-0 flex-1 cursor-pointer flex-col items-start justify-center text-left">
            <PlayerName name={r.profile.name} address={r.profile.address} className="max-w-full text-sm font-bold" />
            <span className="text-xs font-semibold text-muted-foreground">
              {r.me ? "you · " : ""}
              <span className="numeric">{formatInteger(r.explored)}</span> explored · <span className="numeric">{formatInteger(r.knowledge)}</span> Knowledge · <span className="numeric">{r.days}</span> {r.days === 1 ? "day" : "days"}
            </span>
          </button>
          <span className="flex w-12 shrink-0 flex-col items-end">
            <span className="numeric text-outline text-base leading-tight font-bold">{formatInteger(r.tiles)}</span>
            <span className="text-xs leading-none font-semibold text-muted-foreground">{r.tiles === 1 ? "tile" : "tiles"}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Claim({ cobbles, claiming, onClaim }: { cobbles: number; claiming: boolean; onClaim?: () => void }) {
  return (
    <Button className="h-11 w-full" disabled={claiming} aria-busy={claiming || undefined} aria-label={`Claim +${formatInteger(cobbles)} Cobbles`} onClick={onClaim}>
      Claim
      <span className="flex items-center gap-0.5">
        <span className="numeric">+{formatInteger(cobbles)}</span>
        <TokenIcon kind="cobbles" size="sm" px={16} className="size-4" />
      </span>
    </Button>
  );
}

/** A phase over: the allegiance's place and points, the podium, and the viewer's part (their days of Offerings, their Cobbles). */
export function ConquestPhaseCard({ result, className }: { result: ConquestPhaseResult; className?: string }) {
  return (
    <section aria-label={`End of ${CONQUEST_PHASE_NAME[result.phase]}`} data-slot="conquest-phase-result" data-phase={result.phase} className={cn("drawer-carved flex flex-col gap-2.5 rounded-2xl px-3.5 py-3", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-outline text-base font-bold">{CONQUEST_PHASE_NAME[result.phase]}</span>
        <span className="text-sm font-semibold text-muted-foreground">
          <span className="numeric text-foreground">#{result.place}</span> of <span className="numeric">{result.of}</span> · <span className="numeric text-foreground">{formatPoints(result.score)}</span>
        </span>
      </div>
      <ConquestRanks rows={result.podium} phase={result.phase} label={`${CONQUEST_PHASE_NAME[result.phase]}'s podium`} className="bg-background/40" />
      <p className="text-xs font-semibold text-muted-foreground">
        {result.eligible ? (
          <>
            Your part: <span className="numeric text-foreground">{result.days}</span> days of Offerings, <span className="numeric text-foreground">{formatInteger(result.cobbles)}</span> Cobbles{result.claimed ? ", claimed" : ""}.
          </>
        ) : (
          <>
            Offerings on <span className="numeric text-foreground">{result.days}</span> of the phase's days: <span className="numeric">{CONQUEST_PHASE_ELIGIBLE_DAYS}</span> are needed to be paid.
          </>
        )}
      </p>
    </section>
  );
}

export interface ConquestFinalCardProps {
  final: ConquestFinal;
  /** "This Conquest" or "The last Conquest". */
  title: string;
  claiming?: boolean;
  onClaim?: (conquest: number) => void;
  className?: string;
}

/**
 * A Conquest's end for the viewer's allegiance: its final place and points with each phase's, the crest the podium wears for the whole
 * next season, the podium, and the viewer's part: their days of Offerings, their Cobbles, and Claim for everything left to claim.
 */
export function ConquestFinalCard({ final, title, claiming = false, onClaim, className }: ConquestFinalCardProps) {
  return (
    <section aria-label={title} data-slot="conquest-final" className={cn("drawer-carved flex flex-col gap-3 rounded-2xl px-3.5 py-3", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="rounded-md bg-background/70 px-2 py-px text-xs font-extrabold tracking-widest uppercase">{title}</span>
        <span className="text-sm font-semibold text-muted-foreground">
          <span className="numeric text-outline text-lg font-bold text-foreground">#{final.place}</span> of <span className="numeric">{final.of}</span>
        </span>
      </div>
      <p className="text-sm font-semibold text-muted-foreground">
        <span className="numeric text-outline text-xl font-bold text-foreground">{formatPoints(final.score)}</span> points: <span className="numeric">{formatPoints(final.foundation)}</span> in Foundation, <span className="numeric">{formatPoints(final.awakening)}</span> in Awakening,{" "}
        <span className="numeric">{formatPoints(final.frontiers)}</span> in Frontiers.
      </p>
      {final.crest && (
        <p data-slot="conquest-crest" className="text-sm font-bold text-primary">
          The {CREST_NAME[final.crest]} crest, for the whole next season.
        </p>
      )}
      <ConquestRanks rows={final.podium} label="The final podium" className="bg-background/40" />
      <p className="text-xs font-semibold text-muted-foreground">
        {final.eligible ? (
          <>
            Your part: <span className="numeric text-foreground">{final.days}</span> days of Offerings, <span className="numeric text-foreground">{formatInteger(final.cobbles)}</span> Cobbles for the final rank{final.claimed ? ", claimed" : ""}.
          </>
        ) : (
          <>
            Offerings on <span className="numeric text-foreground">{final.days}</span> days: <span className="numeric">{CONQUEST_ELIGIBLE_DAYS}</span> are needed for the final rank's Cobbles.
          </>
        )}
      </p>
      {final.toClaim > 0 && <Claim cobbles={final.toClaim} claiming={claiming} onClaim={() => onClaim?.(final.conquest)} />}
    </section>
  );
}

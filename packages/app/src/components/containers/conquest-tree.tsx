import { CONQUEST_BRANCHES, CONQUEST_LEVELS, CONQUEST_LEVEL_BONUS, CONQUEST_OFFERINGS_A_DAY, conquestLevelCost, formatInteger, type ConquestBranch, type ConquestLevels } from "@paved/game-core";
import { cn } from "../../lib/utils";
import type { UiIconName } from "../elements/ui-art";
import { UiIcon } from "../elements/ui-icon";
import { Button } from "../ui/button";

/** A branch as drawn: its name, its painting, what its levels act on. */
interface Branch { name: string; art: UiIconName; effect: string }

const BRANCH: Record<ConquestBranch, Branch> = {
  roads: { name: "Roads", art: "road", effect: "on the roads you win" },
  cities: { name: "Cities", art: "city", effect: "on the cities you win" },
  forests: { name: "Forests", art: "forest", effect: "on the forests you win" },
  wonders: { name: "Wonders", art: "wonder", effect: "on the wonders and Great Wonders you win" },
  devotion: { name: "Devotion", art: "sun", effect: "Offerings a day" },
};

/** What a branch gives at a level, in a few words. */
const gives = (branch: ConquestBranch, level: number): string => (branch === "devotion" ? `${CONQUEST_OFFERINGS_A_DAY[level]} ${BRANCH.devotion.effect}` : `+${CONQUEST_LEVEL_BONUS[level]}% ${BRANCH[branch].effect}`);

export interface ConquestTreeProps {
  levels: ConquestLevels;
  /** The allegiance's Knowledge to spend. */
  knowledge: number;
  /** The viewer buys the levels: an Officer or the Leader. */
  leads: boolean;
  /** Research is open: from day 1 to the end of Frontiers. */
  open: boolean;
  /** The branch whose purchase is on its way. */
  busy?: ConquestBranch | null;
  onResearch?: (branch: ConquestBranch) => void;
  className?: string;
}

/**
 * The Conquest's knowledge tree: five branches of ten levels, bought in order with the allegiance's Knowledge. Each shows its level
 * as ten pips (the fifth and the tenth, the milestones, taller), what it gives now, and its next level's cost; an Officer or the
 * Leader buys it with one tap, every other member reads it.
 */
export function ConquestTree({ levels, knowledge, leads, open, busy = null, onResearch, className }: ConquestTreeProps) {
  return (
    <ul aria-label="Knowledge tree" data-slot="conquest-tree" className={cn("flex flex-col gap-2", className)}>
      {CONQUEST_BRANCHES.map((branch) => {
        const level = levels[branch];
        const cost = conquestLevelCost(level);
        return (
          <li key={branch} data-branch={branch} className="drawer-carved flex flex-col gap-2 rounded-2xl px-3.5 py-3">
            <div className="flex items-center gap-3">
              <UiIcon name={BRANCH[branch].art} px={32} className="drawer-icon size-8 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-outline text-base leading-tight font-bold">
                  {BRANCH[branch].name} · <span className="numeric">{level}</span>/<span className="numeric">{CONQUEST_LEVELS}</span>
                </span>
                <span className="text-xs font-semibold text-muted-foreground">{gives(branch, level)}</span>
              </div>
              {cost === null ? (
                <span className="shrink-0 text-sm font-bold text-primary">Complete</span>
              ) : leads ? (
                <Button size="sm" className="h-11 shrink-0" disabled={!open || knowledge < cost || busy !== null} aria-busy={busy === branch || undefined} aria-label={`Buy ${BRANCH[branch].name} level ${level + 1} for ${formatInteger(cost)} Knowledge`} onClick={() => onResearch?.(branch)}>
                  <span className="numeric">{formatInteger(cost)}</span>
                </Button>
              ) : (
                <span className="flex shrink-0 flex-col items-end">
                  <span className="numeric text-outline text-base leading-tight font-bold">{formatInteger(cost)}</span>
                  <span className="text-xs leading-none font-semibold text-muted-foreground">next</span>
                </span>
              )}
            </div>
            <div aria-hidden className="grid grid-cols-10 items-end gap-1">
              {Array.from({ length: CONQUEST_LEVELS }, (_, i) => (
                <span key={i} className={cn("rounded-sm", (i + 1) % 5 === 0 ? "h-3" : "h-2", i < level ? "bg-primary" : "bg-background/70")} />
              ))}
            </div>
            {cost !== null && <span className="text-xs font-semibold text-muted-foreground">Next: {gives(branch, level + 1)}</span>}
          </li>
        );
      })}
    </ul>
  );
}

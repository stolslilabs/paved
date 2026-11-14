import { CONQUEST_BRANCHES, CONQUEST_LEVELS, CONQUEST_LEVEL_BONUS, CONQUEST_LEVEL_COSTS, CONQUEST_OFFERINGS_A_DAY, conquestLevelCost, formatInteger, formatPercent, type ConquestBranch, type ConquestLevels } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { ConquestArt, KnowledgeIcon } from "../elements/conquest-art";
import { Button } from "../ui/button";

/** A branch as drawn: its name and what its levels act on. */
interface Branch {
  name: string;
  effect: string;
}

const BRANCH: Record<ConquestBranch, Branch> = {
  roads: { name: "Roads", effect: "on the roads you win" },
  cities: { name: "Cities", effect: "on the cities you win" },
  forests: { name: "Forests", effect: "on the forests you win" },
  wonders: { name: "Wonders", effect: "on the wonders you win" },
  devotion: { name: "Devotion", effect: "Offerings a day" },
};

/** The whole tree's Knowledge: five branches of ten levels. */
export const CONQUEST_TREE_COST = CONQUEST_BRANCHES.length * CONQUEST_LEVEL_COSTS.reduce((a, b) => a + b, 0);
/** The Knowledge a level's branch has cost so far. */
const spentOn = (level: number): number => CONQUEST_LEVEL_COSTS.slice(0, level).reduce((a, b) => a + b, 0);
/** The Knowledge spent on the levels bought. */
export const conquestSpent = (levels: ConquestLevels): number => CONQUEST_BRANCHES.reduce((sum, b) => sum + spentOn(levels[b]), 0);
export const conquestBranchName = (branch: ConquestBranch): string => BRANCH[branch].name;
/** The cheapest next level, a tie to the tree's order; null: the tree is complete. */
export function conquestNextLevel(levels: ConquestLevels): { branch: ConquestBranch; level: number; cost: number } | null {
  let next: { branch: ConquestBranch; level: number; cost: number } | null = null;
  for (const branch of CONQUEST_BRANCHES) {
    const cost = conquestLevelCost(levels[branch]);
    if (cost !== null && (!next || cost < next.cost)) next = { branch, level: levels[branch] + 1, cost };
  }
  return next;
}

/** What a branch gives at a level, in a few words. */
const gives = (branch: ConquestBranch, level: number): string => (branch === "devotion" ? `${CONQUEST_OFFERINGS_A_DAY[level]} ${BRANCH.devotion.effect}` : `+${CONQUEST_LEVEL_BONUS[level]}% ${BRANCH[branch].effect}`);

export interface ConquestTreeProps {
  levels: ConquestLevels;
  /** The allegiance's Knowledge to spend, and all it earned. */
  knowledge: number;
  earned: number;
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
 * The Conquest's knowledge tree: the Knowledge to spend over what was earned and spent (each figure with the Knowledge's book), then
 * five branches of ten levels, bought in order. A branch shows its painting, its level and what it gives now, its ten pips (the fifth
 * and the tenth, the milestones, taller and gold), and its next level's cost before its one button, Buy, for an Officer or the
 * Leader; every other member reads the cost.
 */
export function ConquestTree({ levels, knowledge, earned, leads, open, busy = null, onResearch, className }: ConquestTreeProps) {
  const spent = conquestSpent(levels);
  return (
    <div data-slot="conquest-tree" className={cn("flex flex-col gap-3", className)}>
      <div data-slot="conquest-knowledge" className="flex flex-col gap-2.5 rounded-2xl border border-primary/50 bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <KnowledgeIcon px={40} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="numeric text-outline text-3xl leading-none font-bold text-primary">{formatInteger(knowledge)}</span>
            <span className="text-sm font-semibold text-muted-foreground">Knowledge to spend</span>
          </span>
        </div>
        <div role="progressbar" aria-label="Tree bought" aria-valuemin={0} aria-valuemax={CONQUEST_TREE_COST} aria-valuenow={spent} aria-valuetext={`${formatInteger(spent)} of ${formatInteger(CONQUEST_TREE_COST)} Knowledge`} className="h-2 overflow-hidden rounded-full bg-background/70">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${(spent * 100) / CONQUEST_TREE_COST}%` }} />
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm font-semibold text-muted-foreground">
          <div className="flex flex-col">
            <dt>Earned</dt>
            <dd className="flex items-center gap-1 text-foreground">
              <KnowledgeIcon px={18} />
              <span className="numeric font-bold">{formatInteger(earned)}</span>
            </dd>
          </div>
          <div className="flex flex-col">
            <dt>Spent</dt>
            <dd className="flex items-center gap-1 text-foreground">
              <KnowledgeIcon px={18} />
              <span className="numeric font-bold">{formatInteger(spent)}</span>
              <span className="numeric text-xs font-semibold text-muted-foreground">
                of {formatInteger(CONQUEST_TREE_COST)} ({formatPercent(spent / CONQUEST_TREE_COST)})
              </span>
            </dd>
          </div>
        </dl>
        <p className="text-xs font-semibold text-muted-foreground">+1 per Offering, 5 to 100 per cell explored.</p>
      </div>

      <ul aria-label="Knowledge tree" className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
        {CONQUEST_BRANCHES.map((branch) => {
          const level = levels[branch];
          const cost = conquestLevelCost(level);
          return (
            <li key={branch} data-branch={branch} className="flex flex-col gap-2 px-3.5 py-3">
              <div className="flex items-center gap-3">
                <ConquestArt name={branch} px={48} className="rounded-full border-2 border-primary/60" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-outline text-base leading-tight font-bold">{BRANCH[branch].name}</span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    Level <span className="numeric">{level}</span> · {gives(branch, level)}
                  </span>
                </div>
                {cost === null ? (
                  <span className="shrink-0 rounded-full bg-success px-2.5 py-0.5 text-sm font-bold text-background">Complete</span>
                ) : (
                  <span className="flex shrink-0 items-center gap-2">
                    <span data-slot="conquest-cost" className="flex items-center gap-1" title={`Level ${level + 1}: ${formatInteger(cost)} Knowledge`}>
                      <KnowledgeIcon px={18} />
                      <span className={cn("numeric text-base font-bold", leads && open && knowledge < cost && "text-muted-foreground")}>{formatInteger(cost)}</span>
                    </span>
                    {leads && (
                      <Button size="sm" className="h-11" disabled={!open || knowledge < cost || busy !== null} aria-busy={busy === branch || undefined} aria-label={`Buy ${BRANCH[branch].name} level ${level + 1} for ${formatInteger(cost)} Knowledge`} onClick={() => onResearch?.(branch)}>
                        Buy
                      </Button>
                    )}
                  </span>
                )}
              </div>
              <div aria-hidden className="grid grid-cols-10 items-center gap-1">
                {Array.from({ length: CONQUEST_LEVELS }, (_, i) => {
                  const milestone = (i + 1) % 5 === 0;
                  return <span key={i} className={cn("rounded-sm", milestone ? "h-3.5 border border-primary/60" : "h-2", i < level ? (milestone ? "bg-primary" : "bg-info") : "bg-background/70")} />;
                })}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs font-semibold text-muted-foreground">A structure scores with the level of the moment it closes. Levels 5 and 10 give more. Everything resets at the next Conquest.</p>
    </div>
  );
}

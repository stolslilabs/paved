import { useSidePanel } from "../../lib/side-panel";
import { TierBase, TierSwatch } from "../elements/tier-base";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { ScrollRegion } from "../ui/scroll-region";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { TIERS, tierProgress, type Tier } from "./village-rules";

export interface TiersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The copies the account holds per plan (chain plan id): the plans listed, highest tier first. */
  copies: Readonly<Record<number, number>>;
  /** The plan drawn on each tier's base in the ladder. */
  samplePlan?: number;
  tileArt?: TileArt;
  /** The skins page, where some skins wait for a tier. */
  onOpenSkins?: () => void;
}

/**
 * The tiers (#646): the ladder of bases (one tile on each, the base shows whatever its skin) with the copies each needs, then
 * each plan the account holds with its progress to its next tier. A bottom sheet on a phone, a side panel from `tablet` up.
 */
export function TiersSheet({ open, onOpenChange, copies, samplePlan = 10, tileArt, onOpenSkins }: TiersSheetProps) {
  const wide = useSidePanel();
  const plans = Object.entries(copies)
    .map(([plan, n]) => ({ plan: Number(plan), progress: tierProgress(n) }))
    .filter((p) => p.progress.copies > 0)
    .sort((a, b) => b.progress.copies - a.progress.copies || a.plan - b.plan);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={wide ? "right" : "bottom"} className={wide ? "w-full max-w-sm p-4" : "max-h-[80dvh] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"}>
        <SheetHeader className="pr-10">
          <SheetTitle className="font-display text-lg">Tiers</SheetTitle>
          <SheetDescription>Two of a tier make one of the next. The base shows under the tile, whatever its skin.</SheetDescription>
        </SheetHeader>
        <ScrollRegion className="-mx-4 min-h-0 flex-1 px-4">
          <ol aria-label="Tier ladder" className="grid grid-cols-5 gap-2">
            {TIERS.map((t, i) => (
              <li key={t.name} className="flex min-w-0 flex-col items-center gap-1 text-center">
                <TierBase tier={i as Tier} rim="wide" className="aspect-square w-full">
                  <TileChip plan={samplePlan} art={tileArt} className="size-full rounded-[2px] border-0" />
                </TierBase>
                <span className="text-xs font-semibold">{t.name}</span>
                <span className="text-xs text-muted-foreground">
                  <span className="numeric">{t.copies}</span> {t.copies === 1 ? "copy" : "copies"}
                </span>
              </li>
            ))}
          </ol>
          <h3 className="mt-5 mb-2 text-sm font-semibold">Your plans</h3>
          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tile yet: a reward's tile is your first copy.</p>
          ) : (
            <ul aria-label="Plans" className="flex flex-col gap-2">
              {plans.map(({ plan, progress }) => (
                <li key={plan} className="flex items-center gap-3 rounded-xl bg-secondary/40 p-2">
                  {/* The base's rim is a share of its parent's width: a box of its own size. */}
                  <span className="block size-11 shrink-0">
                    <TierBase tier={progress.tier} className="size-full">
                      <TileChip plan={plan} art={tileArt} className="size-full rounded-[2px] border-0" />
                    </TierBase>
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold">{tileName(plan)}</span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <TierSwatch tier={progress.tier} />
                        {TIERS[progress.tier].name}
                      </span>
                    </div>
                    {progress.need === null ? (
                      <span className="text-xs text-muted-foreground">Highest tier</span>
                    ) : (
                      <>
                        <Progress value={(progress.copies / progress.need) * 100} aria-label={`${tileName(plan)} to ${TIERS[progress.next!].name}`} />
                        <span className="text-xs text-muted-foreground">
                          <span className="numeric">
                            {progress.copies}/{progress.need}
                          </span>{" "}
                          to {TIERS[progress.next!].name}
                        </span>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollRegion>
        {onOpenSkins && (
          <Button variant="outline" className="w-full" onClick={onOpenSkins}>
            Skins reserved to a tier
          </Button>
        )}
      </SheetContent>
    </Sheet>
  );
}

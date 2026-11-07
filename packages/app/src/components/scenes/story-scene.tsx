import { useCallback, useEffect, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useReducedMotionConfig } from "motion/react";
import {
  PlanType,
  campaignStars,
  campaignUnlocked,
  formatInteger,
  levelProgress,
  levelUnlocked,
  type StoryCampaign,
  type StoryProgress,
} from "@paved/game-core";
import { cn } from "../../lib/utils";
import { GOLD_ACTION, GoldShine } from "../elements/gold-action";
import { Notice } from "../elements/notice";
import { listRowShape } from "../elements/list-row";
import { PaintedStars } from "../elements/painted-stars";
import { SectionTitle } from "../elements/section-title";
import type { TileRenders } from "../elements/tile-render";
import { UiIcon } from "../elements/ui-icon";
import { CampaignHero, type CampaignStatus } from "../containers/campaign-hero";
import { DrawerFooter } from "../containers/hud-drawer";
import { Arrow } from "../containers/league-carousel";
import { Button } from "../ui/button";
import { Carousel, CarouselContent, CarouselItem, useCarouselSettled, type CarouselApi } from "../ui/carousel";

export interface StorySceneProps {
  campaigns: readonly StoryCampaign[];
  progress: StoryProgress;
  /** The campaign whose levels show first; unset: the last one open. */
  campaignId?: number;
  /** Campaigns opened since the device last showed the list: their cards play the unlock once. */
  justUnlocked?: readonly number[];
  /** The build-time tile renders the cards' backgrounds draw from. */
  renders?: TileRenders;
  /** The device refused to save the progress: it lasts for this visit only. */
  storageOff?: boolean;
  onCampaign?: (campaignId: number) => void;
  onLevel?: (campaignId: number, levelIndex: number) => void;
}

const PLAN_IDS = Object.values(PlanType);

/** A campaign's background without its picture: the distinct plans of its decks in draw order, as chain ids. */
const coverPlans = (campaign: StoryCampaign): number[] => [...new Set(campaign.levels.flatMap((l) => l.deck))].map((p) => PLAN_IDS.indexOf(p));

function statusOf(progress: StoryProgress, campaigns: readonly StoryCampaign[], campaign: StoryCampaign, fresh: boolean): CampaignStatus {
  if (!campaignUnlocked(progress, campaigns, campaign)) return "locked";
  if (fresh) return "unlocking";
  return campaign.levels.every((l) => levelProgress(progress, campaign.id, l.id)) ? "complete" : "open";
}

/** The soft rule between two rows of a carved list (the Shop's panels', the ends' card). */
const ROW_RULE: CSSProperties = { borderTop: "1px solid color-mix(in oklab, var(--drawer-bevel) 45%, transparent)" };
/** The level to play, its row: the Guild page's and the Leaderboard's own row's discreet gold wash, no ring. */
const CURRENT = "bg-primary/15";
/**
 * The arrows on the picture's edges (the owner's ask of 2026-11-07, no dots): the League's thin arrow on a dark round, so it reads
 * over any picture; dimmed at the ends.
 */
const EDGE_ARROW =
  "pointer-events-auto absolute top-1/2 size-11 -translate-y-1/2 rounded-full bg-background/55 text-foreground backdrop-blur-sm hover:bg-background/75 hover:text-foreground";

/**
 * Story mode (`/story`, #546, #592; STORY-PAGE: the Paved UX Book draws none, so the integrated pages' style, Play's and the
 * Leaderboard's above all): the body of Play's drawer, as the stake, "Story" on its header and its Back to the modes. At its head the
 * campaigns one per view, each written on its picture from the header down, edge to edge, fading into the body (`CampaignHero`, the
 * owner's ask of 2026-11-07: no card); a swipe or the thin arrows on the picture's edges move through them (the League's carousel, no
 * dots; only the one in view is in the accessibility tree). Under it, the Levels of the chosen campaign on a carved list, a row per
 * level: its number, its title (wrapping), its painted stars always, a locked one dimmed with the painted lock in its number's place; a
 * tap on an open row plays it again; a row's wash and press layer take its place's shape in the list (square between two rows). A
 * locked campaign says what opens it at the head only (the owner's ask of 2026-11-07: no box repeating it over its levels). The last level unlocked is the one to play (the owner's ask
 * of 2026-11-07: the player sees they progress): its row on the gold wash, and the gold Play in the drawer's footer (the Challenge's
 * Confirm's place), its number and title beside it. A level opens once the one
 * before it is finished (1 star); every campaign after the Tutorial opens, from its level 1, once the Tutorial is finished (the
 * owner's rule of 2026-11-07). The star thresholds are never shown (#593).
 */
export function StoryScene({ campaigns, progress, campaignId, justUnlocked = [], renders, storageOff, onCampaign, onLevel }: StorySceneProps) {
  const [chosen, setChosen] = useState(() => campaignId ?? [...campaigns].reverse().find((c) => campaignUnlocked(progress, campaigns, c))?.id ?? campaigns[0]?.id);
  const [api, setApi] = useState<CarouselApi>();
  // One motion at a time (#615): the carousel opens on the chosen card without a scroll, and a card's unlock waits until
  // the track is at rest, so neither cuts the other.
  const settled = useCarouselSettled(api);
  // Embla's second argument is `jump`: under reduced motion an arrow brings its campaign in view without a scroll.
  const reduced = Boolean(useReducedMotionConfig());
  const campaign = campaigns.find((c) => c.id === chosen) ?? campaigns[0];
  const index = Math.max(0, campaigns.findIndex((c) => c.id === campaign?.id));
  const last = campaigns.length - 1;

  const choose = useCallback(
    (id: number) => {
      setChosen(id);
      onCampaign?.(id);
    },
    [onCampaign],
  );
  const go = (to: number) => {
    const next = campaigns[Math.max(0, Math.min(last, to))];
    if (!next) return;
    choose(next.id);
    api?.scrollTo(campaigns.indexOf(next), reduced);
  };

  // A swipe chooses the card it lands on.
  useEffect(() => {
    if (!api) return;
    const follow = () => {
      const landed = campaigns[api.selectedScrollSnap()];
      if (landed) choose(landed.id);
    };
    api.on("select", follow);
    return () => {
      api.off("select", follow);
    };
  }, [api, campaigns, choose]);

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    // Before the carousel's own handler, as the League's: the choice stays the scene's, so the ends hold.
    event.preventDefault();
    event.stopPropagation();
    go(index + (event.key === "ArrowLeft" ? -1 : 1));
  };

  // Read once by the carousel: a later choice scrolls it (a swipe, `scrollTo`), never re-inits it.
  const [start] = useState(index);
  return (
    <div className="flex flex-col gap-4">
      {/* Edge to edge from the header: the body's gutters and top padding taken back. */}
      <div className="relative -mx-4 -mt-4">
        <Carousel aria-label="Campaigns" tabIndex={0} setApi={setApi} opts={{ startIndex: start }} onKeyDownCapture={onKey} className="outline-none">
          <CarouselContent>
            {campaigns.map((c, i) => {
              return (
                <CarouselItem key={c.id} aria-label={c.name} aria-hidden={i === index ? undefined : true} inert={i !== index}>
                  <CampaignHero
                    id={c.id}
                    name={c.name}
                    summary={c.summary}
                    levels={c.levels.length}
                    stars={campaignStars(progress, c)}
                    status={statusOf(progress, campaigns, c, justUnlocked.includes(c.id))}
                    opensAfter={campaigns[0]?.name}
                    theme={c.theme}
                    plans={coverPlans(c)}
                    renders={renders}
                    // Its unlock plays once in view and the track at rest (#615): a campaign opened with another waits for its turn.
                    paused={!settled || i !== index}
                  />
                </CarouselItem>
              );
            })}
          </CarouselContent>
        </Carousel>
        {/* The arrows on the edges, at the middle of the picture's room (the hero's gutters and its 2:1 room). */}
        <div className="pointer-events-none absolute inset-x-0 top-0 px-4">
          <div className="relative aspect-[2/1]">
            <Button variant="ghost" size="icon" className={cn(EDGE_ARROW, "-left-3")} aria-label="Previous campaign" disabled={index === 0} onClick={() => go(index - 1)}>
              <Arrow to="left" />
            </Button>
            <Button variant="ghost" size="icon" className={cn(EDGE_ARROW, "-right-3")} aria-label="Next campaign" disabled={index === last} onClick={() => go(index + 1)}>
              <Arrow to="right" />
            </Button>
          </div>
        </div>
      </div>
      {storageOff && (
        <Notice tone="warning" title="Storage is off">
          This browser refuses local storage: your stars last until the page closes.
        </Notice>
      )}
      {campaign && <CampaignLevels campaigns={campaigns} campaign={campaign} progress={progress} onLevel={onLevel} />}
    </div>
  );
}

function CampaignLevels({ campaigns, campaign, progress, onLevel }: { campaigns: readonly StoryCampaign[]; campaign: StoryCampaign; progress: StoryProgress; onLevel?: StorySceneProps["onLevel"] }) {
  const open = campaignUnlocked(progress, campaigns, campaign);
  const first = campaigns[0]?.name ?? "Tutorial";
  // The level to play: the last one unlocked (a level opens once the one before it is finished), never one behind it.
  const current = open ? [...campaign.levels].reverse().find((l) => levelUnlocked(progress, campaigns, campaign, l.id)) : undefined;
  return (
    // Named by the campaign's heading at the view's head (`CampaignHero`), the one in view.
    <section aria-labelledby={`campaign-name-${campaign.id}`} data-campaign={campaign.id} data-locked={!open || undefined} className="flex flex-col gap-2">
      <SectionTitle>
        <UiIcon name="tile-stack" px={28} className="drawer-icon size-7 self-center" />
        Levels
      </SectionTitle>
      <ol aria-label={`${campaign.name} levels`} className="drawer-carved flex flex-col rounded-xl">
        {campaign.levels.map((level, i) => {
          const unlocked = levelUnlocked(progress, campaigns, campaign, level.id);
          const done = levelProgress(progress, campaign.id, level.id);
          const isCurrent = level.id === current?.id;
          return (
            <li key={level.id} style={i > 0 ? ROW_RULE : undefined} className="flex">
              <button
                type="button"
                disabled={!unlocked}
                onClick={() => onLevel?.(campaign.id, level.id)}
                data-level={level.id}
                data-next={isCurrent || undefined}
                title={level.title}
                aria-label={`Level ${level.id}, ${level.title}${unlocked ? "" : ", locked"}${done ? `, ${done.stars} of 3 stars` : ""}`}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "state-layer flex min-h-14 w-full min-w-0 cursor-pointer items-center gap-3 px-3 py-2 text-left outline-none disabled:cursor-default",
                  // The list's shape (the owner's rule of 2026-11-07): rounded at the list's top and foot only, square between two rows.
                  listRowShape(i, campaign.levels.length),
                  isCurrent && CURRENT,
                  !unlocked && "opacity-60",
                )}
              >
                <span aria-hidden data-slot="level-number" className="grid w-8 shrink-0 place-items-center">
                  {unlocked ? (
                    <span className={cn("numeric text-outline font-sans text-lg leading-tight font-bold", isCurrent ? "text-primary" : "text-muted-foreground")}>{formatInteger(level.id)}</span>
                  ) : (
                    <UiIcon name="lock" px={28} className="drawer-icon size-7" />
                  )}
                </span>
                <span data-testid="level-title" className="text-outline min-w-0 flex-1 text-base leading-snug font-bold wrap-anywhere">
                  {level.title}
                </span>
                <PaintedStars stars={done?.stars ?? 0} />
              </button>
            </li>
          );
        })}
      </ol>
      <DrawerFooter>
        {/* The Challenge's bill's place: what Play plays on the left, the gold Play on the right, the header's height. */}
        <div data-slot="story-footer" className="flex min-h-16 items-center gap-3 px-4 py-2">
          <span className="flex min-w-0 flex-1 flex-col">
            {current ? (
              <>
                <span className="text-sm leading-tight font-semibold text-muted-foreground">
                  Level <span className="numeric">{formatInteger(current.id)}</span>
                </span>
                <span className="text-outline text-base leading-snug font-bold wrap-anywhere">{current.title}</span>
              </>
            ) : (
              <span className="flex items-center gap-1.5 text-sm leading-snug font-semibold text-muted-foreground">
                <UiIcon name="lock" px={20} className="drawer-icon size-5 shrink-0" />
                Finish the {first} first
              </span>
            )}
          </span>
          <Button
            variant="ghost"
            style={GOLD_ACTION}
            className="relative h-12 min-w-28 shrink-0 px-1 text-lg font-black text-foreground mobile:text-xl"
            disabled={!current}
            aria-label={current ? `Play level ${current.id}, ${current.title}` : "Play, locked"}
            onClick={() => current && onLevel?.(campaign.id, current.id)}
          >
            {current && <GoldShine />}
            Play
          </Button>
        </div>
      </DrawerFooter>
    </section>
  );
}

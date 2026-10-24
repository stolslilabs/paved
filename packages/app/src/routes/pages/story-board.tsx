import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import {
  CAMPAIGNS,
  DISCARD_POINTS,
  PlanType,
  campaignUnlocked,
  deckSheetOrder,
  levelProgress,
  levelResult,
  levelUnlocked,
  type StoryCampaign,
  type StoryLevel,
} from "@paved/game-core";
import { NO_SKINS, provideManifest, skinsOf, type TileSkins } from "@paved/renderer";
import { BoardViewport } from "../../components/containers/board-viewport";
import type { CoachTarget } from "../../components/containers/coach";
import { DeckPresentation, StoryCoach, StoryEnd } from "../../components/containers/story-panels";
import { hasWebGL } from "../../components/containers/tile-view";
import { StackView, canDrawStack } from "../../components/containers/stack-view";
import { TopBar } from "../../components/containers/top-bar";
import { InlineError } from "../../components/elements/inline-error";
import { Notice } from "../../components/elements/notice";
import { BoardScene } from "../../components/scenes/board-scene";
import { Button } from "../../components/ui/button";
import { useBoardSettings } from "../../data/board-settings";
import { usePlacement, type Slot } from "../../data/placement";
import { RENDERER_ASSETS, manifestBody } from "../../data/renderer-manifest";
import { findLevel, levelPath, nextLevel, useDeckPresented, useStoryProgress, useStoryRun, useTutorialClaim, useTutorialClaimed } from "../../data/story";
import { useTileArt } from "../../data/tile-art";
import { useTileRenders } from "../../data/tile-renders";
import { remainingOf } from "../../data/training";
import { useAccount, type WalletState } from "../../wallet/wallet";
import { errorDetail, useErrorDetail } from "../error-detail";
import { useAppNavigate, useUpTo } from "../ref";

// As the other boards: the renderer reads the manifest the route asked for (`data/renderer-manifest.ts`).
provideManifest(RENDERER_ASSETS, manifestBody(RENDERER_ASSETS));

/**
 * The coach marks of the levels that introduce a control (#546), besides the tip of every level's intro (#721): the coach
 * mark names the control, the board rings it. The placement's ring ("place") is on the bubble's Validate, on the tile (#568);
 * the discard's on the trash, the tile stack's or, with the tile on a cell, the bubble's (#606); the deck's on the tile stack
 * (1-5 opens it, 1-11 plans with it); the rotate and cancel tip has no ring. Keyed by `campaign-level`.
 */
export const COACH: Readonly<Record<string, { target: CoachTarget | null; tip: string }>> = {
  "1-1": { target: "place", tip: "Tap a lit cell next to the starter, then hold the check on the tile to place it. Roads must meet roads." },
  "1-2": { target: null, tip: "Tap a cell: the bubble on the tile turns it, or its cross takes it back. Then hold the check to place it." },
  "1-3": { target: "discard", tip: "This tile only gets in the way: hold the trash by the tile stack to discard it. At 0 points a discard is free." },
  "1-4": { target: "discard", tip: "With points on the board, a discard takes 50 of them. Count what the next tile is worth first." },
  "1-5": { target: "deck", tip: "Tap the tile stack: the deck sheet shows every tile this level deals, and the ones already played." },
  "1-6": { target: "wheel", tip: "The season wheel turns the board through the seasons. Tap it to step on; the score does not change." },
  "1-7": { target: "settings", tip: "The gear opens the settings (sound, the placement highlight, Restart level) without leaving the level." },
  "1-11": { target: "deck", tip: "Tap the tile stack: the deck sheet lists the tiles still to come, in order. Plan with it." },
};

const PLAN_IDS = Object.values(PlanType);

/**
 * The skins of a Story board (#721): every plan in its campaign's theme (`StoryCampaign.theme`), the starter included,
 * whatever skins the player set. Theme 0 is `NO_SKINS` (the base models).
 */
export function campaignSkins(campaign: Pick<StoryCampaign, "theme">): TileSkins {
  if (!campaign.theme) return NO_SKINS;
  return skinsOf(Object.values(PlanType).slice(1).map(() => campaign.theme));
}

/** The points a run scoring `score` was short of its next star, from its result; null at 3 stars. */
export function pointsToNextStar(result: { stars: number; twoStars: number; target: number }, score: number): number | null {
  if (result.stars >= 3) return null;
  return Math.max(0, (result.stars >= 2 ? result.target : result.twoStars) - score);
}

/** `/story/:campaign/:level`: a level of Story mode, if it exists and is open. */
export default function Page() {
  const params = useParams();
  const found = findLevel(Number(params.campaign), Number(params.level));
  const { progress } = useStoryProgress();
  const onBack = useUpTo("/story");
  const go = useAppNavigate();
  const open = found !== null && levelUnlocked(progress, CAMPAIGNS, found.campaign, found.level.id);
  if (!found || !open) {
    return (
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <TopBar title="Story" onBack={onBack} />
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4">
          <Notice title={found ? "This level is locked" : "No such level"} icon="lock" action={<Button size="sm" onClick={() => go("/story")}>Levels</Button>}>
            {found ? "Finish the level before it first (and earn the stars its campaign asks for)." : "Story mode has no level at this address."}
          </Notice>
        </main>
      </div>
    );
  }
  return <StoryBoard key={`${found.campaign.id}-${found.level.id}`} campaign={found.campaign} level={found.level} />;
}

/**
 * A Story level on the board (#546, #593): the presentation of its deck first, the first time this device opens it (the
 * deck sheet shows it again on request) with the level's tip, then the board on the level's `StoryRun`, every tile in the
 * campaign's theme, with the coach mark of the control it introduces, then its end (the stars filling one by one, the score, the points short of the next star, Replay and Next).
 * The star thresholds are never shown. The run is played as Training's (lit slots, the bubble, Place, Discard); a finished run is recorded on the device.
 * Tutorial level 1 offers the claim of First Stone (D-21).
 */
function StoryBoard({ campaign, level }: { campaign: StoryCampaign; level: StoryLevel }) {
  const { run, snapshot } = useStoryRun(campaign, level);
  const { progress, saved, record } = useStoryProgress();
  // The campaign's theme on every tile, never the player's skins (#721).
  const skins = useMemo(() => campaignSkins(campaign), [campaign]);
  const [attempt, setAttempt] = useState(0);
  const boardSettings = useBoardSettings(attempt);
  const go = useAppNavigate();
  // Back is the campaign's level list, never the history: after Next, the entry before is the previous level (#614).
  const levels = `/story?campaign=${campaign.id}`;
  const onBack = useUpTo(levels);
  const { presented, markPresented } = useDeckPresented(campaign.id, level.id);
  const [presenting, setPresenting] = useState(!presented);
  const phase = presenting ? "intro" : "play";
  const renders = useTileRenders(RENDERER_ASSETS);
  const deckIds = useMemo(() => level.deck.map((plan) => PLAN_IDS.indexOf(plan)), [level]);
  const start = useCallback(() => {
    markPresented();
    setPresenting(false);
  }, [markPresented]);
  const coach = COACH[`${campaign.id}-${level.id}`] ?? null;
  const [coachOn, setCoachOn] = useState(true);
  const [view, setView] = useState<"3d" | "plan">(() => (hasWebGL() ? "3d" : "plan"));
  const tileArt = useTileArt(view === "3d" ? RENDERER_ASSETS : undefined);

  const state = snapshot.state;
  const over = state.game?.over ?? false;
  const hand = over ? null : state.hand;
  const slotsAt = useCallback((o: number) => run.slots(o), [run]);
  const orientationsAt = useCallback((cell: Slot) => run.orientationsAt(cell), [run]);
  const placement = usePlacement({
    plan: phase === "play" && hand ? hand.plan : null,
    slotsAt,
    orientationsAt,
    version: snapshot,
    resetKey: attempt,
    confirmMs: boardSettings.renderer?.placement?.motion?.confirmMs,
  });
  const { orientation, move, ghost, slots } = placement;
  const preview = useMemo(() => (move ? run.preview(move) : null), [run, snapshot, move]);
  const handErrorDetail = useErrorDetail(state.writeError);
  // The deck sheet shows the level's draw in its order (#613), the order the presentation shows.
  const deckOrder = useMemo(() => deckSheetOrder(level.deck, snapshot.moves), [level, snapshot.moves]);

  // The best before this run, read once per attempt, then the run recorded once it is over.
  const [previousBest, setPreviousBest] = useState<number | null>(null);
  const recorded = useRef(-1);
  useEffect(() => {
    if (!over || recorded.current === attempt) return;
    recorded.current = attempt;
    setPreviousBest(levelProgress(progress, campaign.id, level.id)?.best ?? null);
    record(level, run.submission(), run.score);
  }, [over, attempt, progress, campaign.id, level, record, run]);

  const confirm = useCallback(() => {
    if (!placement.canConfirm || !move || preview === null) return;
    const placed = placement.ghost;
    if (run.place(move)) {
      placement.accepted(placed);
      placement.setOrientation(1);
    }
  }, [run, placement, move, preview]);
  const discard = useCallback(() => {
    placement.clear();
    run.discard();
  }, [run, placement]);
  const replay = useCallback(() => {
    run.restart();
    placement.clear();
    setAttempt((n) => n + 1);
    setPresenting(false);
  }, [run, placement]);

  const result = levelResult(level, run.score);
  const next = nextLevel(campaign.id, level.id);
  const nextOpen =
    next !== null &&
    (() => {
      const found = findLevel(next.campaignId, next.levelIndex);
      return found !== null && campaignUnlocked(progress, CAMPAIGNS, found.campaign) && levelUnlocked(progress, CAMPAIGNS, found.campaign, found.level.id);
    })();
  const best = levelProgress(progress, campaign.id, level.id);

  let notices;
  if (presenting) {
    notices = (
      <DeckPresentation
        campaign={campaign.name}
        levelIndex={level.id}
        title={level.title}
        intro={level.intro}
        tip={level.tip}
        deck={deckIds}
        theme={campaign.theme}
        renders={renders}
        best={best && { score: best.best, stars: best.stars }}
        onStart={start}
      />
    );
  } else if (over) {
    notices = (
      <StoryEnd
        title={level.title}
        score={run.score}
        stars={result.stars}
        toNextStar={pointsToNextStar(result, run.score)}
        bestKnown={result.bestKnown}
        previousBest={previousBest}
        beatsTarget={result.beatsTarget && result.bestKnown}
        onReplay={replay}
        // Both replace the finished level's entry: the system Back never reopens it as a new game (#614).
        onNext={nextOpen && next ? () => go(levelPath(next.campaignId, next.levelIndex), { replace: true }) : undefined}
        onLevels={() => go(levels, { replace: true })}
      >
        {campaign.id === 1 && level.id === 1 && <FirstStone />}
      </StoryEnd>
    );
  } else if (coach && coachOn) {
    notices = <StoryCoach tip={coach.tip} onDismiss={() => setCoachOn(false)} />;
  }

  const handState = !hand || over ? "empty" : state.writeError ? "refused" : "placing";
  const coachTarget = phase === "play" && !over && coachOn ? (coach?.target ?? null) : null;
  const bubble =
    placement.chosen && phase === "play"
      ? {
          cell: placement.chosen,
          rotations: placement.rotations.length,
          onRotate: placement.rotate,
          onClose: placement.clear,
          onDiscard: discard,
          discardCost: Math.min(run.score, DISCARD_POINTS),
          orientation,
          onConfirm: confirm,
          canConfirm: placement.canConfirm && preview !== null,
          coach: coachTarget === "place" || coachTarget === "discard" ? coachTarget : false,
        }
      : null;
  return (
    <BoardScene
      mode="story"
      title={`${campaign.name} ${level.id}: ${level.title}`}
      deckOrder={deckOrder}
      onPresentDeck={over ? undefined : () => setPresenting(true)}
      coach={coachTarget}
      tiles={state.tiles}
      score={state.game?.score ?? 0}
      delta={snapshot.delta}
      remaining={state.game ? remainingOf(state.game) : 0}
      discardedPlans={state.discardedPlans}
      now={0}
      hand={{
        tile: hand && { plan: hand.plan, orientation },
        state: handState,
        // The next two of the level's order (#701).
        coming: hand ? state.coming : [],
        slotChosen: placement.canConfirm && preview !== null,
        cellChosen: placement.chosen !== null,
        fitsNowhere: hand !== null && phase === "play" && slots?.length === 0,
        preview,
        error: state.writeError,
        errorDetail: handErrorDetail,
      }}
      lastScored={state.lastScored}
      tileArt={tileArt}
      tileRenders={renders}
      skins={skins}
      renderHandStack={view === "3d" && canDrawStack() ? (v) => <StackView {...v} basePath={RENDERER_ASSETS} skins={skins} /> : undefined}
      storageDisabled={!saved}
      slots={phase === "play" ? slots : undefined}
      ghost={ghost}
      confirmed={placement.confirmed}
      bubble={bubble}
      onSlotClick={placement.choose}
      readOnly={phase === "intro" || over}
      notices={notices}
      placementHighlight={boardSettings.placementHighlight}
      seasonWheel={boardSettings.wheel}
      canvas={
        view === "3d" ? (
          <BoardViewport
            settings={boardSettings.renderer}
            onScene={boardSettings.onScene}
            tilePreview={boardSettings.tilePreview}
            placementHighlight={boardSettings.placementHighlight}
            skins={skins}
            tiles={state.tiles}
            basePath={RENDERER_ASSETS}
            slots={phase === "play" ? slots : undefined}
            ghost={ghost}
            confirmed={placement.confirmed}
            bubble={bubble}
            onCellClick={placement.choose}
            onCellPress={placement.choose}
            onCellHover={placement.setHovered}
            onError={() => setView("plan")}
          />
        ) : undefined
      }
      onBack={onBack}
      onDiscard={discard}
      onRestart={replay}
    />
  );
}

/**
 * First Stone (D-21), at the end of Tutorial level 1: one `Setup.claim_tutorial()`, which needs a connected wallet (Connect
 * is offered); a claim made before is read first (`tutorial_claimed`), so it needs no transaction. Nothing on chain checks
 * that the level was played (P-49).
 */
function FirstStone() {
  const wallet = useAccount();
  // One claim per account: another account starts from its own read.
  return <FirstStoneClaim key={wallet.address ?? "guest"} wallet={wallet} />;
}

function FirstStoneClaim({ wallet }: { wallet: WalletState }) {
  const claimed = useTutorialClaimed(wallet.address);
  const claim = useTutorialClaim();
  const outcome = claim.data?.outcome ?? null;
  let body;
  if (!wallet.address) {
    body = (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">Connect a wallet to claim the mission First Stone.</span>
        <Button size="sm" variant="secondary" onClick={() => void wallet.connect()} loading={wallet.status === "connecting"}>
          Connect
        </Button>
      </div>
    );
  } else if (outcome === "claimed") {
    body = <p role="status">Claimed: First Stone is yours.</p>;
  } else if (outcome === "already-claimed" || (claim.isIdle && claimed.data === true)) {
    body = <p role="status">Already claimed: this account had First Stone before.</p>;
  } else if (claim.isIdle && claimed.isPending) {
    body = <p role="status">Checking your claim…</p>;
  } else {
    // An unreadable claim is still offered: the write says what the chain thinks.
    body = (
      <div className="flex flex-col gap-2">
        <Button size="sm" variant="secondary" className="self-start" onClick={() => claim.mutate()} loading={claim.isPending}>
          Claim First Stone
        </Button>
        <InlineError title="The claim was refused" message={claim.error?.message} detail={claim.error ? errorDetail(claim.error) : undefined} />
      </div>
    );
  }
  return (
    <div data-testid="first-stone" className="flex flex-col gap-2 rounded-lg bg-secondary/50 p-2">
      {body}
    </div>
  );
}

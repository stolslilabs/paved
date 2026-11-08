import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import type { BoardTile, WriteResult } from "@paved/chain";
import { AttackRun, CENTER, CategoryType, DISCARD_POINTS, OrientationType, PlanType, STARTER_TILE, type LayoutTile } from "@paved/game-core";
import type { BoardGhost } from "../components/containers/board-viewport";
import { PvpAttackScene } from "../components/scenes/pvp-attack-scene";
import { PvpScoutScene } from "../components/scenes/pvp-scout-scene";
import { PvpSearchScene } from "../components/scenes/pvp-search-scene";
import { SearchVoid } from "./search-void";
import { PvpLoading } from "./pvp-loading";
import { loadPvpV2End } from "./pvp-v2-end-chunk";
import { PAGE_LOADERS } from "./page-loaders";
import { NEXT_PRICE, stakesOf, type PvpPlayer, type PvpVillage } from "../lib/pvp-rules";
import { ATTACK_STAR_PERCENTS } from "../lib/pvp-v2-rules";
import { attackDeckSheet } from "../lib/attack-deck-sheet";
import { useBoardSkins } from "../data/board-skins";
import { useCobbleAccount } from "../data/cobbles";
import { layoutBoard } from "../data/matches";
import { useAttackV2Writes, usePrefetchAttackV2Of, useReadDraw, type AttackMoveV2, type AttackV2, type AttackV2State, type MatchV2 } from "../data/free-attack";
import { V2RefusedError, useFreeVillage, useFreeVillageWrites } from "../data/free-village";
import { savedLook, useAvatar } from "../data/avatar";
import { usePvpStatus } from "../data/pvp";
import { useGuildBadge } from "../data/guilds";
import { errorDetail } from "./error-detail";
import { fromBoard, useAttackLegality, useScoutBoard } from "./attack-board";
import { useGameBoard } from "./game-board";
import { useNow } from "./now";
import { useAppNavigate } from "./ref";

// `/pvp` on PvP v2 (#740, step 1 of #732): the attack on the mock's rules and ledger (#741), its own chunk. The page picks it
// where the sources serve `attackV2` (the mock; the chain from step 3): the search draws a rival village, the scout shows it
// with the deck the attack will have (ceil(1.15 x S)), the attack plays that deck on an unbounded board, the tile in hand and
// the next two shown, stars at 80 / 90 / 100 %. The last tile ends it: the page moves to its end screen (`/pvp/result/:id`,
// #790), which tells its stars, crowns, XP and chest.

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);
const CATEGORIES = Object.values(CategoryType);

/** How long the search shows the village found before the scout. */
const FOUND_MS = 1_200;

/** The search's scan lasts at least this long, longer while the search has not answered (RANKED-SCAN-TIMING, #1067). */
export const SEARCH_SCAN_MS = 3_000;

/** Next, and Search again for a shielded rival, show the scan this long between two rivals (#1067). */
export const NEXT_SCAN_MS = 1_000;

/** A write held on the scan: its answer no sooner than `ms` after it was sent; a refusal at once (the screen says why). */
function held<T>(write: Promise<T>, ms: number): Promise<T> {
  return Promise.all([write, new Promise<void>((done) => setTimeout(done, ms))]).then(([answer]) => answer);
}

/** What a refusal of the v2 writes tells the player; another error's own text. */
export function v2ErrorText(error: Error | null): string | null {
  if (!error) return null;
  if (!(error instanceof V2RefusedError)) return error.message;
  switch (error.reason) {
    case "not-joined":
      return "Your village is not founded yet. Search founds it with its starter layout, then searches.";
    case "no-opponent":
      return "No village can be attacked right now: every one near your crowns is shielded.";
    case "not-enough-cobbles":
      return "Not enough Cobbles for another village.";
    case "opponent-shielded":
      return "This village was attacked a moment ago and is now shielded.";
    case "cannot-place":
      return "The tile does not fit there.";
    default:
      return error.message;
  }
}


/** An attack's moves on the engine: the board before the last move, then the last one applied (its points and closings). */
function boardOf(moves: readonly AttackMoveV2[]) {
  const codes = moves.map((m) => (m.discard ? { plan: m.plan, discard: true as const } : { plan: m.plan, discard: false as const, orientation: m.orientation, cell: m.cell }));
  const run = AttackRun.replay({ territory: null }, codes.slice(0, -1));
  const last = codes.length > 0 ? run.apply(codes.at(-1)!) : null;
  const tiles: BoardTile[] = run.game.placed().map((t) => ({ id: t.id, plan: PLANS.indexOf(t.plan), orientation: ORIENTATIONS.indexOf(t.orientation), x: CENTER + t.x, y: CENTER + t.y }));
  return { run, last, tiles };
}

type Writes = ReturnType<typeof useAttackV2Writes>;

export interface PvpV2Props {
  me: string;
  /** The attacker as the search shows them. */
  self: PvpPlayer;
  state: AttackV2State;
  onBack: () => void;
}

/** The v2 flow: the search, the scout of the rival drawn, the open attack. */
export default function PvpV2({ me, self, state, onBack }: PvpV2Props) {
  const writes = useAttackV2Writes(me);
  const village = useFreeVillageWrites(me);
  const [found, setFound] = useState(false);
  // The scan held on a search or a Next (#1067): it stays up until the write answered and its time is out.
  const [scanning, setScanning] = useState(false);
  const searched = useRef(false);
  // Set once the last tile ended the attack: no new search starts meanwhile (a ref, as the receipt's callback reads it at once).
  const ended = useRef(false);
  // The attack whose last tile ended it: its board stays as that tile left it until the end screen is ready (#1067).
  const [ending, setEnding] = useState<AttackV2 | null>(null);
  const open = state.attack?.status === "open" ? state.attack : null;
  const shownAttack = open ?? (ending && state.attack?.id === ending.id ? state.attack : ending);
  const opponentLook = savedLook(useAvatar(state.match?.opponent ?? null).data);
  const readDraw = useReadDraw(me);
  const phase = shownAttack ? "attack" : state.match ? "scout" : "search";

  // The search starts as the page opens on no match: the player came here to attack. Once per visit; Retry after a refusal.
  // Its scan lasts SEARCH_SCAN_MS at least, and until the draw and the rival's village are read, then the rival found; a refusal
  // shows at once. The scan gives way in a transition: up until the next screen's code is in too, never a loading screen between.
  useEffect(() => {
    if (phase !== "search" || searched.current || ended.current || writes.pending) return;
    searched.current = true;
    writes.reset();
    setScanning(true);
    held(writes.search().then(readDraw), SEARCH_SCAN_MS).then(
      () =>
        startTransition(() => {
          setScanning(false);
          setFound(true);
        }),
      () => setScanning(false),
    );
  }, [phase, writes, readDraw]);
  useEffect(() => {
    if (!found) return;
    const timer = setTimeout(() => startTransition(() => setFound(false)), FOUND_MS);
    return () => clearTimeout(timer);
  }, [found]);

  const retry = () => {
    writes.reset();
    searched.current = false;
  };
  // Next, or Search again (#1067): the scan for NEXT_SCAN_MS, and until the new rival and their village are read (never the last
  // one's scout again), then the new rival's scout with no found screen; a refusal back on the scout with its message.
  const scan = (write: () => Promise<WriteResult>) => {
    setScanning(true);
    held(write().then(readDraw), NEXT_SCAN_MS).then(
      () => startTransition(() => setScanning(false)),
      () => setScanning(false),
    );
  };
  const onEnd = (attack: AttackV2) => {
    ended.current = true;
    setEnding(attack);
  };
  if (scanning && !shownAttack) return <PvpSearchScene canvas={<SearchVoid />} state="searching" player={self} onCancel={onBack} />;
  if (found && state.match) return <PvpSearchScene canvas={<SearchVoid />} state="found" player={self} opponent={playerOf(state.match, opponentLook)} />;
  if (phase === "search") {
    if (writes.error) {
      const reason = writes.error instanceof V2RefusedError ? writes.error.reason : null;
      if (reason === "no-opponent") return <PvpSearchScene canvas={<SearchVoid />} state="none" player={self} onRetry={retry} onCancel={onBack} />;
      // No village yet: founding it (its starter layout) lets the search run.
      const onRetry = reason === "not-joined" ? () => void village.found().then(retry, () => undefined) : retry;
      return <PvpSearchScene canvas={<SearchVoid />} state="error" player={self} error={v2ErrorText(village.error ?? writes.error)} errorDetail={errorDetail(village.error ?? writes.error)} onRetry={onRetry} onCancel={onBack} />;
    }
    return <PvpSearchScene canvas={<SearchVoid />} state="searching" player={self} onCancel={onBack} />;
  }
  if (phase === "scout") return <Scout me={me} match={state.match!} writes={writes} onScan={scan} onBack={onBack} />;
  return <Attack me={me} attack={shownAttack!} match={state.match} writes={writes} ending={ending !== null} onEnd={onEnd} onBack={onBack} />;
}

/** The rival drawn as the PvP screens show them, with the look they saved (#926) once read. */
const playerOf = (match: MatchV2, look: bigint | null = null): PvpPlayer => ({ name: match.name, address: match.opponent, level: match.level, crowns: match.crowns, look });

/** The deck page's state while it is open over the scout: pushed from the scout. */
const DECK_OPENED = { opened: true } as const;

/**
 * The scout's deck page in the URL (`?view=deck`, ATTACK-SCOUT: a view keeps its URL): opened, an entry pushed over the scout, so the
 * system's Back closes it; closed, back in the history when the scout pushed it, else the parameter replaced away (a reload, a link).
 */
function useDeckViewParam() {
  const [params, setParams] = useSearchParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const deckOpen = params.get("view") === "deck";
  const onDeckOpenChange = (open: boolean) => {
    if (open === deckOpen) return;
    const next = new URLSearchParams(params);
    if (open) {
      next.set("view", "deck");
      setParams(next, { state: DECK_OPENED });
    } else if ((state as { opened?: boolean } | null)?.opened) navigate(-1);
    else {
      next.delete("view");
      setParams(next, { replace: true });
    }
  };
  return { deckOpen, onDeckOpenChange };
}

/** The scout of the rival drawn: its village and score, the stars' points, the deck the attack will have, Next and Attack. */
function Scout({ me, match, writes, onScan, onBack }: { me: string; match: MatchV2; writes: Writes; onScan: (write: () => Promise<WriteResult>) => void; onBack: () => void }) {
  const now = useNow();
  const rival = useFreeVillage(match.opponent);
  const look = savedLook(useAvatar(match.opponent).data);
  const account = useCobbleAccount(me);
  const status = usePvpStatus(me);
  // The rival's guild beside their level (the user's ask of 2026-11-07): their profile's badge, null for none.
  const guild = useGuildBadge(match.opponent).data ?? null;
  const tiles = useMemo(() => (rival.data ? layoutBoard(rival.data.tiles) : []), [rival.data]);
  const board = useScoutBoard(match.opponent, tiles);
  // The village's tile list (#788): the attack's deck sheet before its first tile, the defender's tiles and the extras.
  const rivalTiles = rival.data?.tiles;
  const deckSheet = useMemo(() => (rivalTiles ? attackDeckSheet({ defenderPlans: rivalTiles.map((t) => t.plan), size: match.deck, moves: [], view: [] }) : null), [rivalTiles, match.deck]);
  const send = (write: () => Promise<WriteResult>) => {
    if (writes.pending) return;
    writes.reset();
    write().catch(() => undefined);
  };
  // Another rival (Next, Search again): a search, so the scan (#1067).
  const draw = (write: () => Promise<WriteResult>) => {
    if (writes.pending) return;
    writes.reset();
    onScan(write);
  };
  const deckView = useDeckViewParam();
  if (!rival.data) {
    const message = rival.data === null ? "This village cannot be read on this network." : rival.error?.message;
    // Reading the rival's village is no search: the neutral loading, never the scan (#1067).
    if (!message) return <PvpLoading />;
    return <PvpSearchScene canvas={<SearchVoid />} state="error" player={playerOf(match, look)} error={message} onCancel={onBack} />;
  }
  const village: PvpVillage = { cells: tiles.map(({ x, y }) => ({ x, y })), tiles, score: match.target };
  const shield = status.data?.shield;
  const shielded = writes.error instanceof V2RefusedError && writes.error.reason === "opponent-shielded";
  return (
    <PvpScoutScene
      defender={playerOf(match, look)}
      guild={guild}
      village={village}
      {...board}
      stakes={stakesOf(match.offer, match.cost)}
      deck={{ slots: match.slots, size: match.deck, placed: rival.data.tiles.length }}
      deckSheet={deckSheet}
      {...deckView}
      starPercents={ATTACK_STAR_PERCENTS}
      next={{ price: NEXT_PRICE, balance: account.data?.cobbles ?? 0 }}
      shieldEndsAt={shield?.up ? shield.until : null}
      now={now}
      pending={writes.pending?.kind === "next" ? "next" : writes.pending?.kind === "start" ? "attacking" : null}
      error={v2ErrorText(writes.error)}
      errorDetail={writes.error ? errorDetail(writes.error) : undefined}
      onBack={onBack}
      onNext={() => draw(writes.next)}
      onAttack={() => send(writes.start)}
      onSearchAgain={shielded ? () => draw(writes.search) : undefined}
      searching={writes.pending?.kind === "search"}
    />
  );
}

/** The open attack: the deck played on an unbounded board, as a Training game places (`usePlacement`), each move a write; the last one ends it. */
function Attack({ me, attack, match, writes, ending, onEnd, onBack }: { me: string; attack: AttackV2; match: MatchV2 | null; writes: Writes; ending: boolean; onEnd: (attack: AttackV2) => void; onBack: () => void }) {
  const go = useAppNavigate();
  const prefetchEnd = usePrefetchAttackV2Of(me);
  // Where the player is now (the location's key), null once the attack is gone: the end, loaded, moves there only if the player is
  // still on the attack, never over a Back or another page taken meanwhile (#1067).
  const { key: locationKey } = useLocation();
  const here = useRef<string | null>(locationKey);
  useEffect(() => {
    here.current = locationKey;
    return () => {
      here.current = null;
    };
  }, [locationKey]);
  const rival = useFreeVillage(attack.defender);
  const skins = useBoardSkins(attack.defender);
  const { run, last, tiles } = useMemo(() => boardOf(attack.moves), [attack.moves]);
  const hand = attack.view[0] ?? null;
  // The deck sheet (#789): the defender's tiles and the extras, once their village is read.
  const defenderTiles = rival.data?.tiles;
  const deck = useMemo(
    () => (defenderTiles ? attackDeckSheet({ defenderPlans: defenderTiles.map((t) => t.plan), size: attack.deck, moves: attack.moves, view: attack.view }) : null),
    [defenderTiles, attack.deck, attack.moves, attack.view],
  );
  // The last tile in: the end on its way, the board holds (#1067).
  const pending = writes.pending?.kind === "play" || ending;
  const legal = useAttackLegality(run, hand);
  // The rival's village in red (#772).
  const { placement, scene } = useGameBoard({ skins, side: "rival", placement: { plan: hand, slotsAt: legal.slotsAt, orientationsAt: legal.orientationsAt, version: run, resetKey: attack.moves.length } });
  const { orientation, move } = placement;
  const preview = move && hand !== null ? run.preview(hand, move.orientation, fromBoard(move)) : null;
  const play = (next: Parameters<Writes["play"]>[0], ghost: BoardGhost | null = null) => {
    if (writes.pending || ending) return;
    writes.reset();
    writes.play(next).then(
      (receipt) => {
        if (ghost) placement.accepted(ghost);
        else placement.clear();
        placement.setOrientation(1);
        const finished = receipt.events.find((e) => e.name === "AttackFinished");
        if (!finished) return;
        onEnd(attack);
        // Its end screen (#790), in place of the attack: Back from it never returns into the finished attack. The board stays as
        // the last tile left it while the end's page, its chunk and the attack's read come in, then the end comes up with no
        // loading screen between (#1067); a failed load still moves on (the end page says what failed). A player who left meanwhile
        // (Back, another page) stays where they went.
        const from = here.current;
        const ready = Promise.all([PAGE_LOADERS["pvp/result/:id"]!(), loadPvpV2End(), prefetchEnd(attack.id)]);
        void ready
          .catch(() => undefined)
          .then(() => {
            if (from !== null && here.current === from) go(`/pvp/result/${attack.id}`, { replace: true });
          });
      },
      () => undefined,
    );
  };
  const discard = () => play({ discard: true });
  const confirm = () => {
    if (!placement.canConfirm || !move) return;
    play({ discard: false, orientation: move.orientation, cell: fromBoard(move) }, placement.ghost);
  };
  const defender: PvpPlayer = match && match.opponent === attack.defender ? playerOf(match) : { name: null, address: attack.defender, level: rival.data?.level ?? 0, crowns: 0 };
  const score = run.score;
  const bubble = placement.chosen
    ? {
        cell: placement.chosen,
        rotations: placement.rotations.length,
        orientation,
        onRotate: placement.rotate,
        onClose: placement.clear,
        onDiscard: discard,
        discardCost: Math.min(score, DISCARD_POINTS),
        onConfirm: confirm,
        canConfirm: placement.canConfirm && preview !== null && !pending,
        busy: pending,
      }
    : null;
  return (
    <PvpAttackScene
      defender={defender}
      target={attack.target}
      starPercents={ATTACK_STAR_PERCENTS}
      score={score}
      delta={last ? last.delta : null}
      lastScored={(last?.result.scored ?? []).map((s) => ({ category: CATEGORIES.indexOf(s.category), size: s.size, points: s.points }))}
      remaining={Math.max(0, attack.deck - attack.moves.length)}
      deck={deck}
      hand={{
        tile: hand !== null ? { plan: hand, orientation } : null,
        state: pending ? "pending" : writes.error ? "refused" : hand !== null ? "placing" : "empty",
        coming: attack.view.slice(1).map((plan) => ({ plan })),
        slotChosen: placement.canConfirm && preview !== null,
        cellChosen: placement.chosen !== null,
        fitsNowhere: hand !== null && legal.empty,
        preview,
        error: v2ErrorText(writes.error),
        errorDetail: writes.error ? errorDetail(writes.error) : undefined,
      }}
      {...scene({ tiles, bubble })}
      // The pile draws from the defender's tiles (the deck holds them all), the three known ones until they are read.
      pilePlans={rival.data && rival.data.tiles.length > 0 ? rival.data.tiles.map((t) => t.plan) : attack.view}
      onBack={onBack}
      onDiscard={discard}
    />
  );
}

import { Suspense, lazy } from "react";
import { PlayScene } from "../../components/scenes/play-scene";
import { Notice } from "../../components/elements/notice";
import { useActiveGame, useSpawnPaused } from "../../data/chain";
import { puzzleDayEnd, puzzleDayOf } from "@paved/game-core";
import type { ColossusCard, ExpeditionCard, JoustCard, MasterpieceCard, PuzzleCard } from "../../components/containers/play-modes";
import { useSearchParams } from "react-router";
import { useExpeditionAvailable, useExpeditionState } from "../../data/expedition";
import { useJoustAvailable, useJoustState } from "../../data/joust";
import { useColossusAvailable, useColossusState } from "../../data/colossus";
import { useMasterpieceAvailable, useMasterpieceState } from "../../data/masterpiece";
import { MASTERPIECE_KIND } from "../../components/elements/masterpiece-kind";
import { usePuzzleActiveGame, usePuzzleAvailable, usePuzzleStanding } from "../../data/puzzle";
import { useAccount } from "../../wallet/wallet";
import { useConnectError } from "../connect-error";
import { useDrawerRoute } from "../drawer-route";
import { useRoutePage } from "../handle";
import { useNow } from "../now";
import { useTournamentCard } from "../tournament-play";
import { prefetchAllowed } from "../prefetch";
import { useAppNavigate, useUpTo } from "../ref";

/** The Challenge's stake (`/play/challenge`): its reads and its purchase, a chunk of their own, fetched as the Challenge is pointed at. */
const loadStake = () => import("./purchase");
const ChallengeStake = lazy(loadStake);
/** Story's campaigns (`/story`, STORY-PAGE): their progress and the cards' pictures, a chunk of their own, fetched as Play is pointed at. */
const loadStory = () => import("./story");
const StoryCampaigns = lazy(loadStory);
/** The Puzzle (`/play/puzzle`, Play's Limited mode): its leaderboard and its deck, a chunk of their own, fetched as Play is pointed at. */
const loadPuzzle = () => import("./puzzle");
const PuzzleView = lazy(loadPuzzle);
/** The Joust (`/play/joust`, Play's Limited mode): its week, its match and its ranking, a chunk of their own, fetched as Play is pointed at. */
const loadJoust = () => import("./joust");
const JoustView = lazy(loadJoust);
/** The Expedition (`/play/expedition`, Play's Limited mode): its week and its board's journal, a chunk of their own, fetched as Play is pointed at. */
const loadExpedition = () => import("./expedition");
const ExpeditionView = lazy(loadExpedition);
/** The Masterpiece (`/play/masterpiece`, Play's Limited mode): its week and its ranking, a chunk of their own, fetched as Play is pointed at. */
const loadMasterpiece = () => import("./masterpiece");
const MasterpieceView = lazy(loadMasterpiece);
/** The Colossus (`/play/colossus`, Play's Limited mode): its site, its builders and its boards, a chunk of their own. */
const loadColossus = () => import("./colossus");
const ColossusView = lazy(loadColossus);
/** The Tournament (`/play/tournament`, Play's Limited mode): its week and its bracket, a chunk of their own, fetched as Play is pointed at. */
const loadTournament = () => import("./tournament");
const TournamentView = lazy(loadTournament);
/** The header's title of the Joust's views (`?view=`). */
const JOUST_TITLES: Record<string, string> = { top: "Both top 10", ranking: "Ranking" };

/**
 * `/play`, `/play/challenge` and `/story` (PLAY-PAGE, the Paved UX Book's "modes" and "challenge", then the owner's asks of 2026-11-06;
 * STORY-PAGE): one page, the HUD's drawer over the home (`PageDef.drawer`, `home-hosts.tsx`), its three paths one component
 * (`page-loaders.ts`), so the drawer stays as the stake or Story's campaigns open and close. The modes (P6): Attack opens the PvP flow (`/pvp`); the Challenge is bought on its stake (P7b,
 * `./purchase`); no Connect (NO-GUEST: every player has an account); `spawn_paused` disables the Challenge. The
 * player's newest Challenge game still open (`useActiveGame`, the home's) shows its time left and its score, Resume opening its board.
 * Training and Story need no wallet (Story a view of this drawer, STORY-PAGE: never a sheet over it). Free Challenge (a free game from
 * the missions' credits) left with the owner's ask of 2026-11-06. An unread pause counts as not paused: the stake reads it again. Play's
 * close goes back along the pages walked from the home, else to it; the stake's and Story's Back up to the modes, never into a level.
 */
export default function Page() {
  const go = useAppNavigate();
  const drawer = useDrawerRoute();
  const home = useUpTo("/");
  const onBack = drawer?.onClose ?? home;
  const onViewBack = useUpTo("/play");
  // The view by the matched route's page, never by the path's text: the router matches `/PLAY/CHALLENGE/` as `/play/challenge`.
  const path = useRoutePage()?.path;
  const staking = path === "play/challenge";
  const wallet = useAccount();
  const paused = useSpawnPaused();
  useConnectError(wallet.error);
  const active = useActiveGame(wallet.address);
  const now = useNow();
  const running = wallet.address ? (active.data ?? null) : null;
  // The Puzzle's card (Limited): today's time left, the player's best and place, their game still open; "Coming soon" without a Puzzle.
  const me = wallet.address ?? null;
  const puzzleOn = usePuzzleAvailable();
  const today = puzzleDayOf(now);
  const standing = usePuzzleStanding(puzzleOn ? today : null, me);
  const puzzleGame = usePuzzleActiveGame(puzzleOn ? me : null).data ?? null;
  const puzzle: PuzzleCard | null = puzzleOn ? { endsAt: puzzleDayEnd(today), best: standing.data?.me ?? null, playing: puzzleGame ? { score: puzzleGame.score } : null } : null;
  // The Joust's card (Limited): the week's phase, the player's allegiance and its match, their game still open; none without a Joust.
  const joustOn = useJoustAvailable();
  const joustState = useJoustState(me, joustOn).data ?? null;
  const joustLive = joustState?.phase === "live";
  const joustCard: JoustCard | null = joustState
    ? {
        phase: joustState.phase,
        endsAt: joustLive ? joustState.endsAt : joustState.opensAt,
        guild: joustState.guild && { emblem: joustState.guild.emblem, registered: joustState.registered },
        match: joustState.match && { total: joustState.match.own.total, opponent: joustState.match.opponent && { name: joustState.match.opponent.guild.name, emblem: joustState.match.opponent.guild.emblem, total: joustState.match.opponent.total } },
        playing: joustState.me?.open ? { score: joustState.me.open.score } : null,
      }
    : null;
  const joustGame = joustState?.me?.open ?? null;
  // The Expedition's card (Limited): the week's map and day, the player's hand and the tiles today brings; none without an Expedition.
  const expeditionOn = useExpeditionAvailable();
  const expeditionState = useExpeditionState(me, expeditionOn).data ?? null;
  const expeditionCard: ExpeditionCard | null = expeditionState
    ? { map: expeditionState.map, day: expeditionState.day, endsAt: expeditionState.endsAt, board: expeditionState.board && { score: expeditionState.board.score, hand: expeditionState.board.hand, due: expeditionState.board.due.drawn } }
    : null;
  // The Masterpiece's card (Limited): the week's kind and day, the tiles waiting, the player's best piece; none without a Masterpiece.
  const masterpieceOn = useMasterpieceAvailable();
  const masterpieceState = useMasterpieceState(me, masterpieceOn).data ?? null;
  const masterpieceCard: MasterpieceCard | null = masterpieceState
    ? { kind: MASTERPIECE_KIND[masterpieceState.kind].name, day: masterpieceState.day, endsAt: masterpieceState.endsAt, board: masterpieceState.board && { waiting: masterpieceState.board.waiting, size: masterpieceState.board.piece?.size ?? null, score: masterpieceState.board.score } }
    : null;
  const [params] = useSearchParams();
  const masterpieceRanking = path === "play/masterpiece" && params.get("view") === "ranking";
  const onMasterpieceTop = useUpTo("/play/masterpiece");
  const joustView = path === "play/joust" ? params.get("view") : null;
  const onJoustTop = useUpTo("/play/joust");
  // The Colossus's card (Limited): the week's day, the monument, the gauge, the tiles in hand; none without a Colossus.
  const colossusOn = useColossusAvailable();
  const colossusState = useColossusState(me, colossusOn).data ?? null;
  const colossusCard: ColossusCard | null = colossusState && { day: colossusState.day, endsAt: colossusState.endsAt, monument: colossusState.monument, stones: colossusState.stones, cells: colossusState.cells, hand: colossusState.me?.hand.length ?? null };
  // Its views: the builders (`?view=builders`) and a board (`?lot=`), named on the header, their Back up to the site.
  const colossusLot = path === "play/colossus" ? params.get("lot") : null;
  const colossusBoard = colossusLot === null ? null : (colossusState?.lots.find((l) => String(l.board) === colossusLot) ?? null);
  const colossusTitle = colossusLot !== null ? (colossusBoard ? (colossusBoard.heart ? "The heart" : `District ${colossusBoard.name}`) : "District") : path === "play/colossus" && params.get("view") === "builders" ? "Builders" : undefined;
  const onColossusTop = useUpTo("/play/colossus");
  // The Tournament's card (Limited) and its view's own view (`?view=bracket`); none without a Tournament.
  const tournament = useTournamentCard(me);
  const tournamentBracket = path === "play/tournament" && params.get("view") === "bracket";
  const onTournamentTop = useUpTo("/play/tournament");
  // The stake's and Story's chunks as the page is pointed at or focused (`PrefetchOnIntent`'s rule; the drawer's portal bubbles its
  // events here).
  const warm = () => {
    if (!prefetchAllowed()) return;
    void loadStake().catch(() => {});
    void loadStory().catch(() => {});
    void loadPuzzle().catch(() => {});
    if (joustOn) void loadJoust().catch(() => {});
    if (expeditionOn) void loadExpedition().catch(() => {});
    if (masterpieceOn) void loadMasterpiece().catch(() => {});
    if (colossusOn) void loadColossus().catch(() => {});
    if (tournament.on) void loadTournament().catch(() => {});
  };
  return (
    <div className="contents" onPointerOver={warm} onFocus={warm}>
      <PlayScene
        open={drawer?.open ?? true}
        returnFocus={drawer?.returnFocus}
        spawnPaused={paused.data ?? false}
        running={running}
        now={now}
        challenge={
          staking ? (
            <Suspense fallback={<Notice title="Reading the price…">The stake's price, its split and your balance.</Notice>}>
              <ChallengeStake />
            </Suspense>
          ) : null
        }
        story={
          path === "story" ? (
            // The campaigns' own code may still be on its way: the view holds its place, the drawer stays.
            <Suspense fallback={null}>
              <StoryCampaigns />
            </Suspense>
          ) : null
        }
        puzzle={
          path === "play/puzzle" ? (
            // The view's own code may still be on its way: the view holds its place, the drawer stays.
            <Suspense fallback={null}>
              <PuzzleView />
            </Suspense>
          ) : null
        }
        joust={
          path === "play/joust" ? (
            <Suspense fallback={null}>
              <JoustView />
            </Suspense>
          ) : null
        }
        expedition={
          path === "play/expedition" ? (
            <Suspense fallback={null}>
              <ExpeditionView />
            </Suspense>
          ) : null
        }
        onExpeditionBack={onViewBack}
        expeditionCard={expeditionCard}
        onExpedition={() => go("/play/expedition")}
        masterpiece={
          path === "play/masterpiece" ? (
            <Suspense fallback={null}>
              <MasterpieceView />
            </Suspense>
          ) : null
        }
        masterpieceTitle={masterpieceRanking ? "Ranking" : undefined}
        onMasterpieceBack={masterpieceRanking ? onMasterpieceTop : onViewBack}
        masterpieceCard={masterpieceCard}
        onMasterpiece={() => go("/play/masterpiece")}
        joustTitle={joustView ? JOUST_TITLES[joustView] : undefined}
        onJoustBack={joustView && JOUST_TITLES[joustView] ? onJoustTop : onViewBack}
        joustCard={joustCard}
        colossus={
          path === "play/colossus" ? (
            <Suspense fallback={null}>
              <ColossusView />
            </Suspense>
          ) : null
        }
        colossusTitle={colossusTitle}
        onColossusBack={colossusTitle ? onColossusTop : onViewBack}
        colossusCard={colossusCard}
        onColossus={() => go("/play/colossus")}
        onJoust={() => go(joustGame ? `/joust/${joustGame.id}` : "/play/joust")}
        tournament={
          path === "play/tournament" ? (
            <Suspense fallback={null}>
              <TournamentView />
            </Suspense>
          ) : null
        }
        tournamentTitle={tournamentBracket ? "Bracket" : undefined}
        onTournamentBack={tournamentBracket ? onTournamentTop : onViewBack}
        tournamentCard={tournament.card}
        onTournament={() => go(tournament.path)}
        onBack={onBack}
        onChallengeBack={onViewBack}
        onStoryBack={onViewBack}
        onPuzzleBack={onViewBack}
        onChallenge={() => go("/play/challenge")}
        onResume={(id) => go(`/game/${id}`)}
        onTraining={() => go("/training")}
        onStory={() => go("/story")}
        onAttack={() => go("/pvp")}
        puzzleCard={puzzle}
        onPuzzle={() => go(puzzleGame ? `/puzzle/${puzzleGame.id}` : "/play/puzzle")}
      />
    </div>
  );
}

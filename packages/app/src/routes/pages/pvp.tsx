import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Attack, AttackDeck, PvpMatch, WriteResult } from "@paved/chain";
import { CENTER } from "@paved/game-core";
import { deckArt } from "../../components/containers/deck-sheet";
import { PvpAttackScene } from "../../components/scenes/pvp-attack-scene";
import { PvpScoutScene } from "../../components/scenes/pvp-scout-scene";
import { PvpSearchScene } from "../../components/scenes/pvp-search-scene";
import { NEXT_PRICE, type PvpPlayer } from "../../lib/pvp-rules";
import { useBoardSkins } from "../../data/board-skins";
import { useCobbleAccount } from "../../data/cobbles";
import { usePlayerStatus } from "../../data/indexer";
import { ATTACK_OPEN, noOpponent, pvpKeys, usePvpAttack, usePvpPlayer, usePvpScout, usePvpStatus, usePvpWrites } from "../../data/pvp";
import { RENDERER_ASSETS } from "../../data/renderer-manifest";
import { useDataSources } from "../../data/sources";
import { useTileArt } from "../../data/tile-art";
import { useTileRenders } from "../../data/tile-renders";
import { useAccount } from "../../wallet/wallet";
import { errorDetail } from "../error-detail";
import { useNow } from "../now";
import { useAppNavigate, useUpTo } from "../ref";

/** How long the search shows the village found before the scout (the clouds part over it). */
const FOUND_MS = 1_200;

/**
 * `/pvp` (#647 PR 2): the attack's flow on the chain. Where the attacker stands in `Matchmaker` and `Arena` (`usePvpStatus`)
 * picks the screen: an open attack plays on; an opponent drawn is scouted; otherwise the search draws one (`search`, free, on
 * the VRF), its waiting screen until the receipt names it. The scout sends Next (a Cobble) or Attack (`start`); the attack
 * sends each move (`play`), the last one settling the attack, then the page moves to its result (`/pvp/result/:id`).
 */
export default function Page() {
  const sources = useDataSources();
  const wallet = useAccount();
  const client = useQueryClient();
  const onBack = useUpTo("/pvp/league");
  const me = sources.signer?.address ?? null;
  const status = usePvpStatus(me);
  const writes = usePvpWrites(me);
  const player = usePvpPlayer(me, wallet.username ?? null);
  const [found, setFound] = useState<string | null>(null);
  const searched = useRef(false);
  const before = useRef<string | null>(null);
  const s = status.data;
  const phase = !s ? null : s.attack.status === ATTACK_OPEN ? "attack" : !noOpponent(s.match) && !s.match.started ? "scout" : "search";

  // Back to the search from a match or an attack (an opponent skipped by `start`, the match cancelled): a new free search.
  useEffect(() => {
    if (phase === "search" && before.current !== null && before.current !== "search") searched.current = false;
    if (phase !== null) before.current = phase;
  }, [phase]);

  // The search starts as the page opens on no match: the player came here to attack. Once per visit; Search again after a refusal.
  useEffect(() => {
    if (phase !== "search" || !s?.joined || searched.current || writes.pending) return;
    searched.current = true;
    writes.reset();
    writes.search().then(
      (receipt) => {
        const drawn = receipt.events.find((e) => e.name === "OpponentDrawn");
        if (drawn) setFound(String(drawn.fields.opponent));
      },
      () => undefined,
    );
  }, [phase, s?.joined, writes]);
  useEffect(() => {
    if (found === null) return;
    const timer = setTimeout(() => setFound(null), FOUND_MS);
    return () => clearTimeout(timer);
  }, [found]);

  const self = player.data ?? { name: wallet.username ?? null, address: me ?? "0x0", level: 0, crowns: 0 };
  if (me === null) return <PvpSearchScene state="error" player={self} error="Connect to attack another village." onRetry={() => void wallet.connect()} onCancel={onBack} />;
  if (status.data === null) return <PvpSearchScene state="error" player={self} error="PvP is not on this network yet: no village can be attacked here." onCancel={onBack} />;
  if (!s) {
    if (status.error) return <PvpSearchScene state="error" player={self} error={status.error.message} errorDetail={errorDetail(status.error)} onRetry={() => void client.invalidateQueries({ queryKey: pvpKeys.all })} onCancel={onBack} />;
    return <PvpSearchScene state="searching" player={self} onCancel={onBack} />;
  }
  if (found !== null || phase === "search") {
    return <Search me={self} joined={s.joined} found={found} writes={writes} onRetry={() => (searched.current = false)} onBack={onBack} />;
  }
  if (phase === "scout") return <Scout me={me} match={s.match} shieldEndsAt={s.shield.up ? s.shield.until : null} writes={writes} onBack={onBack} />;
  return <AttackView me={me} attack={s.attack} deck={s.deck} writes={writes} onBack={onBack} />;
}

type Writes = ReturnType<typeof usePvpWrites>;

/** The search's waiting screen: the draw on its way, the village found, or why none was drawn. */
function Search({ me, joined, found, writes, onRetry, onBack }: { me: PvpPlayer; joined: boolean; found: string | null; writes: Writes; onRetry: () => void; onBack: () => void }) {
  const name = usePlayerStatus(found).data?.player.name ?? null;
  const opponent = usePvpPlayer(found, name).data ?? null;
  const retry = () => {
    writes.reset();
    onRetry();
  };
  if (!joined) return <PvpSearchScene state="error" player={me} error="Found your village first: a village joins the matchmaker once it is founded." onCancel={onBack} />;
  if (found !== null && opponent) return <PvpSearchScene state="found" player={me} opponent={opponent} />;
  if (writes.error) {
    const none = (writes.error as { reason?: string }).reason === "no-opponent";
    return none ? (
      <PvpSearchScene state="none" player={me} onRetry={retry} onCancel={onBack} />
    ) : (
      <PvpSearchScene state="error" player={me} error={writes.error.message} errorDetail={errorDetail(writes.error)} onRetry={retry} onCancel={onBack} />
    );
  }
  return <PvpSearchScene state="searching" player={me} onCancel={onBack} />;
}

/** The scout of the drawn opponent: its village, the crowns at stake, Next for a Cobble, Attack. */
function Scout({ me, match, shieldEndsAt, writes, onBack }: { me: string; match: PvpMatch; shieldEndsAt: number | null; writes: Writes; onBack: () => void }) {
  const now = useNow();
  const scout = usePvpScout(match);
  // An NPC village is no player of the indexer: its name is its Story level's.
  const name = usePlayerStatus(match.opponent).data?.player.name ?? scout.data?.npc?.title ?? null;
  const defender = usePvpPlayer(match.opponent, scout.data?.npc?.title ?? name);
  const account = useCobbleAccount(me);
  const pending = writes.pending?.kind === "next" ? "next" : writes.pending?.kind === "start" ? "attacking" : null;
  const send = (write: () => Promise<WriteResult>) => {
    if (writes.pending) return;
    writes.reset();
    write().then(
      (receipt) => {
        // `Arena.start` skipped an opponent it cannot attack (#643): the match is cancelled, the next search is free.
        if (receipt.events.some((e) => e.name === "AttackSkipped")) toast("This village cannot be attacked", { description: "Its match was cancelled: searching another, free." });
      },
      () => undefined,
    );
  };
  // Shielded since the draw (the defender's shield, or `start`'s refusal): `search` replaces it for free.
  const shielded = scout.data?.shielded === true || (writes.error as { reason?: string } | null)?.reason === "opponent-shielded";
  if (!scout.data || !defender.data) {
    const error = scout.error ?? defender.error;
    const message = scout.data === null || defender.data === null ? "This village cannot be read on this network." : error?.message;
    return <PvpSearchScene state={message ? "error" : "searching"} player={{ name: null, address: me, level: 0, crowns: 0 }} error={message} onCancel={onBack} />;
  }
  return (
    <PvpScoutScene
      defender={defender.data}
      village={scout.data.village}
      stakes={scout.data.stakes}
      tilesToPlay={scout.data.tilesToPlay}
      openBoard={scout.data.npc !== null}
      next={{ price: NEXT_PRICE, balance: account.data?.cobbles ?? 0 }}
      shieldEndsAt={shieldEndsAt}
      now={now}
      pending={pending}
      error={writes.error?.message ?? null}
      errorDetail={writes.error ? errorDetail(writes.error) : undefined}
      onBack={onBack}
      onNext={() => send(writes.next)}
      onAttack={() => send(writes.start)}
      onSearchAgain={shielded ? () => send(writes.search) : undefined}
      searching={writes.pending?.kind === "search"}
    />
  );
}

/** A cell chosen for the tile in hand: where, and which of its fitting orientations. */
interface Chosen {
  cell: { x: number; y: number };
  orientations: number[];
  turn: number;
}

/** The open attack: the board, the tile in hand, a cell chosen and turned, each move a write; the last one ends it. */
function AttackView({ me, attack, deck, writes, onBack }: { me: string; attack: Attack; deck: AttackDeck | null; writes: Writes; onBack: () => void }) {
  const go = useAppNavigate();
  const read = usePvpAttack(me, attack, deck);
  const indexed = usePlayerStatus(attack.defender).data?.player.name ?? null;
  const name = read.data?.npcTitle ?? indexed;
  const defender = usePvpPlayer(attack.defender, name).data ?? { name, address: attack.defender, level: 0, crowns: 0 };
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const skins = useBoardSkins(attack.defender);
  const tileArt = deckArt(useTileRenders(RENDERER_ASSETS), skins, useTileArt(RENDERER_ASSETS));
  const data = read.data;
  if (!data) {
    const message = data === null ? "This attack cannot be read on this network." : read.error?.message;
    return <PvpSearchScene state={message ? "error" : "searching"} player={defender} error={message} errorDetail={read.error ? errorDetail(read.error) : undefined} onCancel={onBack} />;
  }
  const { run, hand } = data;
  const slots = hand ? run.slots(hand).map((c) => ({ x: CENTER + c.x, y: CENTER + c.y })) : [];
  const pending = writes.pending?.kind === "play";
  const play = (move: Parameters<Writes["play"]>[0]) => {
    if (writes.pending) return;
    writes.reset();
    writes.play(move).then(
      (receipt) => {
        setChosen(null);
        if (receipt.events.some((e) => e.name === "AttackFinished")) go(`/pvp/result/${attack.id}`, { replace: true });
      },
      () => undefined,
    );
  };
  const orientation = chosen ? chosen.orientations[chosen.turn % chosen.orientations.length]! : 1;
  const preview = chosen && hand ? data.run.preview(hand, orientation, chosen.cell) : null;
  return (
    <PvpAttackScene
      defender={defender}
      target={data.target}
      territory={data.territory}
      tiles={data.tiles}
      score={data.score}
      delta={data.delta}
      lastScored={data.lastScored}
      remaining={data.remaining}
      hand={{
        tile: hand ? { plan: hand, orientation } : null,
        state: pending ? "pending" : writes.error ? "refused" : hand ? "placing" : "empty",
        coming: [],
        slotChosen: chosen !== null,
        fitsNowhere: hand !== 0 && slots.length === 0,
        preview,
        error: writes.error?.message ?? null,
        errorDetail: writes.error ? errorDetail(writes.error) : undefined,
      }}
      slots={slots}
      ghost={chosen && hand ? { x: CENTER + chosen.cell.x, y: CENTER + chosen.cell.y, plan: hand, orientation, placed: true, fits: true } : null}
      bubble={
        chosen && hand
          ? {
              cell: { x: CENTER + chosen.cell.x, y: CENTER + chosen.cell.y },
              rotations: chosen.orientations.length,
              orientation,
              onRotate: () => setChosen({ ...chosen, turn: chosen.turn + 1 }),
              onClose: () => setChosen(null),
              onDiscard: () => play({ discard: true }),
              onConfirm: () => play({ discard: false, orientation, cell: chosen.cell }),
              canConfirm: !pending,
              busy: pending,
            }
          : null
      }
      tileArt={tileArt}
      skins={skins}
      pilePlans={data.pilePlans}
      onBack={onBack}
      onSlotClick={(slot) => {
        if (!hand || pending) return;
        const cell = { x: slot.x - CENTER, y: slot.y - CENTER };
        const orientations = run.orientations(hand, cell);
        if (orientations.length === 0) return;
        writes.reset();
        setChosen({ cell, orientations, turn: 0 });
      }}
      onDiscard={() => play({ discard: true })}
    />
  );
}


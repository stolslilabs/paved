import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GameViews, WriteResult } from "@paved/chain";
import { AttackRun, attackStarPoints, type ChestRank, type QueuedMove } from "@paved/game-core";
import { invalidateV2 } from "./free-village";
import { orNone } from "./avatar";
import { queryKeys } from "./keys";
import { useDataSources, type DataSources } from "./sources";

// PvP v2's attack (#741, step 1 of #732): the opponent drawn among the rival villages (crowns and shields as today), and the
// attack on an unbounded board with a deck of ceil(1.15 x S) tiles, the tile in hand and the next two shown, stars at
// 80 / 90 / 100 %. Step 1 serves it from the mock ledger; step 3 (#743) gives `@paved/chain` the same interface, and the
// screens (#740) stay as they are. The rules are game-core's (`attackDeck`, `QueuedAttack`, `attackStars`).

/** The opponent drawn: their village's size and score (the target), the attack's deck, and the crowns at stake. */
export interface MatchV2 {
  opponent: string;
  name: string;
  level: number;
  slots: number;
  /** The village's score: 100 % of it is 3 stars. */
  target: number;
  /** The tiles the attack will draw: ceil(1.15 x slots). */
  deck: number;
  offer: number;
  cost: number;
  crowns: number;
}

/** A move of the attack, with the plan it played. */
export type AttackMoveV2 = QueuedMove & { plan: number };

/** The open attack or the last one. */
export interface AttackV2 {
  id: number;
  status: "open" | "finished" | "surrendered";
  defender: string;
  slots: number;
  target: number;
  /** The deck's size. */
  deck: number;
  /** The tile in hand and the next two (fewer at the deck's end; none once played out or ended). */
  view: number[];
  moves: AttackMoveV2[];
  score: number;
  stars: number;
  /** What the end gave: the XP, the chest (null: none, or the day's cap reached) and the crowns. */
  xp: number;
  chest: ChestRank | null;
  gained: number;
  lost: number;
  openedAt: number;
  finishedAt: number;
}

/** The attacker's state: the opponent drawn (null: none) and the attack, open or the last one (null: none yet). */
export interface AttackV2State {
  match: MatchV2 | null;
  attack: AttackV2 | null;
}

export interface AttackV2Views {
  attackV2(attacker: string): Promise<AttackV2State>;
}

export interface AttackV2Writes {
  /** Draws an opponent: `search` (free, none drawn yet) or `next` (a Cobble, another one). */
  drawOpponentV2(kind: "search" | "next"): Promise<WriteResult>;
  /** Starts the attack on the opponent drawn: the deck is drawn, the first three tiles shown. */
  startAttackV2(): Promise<WriteResult>;
  /** Plays the tile in hand; the last one ends the attack (stars, crowns, XP, a chest). */
  playAttackV2(move: QueuedMove): Promise<WriteResult>;
  surrenderAttackV2(): Promise<WriteResult>;
}

export function attackV2Views(views: GameViews): AttackV2Views | null {
  const v = views as GameViews & Partial<AttackV2Views>;
  return typeof v.attackV2 === "function" ? (v as AttackV2Views) : null;
}

export function attackV2Signer(sources: Pick<DataSources, "signer">): AttackV2Writes | null {
  const s = sources.signer as (Partial<AttackV2Writes> & { address: string }) | null | undefined;
  return s && typeof s.drawOpponentV2 === "function" && typeof s.startAttackV2 === "function" && typeof s.playAttackV2 === "function" && typeof s.surrenderAttackV2 === "function"
    ? (s as AttackV2Writes)
    : null;
}

/** An attack's board on the engine: the starter and its moves, replayed (the score, the cells where a tile fits). */
export function attackV2Board(attack: Pick<AttackV2, "moves">): AttackRun {
  return AttackRun.replay(
    { territory: null },
    attack.moves.map((m) => (m.discard ? { plan: m.plan, discard: true as const } : { plan: m.plan, discard: false as const, orientation: m.orientation, cell: m.cell })),
  );
}

/** The points of each star against an attack's target. */
export const attackV2Marks = (attack: Pick<AttackV2, "target">): [number, number, number] => attackStarPoints(attack.target);

/** The attacker's match and attack. Null where they are not served (the chain before step 3); disabled without a player. */
export function useAttackV2(attacker: string | null): { data: AttackV2State | null | undefined; isPending: boolean; error: Error | null } {
  const { views } = useDataSources();
  const v2 = attackV2Views(views);
  const query = useQuery({
    queryKey: queryKeys.chain.v2.attack(attacker ?? "0x0"),
    queryFn: () => orNone(() => v2!.attackV2(attacker!)),
    enabled: attacker !== null && v2 !== null,
  });
  if (attacker === null || v2 === null) return { data: null, isPending: false, error: null };
  return { data: query.data, isPending: query.isPending && !query.error, error: query.error };
}

export type AttackV2Write = { kind: "search" } | { kind: "next" } | { kind: "start" } | { kind: "play"; move: QueuedMove } | { kind: "surrender" };

/** The attack's writes of the connected account; each invalidates the v2 reads, the Cobbles, the level and the league once settled. */
export function useAttackV2Writes(attacker: string | null) {
  const sources = useDataSources();
  const signer = attackV2Signer(sources);
  const client = useQueryClient();
  const mutation = useMutation<WriteResult, Error, AttackV2Write>({
    mutationFn: (write) => {
      if (!signer) return Promise.reject(new Error("Connect to attack"));
      switch (write.kind) {
        case "search":
        case "next":
          return signer.drawOpponentV2(write.kind);
        case "start":
          return signer.startAttackV2();
        case "play":
          return signer.playAttackV2(write.move);
        case "surrender":
          return signer.surrenderAttackV2();
      }
    },
    onSettled: () => {
      if (attacker) invalidateV2(client, attacker);
    },
  });
  return {
    signer,
    pending: mutation.isPending ? mutation.variables : undefined,
    error: mutation.error,
    reset: () => mutation.reset(),
    search: () => mutation.mutateAsync({ kind: "search" }),
    next: () => mutation.mutateAsync({ kind: "next" }),
    start: () => mutation.mutateAsync({ kind: "start" }),
    play: (move: QueuedMove) => mutation.mutateAsync({ kind: "play", move }),
    surrender: () => mutation.mutateAsync({ kind: "surrender" }),
  };
}

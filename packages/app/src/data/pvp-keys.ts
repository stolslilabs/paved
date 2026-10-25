import { addressKey } from "./keys";

// The PvP reads' keys on their own (#753): the village's writes invalidate the league without the PvP's engine (`pvp.ts`).

/** The keys of the PvP reads, `[domain, read, ...args]` as `keys.ts`'s. */
export const pvpKeys = {
  /** `Matchmaker.village(v)`. */
  village: (playerId: string) => ["chain", "pvp", "village", addressKey(playerId)] as const,
  /** `Matchmaker.current_match(attacker)`. */
  match: (playerId: string) => ["chain", "pvp", "match", addressKey(playerId)] as const,
  /** `Matchmaker.league(v)`. */
  league: (playerId: string) => ["chain", "pvp", "league", addressKey(playerId)] as const,
  /** `Matchmaker.shield(v)`. */
  shield: (playerId: string) => ["chain", "pvp", "shield", addressKey(playerId)] as const,
  /** `Matchmaker.season_start(season)`. */
  seasonStart: (season: number) => ["chain", "pvp", "seasonStart", season] as const,
  /** `Arena.attack(attacker)`. */
  attack: (playerId: string) => ["chain", "pvp", "attack", addressKey(playerId)] as const,
  /** `Arena.deck(attacker, id)`. */
  deck: (playerId: string, id: number) => ["chain", "pvp", "deck", addressKey(playerId), id] as const,
  /** `Arena.moves(attacker, id)`. */
  moves: (playerId: string, id: number) => ["chain", "pvp", "moves", addressKey(playerId), id] as const,
  /** `Arena.npc_level(npc_id)`. */
  npcLevel: (npcId: number) => ["chain", "pvp", "npcLevel", npcId] as const,
  /** The crowns an attack moved, from its last move's receipt (`AttackFinished`): the result's before the indexer has it. */
  settled: (playerId: string, id: number) => ["chain", "pvp", "settled", addressKey(playerId), id] as const,
  /** The indexer's row of attack `id` of `attacker` once it ended, however old. */
  attackRow: (playerId: string, id: number) => ["indexer", "pvpAttack", addressKey(playerId), id] as const,
  /** The indexer's attacks of a player that ended: those on its village (`defender`) or those it made (`attacker`). */
  attacks: (playerId: string, side: "attacker" | "defender") => ["indexer", "pvpAttacks", addressKey(playerId), side] as const,
  /** Every chain read of the PvP. */
  all: ["chain", "pvp"] as const,
};

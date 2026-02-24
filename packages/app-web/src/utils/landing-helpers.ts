import { feltToString } from "./torii";

export interface PlayerGame {
  gameId: number;
  mode: string;
  score: number;
  tilesPlaced: number;
  totalTiles: number;
  isOver: boolean;
  startTime: number;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
}

export interface TournamentInfo {
  prizePool: string;
  topPlayers: { name: string; score: number }[];
}

const MODE_MAP: Record<string, string> = {
  "0": "none",
  "1": "daily",
  "2": "weekly",
  "3": "tutorial",
};

export function parseGameRow(row: any): PlayerGame {
  return {
    gameId: Number(row.id),
    mode: MODE_MAP[row.mode] || "none",
    score: Number(row.score),
    tilesPlaced: Number(row.built),
    totalTiles: Number(row.tile_count),
    isOver: Boolean(row.over),
    startTime: Number(row.start_time),
  };
}

export function splitGames(games: PlayerGame[]): {
  activeGames: PlayerGame[];
  completedGames: PlayerGame[];
} {
  const activeGames = games
    .filter((g) => !g.isOver)
    .sort((a, b) => b.gameId - a.gameId);
  const completedGames = games
    .filter((g) => g.isOver)
    .sort((a, b) => b.gameId - a.gameId);
  return { activeGames, completedGames };
}

export function parseLeaderboardRow(row: any, rank: number): LeaderboardEntry {
  return {
    rank,
    name: feltToString(row.name),
    score: Number(row.score),
  };
}

export function parseTournamentRow(
  row: any,
  playerNames: Record<string, string>
): TournamentInfo {
  const prizeWei = BigInt(row.prize);
  const prizeEth = Number(prizeWei) / 1e18;

  const topPlayers: { name: string; score: number }[] = [];
  if (Number(row.top1_score) > 0) {
    topPlayers.push({ name: playerNames[row.top1_player_id] || "Unknown", score: Number(row.top1_score) });
  }
  if (Number(row.top2_score) > 0) {
    topPlayers.push({ name: playerNames[row.top2_player_id] || "Unknown", score: Number(row.top2_score) });
  }
  if (Number(row.top3_score) > 0) {
    topPlayers.push({ name: playerNames[row.top3_player_id] || "Unknown", score: Number(row.top3_score) });
  }

  return {
    prizePool: prizeEth % 1 === 0 ? String(prizeEth) : String(prizeEth),
    topPlayers,
  };
}

export function formatTimeRemaining(endTimeUnix: number): string {
  const now = Math.floor(Date.now() / 1000);
  const remaining = endTimeUnix - now;
  if (remaining <= 0) return "Ended";

  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function formatEntryFee(priceWei: bigint): string {
  if (priceWei === BigInt(0)) return "Free";
  const eth = Number(priceWei) / 1e18;
  if (eth % 1 === 0) return `${eth} ETH`;
  return `${eth} ETH`;
}

import { shortString } from "starknet";
import { GameOverEvent } from "@/hooks/useGames";
import tournaments from "./tournaments.json";
import { TOURNAMENT_ID_OFFSET } from "@/dojo/game/constants";

const data: GameOverEvent[] = {
  ...tournaments,
}.data.events.edges.map((edge) => {
  const tournamentId = parseInt(edge.node.keys[2], 16);
  const seasonId = tournamentId - TOURNAMENT_ID_OFFSET;
  const gameScore = parseInt(edge.node.data[0], 16);
  const gameStartTime = new Date(parseInt(edge.node.data[1], 16) * 1000);
  const gameEndTime = new Date(parseInt(edge.node.data[2], 16) * 1000);
  const playerId = edge.node.data[3];
  const playerName = shortString.decodeShortString(edge.node.data[4]);
  const playerMaster = edge.node.data[5];
  return {
    id: edge.node.id,
    gameId: 0,
    tournamentId,
    seasonId,
    gameScore,
    gameStartTime,
    gameEndTime,
    playerId,
    playerName,
    playerMaster,
    timestamp: gameEndTime,
  };
});

export default data;

import { shortString } from "starknet";
import { GameOverEvent } from "@/hooks/useGames";
import dataset1 from "./202403280500.json";
import dataset2 from "./202404011900.json";
import { TOURNAMENT_ID_OFFSET } from "@/dojo/game/constants";

const data: GameOverEvent[] = {
  ...dataset1,
  ...dataset2,
}.data.events.edges.map((edge) => {
  const tournamentId = parseInt(edge.node.keys[2], 16) - TOURNAMENT_ID_OFFSET;
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

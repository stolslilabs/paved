import { Tournament } from "./tournament";

const mockTournament = {
  id: 1,
  prize: "1000000",
  top1_player_id: 0x1n,
  top1_game_id: 10,
  top1_multiplier_fp: 2_000_000,
  top2_player_id: 0x2n,
  top2_game_id: 11,
  top2_multiplier_fp: 1_000_000,
  top3_player_id: 0x3n,
  top3_game_id: 12,
  top3_multiplier_fp: 500_000,
  top1_score: 30,
  top2_score: 20,
  top3_score: 10,
  top1_claimed: false,
  top2_claimed: false,
  top3_claimed: false,
};

const tournament = new Tournament(mockTournament as any);
const top1Reward = tournament.reward(1);
const top3Reward = tournament.reward(3);

if (top1Reward <= 0) {
  throw new Error("Tournament economy test failed: expected top1 reward > 0");
}

if (top3Reward <= 0) {
  throw new Error("Tournament economy test failed: expected top3 reward > 0");
}

if (tournament.multiplier(1) !== 2_000_000) {
  throw new Error("Tournament economy test failed: expected locked multiplier");
}

import { Mode } from "../types/mode";
import { computeAdjustedReward, FP_SCALE_DEFAULT } from "../economy";

export interface TournamentData {
  id: number;
  prize: number | bigint | string;
  top1_player_id: number | bigint | string;
  top1_multiplier_fp?: number;
  top2_player_id: number | bigint | string;
  top2_multiplier_fp?: number;
  top3_player_id: number | bigint | string;
  top3_multiplier_fp?: number;
  top1_score: number;
  top2_score: number;
  top3_score: number;
  top1_claimed: boolean;
  top2_claimed: boolean;
  top3_claimed: boolean;
}

export class Tournament {
  public id: number;
  public prize: string;
  public top1_player_id: string;
  public top1_multiplier_fp: number;
  public top2_player_id: string;
  public top2_multiplier_fp: number;
  public top3_player_id: string;
  public top3_multiplier_fp: number;
  public top1_score: number;
  public top2_score: number;
  public top3_score: number;
  public top1_claimed: boolean;
  public top2_claimed: boolean;
  public top3_claimed: boolean;

  constructor(tournament: TournamentData) {
    this.id = tournament.id;
    this.prize = tournament.prize.toString();
    this.top1_player_id = `0x${BigInt(tournament.top1_player_id).toString(16)}`;
    this.top1_multiplier_fp = Number(tournament.top1_multiplier_fp ?? FP_SCALE_DEFAULT);
    this.top2_player_id = `0x${BigInt(tournament.top2_player_id).toString(16)}`;
    this.top2_multiplier_fp = Number(tournament.top2_multiplier_fp ?? FP_SCALE_DEFAULT);
    this.top3_player_id = `0x${BigInt(tournament.top3_player_id).toString(16)}`;
    this.top3_multiplier_fp = Number(tournament.top3_multiplier_fp ?? FP_SCALE_DEFAULT);
    this.top1_score = tournament.top1_score;
    this.top2_score = tournament.top2_score;
    this.top3_score = tournament.top3_score;
    this.top1_claimed = tournament.top1_claimed;
    this.top2_claimed = tournament.top2_claimed;
    this.top3_claimed = tournament.top3_claimed;
  }

  multiplierForRank(rank: number): number {
    if (rank === 1) return this.top1_multiplier_fp;
    if (rank === 2) return this.top2_multiplier_fp;
    if (rank === 3) return this.top3_multiplier_fp;
    return FP_SCALE_DEFAULT;
  }

  rewardWithMultiplier(rank: number, fpScale = FP_SCALE_DEFAULT): number {
    return computeAdjustedReward(this.reward(rank), this.multiplierForRank(rank), fpScale);
  }

  static computeId(duration: number): number {
    const now = new Date();
    return Math.floor(Math.floor(now.getTime() / 1000) / duration);
  }

  reward(rank: number): number {
    if (rank === 1) {
      const second = this.reward(2);
      const third = this.reward(3);
      return Number(this.prize) - second - third;
    }

    if (rank === 2) {
      if (!Number(this.top2_player_id)) {
        return 0;
      }
      const third = this.reward(3);
      return (Number(this.prize) - third) / 3;
    }

    if (rank === 3) {
      if (!Number(this.top3_player_id)) {
        return 0;
      }
      return Number(this.prize) / 6;
    }

    return 0;
  }

  isClaimed(rank: number): boolean {
    if (rank === 1) {
      return this.top1_claimed;
    }

    if (rank === 2) {
      return this.top2_claimed;
    }

    if (rank === 3) {
      return this.top3_claimed;
    }

    return false;
  }

  isOver(mode: Mode): boolean {
    const duration = mode.duration();
    const id = Tournament.computeId(duration);
    return id > this.id;
  }

  isCurrent(mode: Mode): boolean {
    const duration = mode.duration();
    const id = Tournament.computeId(duration);
    return id === this.id;
  }

  isClaimable(rank: number, mode: Mode): boolean {
    return rank <= 3 && this.isOver(mode) && !this.isClaimed(rank);
  }
}

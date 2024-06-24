import { ComponentValue } from "@dojoengine/recs";
import { Mode } from "../types/mode";

export class Tournament {
  public id: number;
  public prize: string;
  public top1_player_id: string;
  public top2_player_id: string;
  public top3_player_id: string;
  public top1_score: number;
  public top2_score: number;
  public top3_score: number;
  public top1_claimed: boolean;
  public top2_claimed: boolean;
  public top3_claimed: boolean;

  constructor(tournament: ComponentValue) {
    this.id = tournament.id;
    this.prize = tournament.prize;
    this.top1_player_id = `0x${tournament.top1_player_id.toString(16).replace("0x", "")}`;
    this.top2_player_id = `0x${tournament.top2_player_id.toString(16).replace("0x", "")}`;
    this.top3_player_id = `0x${tournament.top3_player_id.toString(16).replace("0x", "")}`;
    this.top1_score = tournament.top1_score;
    this.top2_score = tournament.top2_score;
    this.top3_score = tournament.top3_score;
    this.top1_claimed = tournament.top1_claimed;
    this.top2_claimed = tournament.top2_claimed;
    this.top3_claimed = tournament.top3_claimed;
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

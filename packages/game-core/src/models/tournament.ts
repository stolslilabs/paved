import { Mode } from "../types/mode";

/** A day's top 3 (D-20: the prize and its claims left; the day and its leaderboard stay). */
export interface TournamentData {
  id: number;
  top1_player_id: number | bigint | string;
  top2_player_id: number | bigint | string;
  top3_player_id: number | bigint | string;
  top1_score: number;
  top2_score: number;
  top3_score: number;
}

export class Tournament {
  public id: number;
  public top1_player_id: string;
  public top2_player_id: string;
  public top3_player_id: string;
  public top1_score: number;
  public top2_score: number;
  public top3_score: number;

  constructor(tournament: TournamentData) {
    this.id = tournament.id;
    this.top1_player_id = `0x${BigInt(tournament.top1_player_id).toString(16)}`;
    this.top2_player_id = `0x${BigInt(tournament.top2_player_id).toString(16)}`;
    this.top3_player_id = `0x${BigInt(tournament.top3_player_id).toString(16)}`;
    this.top1_score = tournament.top1_score;
    this.top2_score = tournament.top2_score;
    this.top3_score = tournament.top3_score;
  }

  static computeId(duration: number): number {
    const now = new Date();
    return Math.floor(Math.floor(now.getTime() / 1000) / duration);
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
}

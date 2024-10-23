import { ComponentValue } from "@dojoengine/recs";
import { Mode } from "../types/mode";
import { Plan } from "../types/plan";
import { Base } from "../elements/decks/base";
import { shortString } from "starknet";

type GameState = "lobby" | "started" | "over"

export class Game {
  public id: number;
  public over: boolean;
  public claimed: boolean;
  public mode: Mode;
  public tile_count: number;
  public player_count: number;
  public tournament_id: bigint;
  public start_time: Date;
  public end_time: Date;
  public duration: bigint;
  public tiles: bigint;
  public players: bigint;
  public price: bigint;
  public prize: bigint;
  public name: string;
  public seed: string;

  constructor(game: ComponentValue) {
    this.id = game.id;
    this.over = game.over;
    this.claimed = game.claimed;
    this.mode = Mode.from(game.mode);
    this.tiles = BigInt(game.tiles);
    this.tile_count = game.tile_count;
    this.start_time = new Date(game.start_time * 1000);
    this.end_time = new Date(game.end_time * 1000);
    this.seed = game.seed.toString(16);
    this.tournament_id = BigInt(game.tournament_id);
    this.duration = BigInt(game.duration);
    this.players = BigInt(game.players);
    this.price = BigInt(game.price);
    this.prize = BigInt(game.prize);
    this.name = shortString.decodeShortString(game.name);
    this.player_count = game.player_count;
  }

  public isOver(): boolean {
    return this.over;
  }

  public getEndDate = (): Date => new Date(this.start_time.getTime() + Number(this.duration) * 1000);

  public tilesLeft(): number {
    return this.mode.count() - this.tile_count;
  }

  public getState = (): GameState => this.start_time.getTime() === 0 ? "lobby" : this.getEndDate() < new Date() ? "over" : "started"

  public getPlans(): { plan: Plan; count: number }[] {
    let tiles = this.tiles;
    const plans: { [key: number]: number } = {};
    let index = 0;
    while (index < Base.total_count()) {
      if ((tiles & 1n) === 0n) {
        const plan = new Plan(Base.plan(index + 1));
        const planId: number = plan.into();
        plans[planId] = plans[planId] ? plans[planId] + 1 : 1;
      }
      tiles = tiles >> 1n;
      index += 1;
    }
    // Format plans into an array of { plan: Plan, count: number }
    return Object.keys(plans).map((planId) => {
      return {
        plan: Plan.from(parseInt(planId)),
        count: plans[parseInt(planId)],
      };
    });
  }
}

import { ComponentValue } from "@dojoengine/recs";
import { Mode, ModeType } from "../types/mode";
import { Plan, PlanType } from "../types/plan";
import { Base } from "../elements/decks/base";

export class Game {
  public id: number;
  public over: boolean;
  public tiles: bigint;
  public tile_count: number;
  public start_time: number;
  public score: number;
  public seed: string;
  public mode: Mode;

  constructor(game: ComponentValue) {
    this.id = game.id;
    this.over = game.over;
    this.tiles = game.tiles;
    this.tile_count = game.tile_count;
    this.start_time = game.start_time;
    this.score = game.score;
    this.seed = game.seed;
    this.mode = Mode.from(game.mode);
  }

  public isOver(): boolean {
    return this.over;
  }

  public tilesLeft(): number {
    return this.mode.count() - this.tile_count;
  }

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

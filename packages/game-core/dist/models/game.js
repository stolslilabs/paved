import { Mode } from "../types/mode";
import { Plan } from "../types/plan";
import { Base } from "../elements/decks/base";
export class Game {
    id;
    over;
    built;
    discarded;
    tiles;
    tile_count;
    start_time;
    end_time;
    score;
    seed;
    mode;
    tournament_id;
    constructor(game) {
        this.id = game.id;
        this.over = game.over;
        this.built = game.built;
        this.discarded = game.discarded;
        this.tiles = BigInt(game.tiles);
        this.tile_count = game.tile_count;
        this.start_time = new Date(game.start_time * 1000);
        this.end_time = new Date(game.end_time * 1000);
        this.score = game.score;
        this.seed = BigInt(game.seed).toString(16);
        this.mode = Mode.from(game.mode);
        this.tournament_id = BigInt(game.tournament_id);
    }
    isOver() {
        return this.over;
    }
    tilesLeft() {
        return this.mode.count() - this.tile_count;
    }
    getPlans() {
        let tiles = this.tiles;
        const plans = {};
        let index = 0;
        while (index < Base.total_count()) {
            if ((tiles & 1n) === 0n) {
                const plan = new Plan(Base.plan(index + 1));
                const planId = plan.into();
                plans[planId] = plans[planId] ? plans[planId] + 1 : 1;
            }
            tiles = tiles >> 1n;
            index += 1;
        }
        return Object.keys(plans).map((planId) => {
            return {
                plan: Plan.from(parseInt(planId)),
                count: plans[parseInt(planId)],
            };
        });
    }
}
//# sourceMappingURL=game.js.map
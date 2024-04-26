import { ComponentValue } from "@dojoengine/recs";

export class Game {
  public id: number;
  public over: boolean;
  public tiles: string;
  public tile_count: number;
  public start_time: number;
  public score: number;
  public seed: string;

  constructor(game: ComponentValue) {
    this.id = game.id;
    this.over = game.over;
    this.tiles = game.tiles;
    this.tile_count = game.tile_count;
    this.start_time = game.start_time;
    this.score = game.score;
    this.seed = game.seed;
  }

  public isOver(): boolean {
    return this.over;
  }

  public tilesLeft(): number {
    return 72 - this.tile_count;
  }
}
